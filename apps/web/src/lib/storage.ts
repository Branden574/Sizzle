import { Upload } from 'tus-js-client';
import { webEnv } from './env';
import { supabase } from './supabase';

/** PUT a file to a URL via XHR so we get real upload-progress events. */
function xhrPut(url: string, file: File, onProgress?: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('content-type', file.type || 'video/mp4');
    xhr.setRequestHeader('x-upsert', 'true');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.min(99, Math.round((e.loaded / e.total) * 100)));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error('upload network error'));
    xhr.send(file);
  });
}

/**
 * Upload a video DIRECTLY to Cloudflare Stream via the resumable tus protocol.
 * `uploadUrl` is the one-time URL the server provisioned (POST /uploads/tus). tus
 * is PATCH-based (works from the iOS WKWebView), chunked, and resumable — a
 * network drop resumes from the last committed offset instead of restarting, and
 * a half-open socket is caught by the stall watchdog. No Supabase relay, no 2 GiB
 * cap. Rejects with an AbortError when `signal` fires.
 */
export function uploadVideoTus(
  uploadUrl: string,
  file: File,
  opts: { onProgress?: (pct: number) => void; signal?: AbortSignal } = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    let done = false;
    let lastProgressAt = Date.now();
    let stallTimer: ReturnType<typeof setInterval> | null = null;

    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      if (stallTimer) clearInterval(stallTimer);
      opts.signal?.removeEventListener('abort', onAbort);
      fn();
    };

    const upload = new Upload(file, {
      uploadUrl, // resume/upload straight to the CF one-time URL (no creation POST)
      // Cloudflare tus requires a constant chunk size that's a multiple of 256 KiB.
      // 50 MiB = 200 × 256 KiB — big enough to be efficient, small enough to resume.
      chunkSize: 50 * 1024 * 1024,
      retryDelays: [0, 1000, 3000, 5000, 10000, 20000], // backoff on network/5xx
      removeFingerprintOnSuccess: true,
      onError: (err) => finish(() => reject(err instanceof Error ? err : new Error(String(err)))),
      onProgress: (sent, total) => {
        lastProgressAt = Date.now();
        opts.onProgress?.(total ? Math.min(99, Math.round((sent / total) * 100)) : 0);
      },
      onSuccess: () => finish(() => resolve()),
    });

    const onAbort = () => finish(() => { void upload.abort(); reject(new DOMException('Upload cancelled', 'AbortError')); });
    if (opts.signal) {
      if (opts.signal.aborted) return onAbort();
      opts.signal.addEventListener('abort', onAbort);
    }

    // Stall watchdog: a half-open connection can freeze with no error and no
    // progress (the "bar stuck forever" case). If nothing moves for 45s, abort +
    // restart — tus resumes from the last committed offset (HEAD), so no re-send.
    stallTimer = setInterval(() => {
      if (done) return;
      if (Date.now() - lastProgressAt > 45_000) {
        lastProgressAt = Date.now();
        void upload.abort().then(() => { if (!done) upload.start(); }).catch(() => {});
      }
    }, 15_000);

    upload.start();
  });
}

/**
 * Upload a clip to a Cloudflare Stream one-time direct-upload URL. Cloudflare's
 * basic creator upload takes a multipart POST with a `file` field (good for
 * clips up to ~200MB; tus/resumable is a future add for larger files).
 */
export function uploadToCloudflare(uploadUrl: string, file: File, onProgress?: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', uploadUrl);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.min(99, Math.round((e.loaded / e.total) * 100)));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error('upload network error'));
    xhr.send(form);
  });
}

/** Upload a profile image to a user-scoped path and return its public URL. */
export async function uploadProfileImage(bucket: 'avatars' | 'banners', userId: string, file: File): Promise<string> {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  const path = `${userId}/${bucket}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

/**
 * Upload a recipe clip to the user-scoped `videos` bucket and return its public
 * URL. Uses a signed upload URL + XHR so `onProgress` reports real upload %.
 * Falls back to the plain SDK upload (no progress) if the signed path fails.
 */
export async function uploadVideo(userId: string, file: File, onProgress?: (pct: number) => void): Promise<string> {
  const ext = (file.name.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '');
  const path = `${userId}/clip-${Date.now()}.${ext}`;
  try {
    const { data, error } = await supabase.storage.from('videos').createSignedUploadUrl(path);
    if (error || !data?.signedUrl) throw error ?? new Error('no signed url');
    const signed = data.signedUrl;
    const url = signed.startsWith('http') ? signed : `${webEnv.supabaseUrl}/storage/v1${signed.startsWith('/storage/v1') ? signed.slice('/storage/v1'.length) : signed}`;
    await xhrPut(url, file, onProgress);
  } catch {
    // Reliable fallback (no granular progress).
    const { error } = await supabase.storage.from('videos').upload(path, file, { upsert: true, contentType: file.type || 'video/mp4' });
    if (error) throw error;
  }
  onProgress?.(100);
  return supabase.storage.from('videos').getPublicUrl(path).data.publicUrl;
}

/**
 * Read a video's duration (seconds) and capture a poster frame as a JPEG blob.
 * Best-effort — resolves with whatever it could read.
 */
export function probeVideo(file: File): Promise<{ durationSeconds: number | null; poster: Blob | null }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    // preload='metadata' ONLY. NEVER 'auto' — 'auto' loads the entire file before
    // this promise resolves, and the upload is awaited on this, so a large clip
    // stalls the whole upload at 0%. The poster below is strictly BEST-EFFORT.
    video.preload = 'metadata';
    video.src = url;

    let settled = false;
    let duration: number | null = null;
    const done = (poster: Blob | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      try { video.pause(); video.removeAttribute('src'); video.load(); } catch { /* already detached */ }
      resolve({ durationSeconds: duration, poster });
    };
    // HARD CAP: poster capture must NEVER delay the upload. If we can't grab a
    // frame fast, ship without it — the server generates a Cloudflare thumbnail as
    // the backstop, and the grid refreshes when it's ready. Reliability of the
    // upload always wins over an instant client-side thumbnail.
    const timer = setTimeout(() => done(null), 2500);

    const capture = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx || !canvas.width) return done(null);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((b) => done(b), 'image/jpeg', 0.7);
      } catch {
        done(null);
      }
    };

    video.onerror = () => done(null);
    video.onloadedmetadata = () => {
      duration = Number.isFinite(video.duration) ? Math.round(video.duration) : null;
      // Seek a touch in for a representative frame; the seek pulls just that
      // segment (not the whole file).
      try { video.currentTime = Math.min(0.1, video.duration || 0); } catch { /* draw on timeout */ }
    };
    video.onseeked = () => {
      // requestVideoFrameCallback paints on an actually-presented frame (avoids the
      // iOS black-frame), but the 2.5s cap guarantees we never wait on it.
      const rvfc = (video as unknown as { requestVideoFrameCallback?: (cb: () => void) => void }).requestVideoFrameCallback;
      if (typeof rvfc === 'function') rvfc.call(video, () => capture());
      else capture();
    };
  });
}

/**
 * Upload a recipe photo (carousel image) to the user-scoped `videos` bucket and
 * return its public URL. The `${userId}/` prefix is what the API checks to
 * confirm you own the image.
 */
/** Re-encode an image through a canvas to strip EXIF/GPS metadata — phone photos
 *  embed the shooting location, which on a public post would leak the creator's
 *  coordinates. Keeps original dimensions; exports JPEG. Falls back to the raw
 *  file if decoding is unavailable. (Avatars/banners already go through the
 *  cropper canvas, so only these raw recipe photos needed this.) */
async function stripImageMetadata(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx || !canvas.width) { bitmap.close?.(); return file; }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.9));
    return blob ?? file;
  } catch {
    return file;
  }
}

export async function uploadRecipeImage(userId: string, file: File): Promise<string> {
  const clean = await stripImageMetadata(file);
  const path = `${userId}/photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await supabase.storage.from('videos').upload(path, clean, { upsert: true, contentType: 'image/jpeg' });
  if (error) throw error;
  return supabase.storage.from('videos').getPublicUrl(path).data.publicUrl;
}

/** Upload a captured poster frame to the user-scoped `videos` bucket. */
export async function uploadPoster(userId: string, blob: Blob): Promise<string> {
  const path = `${userId}/poster-${Date.now()}.jpg`;
  const { error } = await supabase.storage.from('videos').upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
  if (error) throw error;
  return supabase.storage.from('videos').getPublicUrl(path).data.publicUrl;
}
