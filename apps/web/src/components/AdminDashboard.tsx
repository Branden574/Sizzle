import { useState, type CSSProperties } from 'react';
import type { AdminAppealDTO, AdminReportGroupDTO, AdminUserDTO, ReportCategory, SupportRequestDTO, VerificationTier } from '@sizzle/shared';
import {
  useAdminAppeals, useAdminLog, useAdminReports, useAdminStats, useAdminSupportRequests, useAdminUsers, useBanUser, useDenyAppeal,
  useMarkFalseReport, usePurgeAccounts, useRemoveRecipe, useResolveSupportRequest, useRestoreRecipe, useVerifyUser,
} from '../data/queries';
import { useSizzle } from '../store';
import { formatCount } from '../lib/format';
import { ChevronLeftIcon } from './icons';
import { VerifiedBadge } from './VerifiedBadge';

const CATEGORY_LABEL: Record<string, string> = {
  nudity: 'Nudity or sexual content', harassment: 'Harassment or hate', violence: 'Violence or dangerous acts', spam: 'Spam or scam', other: 'Something else',
};
const topCategory = (cats: Partial<Record<ReportCategory, number>>): string => {
  const e = Object.entries(cats).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0];
  return e ? CATEGORY_LABEL[e[0]] ?? e[0] : 'Violated community guidelines';
};
const daysLeft = (iso: string | null): number | null => (iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)) : null);

const card: CSSProperties = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, padding: 14, marginBottom: 10 };
const pill = (bg: string, color: string): CSSProperties => ({ flex: 1, height: 38, border: 'none', borderRadius: 11, background: bg, color, fontFamily: "'Hanken Grotesk'", fontSize: 13.5, fontWeight: 700, cursor: 'pointer' });
const chip = (bg: string, color: string): CSSProperties => ({ fontSize: 11.5, fontWeight: 700, color, background: bg, padding: '3px 8px', borderRadius: 8 });

export function AdminDashboard() {
  const setShowAdmin = useSizzle((s) => s.setShowAdmin);
  const [tab, setTab] = useState<'reports' | 'appeals' | 'users' | 'log' | 'requests'>('reports');
  const stats = useAdminStats(true).data;
  const purge = usePurgeAccounts();

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 96, background: 'var(--bg)', display: 'flex', flexDirection: 'column', animation: 'sz-fadeIn .3s' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '52px 16px 12px', borderBottom: '1px solid var(--line)', flex: 'none' }}>
        <button onClick={() => setShowAdmin(false)} style={{ width: 38, height: 38, border: 'none', background: 'var(--surface)', borderRadius: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ChevronLeftIcon size={22} stroke="var(--text)" />
        </button>
        <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 26, color: 'var(--text)', flex: 1 }}>Admin dashboard</div>
        <button onClick={() => purge.mutate()} title="Run the expired-ban wipe now (also daily)" style={{ height: 34, padding: '0 12px', border: '1px solid var(--line)', borderRadius: 11, background: 'var(--surface)', color: 'var(--text-faint)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
          {purge.isPending ? 'Purging…' : 'Run purge'}
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 40px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 9, marginBottom: 16 }}>
          <Stat label="Flagged posts" value={stats?.flaggedPosts ?? 0} tone="#d8521e" />
          <Stat label="Appeals" value={stats?.pendingAppeals ?? 0} tone="#c98a1e" />
          <Stat label="Banned" value={stats?.bannedUsers ?? 0} tone="var(--text)" />
          <Stat label="Flagged users" value={stats?.flaggedUsers ?? 0} tone="#d8521e" />
          <Stat label="Verified" value={stats?.verifiedUsers ?? 0} tone="#1d9bf0" />
          <Stat label="Users" value={stats?.totalUsers ?? 0} tone="#1f9d55" />
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          <Tab on={tab === 'reports'} onClick={() => setTab('reports')}>Reports</Tab>
          <Tab on={tab === 'appeals'} onClick={() => setTab('appeals')}>Appeals{stats?.pendingAppeals ? ` (${stats.pendingAppeals})` : ''}</Tab>
          <Tab on={tab === 'users'} onClick={() => setTab('users')}>Users</Tab>
          <Tab on={tab === 'requests'} onClick={() => setTab('requests')}>Requests</Tab>
          <Tab on={tab === 'log'} onClick={() => setTab('log')}>Log</Tab>
        </div>

        {tab === 'reports' ? <ReportsTab /> : tab === 'appeals' ? <AppealsTab /> : tab === 'users' ? <UsersTab /> : tab === 'requests' ? <RequestsTab /> : <LogTab />}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: '12px 10px' }}>
      <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 26, color: tone, lineHeight: 1 }}>{formatCount(value)}</div>
      <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 3, fontWeight: 600 }}>{label}</div>
    </div>
  );
}
function Tab({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} style={{ flex: 1, height: 40, border: '1px solid var(--line)', borderRadius: 12, background: on ? 'var(--invert-bg)' : 'var(--surface)', color: on ? 'var(--invert-fg)' : 'var(--text-soft)', fontFamily: "'Hanken Grotesk'", fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>{children}</button>;
}
function Muted({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-faint-2)', fontSize: 14 }}>{children}</div>;
}

const ACTION_LABEL: Record<string, string> = {
  remove: 'removed a post', restore: 'restored a post', mark_false: 'dismissed reports as false',
  deny_appeal: 'denied an appeal', ban: 'banned a user', unban: 'unbanned a user', verify: 'changed verification', auto_hide: 'auto-hid a post',
};

function LogTab() {
  const log = useAdminLog(true);
  const list = log.data ?? [];
  if (log.isLoading) return <Muted>Loading log…</Muted>;
  if (list.length === 0) return <Muted>No moderation actions yet.</Muted>;
  return (
    <>
      {list.map((e) => (
        <div key={e.id} style={{ ...card, padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{e.actorName}</span>
            <span style={{ fontSize: 13.5, color: 'var(--text-soft)' }}>{ACTION_LABEL[e.action] ?? e.action}</span>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-faint-2)' }}>{e.time}</span>
          </div>
          {(e.targetName || e.targetRecipeTitle || e.detail) && (
            <div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 3 }}>
              {[e.targetRecipeTitle && `“${e.targetRecipeTitle}”`, e.targetName, e.detail].filter(Boolean).join(' · ')}
            </div>
          )}
        </div>
      ))}
    </>
  );
}

const KIND_LABEL: Record<string, string> = {
  access: 'Access my data', delete: 'Delete my data', correct: 'Correct my data', optout: 'Opt out of sale/share', general: 'General',
};

function RequestsTab() {
  const reqs = useAdminSupportRequests(true);
  const resolve = useResolveSupportRequest();
  const list = reqs.data ?? [];
  if (reqs.isLoading) return <Muted>Loading requests…</Muted>;
  if (list.length === 0) return <Muted>No privacy or support requests yet.</Muted>;
  return (
    <>
      <div style={{ fontSize: 12, color: 'var(--text-faint-2)', margin: '0 2px 10px' }}>Submitted via getsizzle.app/contact.</div>
      {list.map((r: SupportRequestDTO) => (
        <div key={r.id} style={{ ...card, opacity: r.status === 'resolved' ? 0.55 : 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
            <span style={chip('var(--surface-3)', 'var(--text-soft)')}>{KIND_LABEL[r.kind] ?? r.kind}</span>
            {r.status === 'resolved' && <span style={chip('var(--invert-bg)', 'var(--invert-fg)')}>resolved</span>}
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-faint-2)' }}>{r.createdAt}</span>
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{r.name}</div>
          <a href={`mailto:${r.email}`} style={{ fontSize: 13, color: '#1d9bf0', textDecoration: 'none' }}>{r.email}</a>
          <div style={{ fontSize: 13.5, color: 'var(--text-soft)', marginTop: 8, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{r.message}</div>
          {r.status !== 'resolved' && (
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button disabled={resolve.isPending} onClick={() => resolve.mutate({ id: r.id })} style={pill('#1f9d55', '#fff')}>Mark resolved</button>
            </div>
          )}
        </div>
      ))}
    </>
  );
}

function ReportsTab() {
  const reports = useAdminReports(true);
  const setOpenRecipe = useSizzle((s) => s.setOpenRecipe);
  const markFalse = useMarkFalseReport();
  const remove = useRemoveRecipe();
  const list = reports.data ?? [];

  if (reports.isLoading) return <Muted>Loading queue…</Muted>;
  if (list.length === 0) return <Muted>Nothing to review — no post has hit 5 reports.</Muted>;

  return (
    <>
      <div style={{ fontSize: 12, color: 'var(--text-faint-2)', margin: '0 2px 10px' }}>Posts surface here once 5+ people report them.</div>
      {list.map((r: AdminReportGroupDTO) => (
        <div key={r.recipeId} style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
            <span style={chip('var(--danger-bg)', '#d8521e')}>{r.reportCount} reports</span>
            {r.reportCount >= 20 && <span style={chip('var(--invert-bg)', 'var(--invert-fg)')}>auto-hidden</span>}
            {Object.entries(r.categories).map(([cat, n]) => <span key={cat} style={chip('var(--surface-3)', 'var(--text-soft)')}>{CATEGORY_LABEL[cat] ?? cat}: {n}</span>)}
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-faint-2)' }}>{r.time}</span>
          </div>
          <div style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--text)' }}>{r.recipeTitle}</div>
          <div style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 2 }}>by {r.cookName}{r.recipeStatus === 'removed' ? ' · removed' : ''}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={() => setOpenRecipe(r.recipeId)} style={pill('var(--invert-bg)', 'var(--invert-fg)')}>View video</button>
            <button disabled={markFalse.isPending} onClick={() => markFalse.mutate({ recipeId: r.recipeId })} style={pill('var(--surface-3)', 'var(--text-soft)')}>Mark false</button>
            <button disabled={remove.isPending || r.recipeStatus === 'removed'} onClick={() => remove.mutate({ recipeId: r.recipeId, reason: topCategory(r.categories) })} style={pill('#d8521e', '#fff')}>Remove</button>
          </div>
        </div>
      ))}
    </>
  );
}

function AppealsTab() {
  const appeals = useAdminAppeals(true);
  const restore = useRestoreRecipe();
  const deny = useDenyAppeal();
  const setOpenRecipe = useSizzle((s) => s.setOpenRecipe);
  const list = appeals.data ?? [];

  if (appeals.isLoading) return <Muted>Loading appeals…</Muted>;
  if (list.length === 0) return <Muted>No pending appeals.</Muted>;

  return (
    <>
      {list.map((a: AdminAppealDTO) => (
        <div key={a.recipeId} style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={chip('var(--warn-bg)', '#c98a1e')}>Appeal</span>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-faint-2)' }}>{a.time}</span>
          </div>
          <div style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--text)' }}>{a.recipeTitle}</div>
          <div style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 2 }}>by {a.cookName} · removed for {a.removalReason ?? '—'}</div>
          {a.appealText && <div style={{ fontSize: 13.5, color: 'var(--text-2)', marginTop: 8, fontStyle: 'italic', background: 'var(--bg-soft)', borderRadius: 10, padding: 10 }}>“{a.appealText}”</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={() => setOpenRecipe(a.recipeId)} style={pill('var(--invert-bg)', 'var(--invert-fg)')}>View video</button>
            <button disabled={deny.isPending} onClick={() => deny.mutate({ recipeId: a.recipeId })} style={pill('var(--surface-3)', 'var(--text-soft)')}>Deny</button>
            <button disabled={restore.isPending} onClick={() => restore.mutate({ recipeId: a.recipeId })} style={pill('#1f9d55', '#fff')}>Restore</button>
          </div>
        </div>
      ))}
    </>
  );
}

function UsersTab() {
  const [filter, setFilter] = useState<'flagged' | 'all' | 'banned'>('flagged');
  const [q, setQ] = useState('');
  const users = useAdminUsers(filter, q, true);
  const verify = useVerifyUser();
  const ban = useBanUser();
  const list = users.data ?? [];

  const tierBtn = (u: AdminUserDTO, tier: VerificationTier | null, label: string) => {
    const active = u.verifiedTier === tier || (tier === null && !u.verifiedTier);
    return <button key={label} onClick={() => verify.mutate({ id: u.id, tier })} style={{ flex: 1, height: 32, border: '1px solid var(--line)', borderRadius: 9, background: active ? 'var(--invert-bg)' : 'var(--surface)', color: active ? 'var(--invert-fg)' : 'var(--text-soft)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>{label}</button>;
  };

  return (
    <>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {(['flagged', 'all', 'banned'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} style={{ flex: 1, height: 34, border: '1px solid var(--line)', borderRadius: 10, background: filter === f ? 'var(--invert-bg)' : 'var(--surface)', color: filter === f ? 'var(--invert-fg)' : 'var(--text-soft)', fontSize: 13, fontWeight: 700, cursor: 'pointer', textTransform: 'capitalize' }}>{f}</button>
        ))}
      </div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or handle" style={{ width: '100%', height: 42, border: '1px solid var(--line)', borderRadius: 12, padding: '0 14px', fontFamily: "'Hanken Grotesk'", fontSize: 14.5, color: 'var(--text)', outline: 'none', background: 'var(--surface)', marginBottom: 12 }} />

      {users.isLoading ? <Muted>Loading users…</Muted> : list.length === 0 ? <Muted>No users match.</Muted> : list.map((u) => {
        const left = daysLeft(u.deleteAt);
        return (
          <div key={u.id} style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 40, height: 40, flex: 'none', borderRadius: '50%', background: u.avatarUrl ? `url(${u.avatarUrl}) center/cover` : u.avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: "'Instrument Serif',serif", fontSize: 16 }}>{u.avatarUrl ? '' : u.init}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{u.name}</span>
                  <VerifiedBadge tier={u.verifiedTier} size={14} />
                  {u.role === 'admin' && <span style={chip('var(--surface-3)', '#1d9bf0')}>ADMIN</span>}
                  {u.flagged && <span style={chip('var(--danger-bg)', '#d8521e')}>⚑ flagged</span>}
                  {u.repeatOffender && <span style={chip('var(--invert-bg)', 'var(--invert-fg)')}>repeat offender</span>}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>@{u.handle} · {formatCount(u.followerCount)} followers · {u.reportCount} reports{u.removedCount ? ` · ${u.removedCount} removed` : ''}</div>
              </div>
            </div>
            {u.banned && (
              <div style={{ marginTop: 10, background: 'var(--danger-bg)', borderRadius: 11, padding: 10 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: '#d8521e' }}>Banned{left != null ? ` · wipes in ${left} day${left === 1 ? '' : 's'}` : ''}</div>
                {u.banReason && <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>{u.banReason}</div>}
                {u.banAppealStatus === 'pending' && <div style={{ fontSize: 12.5, color: '#c98a1e', marginTop: 6, fontStyle: 'italic' }}>Appeal: “{u.banAppealText}”</div>}
              </div>
            )}
            <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>{tierBtn(u, null, 'None')}{tierBtn(u, 'blue', 'Blue')}{tierBtn(u, 'gold', 'Gold')}</div>
            <button
              disabled={u.role === 'admin' || ban.isPending}
              onClick={() => ban.mutate({ id: u.id, banned: !u.banned, reason: 'Repeated violations' })}
              style={{ width: '100%', height: 38, marginTop: 8, border: 'none', borderRadius: 11, background: u.role === 'admin' ? 'var(--surface-3)' : u.banned ? '#1f9d55' : 'var(--danger-bg)', color: u.role === 'admin' ? 'var(--text-faint-2)' : u.banned ? '#fff' : '#d8521e', fontSize: 13.5, fontWeight: 700, cursor: u.role === 'admin' ? 'default' : 'pointer' }}
            >
              {u.role === 'admin' ? 'Admin (protected)' : u.banned ? 'Unban (restore account)' : 'Ban user (45-day wipe)'}
            </button>
          </div>
        );
      })}
    </>
  );
}
