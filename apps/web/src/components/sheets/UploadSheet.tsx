import { useRef, useState, type CSSProperties } from 'react';
import { Button, GlassButton } from '../controls';
import { MAX_DURATION_SECONDS, MAX_UPLOAD_BYTES, type DirectUploadTicket, type PostType } from '@sizzle/shared';
import { useAuth } from '../../auth/useAuth';
import { useRequireAuth } from '../../auth/useRequireAuth';
import { useUploadRecipe, useVideoConfig, type UploadRecipeInput } from '../../data/queries';
import { apiSend } from '../../lib/api';
import { useSizzle } from '../../store';
import { theme } from '../../theme';
import { probeVideo, uploadPoster, uploadRecipeImage, uploadToCloudflare, uploadVideo } from '../../lib/storage';
import { rememberLocalClip } from '../../lib/localClips';
import { CameraRecorder } from '../CameraRecorder';
import { NativeCameraRecorder } from '../NativeCameraRecorder';
import { VideoTrimmer } from '../VideoTrimmer';
import { isNative } from '../../lib/native';
import { Capacitor } from '@capacitor/core';

// Use the native camera only when the plugin is actually compiled into this binary.
// If a JS-only OTA ever reaches an older build without it, fall back to the web
// recorder cleanly instead of erroring.
const useNativeCamera = isNative && Capacitor.isPluginAvailable('CameraPreview');
import { CameraIcon } from '../icons';

const accent = theme.accent;

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

  // "Cook this" lineage: pre-fill the composer from the origin recipe.
  const uploadPrefill = useSizzle((s) => s.uploadPrefill);
  const setUploadPrefill = useSizzle((s) => s.setUploadPrefill);

  const [postType, setPostType] = useState<PostType>('recipe');
  const [scheduleAt, setScheduleAt] = useState('');
  const [rating, setRating] = useState(0);
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
  const [prepping, setPrepping] = useState(false);
  const [submitMode, setSubmitMode] = useState<'publish' | 'draft' | null>(null);
  const [progress, setProgress] = useState(0); // upload % (0–100)
  const [videoErr, setVideoErr] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [trimming, setTrimming] = useState(false);

  // Photo posts (carousel).
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [mediaKind, setMediaKind] = useState<'video' | 'photo'>('video');
  const [photos, setPhotos] = useState<{ file: File; url: string }[]>([]);

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

  const acceptFile = (file: File) => {
    if (file.size > MAX_UPLOAD_BYTES) {
      setVideoErr(`That file is too large (max ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024 / 1024)} GB).`);
      return;
    }
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoErr(null);
    setPreviewAspect(0);
    setVideoFile(file);
    setVideoUrl(URL.createObjectURL(file));
  };

  const pickVideo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (file) acceptFile(file);
  };

  const close = () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setUploadPrefill(null);
    setShowUpload(false);
  };

  const busy = prepping || upload.isPending;
  // Video mode REQUIRES a picked clip — posting with just a title would publish a
  // permanently blank, unplayable card bound to an empty Cloudflare asset.
  const canPost = title.trim().length > 0 && !busy && (mediaKind === 'video' ? !!videoFile : photos.length > 0);

  const submit = async (mode: 'publish' | 'draft' = 'publish') => {
    if (!requireAuth()) return;
    if (!canPost) return;
    setSubmitMode(mode);
    const status = mode === 'draft' ? 'draft' : scheduleAt ? 'scheduled' : 'published';
    const scheduledAt = mode !== 'draft' && scheduleAt ? new Date(scheduleAt).toISOString() : undefined;

    let video: UploadRecipeInput['video'];
    let videoAssetId: string | undefined;
    let images: string[] | undefined;
    if (mediaKind === 'video' && videoFile && user) {
      try {
        setPrepping(true);
        setProgress(0);
        setVideoErr(null);
        // Probe first (metadata only) so a too-long clip is rejected before the upload.
        const probe = await probeVideo(videoFile);
        if (probe.durationSeconds && probe.durationSeconds > MAX_DURATION_SECONDS) {
          setPrepping(false);
          setVideoErr(`Videos can be up to ${Math.round(MAX_DURATION_SECONDS / 60)} minutes long.`);
          return;
        }
        // The Cloudflare DIRECT upload (multipart POST straight from the client to
        // upload.cloudflarestream.com) does not deliver the body from the iOS
        // WKWebView — the slot stays "Pending Upload" and the post dead-ends. The
        // whole rest of the pipeline is fine (register, transcode, playback all
        // verified), and Supabase Storage uploads DO work from the native shell
        // (photos/avatars prove it). So native routes through Supabase storage;
        // the server relays it into Cloudflare for transcoding (uploads.ts).
        if (videoConfig?.provider === 'cloudflare' && !isNative) {
          // Web browsers deliver the multipart body fine — keep the direct path.
          // We do NOT block on transcoding here; the post is created right away and
          // the asset finishes in the background (useUploadRecipe → finalize).
          const ticket = await apiSend<DirectUploadTicket>('POST', '/uploads/video', {});
          await uploadToCloudflare(ticket.uploadUrl, videoFile, setProgress);
          setProgress(100);
          videoAssetId = ticket.videoAssetId;
        } else {
          const uploadedUrl = await uploadVideo(user.id, videoFile, setProgress);
          let posterUrl: string | undefined;
          if (probe.poster) posterUrl = await uploadPoster(user.id, probe.poster).catch(() => undefined);
          video = { uploadedUrl, posterUrl, durationSeconds: probe.durationSeconds ?? undefined };
        }
      } catch {
        setPrepping(false);
        setVideoErr("Couldn't upload the video — please try again.");
        return;
      }
      setPrepping(false);
    } else if (mediaKind === 'photo' && photos.length && user) {
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
        setPrepping(false);
        setVideoErr("Couldn't upload your photos — please try again.");
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
        video,
        videoAssetId,
        images,
        originRecipeId: uploadPrefill?.originRecipeId,
      },
      {
        onSuccess: (detail) => {
          // Keep the local clip alive under its new recipe id — the feed/viewer
          // play it INSTANTLY (TikTok-style) while Cloudflare transcodes.
          if (videoUrl && detail?.id) rememberLocalClip(detail.id, videoUrl);
          else if (videoUrl) URL.revokeObjectURL(videoUrl);
          photos.forEach((p) => URL.revokeObjectURL(p.url));
          setUploadPrefill(null);
          setShowUpload(false);
          // Land on the creator's own profile — where the new post now lives — so
          // they immediately see it uploaded (drafts/scheduled show under the
          // profile's Drafts too). Published posts also get the share moment.
          setTab('profile');
          if (mode === 'publish' && !scheduleAt && detail?.id) setShareAfterPost({ id: detail.id, title: detail.title });
        },
        onSettled: () => setSubmitMode(null),
      },
    );
  };

  return (
    <div className="sz-upload-sheet" style={{ position: 'absolute', inset: 0, zIndex: 90, background: '#0c0a09', animation: 'sz-slideUp .4s cubic-bezier(.16,1,.3,1)', display: 'flex', flexDirection: 'column' }}>
      {recording && (
        useNativeCamera ? (
          <NativeCameraRecorder
            onClose={() => setRecording(false)}
            onCapture={(file) => { acceptFile(file); setRecording(false); }}
            onLibrary={() => { setRecording(false); fileRef.current?.click(); }}
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
          <div style={{ position: 'relative', borderRadius: 20, overflow: 'hidden', marginBottom: 18, aspectRatio: previewAspect > 1.05 ? '16 / 9' : '9 / 12', background: '#000', transition: 'aspect-ratio .25s ease' }}>
            <video
              src={videoUrl}
              muted
              loop
              autoPlay
              playsInline
              onLoadedMetadata={(e) => { const v = e.currentTarget; if (v.videoWidth && v.videoHeight) setPreviewAspect(v.videoWidth / v.videoHeight); }}
              style={{ width: '100%', height: '100%', objectFit: previewAspect > 1.05 ? 'contain' : 'cover' }}
            />
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
                onClick={() => fileRef.current?.click()}
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
              onClick={() => fileRef.current?.click()}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10, padding: '14px', borderRadius: 16, border: '1.5px solid rgba(255,255,255,.18)', background: 'rgba(255,255,255,.05)', cursor: 'pointer', color: '#fff', fontFamily: "'Hanken Grotesk'", fontSize: 15, fontWeight: 700 }}
            >
              Upload from library
            </Button>
            <div style={{ color: 'rgba(255,255,255,.4)', fontSize: 12.5, textAlign: 'center', marginTop: 9 }}>Portrait or landscape · up to 30 min · 4K</div>
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
            </>
          )}
          {(videoErr || upload.isError) && <div style={{ color: '#ff8a6b', fontSize: 13.5, fontWeight: 600 }}>{videoErr ?? "Couldn't post — please try again."}</div>}
        </div>
      </div>

      <div style={{ padding: '14px 20px 32px', flex: 'none' }}>
        {prepping && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
              <span style={{ color: 'rgba(255,255,255,.85)', fontSize: 13.5, fontWeight: 700 }}>{progress >= 100 ? 'Finishing up…' : 'Uploading your video…'}</span>
              <span style={{ color: '#fff', fontSize: 14, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{progress}%</span>
            </div>
            <div style={{ height: 8, borderRadius: 5, background: 'rgba(255,255,255,.14)', overflow: 'hidden' }}>
              <div
                className={progress === 0 ? 'sz-upload-indeterminate' : undefined}
                style={{ height: '100%', width: progress === 0 ? '40%' : `${progress}%`, borderRadius: 5, background: `linear-gradient(90deg, ${accent}, #ffb52e)`, transition: 'width .25s ease', boxShadow: '0 0 12px rgba(255,138,72,.6)' }}
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
