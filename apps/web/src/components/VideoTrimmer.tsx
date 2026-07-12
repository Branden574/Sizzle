import { useEffect, useRef, useState } from 'react';
import { theme } from '../theme';

const accent = theme.accent;

type Cap = HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream };
const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

/**
 * In-browser video trimmer: pick a start/end range, preview the loop, then
 * re-capture JUST that segment (video + audio) with MediaRecorder. It's a
 * real-time re-record — it plays the selected range once while recording — so
 * it's meant for short clips. Browsers without captureStream keep the original.
 */
export function VideoTrimmer({ file, onTrimmed, onCancel }: { file: File; onTrimmed: (f: File) => void; onCancel: () => void }) {
  const url = useRef(URL.createObjectURL(file)).current;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [recording, setRecording] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  const onMeta = () => {
    const v = videoRef.current!;
    setDuration(v.duration || 0);
    setEnd(v.duration || 0);
  };

  // Preview loops the selected range.
  const onTimeUpdate = () => {
    const v = videoRef.current!;
    if (!recording && (v.currentTime >= end || v.currentTime < start - 0.05)) v.currentTime = start;
  };

  const apply = async () => {
    const v = videoRef.current!;
    const cap = v as Cap;
    const getStream = cap.captureStream || cap.mozCaptureStream;
    // No capture support, or a trivial range → just keep the original file.
    if (!getStream || end - start < 0.3 || (start <= 0.05 && end >= duration - 0.05)) { onTrimmed(file); return; }
    setRecording(true);
    v.muted = false;
    try {
      const stream = getStream.call(cap);
      const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus' : 'video/webm';
      const rec = new MediaRecorder(stream, { mimeType: mime });
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      const stopped = new Promise<void>((res) => { rec.onstop = () => res(); });
      v.currentTime = start;
      await new Promise((r) => { v.onseeked = () => r(null); });
      rec.start(100);
      await v.play();
      await new Promise<void>((res) => {
        const tick = () => {
          setProgress(Math.min(1, (v.currentTime - start) / Math.max(0.1, end - start)));
          if (v.currentTime >= end || v.ended) return res();
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      v.pause();
      rec.stop();
      await stopped;
      const blob = new Blob(chunks, { type: 'video/webm' });
      onTrimmed(new File([blob], file.name.replace(/\.\w+$/, '') + '-trim.webm', { type: 'video/webm' }));
    } catch {
      onTrimmed(file); // trimming failed → fall back to the original
    } finally {
      setRecording(false);
    }
  };

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 96, background: '#0c0a09', display: 'flex', flexDirection: 'column', animation: 'sz-slideUp .3s' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '56px 20px 12px' }}>
        <button onClick={onCancel} disabled={recording} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 16, fontWeight: 600, cursor: recording ? 'default' : 'pointer', opacity: recording ? 0.4 : 1 }}>Cancel</button>
        <div style={{ color: '#fff', fontSize: 16, fontWeight: 700 }}>Trim video</div>
        <button onClick={apply} disabled={recording} style={{ background: 'none', border: 'none', color: accent, fontSize: 16, fontWeight: 800, cursor: recording ? 'default' : 'pointer' }}>{recording ? `${Math.round(progress * 100)}%` : 'Done'}</button>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 20px', minHeight: 0 }}>
        <video ref={videoRef} src={url} playsInline autoPlay loop muted onLoadedMetadata={onMeta} onTimeUpdate={onTimeUpdate} style={{ maxWidth: '100%', maxHeight: '58vh', borderRadius: 14, background: '#000' }} />
      </div>
      <div style={{ padding: '16px 24px 40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'rgba(255,255,255,.7)', fontSize: 13, marginBottom: 8 }}>
          <span>Start {fmt(start)}</span><span>End {fmt(end)}</span>
        </div>
        <input type="range" min={0} max={duration || 1} step={0.1} value={start} onChange={(e) => setStart(Math.min(parseFloat(e.target.value), end - 0.3))} disabled={recording} style={{ width: '100%', accentColor: accent }} />
        <input type="range" min={0} max={duration || 1} step={0.1} value={end} onChange={(e) => setEnd(Math.max(parseFloat(e.target.value), start + 0.3))} disabled={recording} style={{ width: '100%', accentColor: accent }} />
        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,.5)', fontSize: 12.5, marginTop: 8 }}>
          {recording ? 'Recording your trim…' : `Selected ${fmt(end - start)} — trimming re-records the segment in real time`}
        </div>
      </div>
    </div>
  );
}
