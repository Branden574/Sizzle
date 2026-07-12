import { useSizzle } from '../store';
import { Button } from './controls';

/** Inline, clickable #hashtags. Tapping one opens that tag's feed. */
export function Hashtags({ tags, color = 'var(--accent)', size = 13, onColor }: { tags: string[]; color?: string; size?: number; onColor?: string }) {
  const setOpenTag = useSizzle((s) => s.setOpenTag);
  if (!tags?.length) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 8px' }}>
      {tags.map((t) => (
        <Button
          key={t}
          onClick={(e) => { e.stopPropagation(); setOpenTag(t); }}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: onColor ?? color, fontSize: size, fontWeight: 700, fontFamily: "'Hanken Grotesk'" }}
        >
          #{t}
        </Button>
      ))}
    </div>
  );
}
