import { create } from 'zustand';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import type { DirectUploadTicket, RecipeDetail } from '@sizzle/shared';
import { queryClient, finalizeVideoAsset, type UploadRecipeInput } from '../data/queries';
import { apiSend, ApiError } from './api';
import { uploadPoster, uploadToCloudflare, uploadVideo, captureVideoPoster, createSignedPutUrl, StorageUploadError } from './storage';
import { rememberLocalClip } from './localClips';
import { useSizzle } from '../store';
import { isNative } from './native';

/**
 * TikTok-style BACKGROUND upload: hitting Post closes the composer immediately
 * and the transfer + publish run here, outside any component, while the user is
 * back on the feed. <UploadProgressTile> renders this store's state as the small
 * top-left tile (progress → ✓ / visible error with Retry). One task at a time —
 * the composer refuses a new Post while one is in flight.
 *
 * NOTE: "background" means while the app is OPEN (the WebView still runs). If the
 * app is killed mid-upload the transfer dies with it — surviving that needs the
 * native uploader (planned, requires a new binary).
 */

export interface UploadJob {
  userId: string;
  file: File;
  /** Cover frame captured at pick — reused as the post's poster. */
  coverBlob: Blob | null;
  /** Object URL of the cover (tile thumbnail). Owned by the task once started. */
  coverUrl: string | null;
  /** Object URL of the clip (instant self-playback). Owned by the task once started. */
  videoUrl: string | null;
  durationSeconds?: number;
  /** Recipe payload for POST /recipes (no media fields — the task fills those). */
  input: Omit<UploadRecipeInput, 'video' | 'videoAssetId' | 'images'>;
  /** Web browsers upload direct to Cloudflare; native rides the Supabase relay. */
  webDirect: boolean;
  /** Pop the share moment when the post goes live (publish only, not draft/scheduled). */
  shareAfterPost: boolean;
  /** Idempotency key (one per picked clip) — server returns the same asset on a retry. */
  clientUploadId: string;
  /** Native picker's on-disk path — lets an app-kill mid-upload RESUME on relaunch
   *  (the File object dies with the process; the path usually survives). */
  filePath?: string;
  /** Retry checkpoints: filled as steps complete so Retry RESUMES (a publish-step
   *  failure must not re-upload 150 MB of already-transferred video).
   *  nativeUploadId/pendingUploadUrl track an in-flight NATIVE background transfer —
   *  if the app is killed, the URLSession finishes anyway and the next launch
   *  claims the completion event instead of re-uploading. */
  ck?: { posterUrl?: string; uploadedUrl?: string; videoAssetId?: string; nativeUploadId?: string; pendingUploadUrl?: string };
}

/**
 * The byte transfer. Build 25+: a NATIVE background URLSession PUTs straight from
 * the picker's file path — the transfer keeps running when the app is backgrounded
 * or even killed (iOS finishes it and hands us the event next launch). Builds
 * without the plugin (or blobs with no path) use the in-app XHR transfer.
 */
async function uploadVideoNativeOrJs(job: UploadJob, onProgress: (p: number) => void): Promise<string> {
  const canNative = isNative && Capacitor.isPluginAvailable('Uploader') && !!job.filePath && job.file.size > 0;
  if (!canNative) return uploadVideo(job.userId, job.file, onProgress);

  const ext = (job.file.name.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '');
  const path = `${job.userId}/clip-${Date.now()}.${ext}`;
  const { putUrl, publicUrl } = await createSignedPutUrl(path);
  const { Uploader } = await import('@capgo/capacitor-uploader');

  return new Promise<string>((resolve, reject) => {
    let uploadId = '';
    let settled = false;
    let handle: { remove: () => Promise<void> } | null = null;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      void handle?.remove().catch(() => {});
      fn();
    };
    void (async () => {
      try {
        handle = await Uploader.addListener('events', (ev) => {
          if (ev.eventId) void Uploader.acknowledgeEvent({ eventId: ev.eventId }).catch(() => {});
          if (ev.id !== uploadId) return;
          if (ev.name === 'uploading') {
            onProgress(Math.min(99, Math.round(ev.payload.percent ?? 0)));
          } else if (ev.name === 'completed') {
            finish(() => resolve(publicUrl));
          } else if (ev.name === 'failed') {
            const code = ev.payload.statusCode ?? 0;
            finish(() => reject(new StorageUploadError(code, ev.payload.error || 'native upload failed', code >= 400 && code < 500)));
          }
        });
        const { id } = await Uploader.startUpload({
          filePath: job.filePath!,
          serverUrl: putUrl,
          method: 'PUT',
          uploadType: 'binary',
          headers: { 'content-type': job.file.type || 'video/mp4', 'x-upsert': 'true' },
          notificationTitle: 'Posting your recipe…',
          maxRetries: 3,
        });
        uploadId = id;
        // Persist the in-flight transfer so an app-kill can CLAIM its completion
        // on relaunch instead of re-uploading from zero.
        const ck = (job.ck ??= {});
        ck.nativeUploadId = id;
        ck.pendingUploadUrl = publicUrl;
        persistJob(job);
      } catch (e) {
        finish(() => reject(e instanceof Error ? e : new Error(String(e))));
      }
    })();
  });
}

// ——— Survive app-kill: persist the in-flight job (native only) ————————————
// The upload runs in JS, so swiping the app away kills it mid-transfer. We
// persist a JSON descriptor of the job (never the bytes) + its checkpoints; on
// the next launch resumePendingUpload() re-reads the file from filePath and
// offers Retry from wherever it died — if the bytes had finished, Retry skips
// straight to publishing. TRUE kill-proof uploads need the native uploader
// (planned binary); this is the best JS can do and it covers the common case.
const PERSIST_KEY = 'sizzle.pendingUpload';
type PersistedJob = {
  userId: string;
  filePath?: string;
  fileName: string;
  fileType: string;
  durationSeconds?: number;
  input: UploadJob['input'];
  webDirect: boolean;
  shareAfterPost: boolean;
  clientUploadId: string;
  ck?: UploadJob['ck'];
};

function persistJob(job: UploadJob): void {
  if (!isNative) return;
  const p: PersistedJob = {
    userId: job.userId,
    filePath: job.filePath,
    fileName: job.file.name,
    fileType: job.file.type,
    durationSeconds: job.durationSeconds,
    input: job.input,
    webDirect: job.webDirect,
    shareAfterPost: job.shareAfterPost,
    clientUploadId: job.clientUploadId,
    ck: job.ck,
  };
  void Preferences.set({ key: PERSIST_KEY, value: JSON.stringify(p) }).catch(() => {});
}

function clearPersistedJob(): void {
  if (!isNative) return;
  void Preferences.remove({ key: PERSIST_KEY }).catch(() => {});
}

let resumeChecked = false;
/** Called once post-auth: restore an upload the OS killed mid-flight. */
export async function resumePendingUpload(currentUserId: string): Promise<void> {
  if (!isNative || resumeChecked) return;
  resumeChecked = true;
  try {
    const { value } = await Preferences.get({ key: PERSIST_KEY });
    if (!value) return;
    const p = JSON.parse(value) as PersistedJob;
    if (p.userId !== currentUserId) { clearPersistedJob(); return; }
    // A native background transfer may have FINISHED while the app was dead —
    // the plugin re-delivers its events on relaunch. Give it a short window to
    // claim the completion so Retry skips straight to publishing.
    if (p.ck?.nativeUploadId && p.ck.pendingUploadUrl && !p.ck.uploadedUrl && Capacitor.isPluginAvailable('Uploader')) {
      try {
        const { Uploader } = await import('@capgo/capacitor-uploader');
        const completed = await new Promise<boolean>((resolve) => {
          let h: { remove: () => Promise<void> } | null = null;
          const t = setTimeout(() => { void h?.remove().catch(() => {}); resolve(false); }, 3000);
          void Uploader.addListener('events', (ev) => {
            if (ev.eventId) void Uploader.acknowledgeEvent({ eventId: ev.eventId }).catch(() => {});
            if (ev.id === p.ck!.nativeUploadId && ev.name === 'completed') {
              clearTimeout(t);
              void h?.remove().catch(() => {});
              resolve(true);
            }
          }).then((hh) => { h = hh; });
        });
        if (completed) p.ck.uploadedUrl = p.ck.pendingUploadUrl;
      } catch { /* best effort — Retry re-uploads if unclaimed */ }
    }
    // Re-read the original file from the picker's path (survives most relaunches).
    let file: File | null = null;
    if (p.filePath) {
      try {
        const blob = await (await fetch(Capacitor.convertFileSrc(p.filePath))).blob();
        if (blob.size > 0) file = new File([blob], p.fileName, { type: p.fileType });
      } catch { /* tmp file purged — see below */ }
    }
    if (!file && !p.ck?.uploadedUrl) {
      // Nothing to resume from: tell the user honestly instead of vanishing.
      clearPersistedJob();
      useUploadTask.setState({
        status: 'error', title: p.input.title, job: null,
        error: `"${p.input.title}" didn't finish uploading before the app closed — please post it again.`,
      });
      return;
    }
    // Bytes already uploaded (ck.uploadedUrl) can publish even without the file.
    const job: UploadJob = {
      userId: p.userId,
      file: file ?? new File([], p.fileName, { type: p.fileType }),
      coverBlob: null, coverUrl: null, videoUrl: null,
      durationSeconds: p.durationSeconds,
      input: p.input,
      webDirect: p.webDirect,
      shareAfterPost: p.shareAfterPost,
      clientUploadId: p.clientUploadId,
      filePath: p.filePath,
      ck: p.ck,
    };
    useUploadTask.setState({
      status: 'error', title: p.input.title, job,
      error: `"${p.input.title}" was interrupted — tap Retry to finish posting.`,
    });
  } catch {
    clearPersistedJob();
  }
}

export type UploadTaskStatus = 'idle' | 'uploading' | 'publishing' | 'done' | 'error';

interface UploadTaskState {
  status: UploadTaskStatus;
  progress: number; // byte-transfer % (0–99); publish shows indeterminate
  coverUrl: string | null;
  title: string;
  error: string | null;
  job: UploadJob | null;
  /** Start a new upload. Returns false (and does nothing) if one is already running. */
  start: (job: UploadJob) => boolean;
  retry: () => void;
  dismiss: () => void;
}

/** Map an upload failure to a specific, honest user message — never a silent bar-vanish. */
export function uploadErrorMessage(e: unknown): string {
  if (e instanceof StorageUploadError) {
    if (e.status === 413 || /exceed|too large|maximum.*size/i.test(e.message))
      return 'That video is too large — the limit is 2 GB. Trim it or export at a lower quality and try again.';
    if (e.status === 415 || /mime|content.?type/i.test(e.message))
      return "That file type isn't supported — export it as MP4 or MOV and try again.";
    // 401 only — a storage-side permission/RLS message is NOT proof the session
    // expired (a signed-in user hit exactly this and got told to sign in again).
    if (e.status === 401 || /jwt expired/i.test(e.message))
      return 'Your session expired — sign in again to post.';
    if (e.status === 0) return 'Lost connection during the upload — check your signal and retry.';
    return `Upload failed: ${e.message} — tap Retry.`;
  }
  if (e instanceof ApiError) {
    if (e.status === 429) return "You've hit today's upload limit. Try again tomorrow.";
    if (e.status === 401) return 'Your session expired — sign in again to post.';
    if (e.status === 400 && e.message) return e.message;
  }
  return "Couldn't upload the video — check your connection and retry.";
}

async function run(job: UploadJob, set: (s: Partial<UploadTaskState>) => void, get: () => UploadTaskState): Promise<void> {
  set({ status: 'uploading', progress: 0, error: null, coverUrl: job.coverUrl, title: job.input.title, job });
  const ck = (job.ck ??= {});
  persistJob(job); // survives an app-kill → resumePendingUpload offers Retry
  try {
    // 1. Poster first (small, sequential — never contends with the transfer).
    //    If the pick-time capture missed (slow decode on a big clip), try ONCE
    //    more here — still before the byte transfer, so no decode contention.
    //    Best-effort, but LOUD on failure so it can't silently regress again.
    //    (A resumed job may carry an empty placeholder File — nothing to decode.)
    if (!job.coverBlob && job.file.size > 0) {
      try {
        job.coverBlob = await captureVideoPoster(job.file);
        if (job.coverBlob && !get().coverUrl) {
          const url = URL.createObjectURL(job.coverBlob);
          job.coverUrl = url;
          set({ coverUrl: url }); // late cover: the tile picks it up too
        }
      } catch { /* placeholder tile; Cloudflare thumbnail is the backstop */ }
    }
    if (job.coverBlob && !ck.posterUrl) {
      try {
        ck.posterUrl = await uploadPoster(job.userId, job.coverBlob);
        persistJob(job);
      } catch (e) {
        const se = e as StorageUploadError;
        console.error(`[upload] poster upload FAILED (${se.status ?? '?'}): ${se.message ?? e}`);
      }
    }
    const posterUrl = ck.posterUrl;

    // 2. The byte transfer (skipped on Retry when a checkpoint says it's done).
    let detail: RecipeDetail;
    if (job.webDirect) {
      // Web browser: straight to Cloudflare (multipart works outside the WKWebView).
      // A basic direct-upload URL is one-shot, so this leg restarts on Retry unless
      // the asset checkpoint proves the bytes already landed.
      if (!ck.videoAssetId) {
        const ticket = await apiSend<DirectUploadTicket>('POST', '/uploads/video', {});
        await uploadToCloudflare(ticket.uploadUrl, job.file, (p) => set({ progress: p }));
        ck.videoAssetId = ticket.videoAssetId;
        persistJob(job);
      }
      set({ status: 'publishing', progress: 99 });
      if (posterUrl) {
        try { await apiSend('POST', `/uploads/video/${ck.videoAssetId}/poster`, { posterUrl }); }
        catch (e) { console.warn('[upload] set poster failed', e); }
      }
      // POST /recipes dedupes on videoAssetId server-side — a retried create
      // returns the existing recipe instead of publishing a duplicate.
      detail = await apiSend<RecipeDetail>('POST', '/recipes', { ...job.input, videoAssetId: ck.videoAssetId });
      finalizeVideoAsset(ck.videoAssetId, queryClient, detail.id);
    } else {
      // Native (and web fallback): the PROVEN path — Supabase, server relays to Cloudflare.
      if (!ck.uploadedUrl) {
        // Build 25+: the byte transfer runs in a NATIVE background URLSession —
        // it keeps going even if the app is backgrounded or killed. Older builds
        // (or no file path) use the in-app XHR transfer.
        ck.uploadedUrl = await uploadVideoNativeOrJs(job, (p) => set({ progress: p }));
        persistJob(job);
      }
      set({ status: 'publishing', progress: 99 });
      if (!ck.videoAssetId) {
        // clientUploadId makes the register idempotent: a retry after a lost
        // response gets the SAME asset back (no duplicate row/transcode).
        const ticket = await apiSend<DirectUploadTicket>('POST', '/uploads/video', {
          uploadedUrl: ck.uploadedUrl, posterUrl, durationSeconds: job.durationSeconds,
          clientUploadId: job.clientUploadId,
        });
        ck.videoAssetId = ticket.videoAssetId;
        persistJob(job);
      }
      detail = await apiSend<RecipeDetail>('POST', '/recipes', { ...job.input, videoAssetId: ck.videoAssetId });
      finalizeVideoAsset(ck.videoAssetId, queryClient, detail.id);
    }

    // 3. Post-publish: instant self-playback + refresh every surface that shows the post.
    if (job.videoUrl && detail?.id) rememberLocalClip(detail.id, job.videoUrl);
    else if (job.videoUrl) URL.revokeObjectURL(job.videoUrl);
    for (const key of [['feed'], ['cook'], ['me'], ['me', 'drafts']] as const) {
      void queryClient.invalidateQueries({ queryKey: [...key] });
    }
    if (job.shareAfterPost && detail?.id) useSizzle.getState().setShareAfterPost({ id: detail.id, title: detail.title });

    clearPersistedJob();
    set({ status: 'done', progress: 100 });
    // Let the ✓ breathe, then clear the tile (and release the cover object URL).
    setTimeout(() => {
      const s = get();
      if (s.status !== 'done') return;
      if (s.coverUrl) URL.revokeObjectURL(s.coverUrl);
      set({ status: 'idle', coverUrl: null, title: '', job: null, progress: 0 });
    }, 3500);
  } catch (e) {
    console.error('[upload] task failed:', e);
    // A 400 on publish/register means the checkpointed asset is gone or invalid
    // (e.g. the user left the error tile overnight and the 6h orphan GC collected
    // the asset + source blob). Clear the checkpoints so Retry restarts the
    // transfer from the still-on-device file instead of failing forever.
    if (e instanceof ApiError && e.status === 400) {
      ck.videoAssetId = undefined;
      ck.uploadedUrl = undefined;
    }
    set({ status: 'error', error: uploadErrorMessage(e) });
  }
}

export const useUploadTask = create<UploadTaskState>((set, get) => ({
  status: 'idle',
  progress: 0,
  coverUrl: null,
  title: '',
  error: null,
  job: null,

  start: (job) => {
    const s = get().status;
    if (s === 'uploading' || s === 'publishing') return false;
    // Replacing a lingering done/error tile: release its object URLs first.
    const prev = get();
    if (prev.coverUrl && prev.coverUrl !== job.coverUrl) URL.revokeObjectURL(prev.coverUrl);
    if (prev.job?.videoUrl && prev.job.videoUrl !== job.videoUrl && prev.status === 'error') URL.revokeObjectURL(prev.job.videoUrl);
    void run(job, set, get);
    return true;
  },

  retry: () => {
    const { job, status } = get();
    if (!job || status !== 'error') return;
    void run(job, set, get);
  },

  dismiss: () => {
    const { coverUrl, job, status } = get();
    if (status === 'uploading' || status === 'publishing') return; // no cancel mid-flight (yet)
    clearPersistedJob();
    if (coverUrl) URL.revokeObjectURL(coverUrl);
    if (job?.videoUrl && status === 'error') URL.revokeObjectURL(job.videoUrl);
    set({ status: 'idle', coverUrl: null, title: '', error: null, job: null, progress: 0 });
  },
}));
