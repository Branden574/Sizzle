import { useCallback, useEffect, useRef, useState } from 'react';
import { CameraIcon, CloseIcon } from './icons';

/** Max length of an in-app recording (longer clips should be uploaded from the library). */
const MAX_SECONDS = 60;
/** A press shorter than this is a "tap" (hands-free start/stop); longer is a "hold". */
const HOLD_MS = 250;

type Status = 'idle' | 'requesting' | 'granted' | 'denied' | 'unsupported';

/** Human guidance for a getUserMedia failure, by DOMException name. */
function permissionHint(errName: string): string {
  switch (errName) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera & microphone are blocked for this site. Tap the camera/lock icon in your browser’s address bar, set Camera and Microphone to Allow, then tap Try again.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No camera was found on this device. Upload a clip from your library instead.';
    case 'NotReadableError':
    case 'AbortError':
      return 'Your camera is being used by another app. Close it and tap Try again.';
    case 'InsecureContext':
      return 'Recording needs a secure (https) connection.';
    default:
      return 'Sizzle uses your camera & microphone only to record the clip you choose to post. Nothing is tracked.';
  }
}

function pickMime(): string {
  const candidates = [
    'video/mp4;codecs=h264,aac',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  for (const t of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec < 10 ? '0' : ''}${sec}`;
}

/**
 * Full-screen camera recorder. Asks for camera + microphone permission via
 * getUserMedia (the browser shows the prompt). TikTok-style capture: hold the
 * button to record while held, or tap to start hands-free and tap again to stop;
 * either way you can stop and keep going — segments accumulate into one clip via
 * MediaRecorder pause/resume. Nothing is recorded or kept until you press Done,
 * and the camera is released as soon as this closes. No tracking.
 */
export function CameraRecorder({ onCapture, onClose }: { onCapture: (file: File) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeRef = useRef<string>('');
  const accumMs = useRef(0); // recorded time across finished segments
  const segStart = useRef(0); // performance.now() when the current segment began
  const pressAt = useRef(0);
  const pressHold = useRef(false);
  const ignoreUp = useRef(false);
  const tickRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const supported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';
  const [status, setStatus] = useState<Status>(supported ? 'idle' : 'unsupported');
  const [errName, setErrName] = useState('');
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [demo, setDemo] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [segments, setSegments] = useState<number[]>([]);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (audioCtxRef.current) { void audioCtxRef.current.close().catch(() => {}); audioCtxRef.current = null; }
  }, []);

  // A synthetic camera (animated canvas + quiet tone) so the full record → segment
  // → upload flow can be exercised where a real camera isn't available/permitted
  // (e.g. the embedded preview pane). Real recording uses the real camera.
  const startDemo = useCallback(() => {
    if (typeof MediaRecorder === 'undefined') { setStatus('unsupported'); return; }
    setDemo(true);
    try {
      stopStream();
      const canvas = document.createElement('canvas');
      canvas.width = 720;
      canvas.height = 1280;
      const ctx = canvas.getContext('2d')!;
      let t = 0;
      const draw = () => {
        t += 1;
        const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
        g.addColorStop(0, '#2a160e');
        g.addColorStop(1, '#b5471f');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const x = canvas.width / 2 + Math.sin(t / 22) * 190;
        const y = canvas.height / 2 + Math.cos(t / 17) * 240;
        ctx.beginPath();
        ctx.arc(x, y, 96, 0, Math.PI * 2);
        ctx.fillStyle = '#ffb52e';
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.font = "800 56px 'Hanken Grotesk', sans-serif";
        ctx.fillText('DEMO CAMERA', canvas.width / 2, 150);
        ctx.font = "600 38px 'Hanken Grotesk', sans-serif";
        ctx.fillText(new Date().toLocaleTimeString(), canvas.width / 2, canvas.height - 130);
        rafRef.current = requestAnimationFrame(draw);
      };
      draw();
      const stream = canvas.captureStream(30);
      try {
        const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ac = new Ctor();
        audioCtxRef.current = ac;
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        gain.gain.value = 0.015;
        osc.frequency.value = 200;
        osc.connect(gain);
        const dest = ac.createMediaStreamDestination();
        gain.connect(dest);
        osc.start();
        dest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
      } catch { /* audio optional */ }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        void videoRef.current.play().catch(() => {});
      }
      mimeRef.current = pickMime();
      setErrName('');
      setStatus('granted');
    } catch {
      setStatus('denied');
    }
  }, [stopStream]);

  // Requested on a user gesture (not on mount) — browsers (esp. iOS Safari) only
  // surface the permission prompt from a gesture, and re-requesting after a tap
  // is what gives a blocked site a chance to re-prompt.
  const startStream = useCallback(async (mode: 'user' | 'environment') => {
    if (!window.isSecureContext) { setErrName('InsecureContext'); setStatus('denied'); return; }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { setStatus('unsupported'); return; }
    setStatus('requesting');
    setDemo(false);
    try {
      stopStream();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode, width: { ideal: 1080 }, height: { ideal: 1920 } },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        void videoRef.current.play().catch(() => {});
      }
      mimeRef.current = pickMime();
      setErrName('');
      setStatus('granted');
    } catch (e) {
      setErrName((e as DOMException)?.name || 'Error');
      setStatus('denied');
    }
  }, [stopStream]);

  // Release the camera + timers on unmount (do NOT auto-request on mount).
  useEffect(() => {
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
      try { recorderRef.current?.state !== 'inactive' && recorderRef.current?.stop(); } catch { /* noop */ }
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startTick = () => {
    if (tickRef.current) window.clearInterval(tickRef.current);
    tickRef.current = window.setInterval(() => {
      const total = accumMs.current + (recorderRef.current?.state === 'recording' ? performance.now() - segStart.current : 0);
      setElapsedMs(total);
      if (total >= MAX_SECONDS * 1000) finalize();
    }, 100);
  };

  const ensureRecorder = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') return;
    const stream = streamRef.current;
    if (!stream) return;
    chunksRef.current = [];
    const rec = new MediaRecorder(stream, mimeRef.current ? { mimeType: mimeRef.current } : undefined);
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
    recorderRef.current = rec;
  };

  const startOrResume = () => {
    if (status !== 'granted') return;
    ensureRecorder();
    const rec = recorderRef.current;
    if (!rec) return;
    if (rec.state === 'inactive') rec.start(1000);
    else if (rec.state === 'paused') rec.resume();
    segStart.current = performance.now();
    setRecording(true);
    startTick();
  };

  const pauseSegment = () => {
    const rec = recorderRef.current;
    if (!rec || rec.state !== 'recording') return;
    rec.pause();
    const dur = performance.now() - segStart.current;
    accumMs.current += dur;
    setSegments((s) => [...s, dur]);
    setRecording(false);
    if (tickRef.current) window.clearInterval(tickRef.current);
    setElapsedMs(accumMs.current);
  };

  const finalize = () => {
    const rec = recorderRef.current;
    if (!rec) return;
    if (rec.state === 'recording') {
      accumMs.current += performance.now() - segStart.current;
    }
    if (tickRef.current) window.clearInterval(tickRef.current);
    rec.onstop = () => {
      const type = mimeRef.current || 'video/webm';
      const blob = new Blob(chunksRef.current, { type });
      const ext = type.includes('mp4') ? 'mp4' : 'webm';
      const file = new File([blob], `sizzle-${Date.now()}.${ext}`, { type });
      stopStream();
      onCapture(file);
    };
    if (rec.state !== 'inactive') rec.stop();
    setRecording(false);
  };

  const retake = () => {
    const rec = recorderRef.current;
    try { if (rec && rec.state !== 'inactive') { rec.onstop = null; rec.stop(); } } catch { /* noop */ }
    recorderRef.current = null;
    chunksRef.current = [];
    accumMs.current = 0;
    setSegments([]);
    setElapsedMs(0);
    setRecording(false);
  };

  // record-button gestures (hold OR tap)
  const onDown = (e: React.PointerEvent) => {
    e.preventDefault();
    if (status !== 'granted') return;
    if (recording) { pauseSegment(); ignoreUp.current = true; return; } // tap to stop (hands-free)
    startOrResume();
    pressAt.current = performance.now();
    pressHold.current = false;
    window.setTimeout(() => { pressHold.current = true; }, HOLD_MS);
  };
  const onUp = () => {
    if (ignoreUp.current) { ignoreUp.current = false; return; }
    if (!recording) return;
    if (pressHold.current) pauseSegment(); // a hold → release stops the segment
    // a quick tap → leave recording (hands-free); the next tap stops it
  };

  const hasFootage = elapsedMs > 600;
  const canFlip = !recording && segments.length === 0;

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 96, background: '#000', display: 'flex', flexDirection: 'column' }}>
      <video ref={videoRef} muted playsInline autoPlay style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: facing === 'user' && !demo ? 'scaleX(-1)' : 'none' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,.4), transparent 18%, transparent 72%, rgba(0,0,0,.5))', pointerEvents: 'none' }} />

      {/* top bar */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '54px 18px 0' }}>
        <button onClick={onClose} style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <CloseIcon size={22} stroke="#fff" strokeWidth={2.2} />
        </button>
        {status === 'granted' && (
          <div style={{ background: 'rgba(0,0,0,.45)', borderRadius: 20, padding: '6px 14px', color: '#fff', fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {fmt(elapsedMs)} <span style={{ opacity: 0.5 }}>/ {fmt(MAX_SECONDS * 1000)}</span>
          </div>
        )}
        <button
          onClick={() => { const next = facing === 'user' ? 'environment' : 'user'; setFacing(next); void startStream(next); }}
          disabled={!canFlip}
          aria-label="Flip camera"
          style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: canFlip ? 'pointer' : 'default', opacity: canFlip ? 1 : 0.35 }}
        >
          <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7h13l-2.5-2.5M21 17H8l2.5 2.5" /><circle cx="12" cy="12" r="3" />
          </svg>
        </button>
      </div>

      {/* segmented progress */}
      {status === 'granted' && (segments.length > 0 || recording) && (
        <div style={{ position: 'relative', display: 'flex', gap: 2, padding: '12px 18px 0' }}>
          {segments.map((d, i) => (
            <div key={i} style={{ width: `${Math.min(100, (d / (MAX_SECONDS * 1000)) * 100)}%`, height: 4, borderRadius: 2, background: '#fff' }} />
          ))}
          {recording && <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'var(--accent)' }} />}
        </div>
      )}

      <div style={{ flex: 1 }} />

      {/* permission / unsupported states */}
      {status !== 'granted' && (
        <div style={{ position: 'relative', margin: '0 28px 40px', background: 'rgba(20,16,12,.92)', borderRadius: 22, padding: 24, textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', margin: '0 auto 14px', background: 'rgba(255,255,255,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CameraIcon size={28} stroke="#fff" strokeWidth={1.7} />
          </div>
          <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 26, color: '#fff' }}>
            {status === 'unsupported' ? 'Recording not supported' : status === 'requesting' ? 'Requesting access…' : status === 'denied' ? 'Camera access needed' : 'Record your dish'}
          </div>
          <p style={{ color: 'rgba(255,255,255,.7)', fontSize: 14.5, lineHeight: 1.5, margin: '10px 0 18px' }}>
            {status === 'unsupported'
              ? 'This browser can’t record video. Upload a clip from your library instead.'
              : status === 'requesting'
                ? 'Your browser is asking for permission — tap Allow on the prompt.'
                : status === 'denied'
                  ? permissionHint(errName)
                  : 'Sizzle uses your camera & microphone only to record the clip you choose to post. Nothing is tracked.'}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {status !== 'unsupported' && (
              <button
                onClick={() => void startStream(facing)}
                disabled={status === 'requesting'}
                style={{ height: 50, border: 'none', borderRadius: 15, background: 'var(--accent)', color: '#fff', fontFamily: "'Hanken Grotesk'", fontSize: 15.5, fontWeight: 700, cursor: status === 'requesting' ? 'default' : 'pointer', opacity: status === 'requesting' ? 0.6 : 1 }}
              >
                {status === 'requesting' ? 'Asking…' : status === 'denied' ? 'Try again' : 'Allow camera & mic'}
              </button>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={startDemo} style={{ flex: 1, height: 48, border: '1.5px solid rgba(255,255,255,.25)', borderRadius: 15, background: 'transparent', color: '#fff', fontFamily: "'Hanken Grotesk'", fontSize: 14.5, fontWeight: 700, cursor: 'pointer' }}>
                Demo camera
              </button>
              <button onClick={onClose} style={{ flex: 1, height: 48, border: '1.5px solid rgba(255,255,255,.25)', borderRadius: 15, background: 'transparent', color: '#fff', fontFamily: "'Hanken Grotesk'", fontSize: 14.5, fontWeight: 700, cursor: 'pointer' }}>
                Use library
              </button>
            </div>
            <div style={{ color: 'rgba(255,255,255,.4)', fontSize: 12, marginTop: 2 }}>“Demo camera” records a synthetic clip so you can test recording without granting the camera.</div>
          </div>
        </div>
      )}

      {/* record controls */}
      {status === 'granted' && (
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 36px 46px' }}>
          {/* retake */}
          <button onClick={retake} disabled={segments.length === 0 && !recording} style={{ width: 56, color: '#fff', background: 'none', border: 'none', fontSize: 14, fontWeight: 700, cursor: segments.length ? 'pointer' : 'default', opacity: segments.length ? 1 : 0.35 }}>
            Retake
          </button>

          {/* record button (hold or tap) */}
          <button
            onPointerDown={onDown}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            aria-label={recording ? 'Stop' : 'Record'}
            style={{ width: 84, height: 84, borderRadius: '50%', border: '5px solid rgba(255,255,255,.85)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'none', padding: 0 }}
          >
            <div style={{ width: recording ? 32 : 64, height: recording ? 32 : 64, borderRadius: recording ? 8 : '50%', background: 'var(--accent)', transition: 'all .2s cubic-bezier(.34,1.56,.64,1)' }} />
          </button>

          {/* done */}
          <button onClick={finalize} disabled={!hasFootage} style={{ width: 56, height: 56, borderRadius: '50%', border: 'none', background: hasFootage ? '#fff' : 'rgba(255,255,255,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: hasFootage ? 'pointer' : 'default' }}>
            <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke={hasFootage ? '#1b1512' : 'rgba(255,255,255,.5)'} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 6" /></svg>
          </button>
        </div>
      )}

      {status === 'granted' && segments.length === 0 && !recording && (
        <div style={{ position: 'absolute', bottom: 138, left: 0, right: 0, textAlign: 'center', color: 'rgba(255,255,255,.7)', fontSize: 13.5, fontWeight: 600, pointerEvents: 'none' }}>
          Hold to record · or tap for hands-free
        </div>
      )}
    </div>
  );
}
