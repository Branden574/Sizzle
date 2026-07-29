import { useRef } from 'react';
import type { CSSProperties } from 'react';
import { useHashtagAutocomplete } from '../lib/hashtagAutocomplete';
import { Button } from './controls';

/**
 * A caption <textarea> with live #hashtag autocomplete. As you type `#…`, a ranked suggestion
 * list (from /hashtags/suggest) drops in; tapping one inserts `#tag ` at the caret and restores
 * focus + cursor. Touch-safe: the suggestion uses onMouseDown+preventDefault so the tap lands
 * before the textarea's blur dismisses the list. Drop-in replacement for a plain textarea.
 */
export function HashtagCaptionField({ value, onChange, rows, placeholder, style }: {
  value: string;
  onChange: (v: string) => void;
  rows: number;
  placeholder: string;
  style: CSSProperties;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const ac = useHashtagAutocomplete(value, ref);

  const pick = (tag: string) => {
    const r = ac.apply(tag);
    if (!r) return;
    onChange(r.next);
    ac.dismiss();
    // Put the caret right after the inserted tag once React has painted the new value.
    requestAnimationFrame(() => {
      const el = ref.current;
      if (el) { el.focus(); el.setSelectionRange(r.caret, r.caret); }
    });
  };

  return (
    <div style={{ position: 'relative' }}>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onSelect={ac.recompute}
        onKeyUp={ac.recompute}
        onClick={ac.recompute}
        onBlur={() => window.setTimeout(ac.dismiss, 140)}
        rows={rows}
        placeholder={placeholder}
        style={{ ...style, resize: 'vertical', lineHeight: 1.5 }}
      />
      {ac.active && (
        <div
          role="listbox"
          style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 60, marginTop: 4, background: 'var(--bg)', border: '1px solid var(--line-2)', borderRadius: 14, boxShadow: '0 10px 34px rgba(0,0,0,.4)', overflow: 'hidden', maxHeight: 232, overflowY: 'auto' }}
        >
          {ac.suggestions.map((s) => (
            // A listbox option, not a standalone action — hence role/aria-selected, which Button
            // spreads straight onto the element it renders. Two things must survive the move onto
            // the shared primitive: onMouseDown (NOT onClick — the tap has to land before the
            // textarea's blur dismisses this list), and whiteSpace:'normal', because .sz-button
            // sets nowrap and a long hashtag is meant to wrap onto a second line rather than be
            // truncated away.
            <Button
              key={s.tag}
              role="option"
              aria-selected={false}
              onMouseDown={(e) => { e.preventDefault(); pick(s.tag); }}
              style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '11px 14px', background: 'none', border: 'none', borderBottom: '1px solid var(--line)', cursor: 'pointer', textAlign: 'left', color: 'var(--text)', whiteSpace: 'normal' }}
            >
              <span style={{ fontWeight: 700, fontSize: 14.5 }}>#{s.displayName}{s.featured ? ' ⭐' : ''}</span>
              <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{s.isNew ? 'New tag' : `${s.postCount.toLocaleString()} post${s.postCount === 1 ? '' : 's'}`}</span>
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
