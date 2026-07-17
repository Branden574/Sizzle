import { Upload } from 'tus-js-client';
import { webEnv } from './env';
import { supabase } from './supabase';

/**
 * A storage upload failure carrying the REAL server reason. `status` is the
 * storage error code (Supabase tucks the true code — 413 too large, 403 RLS,
 * 415 mime — inside the body even when the HTTP status is 400). `permanent`
 * means retrying the identical bytes cannot succeed (size/permission/mime), so
 * callers must NOT waste minutes re-uploading — surface the reason instead.
 * This exists because uploads used to fail silently: the bar hit 99%, the server
 * rejected the finished upload, and the user saw nothing.
 */
export class StorageUploadError extends Error {
  status: number;
  permanent: boolean;
  constructor(status: number, message: string, permanent: boolean) {
    super(message);
    this.name = 'StorageUploadError';
    this.status = status;
    this.permanent = permanent;
  }
}

/** Parse a storage error response into a StorageUploadError with the true code. */
function parseStorageError(httpStatus: number, body: string): StorageUploadError {
  let message = '';
  let code = httpStatus;
  try {
    const j = JSON.parse(body) as { statusCode?: string | number; error?: string; message?: string };
    message = j.message || j.error || '';
    const sc = parseInt(String(j.statusCode), 10);
    if (Number.isFinite(sc) && sc >= 100) code = sc;
  } catch { /* non-JSON body */ }
  // 4xx = the server examined and rejected this exact request — a retry with the
  // same bytes fails the same way. 5xx / 0 (network) are worth retrying.
  const permanent = code >= 400 && code < 500;
  return new StorageUploadError(code, message || `upload failed (${httpStatus})`, permanent);
}

/** Map a supabase-js SDK storage error into a StorageUploadError. */
function mapSdkError(error: unknown): StorageUploadError {
  const e = error as { statusCode?: string | number; status?: number; message?: string } | null;
  const code = Number(e?.statusCode ?? e?.status) || 0;
  return new StorageUploadError(code, e?.message || 'upload failed', code >= 400 && code < 500);
}

/** PUT a blob to a URL via XHR so we get real upload-progress events. */
function xhrPut(url: string, body: Blob, contentType: string, onProgress?: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('content-type', contentType);
    xhr.setRequestHeader('x-upsert', 'true');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.min(99, Math.round((e.loaded / e.total) * 100)));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(parseStorageError(xhr.status, xhr.responseText)));
    xhr.onerror = () => reject(new StorageUploadError(0, 'upload network error', false));
    xhr.send(body);
  });
}

/**
 * Upload to the `videos` bucket via signed URL + XHR PUT — the path PROVEN to
 * work in production (clips upload through it every day). Posters/photos ride
 * the same path instead of the SDK's direct POST, which was silently 400ing.
 * Returns the public URL.
 */
async function putViaSignedUrl(path: string, body: Blob, contentType: string, onProgress?: (pct: number) => void): Promise<string> {
  const { data, error } = await supabase.storage.from('videos').createSignedUploadUrl(path);
  if (error || !data?.signedUrl) throw mapSdkError(error ?? new Error('no signed url'));
  const signed = data.signedUrl;
  const url = signed.startsWith('http') ? signed : `${webEnv.supabaseUrl}/storage/v1${signed.startsWith('/storage/v1') ? signed.slice('/storage/v1'.length) : signed}`;
  await xhrPut(url, body, contentType, onProgress);
  return supabase.storage.from('videos').getPublicUrl(path).data.publicUrl;
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
    const startedAt = Date.now();
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
      onSuccess: () => finish(() => {
        // Real transfer measurement (visible in the remote Safari console during a
        // device test) — proves the actual upload speed instead of guessing.
        const secs = (Date.now() - startedAt) / 1000;
        const mb = file.size / 1_048_576;
        console.log(`[upload] tus DONE: ${mb.toFixed(1)} MB in ${secs.toFixed(1)}s = ${(mb / Math.max(secs, 0.001)).toFixed(2)} MB/s (${((file.size * 8) / 1e6 / Math.max(secs, 0.001)).toFixed(1)} Mbps), direct→Cloudflare`);
        resolve();
      }),
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
    await putViaSignedUrl(path, file, file.type || 'video/mp4', onProgress);
  } catch (e) {
    // A PERMANENT rejection (too large / permission / mime) fails identically on a
    // retry — surface the real reason instead of silently re-uploading the whole
    // file a second time (the old flow doubled the wait, then failed anyway).
    if (e instanceof StorageUploadError && e.permanent) throw e;
    // Transient (network/5xx): one reliable SDK fallback (no granular progress).
    const { error } = await supabase.storage.from('videos').upload(path, file, { upsert: true, contentType: file.type || 'video/mp4' });
    if (error) throw mapSdkError(error);
  }
  onProgress?.(100);
  return supabase.storage.from('videos').getPublicUrl(path).data.publicUrl;
}

/**
 * FAST: read only the video's duration (metadata). Used to gate the length limit
 * before upload — never blocks (resolves within ~3s or null). No frame capture.
 */
export function getVideoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.src = url;
    let settled = false;
    const done = (d: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      try { video.removeAttribute('src'); video.load(); } catch { /* detached */ }
      resolve(d);
    };
    const timer = setTimeout(() => done(null), 3000);
    video.onerror = () => done(null);
    video.onloadedmetadata = () => done(Number.isFinite(video.duration) ? Math.round(video.duration) : null);
  });
}

/**
 * RELIABLE poster capture for the iOS WKWebView. drawImage(video) captures a
 * BLACK frame on iOS unless the video has actually rendered one — so we load real
 * frame data, briefly PLAY the muted clip (allowed: muted+playsInline), and grab
 * the first frame that's actually presented (timeupdate past 0). Runs BEFORE the
 * transfer (not in parallel — decoding + uploading the same large file at once
 * stalls the upload on iOS), so it's time-boxed tight (6s) to bound the delay it
 * adds. Best-effort: resolves null if it genuinely can't (the Cloudflare thumbnail
 * is the backstop) so it never blocks the post.
 */
export function captureVideoPoster(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.preload = 'auto'; // safe here — this is NOT on the upload critical path
    video.src = url;

    let settled = false;
    let capturing = false;
    const done = (b: Blob | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { video.pause(); video.removeAttribute('src'); video.load(); } catch { /* detached */ }
      URL.revokeObjectURL(url);
      resolve(b);
    };
    const timer = setTimeout(() => done(null), 6000);

    const grab = () => {
      if (capturing) return;
      capturing = true;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx || !canvas.width) return done(null);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((b) => done(b), 'image/jpeg', 0.72);
      } catch {
        done(null);
      }
    };

    video.onerror = () => done(null);
    video.onloadeddata = () => {
      const p = video.play();
      if (p && typeof p.catch === 'function') p.catch(() => grab()); // if autoplay is blocked, try a static grab
    };
    // A real frame has rendered once playback advances — capture it, then stop.
    video.ontimeupdate = () => { if (video.currentTime >= 0.05) grab(); };
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
  return putViaSignedUrl(path, clean, 'image/jpeg');
}

/** Upload a captured poster frame to the user-scoped `videos` bucket. */
export async function uploadPoster(userId: string, blob: Blob): Promise<string> {
  const path = `${userId}/poster-${Date.now()}.jpg`;
  return putViaSignedUrl(path, blob, 'image/jpeg');
}
