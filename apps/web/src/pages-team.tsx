import { Ic } from './icons';
import Doodu, { DOODU_LINES } from './components/Doodu';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, fmtTime, goto } from './api';
import { Empty, Modal, toast, useApp, type Me } from './ui';
import { desktopNotify } from './timer';

/** Opens a link stored in a notification, e.g. "tasks/abc" or "meetings/xyz". */
export const openLink = (link?: string | null) => { if (!link) return; const [p, a] = link.split('/'); goto(p, a); };
export const initials = (n?: string | null) => (n ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]?.toUpperCase()).join('');
export const Avatar = ({ name, online, size = 28 }: { name?: string | null; online?: boolean; size?: number }) => {
  const hue = [...(name ?? '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return <span className="avatar" title={name ?? ''} style={{ width: size, height: size, fontSize: size * 0.4, background: `hsl(${hue} 55% 45%)` }}>{initials(name)}{online && <i className="online" />}</span>;
};
export const ago = (iso: string) => { const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000); if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s / 60)} min ago`; if (s < 86400) return `${Math.floor(s / 3600)} h ago`; return fmtTime(iso); };
export const useTeam = () => useQuery({ queryKey: ['team'], refetchInterval: 60_000, queryFn: () => api<{ items: any[] }>('/team').then((r) => r.items) });

/** Keeps the page up to date: the server tells us when something changed (no refreshing needed). */
export function useLive(me: Me) {
  const qc = useQueryClient(); const last = useRef<string>('');
  useEffect(() => {
    if (me.viewAs) return;
    let es: EventSource | null = null; let stopped = false;
    const open = () => {
      try { es = new EventSource('/api/v1/events'); } catch { return; }
      es.onmessage = async (e) => {
        let ev: any = {}; try { ev = JSON.parse(e.data); } catch { return; }
        const inv = (...keys: string[]) => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
        inv('ncount', 'notifications');
        if (ev.type === 'chat') { inv('chat-rooms', 'chat-msgs'); if (!location.hash.startsWith('#chat') && !location.hash.startsWith('#meetings')) { toast('New message'); if (document.hidden) desktopNotify('DOOD', 'You have a new message'); } }
        if (ev.type === 'meeting') inv('meetings', 'meeting', 'chat-rooms', 'chat-msgs', 'messages');
        if (ev.type === 'announcement') inv('announcements', 'feed');
        if (ev.type === 'feed') inv('feed');
        if (ev.type === 'notification') {
          qc.invalidateQueries();      // something changed for you (a task given to you, a completion …): refresh what is on screen
          try { const r = await api<any>('/notifications?unread=true&limit=1'); const n = r.items[0]; if (n && n.id !== last.current) { last.current = n.id; toast(n.title); if (document.hidden) desktopNotify('DOOD', n.title); } } catch { /* ignore */ }
        }
      };
      es.onerror = () => { es?.close(); if (!stopped) setTimeout(open, 4000); };
    };
    open();
    return () => { stopped = true; es?.close(); };
  }, [me.user.id, !!me.viewAs]);
}

// ───── Bell ─────
export function Bell() {
  const [open, setOpen] = useState(false); const qc = useQueryClient();
  const count = useQuery({ queryKey: ['ncount'], refetchInterval: 45_000, queryFn: () => api<{ unread: number; chat: number }>('/notifications/count') });
  const list = useQuery({ queryKey: ['notifications'], enabled: open, queryFn: () => api<{ items: any[]; unread: number }>('/notifications?limit=40') });
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!open) return; const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }; addEventListener('mousedown', h); return () => removeEventListener('mousedown', h); }, [open]);
  const refresh = () => { qc.invalidateQueries({ queryKey: ['ncount'] }); qc.invalidateQueries({ queryKey: ['notifications'] }); };
  const click = async (n: any) => { if (!n.readAt) await api(`/notifications/${n.id}/read`, { method: 'POST' }).catch(() => undefined); refresh(); setOpen(false); openLink(n.link); };
  const u = count.data?.unread ?? 0;
  return (
    <div className="bell-wrap" ref={ref}>
      <button className="top-btn" onClick={() => setOpen(!open)} title="Notifications" aria-label="Notifications"><Ic n="bell" />{u > 0 && <em className="red">{u > 99 ? '99+' : u}</em>}</button>
      {open && <div className="bell-panel card" role="dialog" aria-label="Notifications">
        <header><b>Notifications</b><span style={{ display: 'flex', gap: '.6rem', alignItems: 'center' }}>{u > 0 && <button className="linklike" onClick={async () => { await api('/notifications/read-all', { method: 'POST' }); refresh(); }}>Mark all read</button>}<button className="icon" aria-label="Close" title="Close" onClick={() => setOpen(false)}>✕</button></span></header>
        <div className="bell-list">
          {!list.data?.items.length && <p className="muted pad">Nothing yet. You will see tasks given to you, meeting invites and announcements here.</p>}
          {list.data?.items.map((n) => (
            <button key={n.id} className={'bell-item' + (n.readAt ? '' : ' unread')} onClick={() => click(n)}>
              <Avatar name={n.actorName ?? '•'} size={30} /><span><b>{n.title}</b>{n.body && <small>{n.body}</small>}<small className="muted">{ago(n.createdAt)}</small></span>
            </button>))}
        </div>
      </div>}
    </div>
  );
}

// ───── View-as banner ─────
export function ViewAsBanner({ me }: { me: Me }) {
  const qc = useQueryClient(); if (!me.viewAs) return null;
  const exit = async () => { await api('/auth/view-as', { method: 'DELETE' }); qc.clear(); await qc.refetchQueries({ queryKey: ['me'] }); goto('users'); };
  return <div className="viewas-bar" role="status">{me.viewAs.readOnly ? <>Viewing as <b>{me.user.name}</b> — read-only, nothing can be changed.</> : <>Acting as <b>{me.user.name}</b> — what you do is saved in their name.</>}<button onClick={exit}>Exit and return to {me.viewAs.realName}</button></div>;
}

// ───── First sign-in: choose your own password ─────
export function ForceChange({ me, onDone, onSignOut }: { me: Me; onDone: () => void; onSignOut: () => void }) {
  const [f, setF] = useState({ current: '', next: '', again: '' }); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('');
    if (f.next !== f.again) return setErr('The two new passwords are not the same.');
    setBusy(true);
    try { await api('/auth/change-password', { method: 'POST', body: { currentPassword: f.current, newPassword: f.next } }); onDone(); } catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <div className="auth"><form className="card auth-card" onSubmit={submit}>
      <div className="logo">DOOD</div><h1>Welcome, {me.user.name.split(' ')[0]}</h1>
      <p className="muted">Please choose your own password before you start. Use at least 8 characters — only you should know it.</p>
      <label className="field"><span>Password you were given</span><input type="password" required value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} autoComplete="current-password" autoFocus /></label>
      <label className="field"><span>New password</span><input type="password" required minLength={8} value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} autoComplete="new-password" /></label>
      <label className="field"><span>New password again</span><input type="password" required minLength={8} value={f.again} onChange={(e) => setF({ ...f, again: e.target.value })} autoComplete="new-password" /></label>
      {err && <p className="error">{err}</p>}
      <button className="primary wide-btn" disabled={busy}>{busy ? 'Please wait…' : 'Save and continue'}</button>
      <button type="button" className="linklike" onClick={onSignOut}>Sign out</button>
    </form></div>
  );
}

// ───── Congratulation + self-review after finishing a task ─────
export function Celebrate() {
  const { me } = useApp(); const qc = useQueryClient();
  const [id, setId] = useState<string | null>(null);
  useEffect(() => { const h = (e: Event) => { if (!me.viewAs) setId((e as CustomEvent).detail.id); }; addEventListener('cc-task-done', h); return () => removeEventListener('cc-task-done', h); }, [me.viewAs]);
  if (!id) return null;
  return <CelebrateModal id={id} onClose={() => { setId(null); qc.invalidateQueries({ queryKey: ['task'] }); }} />;
}
function CelebrateModal({ id, onClose }: { id: string; onClose: () => void }) {
  const p = useQuery({ queryKey: ['review-prompt', id], queryFn: () => api<any>(`/tasks/${id}/review-prompt`), retry: false });
  const [f, setF] = useState<any>({ rating: 0, wentWell: '', challenges: '', nextTime: '' }); const [busy, setBusy] = useState(false); const [saved, setSaved] = useState<any>(null); const [err, setErr] = useState('');
  const [mute, setMute] = useState(false);
  useEffect(() => { if (p.isError) onClose(); }, [p.isError]);
  useEffect(() => { if (p.data && localStorage.getItem('cc.noReview') === '1') { toast(p.data.cheer); onClose(); } }, [p.data]);
  if (!p.data || localStorage.getItem('cc.noReview') === '1') return null;
  const d = p.data; const Q = d.questions as string[];
  const save = async () => {
    setBusy(true); setErr('');
    try { if (mute) localStorage.setItem('cc.noReview', '1');
      setSaved(await api(`/tasks/${id}/review`, { method: 'POST', body: { rating: f.rating || null, wentWell: f.wentWell || null, challenges: f.challenges || null, nextTime: f.nextTime || null, withAi: true } })); }
    catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <Modal title="Task complete" onClose={onClose}>
      <div className="confetti" aria-hidden>{Array.from({ length: 24 }).map((_, i) => <i key={i} style={{ left: `${(i * 4.3) % 100}%`, animationDelay: `${(i % 8) * 0.12}s`, background: ['#f59e0b', '#22a06b', '#3b82f6', '#ec4899', '#a855f7'][i % 5] }} />)}</div>
      <div className="doodu-hello center"><Doodu pose="done" size={120} /></div>
      <div className="cheer"><h2>{d.cheer}</h2><p><b>{d.title}</b></p><p className="muted">{d.facts}</p></div>
      {!saved ? <>
        <p className="muted" style={{ margin: '.6rem 0' }}>A one-minute review helps you (and your team) learn from it. {d.aiAvailable ? 'The AI will give you a short note back.' : ''}</p>
        <div className="stars" role="radiogroup" aria-label="How do you rate your work?">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" className={f.rating >= n ? 'on' : ''} aria-label={`${n} star`} onClick={() => setF({ ...f, rating: n })}></button>)}<small className="muted">How do you rate your own work?</small></div>
        <label className="field"><span>{Q[0]}</span><textarea rows={2} value={f.wentWell} onChange={(e) => setF({ ...f, wentWell: e.target.value })} /></label>
        <label className="field"><span>{Q[1]}</span><textarea rows={2} value={f.challenges} onChange={(e) => setF({ ...f, challenges: e.target.value })} /></label>
        <label className="field"><span>{Q[2]}</span><textarea rows={2} value={f.nextTime} onChange={(e) => setF({ ...f, nextTime: e.target.value })} /></label>
        {err && <p className="error">{err}</p>}
        <label className="check-line"><input type="checkbox" checked={mute} onChange={(e) => setMute(e.target.checked)} /> Don’t ask me for reviews again on this computer</label>
        <div className="actions"><button className="ghost" onClick={onClose}>Skip</button><button className="primary" disabled={busy || (!f.rating && !f.wentWell && !f.challenges && !f.nextTime)} onClick={save}>{busy ? 'Saving…' : 'Save my review'}</button></div>
      </> : <>
        <p className="ok-text">✓ Review saved.</p>
        {saved.aiFeedback && <div className="ai-note"><b>A note from the AI coach</b><p>{saved.aiFeedback}</p></div>}
        <div className="actions"><button className="primary" onClick={onClose}>Done</button></div>
      </>}
    </Modal>
  );
}

/** Reviews written for a task (shown inside the task window). */
export function TaskReviews({ taskId }: { taskId: string }) {
  const q = useQuery({ queryKey: ['task-reviews', taskId], queryFn: () => api<{ items: any[] }>(`/tasks/${taskId}/reviews`).then((r) => r.items) });
  if (!q.data?.length) return null;
  return (
    <div className="section"><h4>Self-reviews</h4>
      {q.data.map((r) => (
        <div className="review-card" key={r.id}><div><b>{r.authorName}</b> <span className="stars-static">{''.repeat(r.rating ?? 0)}{''.repeat(5 - (r.rating ?? 0))}</span> <small className="muted">{ago(r.createdAt)}</small></div>
          {r.wentWell && <p><b>Went well:</b> {r.wentWell}</p>}{r.challenges && <p><b>Challenges:</b> {r.challenges}</p>}{r.nextTime && <p><b>Next time:</b> {r.nextTime}</p>}
          {r.aiFeedback && <div className="ai-note"><b>AI coach</b><p>{r.aiFeedback}</p></div>}</div>))}
    </div>
  );
}

export const PersonPick = ({ value, onChange, exclude, placeholder = 'Choose a person…' }: { value: string; onChange: (id: string) => void; exclude?: string; placeholder?: string }) => {
  const t = useTeam();
  return <select value={value} onChange={(e) => onChange(e.target.value)}><option value="">{placeholder}</option>{t.data?.filter((x) => x.id !== exclude).map((x) => <option key={x.id} value={x.id}>{x.name}{x.online ? ' ●' : ''}</option>)}</select>;
};

/** Checkbox list to choose several team members. */
export function PeopleChecks({ value, onChange, exceptMe = true }: { value: string[]; onChange: (v: string[]) => void; exceptMe?: boolean }) {
  const t = useTeam(); const list = (t.data ?? []).filter((x) => !(exceptMe && x.me));
  if (!list.length) return <Empty>No other team members yet. Ask the owner to add them in Users.</Empty>;
  return (
    <div className="people-checks">
      <div className="inline"><button type="button" className="linklike" onClick={() => onChange(list.map((x) => x.id))}>Select all</button><button type="button" className="linklike" onClick={() => onChange([])}>None</button><small className="muted">{value.length} selected</small></div>
      <div className="pc-grid">{list.map((x) => <label key={x.id} className={'pc' + (value.includes(x.id) ? ' on' : '')}><input type="checkbox" checked={value.includes(x.id)} onChange={(e) => onChange(e.target.checked ? [...value, x.id] : value.filter((y) => y !== x.id))} /><Avatar name={x.name} online={x.online} size={24} /><span>{x.name}{x.designation && <small className="muted"> {x.designation}</small>}</span></label>)}</div>
    </div>
  );
}
