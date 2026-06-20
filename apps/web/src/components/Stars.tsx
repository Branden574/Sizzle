/** Read-only 1–5 star rating display. `value` null/0 renders five empty stars. */
export function StarRow({
  value,
  size = 14,
  color = '#ffb52e',
  empty = 'var(--track)',
}: {
  value: number | null;
  size?: number;
  color?: string;
  empty?: string;
}) {
  const v = value ?? 0;
  return (
    <span style={{ display: 'inline-flex', gap: 1, lineHeight: 1 }}>
      {[1, 2, 3, 4, 5].map((n) => {
        const on = n <= v;
        return (
          <svg key={n} width={size} height={size} viewBox="0 0 24 24" fill={on ? color : 'none'} stroke={on ? color : empty} strokeWidth={1.8} strokeLinejoin="round">
            <path d="M12 2.5l2.9 5.88 6.49.94-4.7 4.58 1.11 6.46L12 17.8l-5.8 3.05 1.11-6.46-4.7-4.58 6.49-.94L12 2.5z" />
          </svg>
        );
      })}
    </span>
  );
}
