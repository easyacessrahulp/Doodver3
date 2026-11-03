import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, api, CHANNEL, fmtDate, goto, openTasks, PRIORITY_DOT, today } from './api';
import { Badge, Check, Empty, FormModal, toast, useApp, roleIn } from './ui';
import { useFocus } from './timer';
import { CallForm } from './pages-calls';
import { FollowupForm } from './pages-followups';
import { DiscussionForm } from './pages-discussions';
import { TaskForm } from './pages-tasks';

const TONE: Record<string, string> = { red: 'red', yellow: 'amber', amber: 'amber' };
export const Why = ({ reasons }: { reasons: { tone: string; text: string }[] }) => <div className="why">{reasons.map((r, i) => <span key={i} className={'why-chip ' + (TONE[r.tone] ?? '')}>{r.text}</span>)}</div>;

const CHIPS = [['all', 'All'], ['overdue', 'Overdue'], ['critical', 'Critical'], ['high', 'High priority'], ['dueToday', 'Due today'], ['upcoming', 'Upcoming'], ['waiting', '⏳ Waiting']] as const;
const VIEW_ALL: Record<string, Record<string, unknown>> = { all: { view: 'active' }, overdue: { view: 'overdue' }, critical: { view: 'critical' }, high: { view: 'high' }, dueToday: { view: 'today' }, upcoming: { view: 'active', sort: 'due' }, waiting: { view: 'waiting' } };

/** MY ATTENTION — the things that need action, compact and scrollable. Used on Home (40) and on its own page (200). */
export function AttentionList({ items, counts, tall }: { items: any[]; counts: Record<string, number>; tall?: boolean }) {
  const focus = useFocus(); const qc = useQueryClient(); const [chip, setChip] = useState<(typeof CHIPS)[number][0]>('all'); const [gone, setGone] = useState<Set<string>>(new Set());
  const shown = items.filter((x) => chip === 'all' || x.flags?.[chip]);
  const done = async (x: any) => {
    const note = prompt(`Complete “${x.title}”?\nOptional note:`); if (note === null) return;
    setGone((g) => new Set(g).add(x.id));
    try { await api(`/tasks/${x.id}/complete`, { method: 'POST', body: { note: note || null, today: today() } }); toast('Task completed.'); setTimeout(() => { qc.invalidateQueries(); setGone(new Set()); }, 380); }
    catch (e: any) { setGone((g) => { const n = new Set(g); n.delete(x.id); return n; }); alert(e.message); }
  };
  return (
    <>
      <div className="chips-bar">{CHIPS.map(([k, l]) => <button key={k} className={'chip-btn' + (chip === k ? ' on' : '')} onClick={() => setChip(k)}>{l}<em>{counts?.[k] ?? 0}</em></button>)}</div>
      <ul className={'rows scroll' + (tall ? ' tall' : '')}>
        {shown.map((x, i) => (
          <li key={x.id} className={'row-item tone-' + (x.tone || 'none') + (gone.has(x.id) ? ' leaving' : '')}>
            <Check title="Complete" onDone={() => done(x)} />
            <div className="row-main" onClick={() => goto('tasks', x.id)}>
              <b>{PRIORITY_DOT[x.priority]} {x.title}</b>
              <small className="muted">{x.company}{x.project ? ` › ${x.project}` : ''}{x.person ? ` · ${x.person}` : ''}{x.dueDate ? ` · due ${fmtDate(x.dueDate)}` : ''}</small>
              <Why reasons={x.reasons} />
            </div>
            <div className="row-actions-inline"><button className="small primary" id={i === 0 && !tall ? 'focus-top-btn' : undefined} onClick={() => focus.start({ taskId: x.id, title: x.title })}>▶ Focus</button><button className="small ghost" onClick={() => goto('tasks', x.id)}>Open</button></div>
          </li>))}
        {!shown.length && <li className="empty-li"><Empty>Nothing here — you’re on top of it. </Empty></li>}
      </ul>
      <button className="ghost small view-all" onClick={() => openTasks(VIEW_ALL[chip])}>View all {CHIPS.find((c) => c[0] === chip)![1].replace(/^\S+\s/, '')} tasks →</button>
    </>
  );
}

function Stat({ label, n, tone, onClick }: { label: string; n: number; tone: string; onClick: () => void }) {
  return <button className={'stat ' + tone + (n === 0 ? ' zero' : '')} onClick={onClick}><b key={n}>{n}</b><span>{label}</span></button>;
}
function SummaryCard({ icon, title, accent, stats, onTitle }: { icon: string; title: string; accent: string; stats: React.ReactNode; onTitle: () => void }) {
  return <div className={'sum-card ' + accent}><button className="sum-title" onClick={onTitle}><span>{icon}</span>{title}</button><div className="sum-stats">{stats}</div></div>;
}

export function Home() {
  const { me, companyId } = useApp(); const qc = useQueryClient(); const focus = useFocus();
  const [add, setAdd] = useState<'call' | 'followup' | 'discussion' | 'task' | null>(null);
  const dayStart = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); })();
  const q = useQuery({ queryKey: ['dashboard', companyId], refetchInterval: 120_000, queryFn: () => api<any>(`/dashboard?today=${today()}&dayStart=${encodeURIComponent(dayStart)}&dueDays=7${companyId ? `&companyId=${companyId}` : ''}`) });
  const agenda = useQuery({ queryKey: ['messages', companyId], queryFn: () => api<any>(`/messages?today=${today()}${companyId ? `&companyId=${companyId}` : ''}`) });
  const d = q.data; const a = d?.action; const hour = new Date().getHours(); const refresh = () => qc.invalidateQueries();
  const canAdd = me.user.isAdmin ? me.memberships.length > 0 : me.memberships.some((m) => roleIn(me, m.companyId) !== 'VIEWER');
  const goFu = (tab: string) => { sessionStorage.setItem('cc.fuTab', tab); goto('followups'); };
  const goCalls = (tab: string) => { sessionStorage.setItem('cc.callTab', tab); goto('calls'); };
  const todayItems = agenda.data?.days?.[0]?.items ?? [];
  return (
    <section>
      <div className="home-head">
        <div><h2>{hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'}, {me.user.name.split(' ')[0]}</h2><p className="muted">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · What needs doing now?</p></div>
        {canAdd && <div className="quick-actions">
          <button className="qa call" onClick={() => setAdd('call')}>＋ Call</button><button className="qa follow" onClick={() => setAdd('followup')}>＋ Follow-up</button>
          <button className="qa disc" onClick={() => setAdd('discussion')}>＋ Discussion</button><button className="qa task" id="new-task-btn" onClick={() => setAdd('task')}>＋ Task</button></div>}
      </div>

      {!d ? <p className="muted">Loading…</p> : <>
        <div className="sum-grid">
          <SummaryCard icon="" title="CALLS" accent="call" onTitle={() => goto('calls')} stats={<>
            <Stat label="Due today" n={a.calls.today} tone="amber" onClick={() => goCalls('pending')} /><Stat label="Overdue" n={a.calls.overdue} tone="red" onClick={() => goCalls('pending')} /><Stat label="Upcoming" n={a.calls.upcoming} tone="grey" onClick={() => goCalls('pending')} /></>} />
          <SummaryCard icon="" title="FOLLOW-UPS" accent="follow" onTitle={() => goFu('today')} stats={<>
            <Stat label="Due today" n={a.followups.today} tone="amber" onClick={() => goFu('today')} /><Stat label="Overdue" n={a.followups.overdue} tone="red" onClick={() => goFu('overdue')} /><Stat label="Upcoming" n={a.followups.upcoming} tone="grey" onClick={() => goFu('upcoming')} /></>} />
          <SummaryCard icon="" title="DISCUSSIONS" accent="disc" onTitle={() => goto('discussions')} stats={<>
            <Stat label="Pending" n={a.discussions.pending} tone="blue" onClick={() => goto('discussions')} /><Stat label="Due today" n={a.discussions.today} tone="amber" onClick={() => goto('discussions')} /></>} />
          <SummaryCard icon="" title="TASKS" accent="task" onTitle={() => openTasks({ view: 'active' })} stats={<>
            <Stat label="Overdue" n={a.tasks.overdue} tone="red" onClick={() => openTasks({ view: 'overdue' })} /><Stat label="Due today" n={a.tasks.dueToday} tone="amber" onClick={() => openTasks({ view: 'today' })} /><Stat label="High priority" n={a.tasks.highPriority} tone="blue" onClick={() => openTasks({ view: 'high' })} /></>} />
        </div>

        <div className="card pad panel attention-panel">
          <div className="panel-head"><h3>My Attention</h3>{d.briefing.recommended && <small className="muted">Start with: <b>{d.briefing.recommended.title}</b></small>}</div>
          <AttentionList items={d.attentionPool} counts={d.attentionCounts} />
        </div>

        <div className="three-col">
          <div className="card pad panel"><div className="panel-head"><h3>Calls</h3><button className="ghost small" onClick={() => goto('calls')}>View all</button></div>
            <ul className="mini-list">{a.calls.items.map((c: any) => (
              <li key={c.id} onClick={() => goto('tasks', c.taskId)}><b>{(CHANNEL[c.channel] ?? CHANNEL.CALL).icon} {c.who}</b><small className="muted">{c.note || c.taskTitle}</small>
                {c.dueDate ? <Badge tone={c.dueDate < today() ? 'red' : c.dueDate === today() ? 'amber' : 'grey'}>{fmtDate(c.dueDate)}</Badge> : <Badge tone="grey">no date</Badge>}</li>))}</ul>
            {!a.calls.items.length && <p className="muted">No calls to make.</p>}</div>
          <div className="card pad panel"><div className="panel-head"><h3>Follow-ups</h3><button className="ghost small" onClick={() => goFu('today')}>View all</button></div>
            <ul className="mini-list">{a.followups.items.map((f: any) => (
              <li key={f.id} onClick={() => goto('tasks', f.taskId)}><b>{f.who ? `Chase ${f.who}` : f.taskTitle}</b><small className="muted">{f.who ? f.taskTitle : f.notes || f.companyName}</small>
                <Badge tone={f.dueDate < today() ? 'red' : f.dueDate === today() ? 'amber' : 'grey'}>{fmtDate(f.dueDate)}</Badge></li>))}</ul>
            {!a.followups.items.length && <p className="muted">No follow-ups planned.</p>}</div>
          <div className="card pad panel"><div className="panel-head"><h3>Discussions</h3><button className="ghost small" onClick={() => goto('discussions')}>View all</button></div>
            <ul className="mini-list">{a.discussions.items.map((x: any) => (
              <li key={x.id} onClick={() => goto('discussions')}><b>{x.kind === 'MEETING' ? '' : ''} {x.topic}</b><small className="muted">with {x.who} · {x.taskTitle}</small>
                {x.dueDate ? <Badge tone={x.dueDate < today() ? 'red' : x.dueDate === today() ? 'amber' : 'grey'}>{fmtDate(x.dueDate)}</Badge> : null}</li>))}</ul>
            {!a.discussions.items.length && <p className="muted">Nothing to discuss.</p>}</div>
        </div>

        <div className="two-col">
          <div className="card pad panel"><div className="panel-head"><h3>Important tasks</h3><button className="ghost small" onClick={() => openTasks({ view: 'high' })}>View all</button></div>
            <ul className="mini-list">{d.doNow.slice(0, 6).map((x: any) => (
              <li key={x.id} onClick={() => goto('tasks', x.id)}><b>{PRIORITY_DOT[x.priority]} {x.title}</b><small className="muted">{x.company}{x.person ? ` · ${x.person}` : ''}</small>{x.dueDate && <Badge tone={x.dueDate < today() ? 'red' : x.dueDate === today() ? 'amber' : 'grey'}>{fmtDate(x.dueDate)}</Badge>}</li>))}</ul>
            {!d.doNow.length && <p className="muted">Nothing urgent on your own plate.</p>}</div>
          <div className="card pad panel"><div className="panel-head"><h3>Today’s activities</h3><button className="ghost small" onClick={() => goto('calendar')}>Agenda</button></div>
            <ul className="mini-list">{todayItems.slice(0, 7).map((x: any) => <li key={x.kind + x.id} onClick={() => goto('tasks', x.taskId)}><b>{x.kind === 'call' ? (CHANNEL[x.channel] ?? CHANNEL.CALL).icon : x.kind === 'discussion' ? '' : x.kind === 'followup' ? '' : x.kind === 'subtask' ? '↳' : x.kind === 'waiting' ? '⏳' : '✓'} {x.title}</b><small className="muted">{x.parentTitle ?? x.companyName}{x.time ? ` · ${x.time}` : ''}</small></li>)}</ul>
            {!todayItems.length && <p className="muted">Nothing scheduled for today.</p>}</div>
        </div>

        <details className="more-info"><summary>More: project health, completed today, daily briefing</summary>
          <div className="two-col" style={{ marginTop: '0.75rem' }}>
            <div className="card pad panel"><h3>Project health</h3><table className="mini"><thead><tr><th>Project</th><th>Open</th><th>Overdue</th><th>Progress</th></tr></thead><tbody>{d.projectHealth.slice(0, 8).map((p: any) => <tr key={p.projectId ?? 'none'}><td><b>{p.project}</b><br /><small className="muted">{p.company}</small></td><td>{p.open}</td><td className={p.overdue ? 'red-text' : ''}>{p.overdue}</td><td style={{ width: '5.625rem' }}><div className="progress"><i style={{ width: p.progress + '%' }} /></div></td></tr>)}</tbody></table></div>
            <div className="card pad panel"><h3>Completed today · {d.completedToday.length}</h3><ul className="mini-list">{d.completedToday.map((x: any) => <li key={x.id} onClick={() => goto('tasks', x.id)}><b>✓ {x.title}</b><small className="muted">{x.companyName}</small></li>)}</ul>{!d.completedToday.length && <p className="muted">Nothing yet today.</p>}
              <h3 style={{ marginTop: '0.875rem' }}>Daily briefing</h3>{d.briefing.lines.map((l: string) => <small className="muted block" key={l}>{l}</small>)}{d.focusSuggestion && <button className="primary" style={{ marginTop: '0.625rem' }} onClick={() => focus.start({ taskId: d.focusSuggestion.taskId, title: d.focusSuggestion.title })}>▶ Start {d.focusSuggestion.minutes}-min focus on “{d.focusSuggestion.title}”</button>}</div>
          </div>
        </details>
      </>}

      {add === 'call' && <CallForm onClose={() => setAdd(null)} onSaved={refresh} />}
      {add === 'followup' && <FollowupForm onClose={() => setAdd(null)} onSaved={refresh} />}
      {add === 'discussion' && <DiscussionForm onClose={() => setAdd(null)} onSaved={refresh} />}
      {add === 'task' && <TaskForm task={null} companyId={companyId} onClose={() => setAdd(null)} onSaved={() => { toast('Task created.'); refresh(); }} />}
    </section>
  );
}
void addDays; void FormModal;

export function AttentionPage() {
  const { companyId } = useApp();
  const q = useQuery({ queryKey: ['attention-page', companyId], queryFn: () => api<any>(`/attention?today=${today()}&limit=200${companyId ? `&companyId=${companyId}` : ''}`) });
  return (
    <section>
      <div className="page-head"><div><h2>My Attention</h2><p className="muted">Everything that needs you, ranked by urgency — each with the reason. Filter with the chips.</p></div></div>
      <div className="card pad panel">{q.data ? <AttentionList items={q.data.items} counts={q.data.counts} tall /> : <p className="muted">Loading…</p>}</div>
    </section>
  );
}
