import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { CameraPreview } from '@capgo/camera-preview';
import { Button } from './controls';
import { CameraIcon, CloseIcon } from './icons';

/** Max length of an in-app recording (longer clips upload from the library). */
const MAX_SECONDS = 60;
/** Segment mode (build 26+): total across all stitched segments. */
const TOTAL_MAX_SECONDS = 900; // 15 min in-app; longer clips upload from library

// App-local native plugin (build 26+): stitches recorded segments into ONE video
// (AVMutableComposition passthrough — lossless, seconds-fast). Its presence is
// the gate for the whole TikTok-style pause/resume model; on older binaries the
// recorder keeps the original single-take behavior.
const VideoConcat = registerPlugin<{
  concat(options: { paths: string[] }): Promise<{ path: string }>;
  cleanup(options: { paths: string[] }): Promise<void>;
}>('VideoConcat');
const segmentMode = Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('VideoConcat');
/** A press shorter than this is a "tap" (hands-free start/stop); longer is a "hold". */
const HOLD_MS = 250;
/** Zoom dial: horizontal pixels per zoom octave (2×) — matches iOS dial feel. */
const PX_PER_OCT = 150;

type Status = 'starting' | 'ready' | 'suspended' | 'denied' | 'error';

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec < 10 ? '0' : ''}${sec}`;
}

/**
 * NATIVE camera recorder (iOS/Android via @capgo/camera-preview). Records off the
 * phone's real AVCaptureSession — native quality, HEVC when supported, cinematic
 * stabilization, true optical zoom, and a front↔back flip that works MID-recording.
 *
 * UX mirrors the web CameraRecorder exactly (TikTok-style): HOLD the button to
 * record while held (release stops), or TAP to start hands-free and tap again to
 * stop; the ✓ button also finishes the take. The plugin has no pause/resume, so a
 * take is one continuous clip; stopping hands it to the composer (which offers
 * Re-record / Library).
 *
 * Recording lifecycle is driven by the plugin's `recordingFinished` event — the
 * authoritative "file is finalized on disk" signal (fires for BOTH a manual stop
 * and the native 60s auto-stop) — deduped against stopRecordVideo()'s own result.
 * Every exit path funnels through one idempotent teardown() that stops the camera
 * and restores the WebView, so the camera can never be left running (green dot)
 * and the app can never be left transparent/invisible.
 */
export function NativeCameraRecorder({ onCapture, onClose, onLibrary }: { onCapture: (file: File, nativePath?: string) => void; onClose: () => void; onLibrary?: () => void }) {
  const [status, setStatus] = useState<Status>('starting');
  const [facing, setFacing] = useState<'rear' | 'front'>('rear');
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [lensValues, setLensValues] = useState<number[]>([]);
  const [zoomRange, setZoomRange] = useState<{ min: number; max: number }>({ min: 1, max: 8 });
  // Mic access is requested up-front with the camera; if it's denied we still let
  // them record (some people want silent clips) but say so, so nobody posts a
  // silent cooking video by surprise.
  const [micOff, setMicOff] = useState(false);
  // Torch (continuous light) — the only flash mode that matters for video.
  const [torch, setTorch] = useState(false);
  // SEGMENTS (build 26+): each stop/interruption keeps the take as a segment;
  // ✓ stitches them into one clip. segMsRef accumulates FINISHED segment time.
  const [segCount, setSegCount] = useState(0);
  const [stitching, setStitching] = useState(false);
  const [stitchErr, setStitchErr] = useState(false);
  const [segNote, setSegNote] = useState<string | null>(null);
  const segPathsRef = useRef<string[]>([]);
  const segMsRef = useRef(0);
  const seenPathsRef = useRef(new Set<string>());
  const finishingRef = useRef(false);
  const stitchingRef = useRef(false);

  const codecRef = useRef<'hvc1' | 'avc1'>('avc1');
  const activeRef = useRef(true);
  const tornRef = useRef(false);
  const capturedRef = useRef(false);
  const stoppingRef = useRef(false);
  const recordingRef = useRef(false);
  const tickRef = useRef<number | null>(null);
  const startedAt = useRef(0);
  const pressHold = useRef(false);
  const ignoreUp = useRef(false);
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  const zoomTrailing = useRef<number | null>(null);
  const statusRef = useRef<Status>('starting');
  statusRef.current = status;

  const clearTick = () => {
    if (tickRef.current) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  };

  /**
   * The ONLY place the camera is shut down and the WebView restored. Idempotent —
   * every exit path (unmount, close, capture, any failure) goes through here, so
   * no path can leave the camera running or the app transparent.
   */
  const teardown = useCallback(async () => {
    if (tornRef.current) return;
    tornRef.current = true;
    clearTick();
    if (zoomTrailing.current) { window.clearTimeout(zoomTrailing.current); zoomTrailing.current = null; }
    document.documentElement.classList.remove('sz-native-cam');
    try { await CameraPreview.removeAllListeners(); } catch { /* none */ }
    try { await CameraPreview.stopRecordVideo(); } catch { /* not recording */ }
    try { await CameraPreview.stop(); } catch { /* already stopped */ }
  }, []);

  /**
   * Turn the finalized on-disk take into a File for the existing upload pipeline.
   * Deduped (manual stop + recordingFinished + native auto-stop can all fire).
   * The camera is stopped FIRST so even a failed file read never leaves it running.
   */
  const finalize = useCallback(async (videoFilePath?: string) => {
    if (capturedRef.current) return;
    capturedRef.current = true;
    clearTick();
    recordingRef.current = false;
    if (activeRef.current) setRecording(false);
    try {
      if (!videoFilePath) throw new Error('no file path');
      // Verify the on-disk clip WITHOUT copying it into memory (a stitched
      // 15-minute take can be ~1GB — the old full blob read would OOM). Do NOT
      // gate on res.ok — a local file://→capacitor:// fetch reports ok=false /
      // status 0 even on a perfectly valid read (this is what broke recording).
      // The first bytes existing is the real signal.
      const res = await fetch(Capacitor.convertFileSrc(videoFilePath), { headers: { Range: 'bytes=0-2047' } });
      const head = await res.blob();
      if (!head || head.size === 0) throw new Error('empty recording');
      const ext = (videoFilePath.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4';
      // PATH-BASED handoff: the composer previews/probes from the file URL and
      // the upload PUTs from the path — no bytes are ever copied into JS.
      const file = new File([], `sizzle-${Date.now()}.${ext}`, { type: ext === 'mov' ? 'video/quicktime' : 'video/mp4' });
      // Success → tear the camera down (the composer takes over) and hand off.
      await teardown();
      onCapture(file, videoFilePath);
    } catch {
      // Read failed → keep the camera LIVE so they can simply record again,
      // instead of killing it and forcing a close/reopen. (Unmount still tears
      // down as the backstop.)
      capturedRef.current = false;
      stoppingRef.current = false;
      if (activeRef.current) { setElapsedMs(0); setRecording(false); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teardown]);
  const finalizeRef = useRef(finalize);
  finalizeRef.current = finalize;

  /**
   * SEGMENT MODE (build 26+): a finished file is a SEGMENT, not the take. Keep
   * it, stay in the recorder, and let the user continue — ✓ stitches everything.
   * Deduped by path (manual stop + recordingFinished + auto-stop can all fire).
   */
  const segmentEnd = useCallback((videoFilePath?: string) => {
    if (!videoFilePath || seenPathsRef.current.has(videoFilePath) || capturedRef.current) return;
    seenPathsRef.current.add(videoFilePath);
    segPathsRef.current.push(videoFilePath);
    // Bank this segment's time into the running total.
    segMsRef.current = Math.min(segMsRef.current + (performance.now() - startedAt.current), TOTAL_MAX_SECONDS * 1000);
    clearTick();
    recordingRef.current = false;
    stoppingRef.current = false;
    if (activeRef.current) { setRecording(false); setElapsedMs(0); setSegCount(segPathsRef.current.length); }
    const remaining = TOTAL_MAX_SECONDS * 1000 - segMsRef.current;
    if (finishingRef.current || remaining < 1000) void doFinishRef.current();
  }, []);
  const segmentEndRef = useRef(segmentEnd);
  segmentEndRef.current = segmentEnd;

  /**
   * Stop the live recording and bank it as a segment — WEDGE-PROOF: the plugin
   * does NOT emit recordingFinished when the stop errors, so a rejected stop
   * must reset the recording state itself (after a short grace window in case a
   * late event does land) or the shutter and ✓ are dead forever.
   */
  const stopSegmentSafely = useCallback(async () => {
    if (!recordingRef.current || stoppingRef.current || capturedRef.current) return;
    stoppingRef.current = true;
    try {
      const res = await CameraPreview.stopRecordVideo();
      segmentEndRef.current(res?.videoFilePath);
    } catch {
      window.setTimeout(() => {
        if (recordingRef.current && !capturedRef.current) {
          // The segment is lost (stop errored, no event) — recover the session.
          clearTick();
          recordingRef.current = false;
          finishingRef.current = false;
          if (activeRef.current) { setRecording(false); setElapsedMs(0); }
        }
      }, 800);
    } finally {
      stoppingRef.current = false;
    }
  }, []);
  const stopSegmentSafelyRef = useRef(stopSegmentSafely);
  stopSegmentSafelyRef.current = stopSegmentSafely;

  /** ✓ — stitch all segments into one clip and hand it to the composer. */
  const doFinish = useCallback(async () => {
    if (capturedRef.current || stitching) return;
    if (recordingRef.current) {
      // Stop the live segment first; segmentEnd() re-enters here via finishingRef.
      finishingRef.current = true;
      await stopSegmentSafelyRef.current();
      return;
    }
    const segs = segPathsRef.current;
    if (!segs.length) return;
    finishingRef.current = false;
    setStitchErr(false);
    if (segs.length === 1) { void finalizeRef.current(segs[0]); return; }
    setStitching(true);
    stitchingRef.current = true;
    try {
      const { path } = await VideoConcat.concat({ paths: [...segs] });
      // The inputs are DELETED by the native side on success — rebook the
      // stitched file as the single remaining segment BEFORE finalizing, so a
      // finalize hiccup retries against a file that actually exists.
      segPathsRef.current = [path];
      seenPathsRef.current.add(path);
      if (activeRef.current) setSegCount(1);
      stitchingRef.current = false;
      setStitching(false);
      void finalizeRef.current(path);
    } catch (e) {
      console.error('[recorder] stitch failed', e);
      stitchingRef.current = false;
      if (activeRef.current) { setStitching(false); setStitchErr(true); } // segments intact — ✓ retries
    }
  }, [stitching]);
  const doFinishRef = useRef(doFinish);
  doFinishRef.current = doFinish;

  /** Extracted so mount AND resume-from-background use identical options. */
  const cameraStart = useCallback(async () => {
    await CameraPreview.start({
      position: 'rear',
      toBack: true,
      x: 0,
      y: 0,
      width: Math.round(window.screen.width),
      height: Math.round(window.screen.height),
      aspectMode: 'cover',
      includeSafeAreaInsets: false,
      disableAudio: false,
    });
  }, []);

  /**
   * Backgrounding mid-session (segment mode): iOS kills the camera regardless —
   * bank the live take as a segment, stop the preview, drop the transparency
   * (the app must be OPAQUE while backgrounded — overlays render invisibly
   * otherwise). Foregrounding restarts the preview with every segment intact:
   * an accidental swipe-out costs nothing.
   *
   * SERIALIZED: suspend/resume never overlap. The app-state listener only
   * records the DESIRED state and kicks the worker; the worker converges the
   * actual state to the latest desire, one transition at a time — a fast
   * background→foreground bounce can't interleave a stop with a start.
   */
  const wantActiveRef = useRef(true);
  const transitionChainRef = useRef<Promise<void>>(Promise.resolve());
  const camSuspendedRef = useRef(false);
  const requestTransition = useCallback(() => {
    transitionChainRef.current = transitionChainRef.current.then(async () => {
      for (let i = 0; i < 3; i++) {
        if (tornRef.current || capturedRef.current || !activeRef.current) return;
        const want = wantActiveRef.current;
        if (!want && !camSuspendedRef.current) {
          // ── suspend ──
          camSuspendedRef.current = true;
          await stopSegmentSafelyRef.current();
          try { await CameraPreview.stop(); } catch { /* already stopped / still starting */ }
          document.documentElement.classList.remove('sz-native-cam');
          setTorch(false); // torch dies with the session
          if (activeRef.current && !capturedRef.current) setStatus('suspended');
        } else if (want && camSuspendedRef.current) {
          // ── resume ──
          try {
            document.documentElement.classList.add('sz-native-cam');
            await cameraStart();
            await loadZoomInfoRef.current();
            camSuspendedRef.current = false;
            if (activeRef.current) { setFacing('rear'); setStatus('ready'); }
          } catch (e) {
            if (/already started/i.test(String((e as Error)?.message ?? e))) {
              // Session is live from a half-finished suspend — treat as resumed.
              camSuspendedRef.current = false;
              if (activeRef.current) setStatus('ready');
            } else {
              // Camera didn't come back — segments are safe; ✓ still finishes.
              document.documentElement.classList.remove('sz-native-cam');
              if (activeRef.current) setStatus('suspended');
              return;
            }
          }
        } else {
          return; // converged
        }
      }
    }).catch(() => {});
  }, [cameraStart]);
  const requestTransitionRef = useRef(requestTransition);
  requestTransitionRef.current = requestTransition;

  // Start the native preview behind the (transparented) WebView on mount. Every
  // await is unmount-guarded; any failure funnels through teardown().
  useEffect(() => {
    activeRef.current = true;
    // Tear the camera down the moment the app backgrounds. iOS suspends the
    // AVCaptureSession anyway, and — critically — while sz-native-cam is on, the
    // whole app is transparent; if we returned to a re-locked app-lock passcode
    // (or any overlay) it would render invisibly behind the see-through WebView.
    // Stopping here also removes the class, so we always come back to a normal,
    // opaque app. (removeAllListeners runs before stopRecordVideo in teardown, so
    // no partial clip is captured.)
    let appStateSub: { remove: () => void } | null = null;
    if (Capacitor.isNativePlatform()) {
      void CapApp.addListener('appStateChange', ({ isActive }) => {
        if (tornRef.current) return;
        if (segmentMode) {
          // TikTok-style: backgrounding PAUSES (segment banked, recorder stays);
          // foregrounding restarts the preview with every segment intact. The
          // worker serializes the transitions (no stop/start interleaving).
          wantActiveRef.current = isActive;
          requestTransitionRef.current();
        } else if (!isActive) {
          void teardown();
          onClose();
        }
      }).then((h) => { appStateSub = h; if (tornRef.current) h.remove(); });
    }
    void (async () => {
      try {
        // Ask for camera AND microphone together (disableAudio:false), so the mic
        // prompt appears alongside the camera one — not deferred over the live
        // preview — and we can tell the user if audio will be missing.
        const perm = await CameraPreview.requestPermissions({ disableAudio: false });
        if (!activeRef.current) return;
        if (perm.camera !== 'granted') { setStatus('denied'); return; }
        if (perm.microphone !== undefined && perm.microphone !== 'granted') setMicOff(true);
        document.documentElement.classList.add('sz-native-cam');
        // Full-screen preview edge-to-edge: pass the PHYSICAL screen size
        // (window.screen.* == UIScreen.main.bounds), pin to 0,0, safe-area insets
        // OFF, and 'cover' to fill+crop. (Plugin defaults SHOULD be full-screen but
        // weren't; innerWidth/innerHeight under-reported the height → black band.)
        await cameraStart();
        if (!activeRef.current) { void teardown(); return; }
        try {
          const { codecs } = await CameraPreview.getSupportedVideoCodecs();
          if (codecs.includes('hvc1')) codecRef.current = 'hvc1';
        } catch { /* keep H.264 */ }
        await loadZoomInfo();
        // Authoritative finish signal: fires on manual stop AND native auto-stop.
        // Segment mode banks the file as a segment; classic mode finalizes it.
        await CameraPreview.addListener('recordingFinished', (e) => {
          if (segmentMode) segmentEndRef.current(e.videoFilePath);
          else void finalizeRef.current(e.videoFilePath);
        });
        if (!activeRef.current) { void teardown(); return; }
        // Backgrounded while the camera was still starting? Don't flip to
        // 'ready' behind an opaque WebView. An earlier suspend attempt saw the
        // session mid-init (its stop() rejected), so the session IS running
        // now — clear the suspended flag and re-run the worker so this stop
        // actually lands, parking at 'suspended' until foregrounded.
        if (segmentMode && !wantActiveRef.current) {
          camSuspendedRef.current = false;
          requestTransitionRef.current();
          return;
        }
        setStatus('ready');
      } catch {
        void teardown();
        if (activeRef.current) setStatus('error');
      }
    })();
    return () => {
      activeRef.current = false;
      appStateSub?.remove();
      // Unmounting without a capture abandons any banked segments — free them.
      discardSegmentsRef.current();
      void teardown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadZoomInfo = useCallback(async () => {
    try {
      const [btn, z] = await Promise.all([CameraPreview.getZoomButtonValues(), CameraPreview.getZoom()]);
      if (!activeRef.current) return;
      const vals = (Array.isArray(btn?.values) ? btn.values : []).filter((v) => typeof v === 'number' && v > 0);
      setLensValues([...new Set(vals)].sort((a, b) => a - b));
      setZoomRange({ min: z?.min && z.min > 0 ? z.min : 1, max: z?.max && z.max > 1 ? z.max : 8 });
      setZoom(z?.current && z.current > 0 ? z.current : 1);
    } catch {
      if (!activeRef.current) return;
      setLensValues([]);
      setZoom(1);
    }
  }, []);
  const loadZoomInfoRef = useRef<() => Promise<void>>(async () => {});
  loadZoomInfoRef.current = loadZoomInfo;

  // Flip front↔back — works MID-recording (the plugin swaps the video input while
  // keeping the movie output attached, so the take stays one continuous clip).
  const flip = useCallback(async () => {
    if (statusRef.current !== 'ready') return;
    const next = facing === 'rear' ? 'front' : 'rear';
    try {
      await CameraPreview.flip();
      if (!activeRef.current) return;
      setFacing(next);
      setTorch(false); // the torch belongs to the rear camera; hardware drops it on swap
      await loadZoomInfo(); // front/back expose different lenses + zoom ranges
    } catch { /* single-camera device — stay put */ }
  }, [facing, loadZoomInfo]);

  const zoomCallAt = useRef(0);
  const applyZoom = useCallback((level: number) => {
    if (statusRef.current !== 'ready') return;
    const v = Math.max(zoomRange.min, Math.min(zoomRange.max, Math.round(level * 10) / 10));
    setZoom(v);
    // Throttle the native calls a touch — drags emit faster than the session needs.
    const now = performance.now();
    if (zoomTrailing.current) { window.clearTimeout(zoomTrailing.current); zoomTrailing.current = null; }
    if (now - zoomCallAt.current < 30) {
      // Leading-edge throttle drops the final frame of a fast flick, leaving the
      // hardware (and the recorded footage) a step behind the pill. Schedule a
      // trailing call so the LAST value the user landed on always reaches the lens.
      zoomTrailing.current = window.setTimeout(() => {
        zoomTrailing.current = null;
        if (statusRef.current !== 'ready') return;
        zoomCallAt.current = performance.now();
        CameraPreview.setZoom({ level: v, ramp: false }).catch(() => {});
      }, 40);
      return;
    }
    zoomCallAt.current = now;
    CameraPreview.setZoom({ level: v, ramp: false }).catch(() => {});
  }, [zoomRange]);

  const segCapMs = () => (segmentMode ? Math.max(1000, TOTAL_MAX_SECONDS * 1000 - segMsRef.current) : MAX_SECONDS * 1000);

  const startTick = () => {
    startedAt.current = performance.now();
    clearTick();
    tickRef.current = window.setInterval(() => {
      // Display only — the native maxDuration performs the auto-stop and the
      // recordingFinished listener handles it (no JS/native double-stop race).
      setElapsedMs(Math.min(performance.now() - startedAt.current, segCapMs()));
    }, 100);
  };

  const startRecording = async () => {
    if (statusRef.current !== 'ready' || recordingRef.current || stitchingRef.current) return;
    finishingRef.current = false; // defensive: a stale finish intent must not auto-stitch this take
    try {
      capturedRef.current = false;
      await CameraPreview.startRecordVideo({
        videoCodec: codecRef.current,
        videoQuality: '1080p',
        videoStabilizationMode: 'auto',
        // Segment mode: each segment may run up to the REMAINING total budget.
        maxDuration: Math.ceil(segCapMs() / 1000),
        disableAudio: false,
      });
      if (!activeRef.current) return;
      recordingRef.current = true;
      setRecording(true);
      setElapsedMs(0);
      setSegNote(null);
      startTick();
    } catch {
      // With banked segments, tearing down would trash real footage over one
      // failed start — stay live and point at ✓ instead.
      if (!activeRef.current) return;
      if (segmentMode && segPathsRef.current.length) setSegNote("Couldn't restart the camera — tap ✓ to finish with what you have.");
      else { void teardown(); setStatus('error'); }
    }
  };

  const stopRecording = async () => {
    if (!recordingRef.current || stoppingRef.current || capturedRef.current) return;
    // Segment mode: a stop is a PAUSE — bank the segment and stay in the
    // recorder (✓ finishes). Classic mode: a stop IS the finish.
    if (segmentMode) { await stopSegmentSafelyRef.current(); return; }
    stoppingRef.current = true;
    try {
      const res = await CameraPreview.stopRecordVideo();
      await finalizeRef.current(res?.videoFilePath);
    } catch {
      // The recordingFinished listener may still deliver the file; if neither
      // fires the button stays live so the user can try again.
    } finally {
      stoppingRef.current = false;
    }
  };

  // Torch — the flash mode that matters for video. Dies with the session (flip,
  // suspend), so state resets there too.
  const toggleTorch = async () => {
    if (statusRef.current !== 'ready') return;
    const next = !torch;
    try {
      await CameraPreview.setFlashMode({ flashMode: next ? 'torch' : 'off' });
      if (activeRef.current) setTorch(next);
    } catch { /* front camera / unsupported — leave state as-is */ }
  };

  // Record-button gestures — the SAME proven pointer pattern as the web recorder
  // (pointer events, not click, which is unreliable in WKWebView): hold to record
  // while held, or tap for hands-free; while recording, a tap OR release stops.
  const onDown = (e: React.PointerEvent) => {
    e.preventDefault();
    if (statusRef.current !== 'ready' || stitchingRef.current) return;
    if (recordingRef.current) { void stopRecording(); ignoreUp.current = true; return; } // tap to stop (hands-free)
    void startRecording();
    pressHold.current = false;
    window.setTimeout(() => { pressHold.current = true; }, HOLD_MS);
  };
  const onUp = () => {
    if (ignoreUp.current) { ignoreUp.current = false; return; }
    if (!recordingRef.current) return;
    if (pressHold.current) void stopRecording(); // a hold → release finishes the take
    // a quick tap → keep recording hands-free; the next tap (or ✓) stops it
  };

  // Pinch-to-zoom on the preview (two fingers → native zoom). Ready-gated.
  const dist2 = (t: React.TouchList) => {
    const a = t[0], b = t[1];
    return a && b ? Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) : 0;
  };
  const onPinchStart = (e: React.TouchEvent) => {
    if (statusRef.current === 'ready' && e.touches.length === 2) pinch.current = { dist: dist2(e.touches), zoom };
  };
  const onPinchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinch.current) {
      applyZoom(pinch.current.zoom * (dist2(e.touches) / (pinch.current.dist || 1)));
    }
  };
  const onPinchEnd = () => { pinch.current = null; };

  const doClose = () => {
    // Banked segments are real footage — don't let one mis-tap discard them.
    // (Segment mode only: classic builds keep their instant close.)
    if (segmentMode && (segPathsRef.current.length > 0 || recordingRef.current)) {
      if (!window.confirm('Discard this recording?')) return;
    }
    discardSegments();
    void teardown();
    onClose();
  };

  /** Delete banked segment files on an explicit discard — they live on disk
   *  (not OS-purged tmp) and would otherwise pile up forever. */
  const discardSegments = () => {
    if (!segmentMode || capturedRef.current || !segPathsRef.current.length) return;
    void VideoConcat.cleanup({ paths: [...segPathsRef.current] }).catch(() => {});
    segPathsRef.current = [];
    segMsRef.current = 0;
  };
  const discardSegmentsRef = useRef(discardSegments);
  discardSegmentsRef.current = discardSegments;

  const hasFootage = (recording && elapsedMs > 600) || segCount > 0;
  const totalMs = segMsRef.current + (recording ? elapsedMs : 0);

  return (
    <div
      className="sz-cam-overlay"
      style={{ position: 'absolute', inset: 0, zIndex: 96, background: status === 'ready' ? 'transparent' : '#000', display: 'flex', flexDirection: 'column', touchAction: 'none' }}
      onTouchStart={onPinchStart}
      onTouchMove={onPinchMove}
      onTouchEnd={onPinchEnd}
      onTouchCancel={onPinchEnd}
    >
      {/* subtle top + bottom scrims so the chrome reads against the live preview
          without dimming the middle (TikTok's full-bleed look) */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(180deg, rgba(0,0,0,.45) 0%, transparent 14%, transparent 62%, rgba(0,0,0,.55) 88%, rgba(0,0,0,.78) 100%)' }} />

      {/* ── TOP BAR: close (left) · recording pill (center) · flip (right) ── */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: 'calc(env(safe-area-inset-top) + 14px) 16px 0' }}>
        <Button onClick={doClose} aria-label="Close camera" style={{ width: 42, height: 42, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(6px)' }}>
          <CloseIcon size={22} stroke="#fff" strokeWidth={2.4} />
        </Button>
        {status === 'ready' && (recording || segCount > 0) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: recording ? '#fe2c55' : 'rgba(0,0,0,.55)', borderRadius: 8, padding: '6px 12px', marginTop: 2, color: '#fff', fontSize: 14, fontWeight: 800, fontVariantNumeric: 'tabular-nums', boxShadow: recording ? '0 2px 12px rgba(254,44,85,.5)' : 'none', backdropFilter: recording ? undefined : 'blur(6px)' }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: recording ? '#fff' : '#fe2c55' }} />
            {fmt(totalMs)}
            {segmentMode && segCount > 0 && <span style={{ fontWeight: 600, opacity: 0.85 }}>· {segCount} clip{segCount > 1 ? 's' : ''}</span>}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
          <Button
            onClick={() => void flip()}
            disabled={status !== 'ready'}
            aria-label="Flip camera"
            style={{ width: 42, height: 42, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: status === 'ready' ? 'pointer' : 'default', opacity: status === 'ready' ? 1 : 0.35, backdropFilter: 'blur(6px)' }}
          >
            <svg width={23} height={23} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7h13l-2.5-2.5M21 17H8l2.5 2.5" /><circle cx="12" cy="12" r="3" />
            </svg>
          </Button>
          {/* Torch — rear camera only (front has no flash hardware for video) */}
          {facing === 'rear' && (
            <Button
              onClick={() => void toggleTorch()}
              disabled={status !== 'ready'}
              aria-label={torch ? 'Turn light off' : 'Turn light on'}
              style={{ width: 42, height: 42, borderRadius: '50%', border: 'none', background: torch ? '#ffd60a' : 'rgba(0,0,0,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: status === 'ready' ? 'pointer' : 'default', opacity: status === 'ready' ? 1 : 0.35, backdropFilter: 'blur(6px)', transition: 'background .18s ease' }}
            >
              <svg width={21} height={21} viewBox="0 0 24 24" fill="none" stroke={torch ? '#111' : '#fff'} strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 2L4.5 13.5H11L10 22l8.5-11.5H12L13 2z" />
              </svg>
            </Button>
          )}
        </div>
      </div>

      {/* mic denied → tell them clips will be silent (still recordable) */}
      {status === 'ready' && micOff && (
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', marginTop: 10, pointerEvents: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,0,0,.55)', borderRadius: 20, padding: '6px 12px', color: '#fff', fontSize: 12.5, fontWeight: 600, backdropFilter: 'blur(6px)' }}>
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M1 1l22 22M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23M12 19v4" /></svg>
            No mic — video will be silent
          </div>
        </div>
      )}

      {/* live preview fills the gap; tap/pinch pass through to the camera */}
      <div style={{ flex: 1 }} />

      {/* starting / denied / error states (opaque card over a black bg) */}
      {status !== 'ready' && (
        <div style={{ position: 'relative', margin: '0 28px 40px', background: 'rgba(20,16,12,.92)', borderRadius: 22, padding: 24, textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', margin: '0 auto 14px', background: 'rgba(255,255,255,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CameraIcon size={28} stroke="#fff" strokeWidth={1.7} />
          </div>
          <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 26, color: '#fff' }}>
            {status === 'starting' ? 'Starting camera…' : status === 'suspended' ? 'Recording paused' : status === 'denied' ? 'Camera access needed' : 'Camera problem'}
          </div>
          <p style={{ color: 'rgba(255,255,255,.7)', fontSize: 14.5, lineHeight: 1.5, margin: '10px 0 18px' }}>
            {status === 'denied'
              ? 'Enable Camera & Microphone for Sizzle in Settings, then reopen this screen.'
              : status === 'suspended'
                ? 'Your clips are saved. The camera restarts when you come back to the app.'
                : status === 'error'
                  ? "Something went wrong with the camera. Upload a clip from your library instead."
                  : 'Getting the camera ready…'}
          </p>
          {/* Banked footage must NEVER be discard-only — even from a broken
              camera state, ✓-equivalent finishing stays available. */}
          {segmentMode && segCount > 0 && (
            <Button onClick={() => void doFinish()} disabled={stitching} style={{ width: '100%', height: 50, border: 'none', borderRadius: 15, marginBottom: 10, background: 'var(--accent)', color: '#fff', fontFamily: "'Hanken Grotesk'", fontSize: 15.5, fontWeight: 700, cursor: 'pointer', opacity: stitching ? 0.6 : 1 }}>
              {stitching ? 'Combining your clips…' : `Finish with ${segCount} clip${segCount > 1 ? 's' : ''}`}
            </Button>
          )}
          <Button onClick={() => (onLibrary ? onLibrary() : onClose())} style={{ width: '100%', height: 50, border: 'none', borderRadius: 15, background: segmentMode && segCount > 0 ? 'rgba(255,255,255,.12)' : 'var(--accent)', color: '#fff', fontFamily: "'Hanken Grotesk'", fontSize: 15.5, fontWeight: 700, cursor: 'pointer' }}>
            Use library instead
          </Button>
        </div>
      )}

      {/* ── BOTTOM CLUSTER: hint · zoom pills · shutter row — each on its own
             line with real spacing so nothing overlaps (the old bug) ── */}
      {status === 'ready' && (
        <div style={{ position: 'relative', paddingBottom: 'calc(env(safe-area-inset-bottom) + 26px)' }}>
          {/* one-line hint — before a take, or paused-with-segments state */}
          {!recording && (
            <div style={{ textAlign: 'center', color: 'rgba(255,255,255,.85)', fontSize: 13, fontWeight: 600, marginBottom: 16, textShadow: '0 1px 4px rgba(0,0,0,.6)', pointerEvents: 'none' }}>
              {stitchErr
                ? "Couldn't combine the clips — tap ✓ to try again"
                : stitching
                  ? 'Combining your clips…'
                  : segNote
                    ? segNote
                    : segCount > 0
                      ? 'Paused — record to continue, ✓ to finish'
                      : 'Hold to record · tap for hands-free'}
            </div>
          )}

          {/* iPhone-style zoom: lens pills; press-drag opens the ruler dial */}
          <ZoomDial zoom={zoom} range={zoomRange} lenses={lensValues} onZoom={applyZoom} />

          {/* shutter row: Upload (left) · Record (center) · Done (right) */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 30px' }}>
            {/* Upload from library */}
            <div style={{ width: 62, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
              <Button
                onClick={() => onLibrary?.()}
                disabled={recording || stitching}
                aria-label="Upload from library"
                style={{ width: 48, height: 48, borderRadius: 13, border: 'none', background: 'rgba(255,255,255,.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: recording ? 'default' : 'pointer', opacity: recording ? 0.35 : 1, backdropFilter: 'blur(6px)' }}
              >
                <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="3.5" /><circle cx="8.5" cy="8.5" r="1.6" /><path d="M21 15l-5-5L5 21" />
                </svg>
              </Button>
              <span style={{ color: 'rgba(255,255,255,.9)', fontSize: 11.5, fontWeight: 600, textShadow: '0 1px 3px rgba(0,0,0,.6)' }}>Upload</span>
            </div>

            {/* Record — hold to record while held, or tap for hands-free */}
            <Button
              onPointerDown={onDown}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              aria-label={recording ? 'Stop recording' : 'Record'}
              style={{ position: 'relative', width: 84, height: 84, borderRadius: '50%', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'none', padding: 0 }}
            >
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '5px solid #fff', opacity: 0.95 }} />
              <div style={{ width: recording ? 32 : 64, height: recording ? 32 : 64, borderRadius: recording ? 9 : '50%', background: '#fe2c55', transition: 'all .22s cubic-bezier(.34,1.56,.64,1)' }} />
            </Button>

            {/* Done — finishes the take: segment mode stitches everything into
                one clip; classic mode just stops (stop = finish there) */}
            <div style={{ width: 62, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
              <Button
                onPointerDown={(e) => { e.preventDefault(); if (hasFootage && !stitching) void (segmentMode ? doFinish() : stopRecording()); }}
                disabled={!hasFootage || stitching}
                aria-label="Finish recording"
                style={{ width: 48, height: 48, borderRadius: '50%', border: 'none', background: hasFootage ? '#fff' : 'rgba(255,255,255,.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: hasFootage ? 'pointer' : 'default', touchAction: 'none', backdropFilter: 'blur(6px)' }}
              >
                <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke={hasFootage ? '#111' : 'rgba(255,255,255,.4)'} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 6" /></svg>
              </Button>
              <span style={{ color: hasFootage ? 'rgba(255,255,255,.9)' : 'rgba(255,255,255,.4)', fontSize: 11.5, fontWeight: 600, textShadow: '0 1px 3px rgba(0,0,0,.6)' }}>Done</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * iPhone-style zoom control. Idle: lens pills (0.5 · 1× · 2 …, from the device's
 * REAL lenses); the active pill is yellow and shows the live factor. Press-drag
 * horizontally to open the ruler dial (tick marks slide under a fixed center
 * indicator, like the iOS Camera) for fine zoom; it collapses back to pills after
 * release. Tapping a pill jumps straight to that lens.
 */
function ZoomDial({ zoom, range, lenses, onZoom }: { zoom: number; range: { min: number; max: number }; lenses: number[]; onZoom: (z: number) => void }) {
  const [dial, setDial] = useState(false);
  const drag = useRef<{ x: number; z: number; moved: boolean } | null>(null);
  const hideTimer = useRef<number | null>(null);

  const onDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, z: zoom, moved: false };
    if (hideTimer.current) { window.clearTimeout(hideTimer.current); hideTimer.current = null; }
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) < 7) return; // small tap → let the pill click through
    d.moved = true;
    if (!dial) setDial(true);
    // Dragging left slides the ruler left = higher zoom (iOS direction).
    onZoom(d.z * Math.pow(2, -dx / PX_PER_OCT));
  };
  const onUp = () => {
    drag.current = null;
    hideTimer.current = window.setTimeout(() => setDial(false), 900);
  };

  // Ruler ticks: minor every ⅛ octave across the range, major (labeled) at lenses.
  const ticks = useMemo(() => {
    const lo = Math.log2(Math.max(0.1, range.min));
    const hi = Math.log2(Math.max(range.min * 2, range.max));
    const out: { v: number; major: boolean }[] = [];
    for (let k = Math.ceil(lo * 8); k <= Math.floor(hi * 8); k++) {
      const v = Math.pow(2, k / 8);
      const major = lenses.some((l) => Math.abs(Math.log2(v / l)) < 0.02);
      out.push({ v, major });
    }
    for (const l of lenses) if (!out.some((t) => t.major && Math.abs(Math.log2(t.v / l)) < 0.02)) out.push({ v: l, major: true });
    return out.sort((a, b) => a.v - b.v);
  }, [range, lenses]);

  return (
    <div
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      style={{ position: 'relative', height: 60, margin: '0 24px 22px', touchAction: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      {dial ? (
        <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
          {/* live value */}
          <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', color: '#ffd60a', fontSize: 13, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
            {zoom.toFixed(1)}×
          </div>
          {/* tick strip slides under the fixed center indicator */}
          <div style={{ position: 'absolute', bottom: 4, left: '50%', height: 34, transform: `translateX(${-Math.log2(zoom) * PX_PER_OCT}px)`, willChange: 'transform' }}>
            {ticks.map((t) => {
              const x = Math.log2(t.v) * PX_PER_OCT;
              return (
                <div key={t.v} style={{ position: 'absolute', left: x, bottom: 0, transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                  {t.major && <div style={{ color: 'rgba(255,255,255,.9)', fontSize: 11, fontWeight: 700 }}>{t.v < 1 ? t.v.toFixed(1) : String(Math.round(t.v))}</div>}
                  <div style={{ width: t.major ? 2 : 1, height: t.major ? 16 : 9, background: t.major ? 'rgba(255,255,255,.95)' : 'rgba(255,255,255,.4)', borderRadius: 1 }} />
                </div>
              );
            })}
          </div>
          {/* fixed center indicator */}
          <div style={{ position: 'absolute', bottom: 2, left: '50%', transform: 'translateX(-50%)', width: 2, height: 24, background: '#ffd60a', borderRadius: 1 }} />
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(0,0,0,.42)', borderRadius: 30, padding: '7px 12px', backdropFilter: 'blur(8px)' }}>
          {(lenses.length ? lenses : [1]).map((val) => {
            const on = Math.abs(Math.log2(zoom / val)) < 0.12;
            const near = Math.abs(zoom - Math.round(zoom)) < 0.05;
            const label = on
              ? (near ? `${Math.round(zoom)}×` : `${zoom.toFixed(1)}×`)
              : val < 1 ? val.toString().replace(/^0/, '') : String(Math.round(val));
            return (
              <Button
                key={val}
                onClick={() => onZoom(val)}
                aria-label={`${val}× zoom`}
                style={{
                  minWidth: on ? 40 : 30,
                  height: on ? 40 : 30,
                  borderRadius: '50%',
                  border: 'none',
                  padding: on ? '0 8px' : 0,
                  background: on ? 'rgba(0,0,0,.55)' : 'transparent',
                  color: on ? '#ffd60a' : '#fff',
                  fontWeight: on ? 800 : 700,
                  fontSize: on ? 14 : 13,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all .15s',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {label}
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}
