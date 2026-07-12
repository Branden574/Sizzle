import { useState } from 'react';
import { useSwipeDismiss } from '../../lib/useSwipeDismiss';
import type { ReportCategory } from '@sizzle/shared';
import { useReport } from '../../data/queries';
import { useRequireAuth } from '../../auth/useRequireAuth';
import { useSizzle } from '../../store';

const TARGET_NOUN = { recipe: 'post', comment: 'comment', profile: 'profile' } as const;

const REASONS: { key: ReportCategory; label: string; sub: string }[] = [
  { key: 'nudity', label: 'Nudity or sexual content', sub: 'Explicit or suggestive material' },
  { key: 'harassment', label: 'Harassment or hate', sub: 'Bullying, threats, or hate speech' },
  { key: 'violence', label: 'Violence or dangerous acts', sub: 'Graphic or harmful content' },
  { key: 'spam', label: 'Spam or scam', sub: 'Misleading or repetitive content' },
  { key: 'other', label: 'Something else', sub: "It doesn't belong on Sizzle" },
];

export function ReportSheet() {
  const reportFor = useSizzle((s) => s.reportFor);
  const setReportFor = useSizzle((s) => s.setReportFor);
  const requireAuth = useRequireAuth();
  const report = useReport();
  const [done, setDone] = useState(false);

  const swipe = useSwipeDismiss(() => setReportFor(null));
  if (!reportFor) return null;
  const noun = TARGET_NOUN[reportFor.type];
  const close = () => { setReportFor(null); setDone(false); };

  const pick = (category: ReportCategory) => {
    if (!requireAuth()) return;
    if (report.isPending) return;
    report.mutate({ targetType: reportFor.type, targetId: reportFor.id, category }, { onSuccess: () => setDone(true) });
  };

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 94 }}>
      <div onClick={close} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)', animation: 'sz-fadeIn .3s' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: 'var(--bg)', borderRadius: '26px 26px 0 0', overflow: 'hidden', animation: 'sz-slideUp .4s cubic-bezier(.16,1,.3,1)', paddingBottom: 30, ...swipe.sheetStyle }}>
        <div {...swipe.handlers} style={{ textAlign: 'center', padding: '16px 0 6px', position: 'relative' , ...swipe.handlers.style}}>
          <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', width: 42, height: 5, borderRadius: 3, background: 'var(--track)' }} />
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginTop: 6 }}>{done ? 'Thanks for the report' : `Report this ${noun}`}</div>
          <div style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 2 }}>{done ? "Our team will review it shortly." : 'Why are you reporting it?'}</div>
        </div>

        <div style={{ padding: '12px 22px 0' }}>
          {done ? (
            <button onClick={close} style={{ width: '100%', height: 52, border: 'none', borderRadius: 16, background: 'var(--invert-bg)', color: 'var(--invert-fg)', fontFamily: "'Hanken Grotesk'", fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>Done</button>
          ) : (
            <>
              {REASONS.map((r) => (
                <button
                  key={r.key}
                  onClick={() => pick(r.key)}
                  disabled={report.isPending}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, padding: 14, cursor: 'pointer', textAlign: 'left', width: '100%', marginBottom: 10, opacity: report.isPending ? 0.6 : 1 }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{r.label}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 2 }}>{r.sub}</div>
                  </div>
                  <div style={{ color: '#c9bcae', fontSize: 20 }}>›</div>
                </button>
              ))}
              {report.isError && <div style={{ color: '#d8521e', fontSize: 13.5, fontWeight: 600, padding: '2px 2px 8px' }}>Couldn't submit — please try again.</div>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
