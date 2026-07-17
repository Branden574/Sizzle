import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Button, GlassButton } from '../controls';
import { MAX_DURATION_SECONDS, MAX_UPLOAD_BYTES, isPremiumPriceTier, type PostType } from '@sizzle/shared';
import { useAuth } from '../../auth/useAuth';
import { useRequireAuth } from '../../auth/useRequireAuth';
import { useUploadRecipe, useVideoConfig, useMonetizationStatus } from '../../data/queries';
import { PremiumPriceFields } from '../PremiumPriceFields';
import { useSizzle } from '../../store';
import { theme } from '../../theme';
import { getVideoDuration, captureVideoPoster, uploadRecipeImage } from '../../lib/storage';
import { useUploadTask, uploadErrorMessage, type UploadJob } from '../../lib/uploadTask';
import { CameraRecorder } from '../CameraRecorder';
import { NativeCameraRecorder } from '../NativeCameraRecorder';
import { VideoTrimmer } from '../VideoTrimmer';
import { isNative } from '../../lib/native';
import { Capacitor } from '@capacitor/core';

// Use the native camera only when the plugin is actually compiled into this binary.
// If a JS-only OTA ever reaches an older build without it, fall back to the web
// recorder cleanly instead of erroring.
const useNativeCamera = isNative && Capacitor.isPluginAvailable('CameraPreview');
// Native photo picker (build 24+): PHPicker with skipTranscoding returns the
// ORIGINAL file instantly. The WebView <input> path makes iOS re-encode the clip
// to a "compatible" H.264 export first — the 15-20s "preparing" wait before the
// composer even sees the file. Cloudflare normalizes HEVC server-side, so the
// original is exactly what we want. Same binary-guard pattern as the camera.
const useNativePicker = isNative && Capacitor.isPluginAvailable('FilePicker');
// Native picks/recordings are handled BY PATH — no bytes are copied into the
// WebView at pick time (the old eager fetch().blob() froze the UI ~5s on a
// 150MB clip with zero feedback). Preview/cover/duration read the capacitor://
// file URL directly; upload PUTs from the path (build 25's background session);
// the JS fallback reads the blob lazily only if it's actually needed.
import { CameraIcon } from '../icons';

const accent = theme.accent;

// Draft-survival storage (see DRAFT SURVIVAL below).
const COMPOSER_DRAFT_KEY = 'sizzle.composerDraft';
type ComposerDraft = {
  postType?: PostType; title?: string; cuisine?: string; time?: string; servings?: string;
  caption?: string; ingredients?: string; steps?: string;
  calories?: string; proteinG?: string; carbsG?: string; fatG?: string;
  rating?: number; scheduleAt?: string;
  nativePath?: string | null; fileName?: string; fileType?: string; fileSize?: number;
};

const field: CSSProperties = {
  width: '100%',
  background: 'rgba(255,255,255,.06)',
  border: '1.5px solid rgba(255,255,255,.15)',
  borderRadius: 14,
  color: '#fff',
  fontFamily: "'Hanken Grotesk'",
  fontSize: 15,
  padding: '13px 14px',
  outline: 'none',
};
const labelStyle: CSSProperties = { display: 'block', color: 'rgba(255,255,255,.5)', fontSize: 12, fontWeight: 700, letterSpacing: '.4px', textTransform: 'uppercase', margin: '0 0 7px 2px' };

export function UploadSheet() {
  const setShowUpload = useSizzle((s) => s.setShowUpload);
  const setShareAfterPost = useSizzle((s) => s.setShareAfterPost);
  const setTab = useSizzle((s) => s.setTab);
  const requireAuth = useRequireAuth();
  const upload = useUploadRecipe();
  const { data: videoConfig } = useVideoConfig();
  const user = useAuth((s) => s.user);
  const monetize = useMonetizationStatus(!!user);
  const canMonetize = monetize.data?.status === 'active';

  // "Cook this" lineage: pre-fill the composer from the origin recipe.
  const uploadPrefill = useSizzle((s) => s.uploadPrefill);
  const setUploadPrefill = useSizzle((s) => s.setUploadPrefill);

  const [postType, setPostType] = useState<PostType>('recipe');
  const [scheduleAt, setScheduleAt] = useState('');
  const [rating, setRating] = useState(0);
  // Premium pricing (recipes only; gated on an active payout account below).
  const [premium, setPremium] = useState(false);
  const [priceCents, setPriceCents] = useState<number | null>(null);
  const [subOnly, setSubOnly] = useState(false);
  const [priceErr, setPriceErr] = useState(false);
  const [title, setTitle] = useState('');
  const [cuisine, setCuisine] = useState('');
  const [time, setTime] = useState('');
  const [servings, setServings] = useState('');
  const [caption, setCaption] = useState('');
  const [ingredients, setIngredients] = useState(() => uploadPrefill?.ingredients ?? '');
  const [steps, setSteps] = useState(() => uploadPrefill?.steps ?? '');
  // Nutrition per serving (all optional).
  const [calories, setCalories] = useState('');
  const [proteinG, setProteinG] = useState('');
  const [carbsG, setCarbsG] = useState('');
  const [fatG, setFatG] = useState('');

  const isReview = postType === 'review';

  const fileRef = useRef<HTMLInputElement>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [previewAspect, setPreviewAspect] = useState(0); // width / height of the picked clip
  // Static cover frame captured ON PICK. We render THIS image in the composer — never
  // a live-playing <video> — so the WKWebView isn't decoding the whole clip the entire
  // time the form is open (that drains data/battery/memory and, worse, contends with
  // the eventual byte transfer and stalls it). Reused as the post's poster at submit.
  const [coverBlob, setCoverBlob] = useState<Blob | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverLoading, setCoverLoading] = useState(false);
  const [durationSecs, setDurationSecs] = useState<number | null>(null);
  const [prepping, setPrepping] = useState(false);
  const [submitMode, setSubmitMode] = useState<'publish' | 'draft' | null>(null);
  const [progress, setProgress] = useState(0); // upload % (0–100)
  const [videoErr, setVideoErr] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [trimming, setTrimming] = useState(false);

  // Upload plumbing: a stable clientUploadId per picked clip makes a retried/
  // double-tapped submit idempotent (server returns the same asset + recipe, never
  // a duplicate); submittingRef is a SYNCHRONOUS double-tap guard (state updates
  // lag a render, so two fast taps can both pass the canPost check).
  const clientUploadIdRef = useRef<string>('');
  const submittingRef = useRef(false);
  // Native picker's on-disk path for the picked clip: enables the background
  // URLSession transfer (build 25+) and resume-after-kill.
  const nativePathRef = useRef<string | null>(null);
  // Visible reason when the pick fell back to the slow transcoding input — the
  // silent fallback made "sometimes instant, sometimes 20s" look random.
  const [pickerNote, setPickerNote] = useState<string | null>(null);

  // Photo posts (carousel).
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [mediaKind, setMediaKind] = useState<'video' | 'photo'>('video');
  const [photos, setPhotos] = useState<{ file: File; url: string }[]>([]);

  // ——— DRAFT SURVIVAL ————————————————————————————————————————————————
  // A half-written post must survive the app reloading underneath the user
  // (OTA apply, jetsam, accidental swipe-out + kill). Text fields + the picked
  // clip's on-disk path persist as they type and restore on the next open.
  // Cleared on Post (the task owns it from there) and on explicit Cancel.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    if (uploadPrefill) return; // an intentional "Cook this" prefill wins over an old draft
    try {
      const raw = localStorage.getItem(COMPOSER_DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw) as ComposerDraft;
      setPostType(d.postType ?? 'recipe');
      setTitle(d.title ?? '');
      setCuisine(d.cuisine ?? '');
      setTime(d.time ?? '');
      setServings(d.servings ?? '');
      setCaption(d.caption ?? '');
      setIngredients(d.ingredients ?? '');
      setSteps(d.steps ?? '');
      setCalories(d.calories ?? '');
      setProteinG(d.proteinG ?? '');
      setCarbsG(d.carbsG ?? '');
      setFatG(d.fatG ?? '');
      setRating(d.rating ?? 0);
      setScheduleAt(d.scheduleAt ?? '');
      if (d.nativePath) {
        acceptFile(
          new File([], d.fileName || 'clip.mov', { type: d.fileType || 'video/quicktime' }),
          d.nativePath,
          { mediaSrc: Capacitor.convertFileSrc(d.nativePath), size: d.fileSize ?? 0 },
        );
      }
    } catch { /* corrupt draft — start clean */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const meaningful = title.trim() || caption.trim() || ingredients.trim() || steps.trim() || nativePathRef.current;
        if (!meaningful) { localStorage.removeItem(COMPOSER_DRAFT_KEY); return; }
        const d: ComposerDraft = {
          postType, title, cuisine, time, servings, caption, ingredients, steps,
          calories, proteinG, carbsG, fatG, rating, scheduleAt,
          nativePath: nativePathRef.current,
          fileName: videoFile?.name, fileType: videoFile?.type,
          fileSize: videoFile && videoFile.size > 0 ? videoFile.size : undefined,
        };
        localStorage.setItem(COMPOSER_DRAFT_KEY, JSON.stringify(d));
      } catch { /* storage full/private — best effort */ }
    }, 600);
    return () => clearTimeout(t);
  }, [postType, title, cuisine, time, servings, caption, ingredients, steps, calories, proteinG, carbsG, fatG, rating, scheduleAt, videoFile]);

  const pickPhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;
    setVideoErr(null);
    setPhotos((prev) => [...prev, ...files.map((file) => ({ file, url: URL.createObjectURL(file) }))].slice(0, 8));
  };
  const removePhoto = (i: number) =>
    setPhotos((prev) => {
      const p = prev[i];
      if (p) URL.revokeObjectURL(p.url);
      return prev.filter((_, j) => j !== i);
    });

  const acceptFile = (file: File, nativePath?: string, opts?: { mediaSrc?: string; size?: number }) => {
    nativePathRef.current = nativePath ?? null;
    const size = opts?.size ?? file.size;
    // TRANSPARENT gates AT PICK — fail in 1 second with the real reason, not
    // after minutes of upload the server would reject anyway.
    if (size > MAX_UPLOAD_BYTES) {
      setVideoErr(`That video is too large (${(size / 1073741824).toFixed(1)} GB — the limit is ${Math.round(MAX_UPLOAD_BYTES / 1073741824)} GB). Trim it or export at a lower quality.`);
      return;
    }
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    if (coverUrl) URL.revokeObjectURL(coverUrl);
    setVideoErr(null);
    setPreviewAspect(0);
    setCoverBlob(null);
    setCoverUrl(null);
    setDurationSecs(null);
    setVideoFile(file);
    // Path-backed media plays/probes straight from disk (no bytes copied to JS).
    const mediaSrc = opts?.mediaSrc ?? URL.createObjectURL(file);
    setVideoUrl(mediaSrc);
    // Fresh idempotency key per picked clip (retries of THIS clip reuse it).
    clientUploadIdRef.current = crypto.randomUUID();
    // Duration gate too — read metadata now (fast) so an over-long clip is
    // rejected at pick, and submit doesn't have to probe anything.
    const probeSrc: File | string = opts?.mediaSrc ?? file;
    void getVideoDuration(probeSrc).then((d) => {
      setDurationSecs(d);
      if (d && d > MAX_DURATION_SECONDS) {
        setVideoErr(`Videos can be up to ${Math.round(MAX_DURATION_SECONDS / 60)} minutes long — this one is ${Math.round(d / 60)} minutes.`);
        setVideoFile(null);
      }
    });
    // Capture the static cover frame NOW (decode once, then release) so the composer
    // shows an image instead of a looping <video>. Best-effort + time-boxed; if it
    // can't grab a frame we fall back to a neutral placeholder and the poster is
    // re-attempted at submit (Cloudflare's thumbnail is the final backstop).
    setCoverLoading(true);
    captureVideoPoster(probeSrc)
      .then((b) => {
        if (!b) return;
        setCoverBlob(b);
        setCoverUrl(URL.createObjectURL(b));
      })
      .catch(() => { /* placeholder handles the miss */ })
      .finally(() => setCoverLoading(false));
  };

  const pickVideo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (file) acceptFile(file);
  };

  /** Open the library: native PHPicker (instant, original file) when the binary
   *  has it; otherwise the WebView input (iOS transcodes first — slow). */
  const pickFromLibrary = async () => {
    if (!useNativePicker) { fileRef.current?.click(); return; }
    setPickerNote(null);
    try {
      const { FilePicker } = await import('@capawesome/capacitor-file-picker');
      const res = await FilePicker.pickVideos({ limit: 1, skipTranscoding: true });
      const f = res.files[0];
      if (!f?.path) return; // dismissed without picking
      // INSTANT accept: no bytes are read — a zero-length placeholder File carries
      // the name/type, the real media lives at the path, and every consumer
      // (preview, cover, duration, upload) works from the path/src directly.
      acceptFile(
        new File([], f.name || 'clip.mov', { type: f.mimeType || 'video/quicktime' }),
        f.path,
        { mediaSrc: Capacitor.convertFileSrc(f.path), size: f.size ?? 0 },
      );
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      if (/cancel/i.test(msg)) return; // user closed the picker — not an error
      console.warn('[picker] native pick failed — falling back to input', e);
      // No more SILENT fallback: say why it's suddenly slow (usually an iCloud-
      // offloaded video that couldn't be handed over as the original).
      setPickerNote("Couldn't load the original from your library — using the compatibility picker (iOS re-encodes it first, which takes longer).");
      fileRef.current?.click();
    }
  };

  const close = () => {
    // Cancel = discard the picked media AND the saved draft (explicit choice —
    // accidental exits never come through here; they're covered by draft
    // survival + the kill-only update policy). A STARTED upload lives in the
    // global task and keeps going — its object URLs belong to the task.
    try { localStorage.removeItem(COMPOSER_DRAFT_KEY); } catch { /* best effort */ }
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    if (coverUrl) URL.revokeObjectURL(coverUrl);
    photos.forEach((p) => URL.revokeObjectURL(p.url));
    setUploadPrefill(null);
    setShowUpload(false);
  };

  const busy = prepping || coverLoading || upload.isPending;
  // Video mode REQUIRES a picked clip — posting with just a title would publish a
  // permanently blank, unplayable card bound to an empty Cloudflare asset.
  const canPost = title.trim().length > 0 && !busy && (mediaKind === 'video' ? !!videoFile : photos.length > 0);

  const submit = async (mode: 'publish' | 'draft' = 'publish') => {
    if (!requireAuth()) return;
    if (!canPost) return;
    // Synchronous double-tap guard: `busy` (state) lags a render, so two fast taps
    // can both pass canPost — this ref blocks the second one immediately.
    if (submittingRef.current) return;
    submittingRef.current = true;
    if (!clientUploadIdRef.current) clientUploadIdRef.current = crypto.randomUUID();
    const bail = (msg?: string) => { setPrepping(false); setSubmitMode(null); submittingRef.current = false; if (msg) setVideoErr(msg); };
    setSubmitMode(mode);
    const status = mode === 'draft' ? 'draft' : scheduleAt ? 'scheduled' : 'published';
    const scheduledAt = mode !== 'draft' && scheduleAt ? new Date(scheduleAt).toISOString() : undefined;

    // Premium: only a monetization-active creator can price a recipe (reviews never
    // can). Block the post if Premium is on but no valid price tier is chosen.
    const wantPremium = !isReview && canMonetize && premium;
    if (wantPremium && !isPremiumPriceTier(priceCents)) {
      setPriceErr(true);
      bail('Pick a price to make this recipe premium, or turn Premium off.');
      return;
    }
    const premiumPriceCents = wantPremium ? priceCents ?? undefined : undefined;
    const visibility = !isReview && canMonetize && subOnly ? ('subscribers' as const) : undefined;

    // TIKTOK-STYLE VIDEO POST: hand the whole upload+publish to the global
    // background task, close the composer IMMEDIATELY, and land the user back on
    // the feed — <UploadProgressTile> (top-left) shows live progress, then ✓, or
    // the real failure reason with Retry. No more waiting on this screen.
    if (mediaKind === 'video' && videoFile && user) {
      const recipeInput: UploadJob['input'] = {
        title: title.trim(),
        cuisine: cuisine.trim() || 'Home',
        level: 'Easy',
        timeMinutes: isReview ? 0 : parseInt(time, 10) || 15,
        servings: isReview ? 1 : parseInt(servings, 10) || 2,
        caption: caption.trim() || undefined,
        ingredients: isReview ? [] : ingredients.split('\n').map((s) => s.trim()).filter(Boolean),
        steps: isReview ? [] : steps.split('\n').map((s) => s.trim()).filter(Boolean),
        macros: isReview ? undefined : buildMacros(calories, proteinG, carbsG, fatG),
        postType,
        rating: isReview && rating > 0 ? rating : undefined,
        status,
        scheduledAt,
        originRecipeId: uploadPrefill?.originRecipeId,
        priceCents: premiumPriceCents,
        visibility,
      };
      const started = useUploadTask.getState().start({
        userId: user.id,
        file: videoFile,
        coverBlob,
        coverUrl,   // ownership moves to the task (tile art; it revokes on dismiss)
        videoUrl,   // ownership moves to the task (instant self-playback)
        durationSeconds: durationSecs ?? undefined,
        input: recipeInput,
        webDirect: videoConfig?.provider === 'cloudflare' && !isNative,
        shareAfterPost: mode === 'publish' && !scheduleAt,
        clientUploadId: clientUploadIdRef.current,
        filePath: nativePathRef.current ?? undefined,
      });
      if (!started) {
        bail('An upload is already in progress — let it finish first.');
        return;
      }
      try { localStorage.removeItem(COMPOSER_DRAFT_KEY); } catch { /* best effort */ }
      photos.forEach((p) => URL.revokeObjectURL(p.url));
      setUploadPrefill(null);
      setShowUpload(false);
      setTab('feed'); // back to the timeline, TikTok-style — the tile takes it from here
      submittingRef.current = false;
      setSubmitMode(null);
      return;
    }

    // PHOTO POST (fast, stays inline): upload the carousel then create the recipe.
    let images: string[] | undefined;
    if (mediaKind === 'photo' && photos.length && user) {
      try {
        setPrepping(true);
        setProgress(0);
        setVideoErr(null);
        const urls: string[] = [];
        for (let i = 0; i < photos.length; i++) {
          urls.push(await uploadRecipeImage(user.id, photos[i]!.file));
          setProgress(Math.round(((i + 1) / photos.length) * 100));
        }
        images = urls;
      } catch {
        bail("Couldn't upload your photos — please try again.");
        return;
      }
      setPrepping(false);
    }

    upload.mutate(
      {
        title: title.trim(),
        cuisine: cuisine.trim() || 'Home',
        level: 'Easy',
        // Reviews carry no prep time / servings / recipe steps.
        timeMinutes: isReview ? 0 : parseInt(time, 10) || 15,
        servings: isReview ? 1 : parseInt(servings, 10) || 2,
        caption: caption.trim() || undefined,
        ingredients: isReview ? [] : ingredients.split('\n').map((s) => s.trim()).filter(Boolean),
        steps: isReview ? [] : steps.split('\n').map((s) => s.trim()).filter(Boolean),
        macros: isReview ? undefined : buildMacros(calories, proteinG, carbsG, fatG),
        postType,
        rating: isReview && rating > 0 ? rating : undefined,
        status,
        scheduledAt,
        images,
        originRecipeId: uploadPrefill?.originRecipeId,
        priceCents: premiumPriceCents,
        visibility,
      },
      {
        onSuccess: (detail) => {
          try { localStorage.removeItem(COMPOSER_DRAFT_KEY); } catch { /* best effort */ }
          photos.forEach((p) => URL.revokeObjectURL(p.url));
          setUploadPrefill(null);
          setShowUpload(false);
          // Land on the creator's own profile — where the new post now lives — so
          // they immediately see it uploaded (drafts/scheduled show under the
          // profile's Drafts too). Published posts also get the share moment.
          setTab('profile');
          if (mode === 'publish' && !scheduleAt && detail?.id) setShareAfterPost({ id: detail.id, title: detail.title });
        },
        onSettled: () => { setSubmitMode(null); submittingRef.current = false; },
        onError: (e) => setVideoErr(uploadErrorMessage(e)),
      },
    );
  };

  return (
    <div className="sz-upload-sheet" style={{ position: 'absolute', inset: 0, zIndex: 90, background: '#0c0a09', animation: 'sz-slideUp .4s cubic-bezier(.16,1,.3,1)', display: 'flex', flexDirection: 'column' }}>
      {recording && (
        useNativeCamera ? (
          <NativeCameraRecorder
            onClose={() => setRecording(false)}
            onCapture={(file, path) => {
              // Recordings are PATH-BASED (no bytes in JS) — same treatment as
              // native picks: preview/probe from the file URL, upload from the path.
              acceptFile(file, path, path ? { mediaSrc: Capacitor.convertFileSrc(path), size: file.size || 0 } : undefined);
              setRecording(false);
            }}
            onLibrary={() => { setRecording(false); void pickFromLibrary(); }}
          />
        ) : (
          <CameraRecorder
            onClose={() => setRecording(false)}
            onCapture={(file) => { acceptFile(file); setRecording(false); }}
          />
        )
      )}
      {trimming && videoFile && (
        <VideoTrimmer
          file={videoFile}
          onTrimmed={(f) => { acceptFile(f); setTrimming(false); }}
          onCancel={() => setTrimming(false)}
        />
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '56px 20px 14px', flex: 'none' }}>
        <Button variant="text" onClick={close} style={{ color: '#fff' }}>Cancel</Button>
        <div style={{ color: '#fff', fontSize: 16, fontWeight: 700 }}>{isReview ? 'New review' : 'New recipe'}</div>
        <div style={{ width: 48 }} />
      </div>

      <div className="sz-upload-body" style={{ flex: 1, overflowY: 'auto', padding: '0 20px 16px' }}>
        {uploadPrefill && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0 2px', padding: '9px 13px', background: 'var(--surface, rgba(255,255,255,.06))', border: '1px solid var(--line-2, rgba(255,255,255,.14))', borderRadius: 12 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-muted, rgba(255,255,255,.75))', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              🍳 Cooking @{uploadPrefill.originHandle}'s “{uploadPrefill.originTitle}” — your post will credit the original
            </span>
            <Button onClick={() => setUploadPrefill(null)} aria-label="Remove recipe credit" style={{ flex: 'none', border: 'none', background: 'none', color: 'var(--text-faint, rgba(255,255,255,.5))', fontSize: 16, cursor: 'pointer', padding: 2 }}>✕</Button>
          </div>
        )}
        <input ref={fileRef} type="file" accept="video/*" onChange={pickVideo} style={{ display: 'none' }} />
        <input ref={photoInputRef} type="file" accept="image/*" multiple onChange={pickPhotos} style={{ display: 'none' }} />

        {/* Post type — recipe/tutorial vs foodie review. */}
        <div style={{ display: 'flex', gap: 6, padding: 5, borderRadius: 16, background: 'rgba(255,255,255,.06)', border: '1.5px solid rgba(255,255,255,.12)', marginBottom: 18 }}>
          {([['recipe', 'Recipe'], ['review', 'Food review']] as const).map(([val, label]) => {
            const on = postType === val;
            return (
              <Button
                key={val}
                onClick={() => setPostType(val)}
                aria-pressed={on}
                style={{
                  flex: 1,
                  padding: '11px 0',
                  borderRadius: 12,
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: "'Hanken Grotesk'",
                  fontSize: 14.5,
                  fontWeight: 700,
                  transition: 'all .2s ease',
                  background: on ? `linear-gradient(135deg,${accent},#e23a18)` : 'transparent',
                  color: on ? '#fff' : 'rgba(255,255,255,.55)',
                  boxShadow: on ? '0 6px 16px -8px rgba(226,58,24,.7)' : 'none',
                }}
              >
                {label}
              </Button>
            );
          })}
        </div>

        {/* Media kind — a video clip or a photo carousel. */}
        <div style={{ display: 'flex', gap: 6, padding: 5, borderRadius: 16, background: 'rgba(255,255,255,.06)', border: '1.5px solid rgba(255,255,255,.12)', marginBottom: 14 }}>
          {([['video', 'Video'], ['photo', 'Photos']] as const).map(([val, label]) => {
            const on = mediaKind === val;
            return (
              <Button key={val} aria-pressed={on} onClick={() => setMediaKind(val)} style={{ flex: 1, padding: '10px 0', borderRadius: 12, border: 'none', cursor: 'pointer', fontFamily: "'Hanken Grotesk'", fontSize: 14.5, fontWeight: 700, background: on ? '#fff' : 'transparent', color: on ? '#0c0a09' : 'rgba(255,255,255,.6)' }}>{label}</Button>
            );
          })}
        </div>

        {mediaKind === 'photo' ? (
          <div style={{ marginBottom: 18 }}>
            {photos.length === 0 ? (
              <Button onClick={() => photoInputRef.current?.click()} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: 16, borderRadius: 20, border: 'none', background: `linear-gradient(135deg,${accent},#e23a18)`, cursor: 'pointer', textAlign: 'left', boxShadow: '0 10px 26px -10px rgba(226,58,24,.7)' }}>
                <div style={{ width: 52, height: 52, flex: 'none', borderRadius: '50%', background: 'rgba(255,255,255,.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>🖼️</div>
                <div>
                  <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 21, color: '#fff' }}>Add photos</div>
                  <div style={{ color: 'rgba(255,255,255,.78)', fontSize: 13, marginTop: 2 }}>Up to 8 · swipe through them in the feed</div>
                </div>
              </Button>
            ) : (
              <div className="sz-hscroll" style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
                {photos.map((p, i) => (
                  <div key={p.url} style={{ position: 'relative', flex: '0 0 auto' }}>
                    <img src={p.url} alt="" style={{ width: 96, height: 120, objectFit: 'cover', borderRadius: 14, display: 'block' }} />
                    <Button onClick={() => removePhoto(i)} aria-label="Remove photo" style={{ position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,.6)', color: '#fff', cursor: 'pointer', fontSize: 15, lineHeight: 1 }}>×</Button>
                    <div style={{ position: 'absolute', bottom: 6, left: 6, fontSize: 11, color: '#fff', background: 'rgba(0,0,0,.5)', borderRadius: 6, padding: '1px 6px' }}>{i + 1}</div>
                  </div>
                ))}
                {photos.length < 8 && (
                  <Button onClick={() => photoInputRef.current?.click()} aria-label="Add more photos" style={{ flex: '0 0 auto', width: 96, height: 120, borderRadius: 14, border: '1.5px dashed rgba(255,255,255,.25)', background: 'rgba(255,255,255,.05)', color: 'rgba(255,255,255,.7)', cursor: 'pointer', fontSize: 28 }}>+</Button>
                )}
              </div>
            )}
          </div>
        ) : videoUrl ? (
          <div
            // No cover yet → keep the box SHORT (16/9) so the title/caption fields
            // stay above the fold; a captured portrait cover grows it to 9/12.
            style={{ position: 'relative', borderRadius: 20, overflow: 'hidden', marginBottom: 18, aspectRatio: !coverUrl || previewAspect > 1.05 ? '16 / 9' : '9 / 12', background: '#000', transition: 'aspect-ratio .25s ease' }}
          >
            {/* Static cover — NOT a live <video>. See coverBlob note above. */}
            {coverUrl ? (
              <img
                src={coverUrl}
                alt="Video cover"
                onLoad={(e) => { const im = e.currentTarget; if (im.naturalWidth && im.naturalHeight) setPreviewAspect(im.naturalWidth / im.naturalHeight); }}
                style={{ width: '100%', height: '100%', objectFit: previewAspect > 1.05 ? 'contain' : 'cover', display: 'block' }}
              />
            ) : (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,.55)', fontSize: 13, fontFamily: "'Hanken Grotesk'" }}>
                {coverLoading ? 'Preparing preview…' : 'Video ready to post'}
              </div>
            )}
            <div style={{ position: 'absolute', bottom: 12, right: 12, display: 'flex', gap: 8 }}>
              {/* Trim relies on HTMLVideoElement.captureStream, which iOS WKWebView
                  doesn't support — so it's a silent no-op on the native app. Hide it
                  there rather than show a button that does nothing. */}
              {!isNative && (
                <GlassButton
                  onClick={() => setTrimming(true)}
                  size="sm"
                >
                  ✂️ Trim
                </GlassButton>
              )}
              <GlassButton
                onClick={() => setRecording(true)}
                size="sm"
              >
                Re-record
              </GlassButton>
              <GlassButton
                onClick={() => void pickFromLibrary()}
                size="sm"
              >
                Library
              </GlassButton>
            </div>
          </div>
        ) : (
          <div style={{ marginBottom: 18 }}>
            <Button
              onClick={() => setRecording(true)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '16px', borderRadius: 20, border: 'none', background: `linear-gradient(135deg,${accent},#e23a18)`, cursor: 'pointer', textAlign: 'left', boxShadow: '0 10px 26px -10px rgba(226,58,24,.7)' }}
            >
              <div style={{ width: 52, height: 52, flex: 'none', borderRadius: '50%', background: 'rgba(255,255,255,.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CameraIcon size={26} stroke="#fff" strokeWidth={1.8} />
              </div>
              <div>
                <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 21, color: '#fff' }}>Record a video</div>
                <div style={{ color: 'rgba(255,255,255,.78)', fontSize: 13, marginTop: 2 }}>Hold or tap · stop &amp; keep going</div>
              </div>
            </Button>
            <Button
              onClick={() => void pickFromLibrary()}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10, padding: '14px', borderRadius: 16, border: '1.5px solid rgba(255,255,255,.18)', background: 'rgba(255,255,255,.05)', cursor: 'pointer', color: '#fff', fontFamily: "'Hanken Grotesk'", fontSize: 15, fontWeight: 700 }}
            >
              Upload from library
            </Button>
            <div style={{ color: 'rgba(255,255,255,.4)', fontSize: 12.5, textAlign: 'center', marginTop: 9 }}>Portrait or landscape · up to 30 min · max 2 GB</div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={labelStyle}>{isReview ? 'Dish or place' : 'Title'}</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={isReview ? 'Tonkotsu ramen at Ippudo' : 'Charred Miso Eggplant'} style={field} />
          </div>

          {isReview && (
            <div>
              <label style={labelStyle}>Your rating</label>
              <StarPicker value={rating} onChange={setRating} />
            </div>
          )}

          <div>
            <label style={labelStyle}>{isReview ? 'Your review · add #hashtags' : 'Caption · add #hashtags'}</label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={isReview ? 4 : 2}
              placeholder={isReview ? 'Rich, garlicky broth — worth the wait. #ramen #foodie #review' : 'Smoky, sweet, 20 min. #weeknight #vegetarian #japanese'}
              style={{ ...field, resize: 'vertical', lineHeight: 1.5 }}
            />
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: isReview ? 1 : 2 }}>
              <label style={labelStyle}>Cuisine</label>
              <input value={cuisine} onChange={(e) => setCuisine(e.target.value)} placeholder="Japanese" style={field} />
            </div>
            {!isReview && (
              <>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Time (min)</label>
                  <input value={time} onChange={(e) => setTime(e.target.value)} inputMode="numeric" placeholder="25" style={field} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Serves</label>
                  <input value={servings} onChange={(e) => setServings(e.target.value)} inputMode="numeric" placeholder="2" style={field} />
                </div>
              </>
            )}
          </div>

          {!isReview && (
            <>
              <div>
                <label style={labelStyle}>Ingredients · one per line</label>
                <textarea value={ingredients} onChange={(e) => setIngredients(e.target.value)} rows={4} placeholder={'2 globe eggplants\n3 tbsp white miso'} style={{ ...field, resize: 'vertical', lineHeight: 1.5 }} />
              </div>
              <div>
                <label style={labelStyle}>Method · one step per line</label>
                <textarea value={steps} onChange={(e) => setSteps(e.target.value)} rows={4} placeholder={'Halve and score the eggplants.\nSear cut-side down until caramelized.'} style={{ ...field, resize: 'vertical', lineHeight: 1.5 }} />
              </div>
              <div>
                <label style={labelStyle}>Nutrition per serving · optional</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <MacroInput label="Cal" value={calories} onChange={setCalories} placeholder="520" />
                  <MacroInput label="Protein" value={proteinG} onChange={setProteinG} placeholder="32" unit="g" />
                  <MacroInput label="Carbs" value={carbsG} onChange={setCarbsG} placeholder="48" unit="g" />
                  <MacroInput label="Fat" value={fatG} onChange={setFatG} placeholder="18" unit="g" />
                </div>
              </div>
              <PremiumPriceFields
                value={{ premium, priceCents, subOnly }}
                onChange={(v) => { setPremium(v.premium); setPriceCents(v.priceCents); setSubOnly(v.subOnly); setPriceErr(false); }}
                canMonetize={canMonetize}
                priceErr={priceErr}
              />
            </>
          )}
          {(videoErr || upload.isError) && <div style={{ color: '#ff8a6b', fontSize: 13.5, fontWeight: 600 }}>{videoErr ?? "Couldn't post — please try again."}</div>}
          {pickerNote && !videoErr && <div style={{ color: 'rgba(255,255,255,.55)', fontSize: 12.5 }}>{pickerNote}</div>}
        </div>
      </div>

      <div style={{ padding: '14px 20px 32px', flex: 'none' }}>
        {(prepping || upload.isPending) && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
              {/* Honest progress: the bar only reflects the BYTE upload (0–99%). Once
                  bytes are up we show an indeterminate "Publishing…" while the post
                  is created — we never show 100% before the post actually exists. */}
              <span style={{ color: 'rgba(255,255,255,.85)', fontSize: 13.5, fontWeight: 700 }}>{upload.isPending || progress >= 99 ? 'Publishing…' : 'Uploading your video…'}</span>
              {prepping && !upload.isPending && <span style={{ color: '#fff', fontSize: 14, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{progress}%</span>}
            </div>
            <div style={{ height: 8, borderRadius: 5, background: 'rgba(255,255,255,.14)', overflow: 'hidden' }}>
              <div
                className={progress === 0 || upload.isPending ? 'sz-upload-indeterminate' : undefined}
                style={{ height: '100%', width: progress === 0 || upload.isPending ? '40%' : `${progress}%`, borderRadius: 5, background: `linear-gradient(90deg, ${accent}, #ffb52e)`, transition: 'width .25s ease', boxShadow: '0 0 12px rgba(255,138,72,.6)' }}
              />
            </div>
          </div>
        )}
        {/* Schedule: pick a future time to auto-publish, or leave blank to post now. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,.6)', flex: 'none' }}>Schedule</span>
          <input
            type="datetime-local"
            value={scheduleAt}
            onChange={(e) => setScheduleAt(e.target.value)}
            style={{ flex: 1, height: 40, border: '1.5px solid rgba(255,255,255,.16)', borderRadius: 12, background: 'rgba(255,255,255,.06)', color: '#fff', fontFamily: "'Hanken Grotesk'", fontSize: 13.5, outline: 'none', padding: '0 10px', colorScheme: 'dark' }}
          />
          {scheduleAt && <Button onClick={() => setScheduleAt('')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.5)', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>Clear</Button>}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button
            onClick={() => submit('draft')}
            disabled={!canPost}
            variant="glass"
            size="lg"
            loading={busy && submitMode === 'draft'}
            loadingLabel="Saving…"
          >
            Save draft
          </Button>
          <Button
            onClick={() => submit('publish')}
            disabled={!canPost}
            variant="primary"
            size="lg"
            loading={busy && submitMode === 'publish'}
            loadingLabel={prepping ? 'Uploading…' : 'Posting…'}
            style={{ flex: 1 }}
          >
            {scheduleAt ? 'Schedule' : isReview ? 'Post review' : 'Post recipe'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Parse the four optional macro inputs into the create payload (or nothing). */
export function buildMacros(calories: string, proteinG: string, carbsG: string, fatG: string):
  { calories?: number; proteinG?: number; carbsG?: number; fatG?: number } | undefined {
  const num = (s: string, max: number) => {
    const n = parseInt(s, 10);
    return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : undefined;
  };
  const m = { calories: num(calories, 30000), proteinG: num(proteinG, 2000), carbsG: num(carbsG, 2000), fatG: num(fatG, 2000) };
  return m.calories === undefined && m.proteinG === undefined && m.carbsG === undefined && m.fatG === undefined ? undefined : m;
}

/** One numeric nutrition field (calories / protein / carbs / fat). The composer
 *  is always dark; the edit sheet passes its themed field/label styles. */
export function MacroInput({ label, value, onChange, placeholder, unit, fieldStyle = field, mutedColor = 'rgba(255,255,255,.45)' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string; unit?: string;
  fieldStyle?: CSSProperties; mutedColor?: string;
}) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ position: 'relative' }}>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, '').slice(0, 5))}
          inputMode="numeric"
          placeholder={placeholder}
          aria-label={`${label}${unit ? ` (${unit})` : ''} per serving`}
          style={{ ...fieldStyle, padding: '13px 10px', textAlign: 'center' }}
        />
        {unit && value && (
          <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: mutedColor, pointerEvents: 'none' }}>{unit}</span>
        )}
      </div>
      <div style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: mutedColor, marginTop: 4 }}>{label}</div>
    </div>
  );
}

/** Tap-to-set 1–5 star rating used in the review composer. */
function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {[1, 2, 3, 4, 5].map((n) => {
        const on = n <= value;
        return (
          <Button
            key={n}
            type="button"
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            onClick={() => onChange(value === n ? 0 : n)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, lineHeight: 1 }}
          >
            <svg width={30} height={30} viewBox="0 0 24 24" fill={on ? '#ffb52e' : 'none'} stroke={on ? '#ffb52e' : 'rgba(255,255,255,.3)'} strokeWidth={1.6} strokeLinejoin="round">
              <path d="M12 2.5l2.9 5.88 6.49.94-4.7 4.58 1.11 6.46L12 17.8l-5.8 3.05 1.11-6.46-4.7-4.58 6.49-.94L12 2.5z" />
            </svg>
          </Button>
        );
      })}
    </div>
  );
}
