import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, goto } from './api';
import { Badge, Empty, Modal, toast, useApp } from './ui';
import { Avatar, PeopleChecks, ago } from './pages-team';

const EMOJI = ['👍', '❤️', '👏', '🎉', '😮'];
const PRI_TONE: Record<string, string> = { NORMAL: 'grey', IMPORTANT: 'amber', URGENT: 'red' };

function Reactions({ type, id, items, onChange }: { type: 'ANNOUNCEMENT' | 'POST' | 'TASK'; id: string; items: any[]; onChange: () => void }) {
  const { me } = useApp();
  const react = async (emoji: string) => { if (me.viewAs?.readOnly) return; try { await api('/reactions', { method: 'PUT', body: { entityType: type, entityId: id, emoji } }); onChange(); } catch (e: any) { toast(e.message); } };
  return <div className="reacts">
    {items.map((r) => <button key={r.emoji} className={'react' + (r.mine ? ' on' : '')} title={r.names} onClick={() => react(r.emoji)}>{r.emoji} {r.n}</button>)}
    <span className="react-add">☺<span className="react-pop">{EMOJI.map((e) => <button key={e} onClick={() => react(e)}>{e}</button>)}</span></span>
  </div>;
}

// ───────────────────────── Announcements ─────────────────────────
export function Announcements() {
  const { me } = useApp(); const qc = useQueryClient();
  const q = useQuery({ queryKey: ['announcements'], refetchInterval: 30_000, queryFn: () => api<any>('/announcements') });
  const [creating, setCreating] = useState(false); const [readers, setReaders] = useState<any>(null);
  const canWrite = !me.viewAs?.readOnly && (me.user.isAdmin || me.memberships.some((m) => m.role === 'MANAGER') || true);
  const refresh = () => { q.refetch(); qc.invalidateQueries({ queryKey: ['feed'] }); qc.invalidateQueries({ queryKey: ['ann-count'] }); };
  const seen = async (a: any) => { if (a.seenAt || a.createdById === me.user.id || me.viewAs) return; await api(`/announcements/${a.id}/seen`, { method: 'POST' }).catch(() => undefined); refresh(); };
  const ack = async (a: any) => { try { await api(`/announcements/${a.id}/ack`, { method: 'POST' }); toast('Thank you — the sender can see you have read it.'); refresh(); } catch (e: any) { toast(e.message); } };
  const act = async (fn: () => Promise<any>, ok?: string) => { try { await fn(); if (ok) toast(ok); refresh(); } catch (e: any) { toast(e.message); } };
  const items: any[] = q.data?.items ?? [];
  return (
    <section>
      <div className="page-head"><div><h2>Announcements</h2><p className="muted">Notices from the owner and managers. You can see who has read each one.{q.data?.needsAck ? <b className="red-text"> {q.data.needsAck} need your “I have read this”.</b> : ''}</p></div>
        {canWrite && <button className="primary" onClick={() => setCreating(true)}>＋ New announcement</button>}</div>
      {!items.length && <Empty>No announcements right now.</Empty>}
      <div className="ann-list">{items.map((a) => (
        <article key={a.id} className={'card ann ' + a.priority.toLowerCase() + (!a.seenAt && a.createdById !== me.user.id ? ' unseen' : '')} onMouseEnter={() => seen(a)} onClick={() => seen(a)}>
          <header><div>{a.pinned && <span title="Pinned"></span>}<b>{a.title}</b> {a.priority !== 'NORMAL' && <Badge tone={PRI_TONE[a.priority]}>{a.priority === 'URGENT' ? 'Urgent' : 'Important'}</Badge>}
            {a.publishAt && a.publishAt > new Date().toISOString() && <Badge tone="blue">Scheduled</Badge>}</div>
            <small className="muted">{a.authorName ?? 'Owner'} · {ago(a.publishAt ?? a.createdAt)}{a.expiresAt ? ` · until ${new Date(a.expiresAt).toLocaleDateString('en-IN')}` : ''}</small></header>
          <p className="ann-body">{a.body}</p>
          <Reactions type="ANNOUNCEMENT" id={a.id} items={a.reactions} onChange={refresh} />
          <footer>
            {a.requiresAck && a.createdById !== me.user.id && (a.ackAt ? <span className="ok-text">You acknowledged this</span> : <button className="primary" disabled={!!me.viewAs} onClick={() => ack(a)}>✔ I have read this</button>)}
            {a.stats && <button className="linklike" onClick={async () => setReaders({ a, ...(await api(`/announcements/${a.id}/readers`)) })}>Seen by {a.stats.seen} of {a.stats.audience}{a.requiresAck ? ` · acknowledged ${a.stats.acknowledged}` : ''}</button>}
            {a.canManage && !me.viewAs?.readOnly && <span className="ann-tools">
              {(a.stats && (a.requiresAck ? a.stats.acknowledged : a.stats.seen) < a.stats.audience) && <button className="ghost small" onClick={() => act(async () => { const r = await api(`/announcements/${a.id}/remind`, { method: 'POST' }); toast(`Reminder sent to ${r.reminded}.`); })}>Remind</button>}
              <button className="ghost small" onClick={() => act(() => api(`/announcements/${a.id}`, { method: 'PATCH', body: { expectedUpdatedAt: a.updatedAt, pinned: !a.pinned } }))}>{a.pinned ? 'Unpin' : 'Pin'}</button>
              <button className="ghost small" onClick={() => confirm('Remove this announcement for everyone?') && act(() => api(`/announcements/${a.id}/archive`, { method: 'POST' }), 'Removed.')}>Remove</button></span>}
          </footer>
        </article>))}</div>
      {creating && <NewAnnouncement onClose={() => setCreating(false)} onDone={() => { setCreating(false); refresh(); }} />}
      {readers && <Modal title={`Who has read: ${readers.a.title}`} onClose={() => setReaders(null)} wide>
        <div className="table-wrap"><table><thead><tr><th>Person</th><th>Seen</th>{readers.requiresAck && <th>Acknowledged</th>}</tr></thead>
          <tbody>{readers.items.map((r: any) => <tr key={r.userId}><td>{r.name}</td><td>{r.seenAt ? ago(r.seenAt) : <span className="red-text">Not yet</span>}</td>{readers.requiresAck && <td>{r.ackAt ? '' + ago(r.ackAt) : <span className="red-text">Not yet</span>}</td>}</tr>)}</tbody></table></div>
      </Modal>}
    </section>
  );
}

function NewAnnouncement({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { me } = useApp(); const ai = useQuery({ queryKey: ['ai-status'], retry: false, queryFn: () => api<any>('/ai/status').catch(() => ({ enabled: false })) });
  const companies = useQuery({ queryKey: ['companies-all'], queryFn: () => api<{ items: any[] }>('/companies?limit=200').then((r) => r.items) });
  const mgrCompanies = (companies.data ?? []).filter((c) => me.user.isAdmin || me.memberships.some((m) => m.companyId === c.id && m.role === 'MANAGER'));
  const [f, setF] = useState<any>({ title: '', body: '', priority: 'NORMAL', audience: me.user.isAdmin ? 'ALL' : 'SELECTED', companyId: '', pinned: false, requiresAck: false, publishAt: '', expiresAt: '' });
  const [people, setPeople] = useState<string[]>([]); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const polish = async (mode: string) => { setBusy(true); setErr(''); try { const r = await api('/announcements/polish', { method: 'POST', body: { title: f.title, body: f.body, mode, language: 'Hindi' } }); setF((p: any) => ({ ...p, title: r.title || p.title, body: r.body })); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      await api('/announcements', { method: 'POST', body: { title: f.title, body: f.body, priority: f.priority, audience: f.audience, companyId: f.audience === 'COMPANY' ? f.companyId : null, userIds: f.audience === 'SELECTED' ? people : [], pinned: f.pinned, requiresAck: f.requiresAck,
        publishAt: f.publishAt ? new Date(f.publishAt).toISOString() : null, expiresAt: f.expiresAt ? new Date(f.expiresAt + 'T23:59:00').toISOString() : null } });
      toast('Announcement sent.'); onDone();
    } catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <Modal title="New announcement" onClose={onClose} wide>
      <form className="form" onSubmit={submit}>
        <label className="field"><span>Heading *</span><input required value={f.title} onChange={(e) => set('title', e.target.value)} autoFocus /></label>
        <label className="field"><span>Message *</span><textarea required rows={6} value={f.body} onChange={(e) => set('body', e.target.value)} /></label>
        {ai.data?.enabled && <div className="actions wrap left"><small className="muted">AI can help with the wording:</small><button type="button" className="ghost small" disabled={busy || !f.body.trim()} onClick={() => polish('polish')}>Improve wording</button><button type="button" className="ghost small" disabled={busy || !f.body.trim()} onClick={() => polish('shorter')}>Make shorter</button><button type="button" className="ghost small" disabled={busy || !f.body.trim()} onClick={() => polish('translate')}>Translate to Hindi</button></div>}
        <div className="row2">
          <label className="field"><span>Importance</span><select value={f.priority} onChange={(e) => set('priority', e.target.value)}><option value="NORMAL">Normal</option><option value="IMPORTANT">Important</option><option value="URGENT">Urgent</option></select></label>
          <label className="field"><span>Who is it for?</span><select value={f.audience} onChange={(e) => set('audience', e.target.value)}>{me.user.isAdmin && <option value="ALL">Everyone</option>}{!!mgrCompanies.length && <option value="COMPANY">One company</option>}<option value="SELECTED">Chosen people</option></select></label>
        </div>
        {f.audience === 'COMPANY' && <label className="field"><span>Company *</span><select required value={f.companyId} onChange={(e) => set('companyId', e.target.value)}><option value="">Choose…</option>{mgrCompanies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
        {f.audience === 'SELECTED' && <div className="field"><span>People *</span><PeopleChecks value={people} onChange={setPeople} /></div>}
        <div className="row2">
          <label className="field"><span>Publish later (optional)</span><input type="datetime-local" value={f.publishAt} onChange={(e) => set('publishAt', e.target.value)} /></label>
          <label className="field"><span>Hide after (optional)</span><input type="date" value={f.expiresAt} onChange={(e) => set('expiresAt', e.target.value)} /></label>
        </div>
        <label className="check-line"><input type="checkbox" checked={f.requiresAck} onChange={(e) => set('requiresAck', e.target.checked)} /> People must press “I have read this”</label>
        <label className="check-line"><input type="checkbox" checked={f.pinned} onChange={(e) => set('pinned', e.target.checked)} /> Keep pinned at the top</label>
        {err && <p className="error">{err}</p>}
        <div className="actions"><button className="primary" disabled={busy || !f.title.trim() || !f.body.trim()}>{f.publishAt ? 'Schedule' : 'Send now'}</button></div>
      </form>
    </Modal>);
}

// ───────────────────────── Feed ─────────────────────────
export function Feed() {
  const { me } = useApp(); const qc = useQueryClient();
  const q = useQuery({ queryKey: ['feed'], refetchInterval: 45_000, queryFn: () => api<{ items: any[] }>('/feed').then((r) => r.items) });
  const [text, setText] = useState(''); const [busy, setBusy] = useState(false); const [open, setOpen] = useState<string | null>(null);
  const post = async () => { if (!text.trim()) return; setBusy(true); try { await api('/feed/posts', { method: 'POST', body: { body: text.trim() } }); setText(''); q.refetch(); } catch (e: any) { toast(e.message); } finally { setBusy(false); } };
  const refresh = () => qc.invalidateQueries({ queryKey: ['feed'] });
  return (
    <section className="feed-page">
      <div className="page-head"><div><h2>Team feed</h2><p className="muted">What is happening across the team: updates, announcements, finished work and meeting minutes.</p></div></div>
      {!me.viewAs?.readOnly && <div className="card pad composer-card"><textarea rows={2} placeholder="Share an update with the team…" value={text} onChange={(e) => setText(e.target.value)} /><div className="actions"><button className="primary" disabled={busy || !text.trim()} onClick={post}>Post</button></div></div>}
      {!q.data?.length && <Empty>Nothing here yet. Post the first update!</Empty>}
      {q.data?.map((i) => (
        <article key={i.type + i.id} className={'card feed-card ' + i.type.toLowerCase()}>
          <header><Avatar name={i.author} size={34} /><div><b>{i.author ?? 'Someone'}</b> <small className="muted">
            {i.type === 'POST' ? 'posted' : i.type === 'ANNOUNCEMENT' ? 'announced' : i.type === 'COMPLETED' ? 'finished a task' : 'held a meeting'} · {ago(i.at)}</small></div>
            {i.type === 'POST' && (i.author === me.user.name || me.user.isAdmin) && <button className="icon" title="Remove" onClick={async () => { if (confirm('Remove this post?')) { await api(`/feed/posts/${i.id}/archive`, { method: 'POST' }); refresh(); } }}>✕</button>}</header>
          {i.type === 'POST' && <p className="ann-body">{i.body}</p>}
          {i.type === 'ANNOUNCEMENT' && <><b>{i.priority === 'URGENT' ? '' : i.priority === 'IMPORTANT' ? '' : ''}{i.title}</b><p className="ann-body">{i.body}</p><button className="linklike" onClick={() => goto('announcements')}>Open announcements</button></>}
          {i.type === 'COMPLETED' && <><p><button className="linklike" onClick={() => goto('tasks', i.id)}>{i.title}</button> <small className="muted">· {i.company}</small></p>
            {i.onTime ? <Badge tone="green">On time</Badge> : <Badge tone="amber">Finished late</Badge>}{i.rating ? <span className="stars-line"> {''.repeat(i.rating)}{''.repeat(5 - i.rating)}</span> : null}{i.review && <p className="muted ai-note">“{i.review}”</p>}</>}
          {i.type === 'MEETING' && <><b>{i.title}</b><p className="ann-body">{i.body}</p><button className="linklike" onClick={() => goto('meetings', i.id)}>Open meeting & minutes</button></>}
          {(i.type === 'POST' || i.type === 'ANNOUNCEMENT' || i.type === 'COMPLETED') && <Reactions type={i.type === 'COMPLETED' ? 'TASK' : i.type} id={i.id} items={i.reactions ?? []} onChange={refresh} />}
          {i.type === 'POST' && <><button className="linklike" onClick={() => setOpen(open === i.id ? null : i.id)}>{i.comments ? `${i.comments} comment${i.comments > 1 ? 's' : ''}` : 'Comment'}</button>{open === i.id && <Comments postId={i.id} onChange={refresh} />}</>}
        </article>))}
    </section>
  );
}

function Comments({ postId, onChange }: { postId: string; onChange: () => void }) {
  const { me } = useApp(); const q = useQuery({ queryKey: ['post-comments', postId], queryFn: () => api<{ items: any[] }>(`/feed/posts/${postId}/comments`).then((r) => r.items) });
  const [t, setT] = useState('');
  const send = async () => { if (!t.trim()) return; try { await api(`/feed/posts/${postId}/comments`, { method: 'POST', body: { body: t.trim() } }); setT(''); q.refetch(); onChange(); } catch (e: any) { toast(e.message); } };
  return <div className="comments">
    {q.data?.map((c) => <div key={c.id} className="comment"><Avatar name={c.authorName} size={24} /><div><b>{c.authorName}</b> <small className="muted">{ago(c.createdAt)}</small><div>{c.body}</div></div></div>)}
    {!me.viewAs?.readOnly && <div className="composer-row"><input value={t} placeholder="Write a comment…" onChange={(e) => setT(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} /><button onClick={send} disabled={!t.trim()}>Send</button></div>}
  </div>;
}
