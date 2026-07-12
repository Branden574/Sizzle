import { useEffect, useRef, useState } from 'react';
import { Button } from './controls';
import { pressVars } from './ui';

/**
 * Drag-to-reposition + zoom image cropper. Used for the profile avatar (circle)
 * and banner (wide). Renders the chosen region to a canvas and returns a JPEG blob.
 */
export function ImageCropper({
  src,
  aspect,
  round = false,
  title,
  onCancel,
  onComplete,
}: {
  src: string;
  aspect: number; // crop width / height
  round?: boolean;
  title: string;
  onCancel: () => void;
  onComplete: (blob: Blob) => void;
}) {
  const VIEW_W = 300;
  const VIEW_H = Math.round(VIEW_W / aspect);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setNat({ w: img.naturalWidth, h: img.naturalHeight });
      const base = Math.max(VIEW_W / img.naturalWidth, VIEW_H / img.naturalHeight);
      setOffset({ x: (VIEW_W - img.naturalWidth * base) / 2, y: (VIEW_H - img.naturalHeight * base) / 2 });
      setZoom(1);
    };
    img.src = src;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  const base = nat ? Math.max(VIEW_W / nat.w, VIEW_H / nat.h) : 1;
  const scale = base * zoom;
  const dispW = nat ? nat.w * scale : 0;
  const dispH = nat ? nat.h * scale : 0;

  const clamp = (o: { x: number; y: number }) => ({
    x: Math.min(0, Math.max(VIEW_W - dispW, o.x)),
    y: Math.min(0, Math.max(VIEW_H - dispH, o.y)),
  });
  const off = clamp(offset);

  const onDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, ox: off.x, oy: off.y };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setOffset(clamp({ x: drag.current.ox + (e.clientX - drag.current.x), y: drag.current.oy + (e.clientY - drag.current.y) }));
  };
  const onUp = () => { drag.current = null; };

  const save = () => {
    if (!imgRef.current || !nat) return;
    const OUT_W = round ? 512 : 1280;
    const OUT_H = Math.round(OUT_W / aspect);
    const k = OUT_W / VIEW_W;
    const canvas = document.createElement('canvas');
    canvas.width = OUT_W;
    canvas.height = OUT_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(imgRef.current, off.x * k, off.y * k, dispW * k, dispH * k);
    canvas.toBlob((b) => { if (b) onComplete(b); }, 'image/jpeg', 0.9);
  };

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 120, background: 'rgba(0,0,0,.72)', backdropFilter: 'blur(6px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, animation: 'sz-fadeIn .2s' }}>
      <div style={{ color: '#fff', fontFamily: "'Instrument Serif',serif", fontSize: 26, marginBottom: 4 }}>{title}</div>
      <div style={{ color: 'rgba(255,255,255,.6)', fontSize: 13.5, marginBottom: 18 }}>Drag to reposition · slide to zoom</div>

      <div
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        style={{ position: 'relative', width: VIEW_W, height: VIEW_H, overflow: 'hidden', borderRadius: round ? '50%' : 16, cursor: 'grab', touchAction: 'none', background: '#000', boxShadow: '0 0 0 2px rgba(255,255,255,.5), 0 20px 60px -20px rgba(0,0,0,.8)' }}
      >
        {nat && (
          <img
            src={src}
            alt=""
            draggable={false}
            style={{ position: 'absolute', left: off.x, top: off.y, width: dispW, height: dispH, maxWidth: 'none', userSelect: 'none', pointerEvents: 'none' }}
          />
        )}
      </div>

      <input
        type="range"
        min={1}
        max={4}
        step={0.01}
        value={zoom}
        onChange={(e) => setZoom(Number(e.target.value))}
        style={{ width: VIEW_W, marginTop: 22, accentColor: 'var(--accent)' }}
      />

      <div style={{ display: 'flex', gap: 12, marginTop: 24, width: VIEW_W }}>
        <Button onClick={onCancel} className="sz-press" style={{ ...pressVars(0.97), flex: 1, height: 50, borderRadius: 15, border: '1.5px solid rgba(255,255,255,.3)', background: 'transparent', color: '#fff', fontFamily: "'Hanken Grotesk'", fontSize: 15.5, fontWeight: 700, cursor: 'pointer' }}>
          Cancel
        </Button>
        <Button onClick={save} className="sz-press" style={{ ...pressVars(0.97), flex: 1, height: 50, borderRadius: 15, border: 'none', background: 'var(--accent)', color: '#fff', fontFamily: "'Hanken Grotesk'", fontSize: 15.5, fontWeight: 700, cursor: 'pointer' }}>
          Use photo
        </Button>
      </div>
    </div>
  );
}
