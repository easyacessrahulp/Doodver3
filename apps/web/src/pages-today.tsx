import { QuickNoteCard } from './pages-notebook';
import Doodu, { DOODU_LINES } from './components/Doodu';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, diffDays, fmtDate, goto, openTasks, today } from './api';
import { Empty, FormModal, toast, useApp, roleIn } from './ui';
import { useFocus } from './timer';
import { Ic, companyColor, CoDot } from './icons';
import { initials } from './pages-team';
import { useTaskActions } from './task-actions';
import { openFollowUp, openLetter, openQuickAdd } from './bus';
import { EmailWindow } from './pages-ai';
import { healthSnapshot } from './pages-v5';
import { TodayV8Cards } from './pages-v8';
import { useAiStatus } from './pages-ai';

export const weekday = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
/** Red = overdue, amber = due today, grey = later. */
export function dueChip(due?: string | null, done?: boolean): { cls: string; text: string } | null {
  if (!due) return null; if (done) return { cls: 'green', text: 'Done' };
  const n = diffDays(due, today());
  if (n > 0) return { cls: 'red', text: `Overdue ${n} day${n === 1 ? '' : 's'}` };
  if (n === 0) return { cls: 'amber', text: 'Today' };
  return { cls: '', text: weekday(due) };
}
export const Chip = ({ due, done }: { due?: string | null; done?: boolean }) => { const c = dueChip(due, done); return c ? <span className={'chip ' + c.cls}>{c.text}</span> : null; };

/** A slim task row: company dot, title, project, subtask progress, person, due chip, Focus, and the ⋯ menu. Actions appear on hover. */
export function TaskRow({ x, acts, onOpen }: { x: any; acts: ReturnType<typeof useTaskActions>['act']; onOpen?: () => void }) {
  const { me } = useApp(); const focus = useFocus(); const [menu, setMenu] = useState(false); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!menu) return; const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setMenu(false); }; addEventListener('mousedown', h); return () => removeEventListener('mousedown', h); }, [menu]);
  const co = me.memberships.find((m) => m.companyId === x.companyId); const color = companyColor({ color: co?.color, companyId: x.companyId, companyName: x.company ?? x.companyName });
  const who = x.person ?? x.delegatedToName; const canWrite = x.companyId ? roleIn(me, x.companyId) !== 'VIEWER' : true;
  const total = x.subTotal ?? 0; const dn = x.subDone ?? 0;
  const t = { id: x.id, title: x.title, companyId: x.companyId };
  return (
    <div className="trow" style={{ ['--rc' as any]: color }} onClick={onOpen ?? (() => goto('tasks', x.id))} role="listitem">
      <CoDot color={color} />
      <div className="tmain"><div className="ttitle">{x.title}{x.isPrivate && <Ic n="lock" s={12} className="muted" title="Private · no AI" />}</div><div className="tsub">{[x.company ?? x.companyName, x.project ?? x.projectName].filter(Boolean).join(' · ')}</div></div>
      <div className="tmeta" onClick={(e) => e.stopPropagation()}>
        {total > 0 && <span className="subprog hide-hover" title={`${dn} of ${total} subtasks done`}>{dn} of {total}<i><b style={{ width: `${Math.round((dn / total) * 100)}%` }} /></i></span>}
        {who && <span className="ini hide-hover" title={who}>{initials(who)}</span>}
        <span className="hide-hover"><Chip due={x.dueDate} done={x.status === 'DONE'} /></span>
        {canWrite && x.status !== 'DONE' && <span className="hover-actions">
          <button className="ibtn" title="Follow up" aria-label="Follow up" onClick={() => acts('followup', t)}><Ic n="message" /></button>
          <button className="ibtn" title="Delegate" aria-label="Delegate" onClick={() => acts('delegate', t)}><Ic n="user" /></button>
          <button className="ibtn" title="Reschedule" aria-label="Reschedule" onClick={() => acts('reschedule', t)}><Ic n="calendar" /></button>
          <button className="ibtn" title="Complete" aria-label="Complete" onClick={() => acts('complete', t)}><Ic n="check" /></button></span>}
        {canWrite && x.status !== 'DONE' && <button className="small" onClick={() => focus.start({ taskId: x.id, title: x.title })}><Ic n="play" s={12} />Focus</button>}
        <div className="menu-wrap" ref={ref}><button className="ibtn" aria-label="More" title="More" onClick={() => setMenu(!menu)}><Ic n="more" /></button>
          {menu && <div className="menu-pop card right" onClick={() => setMenu(false)}>
            <button onClick={() => goto('tasks', x.id)}><Ic n="right" />Open task</button>
            {canWrite && <><button onClick={() => acts('followup', t)}><Ic n="message" />Follow up</button><button onClick={() => acts('delegate', t)}><Ic n="user" />Delegate</button><button onClick={() => acts('reschedule', t)}><Ic n="calendar" />Reschedule</button>
              <button onClick={() => acts('email', t)}><Ic n="mail" />Write email</button><button onClick={() => acts('complete', t)}><Ic n="check" />Complete</button></>}</div>}</div>
      </div>
    </div>
  );
}

const CHIPS = [['all', 'All'], ['overdue', 'Overdue'], ['critical', 'Critical'], ['high', 'High priority'], ['dueToday', 'Due today'], ['upcoming', 'Upcoming'], ['waiting', 'Waiting']] as const;
const VIEW_ALL: Record<string, Record<string, unknown>> = { all: { view: 'active' }, overdue: { view: 'overdue' }, critical: { view: 'critical' }, high: { view: 'high' }, dueToday: { view: 'today' }, upcoming: { view: 'active', sort: 'due' }, waiting: { view: 'waiting' } };

/** My Attention as slim rows (used on Today and on its own page). */
export function AttentionRows({ items, counts, acts, limit }: { items: any[]; counts?: Record<string, number>; acts: ReturnType<typeof useTaskActions>['act']; limit?: number }) {
  const [chip, setChip] = useState<(typeof CHIPS)[number][0]>('all');
  const shown = items.filter((x) => chip === 'all' || x.flags?.[chip]).slice(0, limit ?? 200);
  return <>
    <div className="seg2" style={{ padding: '0 1.2rem 0.6rem', flexWrap: 'wrap' }}>{CHIPS.map(([k, l]) => <button key={k} className={chip === k ? 'on' : ''} onClick={() => setChip(k)}>{l}{counts?.[k] ? <span className="muted"> {counts[k]}</span> : null}</button>)}</div>
    <div role="list">{shown.map((x) => <TaskRow key={x.id} x={x} acts={acts} />)}</div>
    {!shown.length && <div className="empty2"><Ic n="checkcircle" s={22} />Nothing here. You are on top of it.</div>}
    {!!shown.length && items.length > shown.length && <div className="add-row"><button onClick={() => openTasks(VIEW_ALL[chip])}>View all {CHIPS.find((c) => c[0] === chip)![1].toLowerCase()} tasks</button></div>}
  </>;
}

const BKEY = 'cc.briefing3';
function Briefing({ companyId }: { companyId: string }) {
  const ai = useAiStatus(); const [gone, setGone] = useState(() => { try { return localStorage.getItem('cc.briefDismiss') === today(); } catch { return false; } });
  const [b, setB] = useState<any>(() => { try { const c = JSON.parse(localStorage.getItem(BKEY) ?? 'null'); return c && c.key === companyId + today() ? c : null; } catch { return null; } });
  const [open, setOpen] = useState(false); const [mail, setMail] = useState(false); const [busy, setBusy] = useState(false);
  const load = async () => {
    setBusy(true);
    try { const r = await api<any>('/ai/briefing', { method: 'POST', body: { today: today(), companyId: companyId || undefined } }); const c = { key: companyId + today(), at: Date.now(), ...r }; setB(c); try { localStorage.setItem(BKEY, JSON.stringify(c)); } catch { /* ok */ } }
    catch { /* offline: no card */ } finally { setBusy(false); }
  };
  useEffect(() => { if (gone || !ai.data) return; if (!b || Date.now() - b.at > 3 * 3600_000) load(); }, [ai.data?.enabled, companyId, gone]);
  if (gone || !b) return null;
  const hm = (t: number) => new Date(t).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  return (
    <section className="brief-card" aria-label="Briefing">
      <span className="brief-ic"><Ic n="sparkles" s={18} /></span>
      <div className="grow"><div className="meta">{b.aiUsed ? 'AI briefing' : 'Daily briefing'} · updated {hm(b.at)}{b.aiUsed ? ` · next at ${hm(b.at + 3 * 3600_000)}` : ''}</div>
        <p>{b.message}</p>
        {open && b.items?.length > 0 && <ul style={{ margin: '0 0 0.7rem', paddingLeft: '1.1rem', display: 'grid', gap: 2 }}>{b.items.slice(0, 12).map((i: any, n: number) => <li key={n} className={i.overdue ? 'red-text' : ''}>{i.title} <small className="muted">· {i.company}</small></li>)}</ul>}
        {b.notice && <small className="muted">{b.notice}</small>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button className="small" onClick={() => setOpen(!open)}>{open ? 'Hide full briefing' : 'Read full briefing'}</button><button className="small" onClick={() => setMail(true)}>Draft an email</button><button className="small ghost" disabled={busy} onClick={load}><Ic n="refresh" s={13} />Refresh</button></div></div>
      <button className="ibtn" aria-label="Dismiss briefing" onClick={() => { try { localStorage.setItem('cc.briefDismiss', today()); } catch { /* ok */ } setGone(true); }}><Ic n="x" /></button>
      {mail && <EmailWindow onClose={() => setMail(false)} />}
    </section>
  );
}

function useHealth() { const [h, setH] = useState(healthSnapshot()); useEffect(() => { const u = () => setH(healthSnapshot()); addEventListener('cc-health', u); const t = setInterval(u, 30_000); return () => { removeEventListener('cc-health', u); clearInterval(t); }; }, []); return h; }

export function Today() {
  const { me, companyId } = useApp(); const qc = useQueryClient(); const health = useHealth();
  const dayStart = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); })();
  const q = useQuery({ queryKey: ['dashboard', companyId], refetchInterval: 120_000, queryFn: () => api<any>(`/dashboard?today=${today()}&dayStart=${encodeURIComponent(dayStart)}&dueDays=7${companyId ? `&companyId=${companyId}` : ''}`) });
  const meet = useQuery({ queryKey: ['meetings'], refetchInterval: 60_000, queryFn: () => api<{ items: any[] }>('/meetings').then((r) => r.items) });
  const ann = useQuery({ queryKey: ['announcements'], refetchInterval: 60_000, queryFn: () => api<any>('/announcements') });
  const refresh = () => qc.invalidateQueries(); const { act, node } = useTaskActions(refresh);
  const d = q.data; const a = d?.action; const hour = new Date().getHours();
  const [callDone, setCallDone] = useState<any>(null); const [mail, setMail] = useState<any>(null);
  const canAdd = me.user.isAdmin ? me.memberships.length > 0 : me.memberships.some((m) => roleIn(me, m.companyId) !== 'VIEWER');
  const nowIso = new Date().toISOString();
  const upcoming = (meet.data ?? []).filter((m) => m.status !== 'ENDED' && m.status !== 'CANCELLED' && m.startAt >= new Date(Date.now() - 3600_000).toISOString()).sort((x, y) => x.startAt.localeCompare(y.startAt)).slice(0, 3);
  const notes = (ann.data?.items ?? []).slice(0, 3);
  const overdue = (d?.counters?.tasks?.overdue ?? a?.tasks.overdue ?? 0); const dueToday = a?.tasks.dueToday ?? 0;
  void nowIso;
  return (
    <section>
      <div className="today-head">
        <div className="doodu-hello"><Doodu pose="hello" size={104} /><div className="doodu-bubble">{DOODU_LINES.hello}</div></div>
        <div><h1>{hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'}, {me.user.name.split(' ')[0]}</h1>
          <p>{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}{a ? ` · ${dueToday} due today · ${overdue} overdue` : ''}</p></div>
        {health.on && <div className="health"><span><Ic n="droplet" s={14} />Water {health.water} of 8</span><span><Ic n="walk" s={14} />Walk due {new Date(health.walkAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</span><span><Ic n="coffee" s={14} />Break in {health.breakInMin} min</span></div>}
      </div>
      <Briefing companyId={companyId} />
      {d && <div className="tiles" role="list" aria-label="Today in numbers">
        <button className="tile red" role="listitem" onClick={() => openTasks({ view: 'overdue' })}><small>Overdue</small><b>{overdue}</b></button>
        <button className="tile amber" role="listitem" onClick={() => openTasks({ view: 'today' })}><small>Due today</small><b>{dueToday}</b></button>
        <button className="tile blue" role="listitem" onClick={() => { sessionStorage.setItem('cc.fuTab', 'today'); goto('followups'); }}><small>Follow-ups due</small><b>{a?.followups.items.length ?? 0}</b></button>
        <button className="tile violet" role="listitem" onClick={() => goto('calls')}><small>Calls to make</small><b>{a?.calls.items.length ?? 0}</b></button>
        <button className="tile green" role="listitem" onClick={() => goto('reports')}><small>Done today</small><b>{d.completedToday?.length ?? 0}</b></button>
      </div>}
      <QuickNoteCard />
      {!d ? <p className="muted">Loading…</p> : (
        <div className="today-grid">
          <section className="panel2 today-main" aria-label="My Attention">
            <header><h2>My Attention <span>· {d.attentionCounts?.all ?? d.attentionPool.length}</span></h2><div className="seg2"><button className="on">List</button><button onClick={() => goto('kanban')}>Board</button></div></header>
            <AttentionRows items={d.attentionPool} counts={d.attentionCounts} acts={act} limit={12} />
            {canAdd && <div className="add-row"><Ic n="plus" s={14} /><button id="new-task-btn" onClick={() => openQuickAdd()}>Add a task</button><span>or press N</span><span style={{ flex: 1 }} /><button onClick={() => openLetter()}><Ic n="upload" s={13} />Read a letter</button></div>}
          </section>
          <aside className="today-side">
            <TodayV8Cards />
            <section className="panel2"><header><h2>Follow-ups due <span>· {a.followups.items.length}</span></h2><button className="small ghost" onClick={() => { sessionStorage.setItem('cc.fuTab', 'today'); goto('followups'); }}>All</button></header>
              {a.followups.items.map((f: any) => { const od = f.dueDate < today(); return (
                <div className="side-row" key={f.id}><span className="ini">{initials(f.who ?? '?')}</span><div className="tmain"><b>{f.notes || f.taskTitle}</b><span className="tsub" style={{ color: od ? 'var(--red)' : f.dueDate === today() ? 'var(--amber)' : undefined }}>{f.who ? `${f.who} · ` : ''}{od ? 'overdue' : f.dueDate === today() ? 'due today' : `due ${weekday(f.dueDate)}`}</span></div>
                  <button className="small" onClick={() => openFollowUp({ taskId: f.taskId, subtaskId: f.subtaskId, personId: f.personId, followupId: f.id, title: f.taskTitle })}>Follow up</button></div>); })}
              {!a.followups.items.length && <div className="empty2"><Ic n="checkcircle" s={20} />No follow-ups waiting.</div>}</section>
            <section className="panel2"><header><h2>Calls to make <span>· {a.calls.items.length}</span></h2><button className="small ghost" onClick={() => goto('calls')}>All</button></header>
              {a.calls.items.map((c: any) => (
                <div className="side-row" key={c.id}><Ic n={c.channel === 'EMAIL' ? 'mail' : c.channel === 'WHATSAPP' ? 'whatsapp' : 'phone'} s={16} className="muted" /><div className="tmain"><b>{c.who}</b><span className="tsub">{c.note || c.taskTitle}{c.dueDate && c.dueDate < today() ? ' · overdue' : ''}</span></div>
                  <button className="small" onClick={() => setMail(c)}>Write email</button><button className="small" onClick={() => setCallDone(c)}>Done</button></div>))}
              {!a.calls.items.length && <div className="empty2"><Ic n="phone" s={20} />No calls to make.</div>}</section>
            <section className="panel2"><header><h2>Meetings &amp; announcements</h2><button className="small ghost" onClick={() => goto('meetings')}>All</button></header>
              {upcoming.map((m) => <div className="side-row" key={m.id}><Ic n="video" s={16} className="muted" /><div className="tmain"><b>{m.title}</b><span className="tsub">{new Date(m.startAt).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} · {m.people} people</span></div><button className="small" onClick={() => goto('meetings', m.id)}>Join</button></div>)}
              {notes.map((n: any) => <div className="side-row" key={n.id}><Ic n="megaphone" s={16} className="muted" /><div className="tmain"><b>{n.title}</b><span className="tsub">{n.createdById === me.user.id ? 'Announcement from you' : `From ${n.authorName ?? 'the team'}`}{n.createdById === me.user.id && n.seenCount != null ? ` · seen by ${n.seenCount}` : ''}</span></div></div>)}
              {!upcoming.length && !notes.length && <div className="empty2"><Ic n="calendar" s={20} />Nothing scheduled.</div>}</section>
          </aside>
        </div>)}
      {node}
      {mail && <EmailWindow link={{ type: 'TASK', id: mail.taskId, title: mail.taskTitle, companyId: mail.companyId }} preset={{ recipient: mail.who }} onClose={() => setMail(null)} />}
      {callDone && <FormModal title={`${callDone.who} — mark done`} submitLabel="Mark done" initial={{ result: '' }} fields={[{ key: 'result', label: 'What happened? (added to the task notes)', type: 'textarea', required: true }]} onClose={() => setCallDone(null)}
        onSubmit={async (v) => { await api(`/calls/${callDone.id}`, { method: 'PATCH', body: { expectedUpdatedAt: callDone.updatedAt, done: true, result: v.result } }); setCallDone(null); toast('Done.'); refresh(); }} />}
    </section>
  );
}
void Empty; void fmtDate;
