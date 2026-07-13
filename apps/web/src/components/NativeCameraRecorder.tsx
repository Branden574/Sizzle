import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { CameraPreview } from '@capgo/camera-preview';
import { Button } from './controls';
import { CameraIcon, CloseIcon } from './icons';

/** Max length of an in-app recording (longer clips upload from the library). */
const MAX_SECONDS = 60;

type Status = 'starting' | 'ready' | 'denied' | 'error';

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec < 10 ? '0' : ''}${sec}`;
}

/**
 * NATIVE camera recorder (iOS/Android via @capgo/camera-preview). Records off the
 * phone's real AVCaptureSession — full native quality, HEVC/H.265 (smaller files
 * at equal quality → faster uploads), cinematic stabilization, TRUE optical/pinch
 * zoom, and a front↔back flip that works MID-recording (impossible with the web
 * MediaRecorder). The native preview renders BEHIND a transparented WebView; these
 * HTML controls sit on top and call plugin methods. On stop, the recorded file is
 * read into a File and handed to the existing upload pipeline unchanged.
 *
 * Same props as the web CameraRecorder so it's a drop-in on native. If the native
 * camera can't start, it surfaces an error state with a "Use library" escape.
 */
export function NativeCameraRecorder({ onCapture, onClose }: { onCapture: (file: File) => void; onClose: () => void }) {
  const [status, setStatus] = useState<Status>('starting');
  const [facing, setFacing] = useState<'rear' | 'front'>('rear');
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [zoom, setZoom] = useState(1);
  const codecRef = useRef<'hvc1' | 'avc1'>('avc1');
  const tickRef = useRef<number | null>(null);
  const startedAt = useRef(0);
  const stopping = useRef(false);
  const active = useRef(true);
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);

  const clearTick = () => { if (tickRef.current) { window.clearInterval(tickRef.current); tickRef.current = null; } };

  // Start the native preview behind the (transparented) WebView on mount; tear the
  // camera down + restore the WebView on unmount.
  useEffect(() => {
    active.current = true;
    void (async () => {
      try {
        const perm = await CameraPreview.requestPermissions({});
        if (perm.camera !== 'granted') { if (active.current) setStatus('denied'); return; }
        document.documentElement.classList.add('sz-native-cam');
        await CameraPreview.start({ position: 'rear', toBack: true, aspectMode: 'cover', disableAudio: false });
        // Prefer HEVC when the device supports it (half the size at equal quality).
        try {
          const { codecs } = await CameraPreview.getSupportedVideoCodecs();
          if (codecs.includes('hvc1')) codecRef.current = 'hvc1';
        } catch { /* keep H.264 */ }
        if (active.current) setStatus('ready');
      } catch {
        document.documentElement.classList.remove('sz-native-cam');
        if (active.current) setStatus('error');
      }
    })();
    return () => {
      active.current = false;
      clearTick();
      document.documentElement.classList.remove('sz-native-cam');
      void CameraPreview.stopRecordVideo().catch(() => {});
      void CameraPreview.stop().catch(() => {});
    };
  }, []);

  // Flip front↔back — works MID-recording (the headline native win).
  const flip = useCallback(async () => {
    if (status !== 'ready') return;
    const next = facing === 'rear' ? 'front' : 'rear';
    try { await CameraPreview.flip(); setFacing(next); setZoom(1); } catch { /* stay put */ }
  }, [facing, status]);

  const applyZoom = useCallback(async (level: number) => {
    const v = Math.max(1, Math.min(8, Math.round(level * 10) / 10));
    setZoom(v);
    try { await CameraPreview.setZoom({ level: v, ramp: false }); } catch { /* device rejected */ }
  }, []);

  const startTick = () => {
    startedAt.current = performance.now();
    clearTick();
    tickRef.current = window.setInterval(() => {
      const ms = performance.now() - startedAt.current;
      setElapsedMs(ms);
      if (ms >= MAX_SECONDS * 1000) void stopAndCapture();
    }, 100);
  };

  const startRecording = async () => {
    if (status !== 'ready' || recording) return;
    try {
      await CameraPreview.startRecordVideo({
        videoCodec: codecRef.current,
        videoQuality: '1080p',
        videoStabilizationMode: 'auto',
        maxDuration: MAX_SECONDS,
        disableAudio: false,
      });
      setRecording(true);
      startTick();
    } catch {
      setStatus('error');
    }
  };

  const stopAndCapture = async () => {
    if (stopping.current) return;
    stopping.current = true;
    clearTick();
    try {
      const { videoFilePath } = await CameraPreview.stopRecordVideo();
      setRecording(false);
      // Read the on-disk file into a File for the existing upload pipeline.
      const url = Capacitor.convertFileSrc(videoFilePath);
      const blob = await fetch(url).then((r) => r.blob());
      const type = blob.type || 'video/mp4';
      const ext = (videoFilePath.split('.').pop() || 'mp4').toLowerCase();
      const file = new File([blob], `sizzle-${Date.now()}.${ext}`, { type });
      document.documentElement.classList.remove('sz-native-cam');
      await CameraPreview.stop().catch(() => {});
      active.current = false; // prevent the unmount cleanup from double-stopping
      onCapture(file);
    } catch {
      stopping.current = false;
      setStatus('error');
    }
  };

  const onRecordPress = () => {
    if (recording) void stopAndCapture();
    else void startRecording();
  };

  // Pinch-to-zoom on the preview (two fingers → native setZoom).
  const dist2 = (t: React.TouchList) => {
    const a = t[0], b = t[1];
    return a && b ? Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) : 0;
  };
  const onPinchStart = (e: React.TouchEvent) => { if (e.touches.length === 2) pinch.current = { dist: dist2(e.touches), zoom }; };
  const onPinchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinch.current) {
      e.preventDefault();
      void applyZoom(pinch.current.zoom * (dist2(e.touches) / (pinch.current.dist || 1)));
    }
  };
  const onPinchEnd = () => { pinch.current = null; };

  const doClose = () => {
    document.documentElement.classList.remove('sz-native-cam');
    void CameraPreview.stopRecordVideo().catch(() => {});
    void CameraPreview.stop().catch(() => {});
    onClose();
  };

  const hasFootage = elapsedMs > 600;

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
        <Button onClick={doClose} style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <CloseIcon size={22} stroke="#fff" strokeWidth={2.2} />
        </Button>
        {status === 'ready' && (
          <div style={{ background: 'rgba(0,0,0,.45)', borderRadius: 20, padding: '6px 14px', color: '#fff', fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
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
            {status === 'starting' ? 'Starting camera…' : status === 'denied' ? 'Camera access needed' : 'Camera unavailable'}
          </div>
          <p style={{ color: 'rgba(255,255,255,.7)', fontSize: 14.5, lineHeight: 1.5, margin: '10px 0 18px' }}>
            {status === 'denied'
              ? 'Enable Camera & Microphone for Sizzle in Settings, then reopen this screen.'
              : status === 'error'
                ? "The camera couldn't start. Upload a clip from your library instead."
                : 'Getting the camera ready…'}
          </p>
          <Button onClick={onClose} style={{ width: '100%', height: 50, border: 'none', borderRadius: 15, background: 'var(--accent)', color: '#fff', fontFamily: "'Hanken Grotesk'", fontSize: 15.5, fontWeight: 700, cursor: 'pointer' }}>
            Use library instead
          </Button>
        </div>
      )}

      {/* zoom slider */}
      {status === 'ready' && (
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12, padding: '0 32px 16px' }}>
          <span style={{ color: '#fff', fontSize: 12.5, fontWeight: 800, minWidth: 40, textAlign: 'center', background: 'rgba(0,0,0,.4)', borderRadius: 12, padding: '4px 0', fontVariantNumeric: 'tabular-nums' }}>
            {zoom.toFixed(1)}×
          </span>
          <input type="range" min={1} max={8} step={0.1} value={zoom} onChange={(e) => void applyZoom(parseFloat(e.target.value))} aria-label="Zoom" style={{ flex: 1, accentColor: 'var(--accent)', height: 28 }} />
        </div>
      )}

      {/* record controls */}
      {status === 'ready' && (
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 36px 46px' }}>
          <Button
            onClick={onRecordPress}
            aria-label={recording ? 'Stop' : 'Record'}
            style={{ width: 84, height: 84, borderRadius: '50%', border: '5px solid rgba(255,255,255,.85)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
          >
            <div style={{ width: recording ? 32 : 64, height: recording ? 32 : 64, borderRadius: recording ? 8 : '50%', background: 'var(--accent)', transition: 'all .2s cubic-bezier(.34,1.56,.64,1)' }} />
          </Button>
        </div>
      )}

      {status === 'ready' && !recording && !hasFootage && (
        <div style={{ position: 'absolute', bottom: 150, left: 0, right: 0, textAlign: 'center', color: 'rgba(255,255,255,.8)', fontSize: 13.5, fontWeight: 600, pointerEvents: 'none' }}>
          Tap to record · flip anytime · pinch to zoom
        </div>
      )}
    </div>
  );
}
