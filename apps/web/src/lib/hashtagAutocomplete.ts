import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { apiGet } from './api';

export interface HashtagSuggestion {
  tag: string;
  displayName: string;
  postCount: number;
  featured: boolean;
  isNew: boolean;
}

/**
 * Find the `#token` the caret currently sits inside, or null. A hashtag must be preceded by
 * whitespace or the start of the text (never mid-word, so `foo#bar` and URLs/emails don't match),
 * and the caret must be after the `#`. Returns the token text (incl. `#`) and its [start, end).
 */
export function activeHashtagToken(text: string, caret: number): { prefix: string; start: number; end: number } | null {
  if (caret < 1) return null;
  let start = caret;
  while (start > 0 && /[\p{L}0-9_]/u.test(text[start - 1]!)) start--;
  if (start === 0 || text[start - 1] !== '#') return null;
  const hashPos = start - 1;
  // A hashtag must follow whitespace or the start of the text — never punctuation/word chars, so
  // URLs (example.com/#frag), anchors, and mid-word #s don't trigger the composer autocomplete.
  if (hashPos > 0 && !/\s/.test(text[hashPos - 1]!)) return null;
  let end = caret;
  while (end < text.length && /[\p{L}0-9_]/u.test(text[end]!)) end++;
  return { prefix: text.slice(hashPos, caret), start: hashPos, end };
}

/**
 * Composer hashtag autocomplete. Tracks the caret in the caption field, detects the active
 * `#token`, debounces a LATEST-WINS fetch to /hashtags/suggest, and exposes apply() to replace
 * the token at the caret. Reads selectionStart from the live element each time, so it stays
 * correct across the native keyboard, autocorrect, paste, and IME composition.
 */
export function useHashtagAutocomplete(text: string, ref: RefObject<HTMLTextAreaElement | null>) {
  const [suggestions, setSuggestions] = useState<HashtagSuggestion[]>([]);
  const [token, setToken] = useState<{ prefix: string; start: number; end: number } | null>(null);
  const reqId = useRef(0);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recompute = () => {
    const el = ref.current;
    if (!el) return;
    const caret = el.selectionStart ?? text.length;
    // Only when there's a real selection point (not a range selection).
    const t = el.selectionStart === el.selectionEnd ? activeHashtagToken(text, caret) : null;
    setToken(t);
    if (!t) { setSuggestions([]); return; }
    const q = t.prefix.slice(1);
    const myId = ++reqId.current;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      apiGet<HashtagSuggestion[]>(`/hashtags/suggest?q=${encodeURIComponent(q)}`)
        .then((res) => { if (myId === reqId.current) setSuggestions(res); })
        .catch(() => { if (myId === reqId.current) setSuggestions([]); });
    }, 140);
  };

  // Recompute whenever the caption text changes (the caret listeners handle cursor-only moves).
  useEffect(() => { recompute(); return () => { if (debounce.current) clearTimeout(debounce.current); };   }, [text]);

  /** Replace the active token with `#tag ` and return the new text + caret to place after it. */
  const apply = (tag: string): { next: string; caret: number } | null => {
    if (!token) return null;
    const after = text.slice(token.end);
    // Add a trailing space only if the next char isn't already whitespace (no double space).
    const insert = `#${tag}` + (/^\s/.test(after) ? '' : ' ');
    const next = text.slice(0, token.start) + insert + after;
    return { next, caret: token.start + insert.length };
  };

  const dismiss = () => { setToken(null); setSuggestions([]); };

  return { suggestions, active: !!token && suggestions.length > 0, apply, recompute, dismiss };
}
