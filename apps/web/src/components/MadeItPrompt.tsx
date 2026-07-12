import { useRef, useState } from 'react';
import { Button, DismissBackdrop } from './controls';
import { useAuth } from '../auth/useAuth';
import { useCreateCookLog } from '../data/queries';
import { uploadRecipeImage } from '../lib/storage';

/**
 * "You made it!" — the Made-It Journal prompt. Shown after finishing cook mode
 * (and from "I made this" on the recipe sheet): 1-5 stars, a short note, an
 * optional photo, and a public toggle. Public entries become the recipe's
 * social proof; every entry lands in the cook's personal journal. Skipping is
 * always one tap — proof-of-cook is a gift, not a toll.
 */
export function MadeItPrompt({ recipeId, recipeTitle, onClose }: { recipeId: string; recipeTitle: string; onClose: () => void }) {
  const user = useAuth((s) => s.user);
  const create = useCreateCookLog();
  const [rating, setRating] = useState(0);
  const [note, setNote] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const pickPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (photo) URL.revokeObjectURL(photo.url);
    setPhoto({ file, url: URL.createObjectURL(file) });
  };

  const save = async () => {
    if (create.isPending || uploading) return;
    setErr(null);
    let photoUrl: string | undefined;
    if (photo && user) {
      setUploading(true);
      try {
        photoUrl = await uploadRecipeImage(user.id, photo.file);
      } catch {
        setUploading(false);
        setErr("Couldn't upload your photo — try again or save without it.");
        return;
      }
      setUploading(false);
    }
    create.mutate(
      { recipeId, note: note.trim() || undefined, rating: rating || undefined, photoUrl, isPublic },
      { onSuccess: () => { if (photo) URL.revokeObjectURL(photo.url); onClose(); }, onError: () => setErr("Couldn't save your entry — please try again.") },
    );
  };

  const busy = create.isPending || uploading;

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 99 }}>
      <DismissBackdrop onDismiss={onClose} />
      <div style={{ position: 'absolute', left: 14, right: 14, bottom: 'calc(20px + var(--sab, 0px))', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 24, padding: '22px 20px', animation: 'sz-slideUp .38s cubic-bezier(.16,1,.3,1)', boxShadow: '0 24px 60px rgba(0,0,0,.4)' }}>
        <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 28, color: 'var(--text)' }}>You made it! 🎉</div>
        <div style={{ fontSize: 13.5, color: 'var(--text-faint)', marginTop: 3 }}>Log “{recipeTitle}” in your cooking journal.</div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-muted)' }}>How was it?</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Button key={n} onClick={() => setRating(n === rating ? 0 : n)} aria-label={`${n} star${n === 1 ? '' : 's'}`} aria-pressed={rating >= n} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 2, fontSize: 24, lineHeight: 1, color: rating >= n ? '#f4a52c' : 'var(--track)' }}>
                ★
              </Button>
            ))}
          </div>
        </div>

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 400))}
          placeholder="Any tweaks? (used half the salt, swapped in tofu…)"
          rows={2}
          style={{ width: '100%', marginTop: 12, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: '11px 13px', fontFamily: "'Hanken Grotesk'", fontSize: 14.5, color: 'var(--text)', outline: 'none', resize: 'none' }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
          <input ref={fileRef} type="file" accept="image/*" onChange={pickPhoto} style={{ display: 'none' }} />
          <Button onClick={() => fileRef.current?.click()} style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 7, border: '1.5px dashed var(--line-2)', borderRadius: 12, background: 'var(--surface)', color: 'var(--text-muted)', padding: '9px 13px', fontFamily: "'Hanken Grotesk'", fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            📸 {photo ? 'Change photo' : 'Add a photo'}
          </Button>
          {photo && <img src={photo.url} alt="Your dish" style={{ width: 42, height: 42, borderRadius: 10, objectFit: 'cover' }} />}
          <div style={{ flex: 1 }} />
          <Button
            onClick={() => setIsPublic((v) => !v)}
            aria-pressed={isPublic}
            style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: isPublic ? 'var(--accent,#ff5a36)' : 'var(--text-faint)' }}
          >
            {isPublic ? '🌍 Public' : '🔒 Just me'}
          </Button>
        </div>

        {err && <div style={{ marginTop: 10, fontSize: 13, color: 'var(--danger-fg,#d8521e)', fontWeight: 600 }}>{err}</div>}

        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <Button onClick={onClose} disabled={busy} style={{ flex: 'none', padding: '0 18px', height: 48, border: 'none', borderRadius: 14, background: 'transparent', color: 'var(--text-faint)', fontFamily: "'Hanken Grotesk'", fontSize: 14.5, fontWeight: 700, cursor: 'pointer' }}>
            Skip
          </Button>
          <Button
            onClick={() => void save()}
            loading={busy}
            loadingLabel={uploading ? 'Uploading…' : 'Saving…'}
            variant="primary"
            style={{ flex: 1, height: 48, borderRadius: 14, fontSize: 15 }}
          >
            Save to journal
          </Button>
        </div>
      </div>
    </div>
  );
}
