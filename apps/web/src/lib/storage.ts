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
    video.preload = 'metadata';
    video.src = url;

    const done = (durationSeconds: number | null, poster: Blob | null) => {
      URL.revokeObjectURL(url);
      resolve({ durationSeconds, poster });
    };

    video.onerror = () => done(null, null);
    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) ? Math.round(video.duration) : null;
      // Seek a touch in to grab a representative frame.
      video.currentTime = Math.min(0.1, video.duration || 0);
      video.onseeked = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          if (!ctx || !canvas.width) return done(duration, null);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((b) => done(duration, b), 'image/jpeg', 0.7);
        } catch {
          done(duration, null);
        }
      };
    };
  });
}

/** Upload a captured poster frame to the user-scoped `videos` bucket. */
export async function uploadPoster(userId: string, blob: Blob): Promise<string> {
  const path = `${userId}/poster-${Date.now()}.jpg`;
  const { error } = await supabase.storage.from('videos').upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
  if (error) throw error;
  return supabase.storage.from('videos').getPublicUrl(path).data.publicUrl;
}
