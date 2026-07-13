import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { CameraPreview } from '@capgo/camera-preview';
import { Button } from './controls';
import { CameraIcon, CloseIcon } from './icons';

/** Max length of an in-app recording (longer clips upload from the library). */
const MAX_SECONDS = 60;
/** A press shorter than this is a "tap" (hands-free start/stop); longer is a "hold". */
const HOLD_MS = 250;
/** Zoom dial: horizontal pixels per zoom octave (2×) — matches iOS dial feel. */
const PX_PER_OCT = 150;

type Status = 'starting' | 'ready' | 'denied' | 'error';

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
export function NativeCameraRecorder({ onCapture, onClose }: { onCapture: (file: File) => void; onClose: () => void }) {
  const [status, setStatus] = useState<Status>('starting');
  const [facing, setFacing] = useState<'rear' | 'front'>('rear');
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [lensValues, setLensValues] = useState<number[]>([]);
  const [zoomRange, setZoomRange] = useState<{ min: number; max: number }>({ min: 1, max: 8 });

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
    await teardown();
    try {
      if (!videoFilePath) throw new Error('no file path');
      const res = await fetch(Capacitor.convertFileSrc(videoFilePath));
      if (!res.ok) throw new Error(`read failed (${res.status})`);
      const blob = await res.blob();
      if (!blob.size) throw new Error('empty recording');
      const ext = (videoFilePath.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4';
      const file = new File([blob], `sizzle-${Date.now()}.${ext}`, { type: blob.type || 'video/mp4' });
      onCapture(file);
    } catch {
      // The take couldn't be read — camera is already off and the UI restored;
      // show an honest error with a way out instead of silently dropping it.
      if (activeRef.current) setStatus('error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teardown]);
  const finalizeRef = useRef(finalize);
  finalizeRef.current = finalize;

  // Start the native preview behind the (transparented) WebView on mount. Every
  // await is unmount-guarded; any failure funnels through teardown().
  useEffect(() => {
    activeRef.current = true;
    void (async () => {
      try {
        const perm = await CameraPreview.requestPermissions({});
        if (!activeRef.current) return;
        if (perm.camera !== 'granted') { setStatus('denied'); return; }
        document.documentElement.classList.add('sz-native-cam');
        await CameraPreview.start({
          position: 'rear',
          toBack: true,
          x: 0,
          y: 0,
          width: Math.round(window.innerWidth),
          height: Math.round(window.innerHeight),
          aspectMode: 'cover',
          disableAudio: false,
        });
        if (!activeRef.current) { void teardown(); return; }
        try {
          const { codecs } = await CameraPreview.getSupportedVideoCodecs();
          if (codecs.includes('hvc1')) codecRef.current = 'hvc1';
        } catch { /* keep H.264 */ }
        await loadZoomInfo();
        // Authoritative finish signal: fires on manual stop AND native auto-stop.
        await CameraPreview.addListener('recordingFinished', (e) => { void finalizeRef.current(e.videoFilePath); });
        if (!activeRef.current) { void teardown(); return; }
        setStatus('ready');
      } catch {
        void teardown();
        if (activeRef.current) setStatus('error');
      }
    })();
    return () => {
      activeRef.current = false;
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

  // Flip front↔back — works MID-recording (the plugin swaps the video input while
  // keeping the movie output attached, so the take stays one continuous clip).
  const flip = useCallback(async () => {
    if (statusRef.current !== 'ready') return;
    const next = facing === 'rear' ? 'front' : 'rear';
    try {
      await CameraPreview.flip();
      if (!activeRef.current) return;
      setFacing(next);
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
    if (now - zoomCallAt.current < 30) return;
    zoomCallAt.current = now;
    CameraPreview.setZoom({ level: v, ramp: false }).catch(() => {});
  }, [zoomRange]);

  const startTick = () => {
    startedAt.current = performance.now();
    clearTick();
    tickRef.current = window.setInterval(() => {
      // Display only — the native maxDuration performs the 60s auto-stop and the
      // recordingFinished listener finalizes it (no JS/native double-stop race).
      setElapsedMs(Math.min(performance.now() - startedAt.current, MAX_SECONDS * 1000));
    }, 100);
  };

  const startRecording = async () => {
    if (statusRef.current !== 'ready' || recordingRef.current) return;
    try {
      capturedRef.current = false;
      await CameraPreview.startRecordVideo({
        videoCodec: codecRef.current,
        videoQuality: '1080p',
        videoStabilizationMode: 'auto',
        maxDuration: MAX_SECONDS,
        disableAudio: false,
      });
      if (!activeRef.current) return;
      recordingRef.current = true;
      setRecording(true);
      setElapsedMs(0);
      startTick();
    } catch {
      if (activeRef.current) { void teardown(); setStatus('error'); }
    }
  };

  const stopRecording = async () => {
    if (!recordingRef.current || stoppingRef.current || capturedRef.current) return;
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

  // Record-button gestures — the SAME proven pointer pattern as the web recorder
  // (pointer events, not click, which is unreliable in WKWebView): hold to record
  // while held, or tap for hands-free; while recording, a tap OR release stops.
  const onDown = (e: React.PointerEvent) => {
    e.preventDefault();
    if (statusRef.current !== 'ready') return;
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
    void teardown();
    onClose();
  };

  const hasFootage = recording && elapsedMs > 600;

  return (
    <div
      className="sz-cam-overlay"
      style={{ position: 'absolute', inset: 0, zIndex: 96, background: status === 'ready' ? 'transparent' : '#000', display: 'flex', flexDirection: 'column', touchAction: 'none' }}
      onTouchStart={onPinchStart}
      onTouchMove={onPinchMove}
      onTouchEnd={onPinchEnd}
      onTouchCancel={onPinchEnd}
    >
      {/* darkening only at the edges so controls read against the live preview */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(180deg, rgba(0,0,0,.4), transparent 18%, transparent 72%, rgba(0,0,0,.5))' }} />

      {/* top bar: close · timer · flip (flip works mid-recording) */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '54px 18px 0' }}>
        <Button onClick={doClose} aria-label="Close camera" style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <CloseIcon size={22} stroke="#fff" strokeWidth={2.2} />
        </Button>
        {status === 'ready' && (
          <div style={{ background: 'rgba(0,0,0,.45)', borderRadius: 20, padding: '6px 14px', color: '#fff', fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {recording && <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#ff453a', marginRight: 7, verticalAlign: 'middle' }} />}
            {fmt(elapsedMs)} <span style={{ opacity: 0.5 }}>/ {fmt(MAX_SECONDS * 1000)}</span>
          </div>
        )}
        <Button
          onClick={() => void flip()}
          disabled={status !== 'ready'}
          aria-label="Flip camera"
          style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: status === 'ready' ? 'pointer' : 'default', opacity: status === 'ready' ? 1 : 0.35 }}
        >
          <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7h13l-2.5-2.5M21 17H8l2.5 2.5" /><circle cx="12" cy="12" r="3" />
          </svg>
        </Button>
      </div>

      <div style={{ flex: 1 }} />

      {/* starting / denied / error states (opaque card over a black bg) */}
      {status !== 'ready' && (
        <div style={{ position: 'relative', margin: '0 28px 40px', background: 'rgba(20,16,12,.92)', borderRadius: 22, padding: 24, textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', margin: '0 auto 14px', background: 'rgba(255,255,255,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CameraIcon size={28} stroke="#fff" strokeWidth={1.7} />
          </div>
          <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 26, color: '#fff' }}>
            {status === 'starting' ? 'Starting camera…' : status === 'denied' ? 'Camera access needed' : 'Camera problem'}
          </div>
          <p style={{ color: 'rgba(255,255,255,.7)', fontSize: 14.5, lineHeight: 1.5, margin: '10px 0 18px' }}>
            {status === 'denied'
              ? 'Enable Camera & Microphone for Sizzle in Settings, then reopen this screen.'
              : status === 'error'
                ? "Something went wrong with the camera. Upload a clip from your library instead."
                : 'Getting the camera ready…'}
          </p>
          <Button onClick={onClose} style={{ width: '100%', height: 50, border: 'none', borderRadius: 15, background: 'var(--accent)', color: '#fff', fontFamily: "'Hanken Grotesk'", fontSize: 15.5, fontWeight: 700, cursor: 'pointer' }}>
            Use library instead
          </Button>
        </div>
      )}

      {/* iOS-style zoom: lens pills; press-drag opens the ruler dial */}
      {status === 'ready' && (
        <ZoomDial zoom={zoom} range={zoomRange} lenses={lensValues} onZoom={applyZoom} />
      )}

      {/* record controls: hold OR tap (web-recorder parity) + ✓ to finish */}
      {status === 'ready' && (
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 36px 46px' }}>
          <div style={{ width: 56 }} />
          <Button
            onPointerDown={onDown}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            aria-label={recording ? 'Stop' : 'Record'}
            style={{ width: 84, height: 84, borderRadius: '50%', border: '5px solid rgba(255,255,255,.85)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'none', padding: 0 }}
          >
            <div style={{ width: recording ? 32 : 64, height: recording ? 32 : 64, borderRadius: recording ? 8 : '50%', background: 'var(--accent)', transition: 'all .2s cubic-bezier(.34,1.56,.64,1)' }} />
          </Button>
          {/* done — finishes the take */}
          <Button
            onPointerDown={(e) => { e.preventDefault(); if (hasFootage) void stopRecording(); }}
            disabled={!hasFootage}
            aria-label="Finish recording"
            style={{ width: 56, height: 56, borderRadius: '50%', border: 'none', background: hasFootage ? '#fff' : 'rgba(255,255,255,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: hasFootage ? 'pointer' : 'default', touchAction: 'none' }}
          >
            <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke={hasFootage ? '#1b1512' : 'rgba(255,255,255,.5)'} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 6" /></svg>
          </Button>
        </div>
      )}

      {status === 'ready' && !recording && (
        <div style={{ position: 'absolute', bottom: 34, left: 0, right: 0, textAlign: 'center', color: 'rgba(255,255,255,.75)', fontSize: 12.5, fontWeight: 600, pointerEvents: 'none' }}>
          Hold to record · or tap for hands-free
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
      style={{ position: 'relative', height: 64, margin: '0 24px 10px', touchAction: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,0,0,.4)', borderRadius: 26, padding: 5, backdropFilter: 'blur(6px)' }}>
          {(lenses.length ? lenses : [1]).map((val) => {
            const on = Math.abs(Math.log2(zoom / val)) < 0.12;
            return (
              <Button
                key={val}
                onClick={() => onZoom(val)}
                aria-label={`${val}× zoom`}
                style={{
                  minWidth: on ? 46 : 36,
                  height: on ? 46 : 36,
                  borderRadius: '50%',
                  border: 'none',
                  padding: '0 6px',
                  background: on ? 'rgba(28,24,20,.85)' : 'rgba(255,255,255,.12)',
                  color: on ? '#ffd60a' : '#fff',
                  fontWeight: 800,
                  fontSize: on ? 13.5 : 12,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all .15s',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {on ? `${zoom.toFixed(1)}×` : val < 1 ? `${val}` : `${Math.round(val)}`}
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}
