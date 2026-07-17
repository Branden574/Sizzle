import { create } from 'zustand';
import type { DirectUploadTicket, RecipeDetail } from '@sizzle/shared';
import { queryClient, finalizeVideoAsset, type UploadRecipeInput } from '../data/queries';
import { apiSend, ApiError } from './api';
import { uploadPoster, uploadToCloudflare, uploadVideo, captureVideoPoster, StorageUploadError } from './storage';
import { rememberLocalClip } from './localClips';
import { useSizzle } from '../store';

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
  /** Retry checkpoints: filled as steps complete so Retry RESUMES (a publish-step
   *  failure must not re-upload 150 MB of already-transferred video). */
  ck?: { posterUrl?: string; uploadedUrl?: string; videoAssetId?: string };
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
  try {
    // 1. Poster first (small, sequential — never contends with the transfer).
    //    If the pick-time capture missed (slow decode on a big clip), try ONCE
    //    more here — still before the byte transfer, so no decode contention.
    //    Best-effort, but LOUD on failure so it can't silently regress again.
    if (!job.coverBlob) {
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
        ck.uploadedUrl = await uploadVideo(job.userId, job.file, (p) => set({ progress: p }));
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
    if (coverUrl) URL.revokeObjectURL(coverUrl);
    if (job?.videoUrl && status === 'error') URL.revokeObjectURL(job.videoUrl);
    set({ status: 'idle', coverUrl: null, title: '', error: null, job: null, progress: 0 });
  },
}));
