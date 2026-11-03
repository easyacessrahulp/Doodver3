import { Fragment, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { addDays, api, CHANNEL, diffDays, fmtDate, goto, PRIORITY_DOT, STATUS_LABEL, today, ymd } from './api';
import { useMessages } from './hooks';
import { Badge, Empty, useApp } from './ui';
import { desktopNotify } from './timer';

const KIND = {
  task: { icon: '✓', label: 'Task due' }, subtask: { icon: '↳', label: 'Subtask due' }, call: { icon: '', label: 'Call' },
  followup: { icon: '↩', label: 'Follow up' }, waiting: { icon: '⏳', label: 'Waiting — expected' }, discussion: { icon: '', label: 'Discussion' },
} as Record<string, { icon: string; label: string }>;
const kindOf = (i: any) => i.kind === 'call' ? { icon: (CHANNEL[i.channel] ?? CHANNEL.CALL).icon, label: (CHANNEL[i.channel] ?? CHANNEL.CALL).label } : i.kind === 'discussion' ? (i.channel === 'MEETING' ? { icon: '', label: 'Meeting' } : KIND.discussion) : KIND[i.kind] ?? KIND.task;

// ───────────────────────── Message Center ─────────────────────────
function Item({ i }: { i: any }) {
  const k = kindOf(i);
  return (
    <li className={'msg ' + (i.priority === 1 ? 'crit' : '')} onClick={() => goto('tasks', i.taskId)}>
      <span className="msg-icon" title={k.label}>{k.icon}</span>
      <div className="msg-main">
        <b>{i.title}</b> {i.priority === 1 && <Badge tone="red">Critical</Badge>}
        <small className="muted">{k.label}{i.parentTitle ? ` · ${i.parentTitle}` : ''} · {i.companyName}{i.person && i.kind !== 'call' ? ` · ${i.person}` : ''}</small>
        {i.note && <small className="msg-note">{i.kind === 'waiting' ? `Waiting for ${i.note}` : i.note}</small>}
      </div>
      {i.time && <span className="muted msg-date">{i.time}</span>}
      {i.phone && <a href={`tel:${String(i.phone).replace(/\s/g, '')}`} onClick={(e) => e.stopPropagation()}>{i.phone}</a>}
      <span className="muted msg-date">{fmtDate(i.date)}</span>
    </li>
  );
}

export function Messages() {
  const { companyId } = useApp(); const q = useMessages(companyId); const m = q.data;
  const [perm, setPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'denied');
  const group = (title: string, tone: string, items: any[], hint?: string) => (
    <div className={'card pad msg-group ' + tone} key={title}>
      <h3>{title} <span className="muted">· {items.length}</span></h3>{hint && <small className="muted">{hint}</small>}
      {items.length ? <ul className="msgs">{items.map((i) => <Item key={i.kind + i.id + i.date} i={i} />)}</ul> : <p className="muted">Nothing here.</p>}
    </div>);
  return (
    <section>
      <div className="page-head"><div><h2>Message Center</h2><p className="muted">What needs your attention today, tomorrow and the day after — plus anything overdue.</p></div>
        {perm === 'default' && <button onClick={() => Notification.requestPermission().then((p) => { setPerm(p); if (p === 'granted') desktopNotify('Notifications on', 'You will get a daily reminder of critical tasks.'); })}>Turn on desktop alerts</button>}</div>
      {!m ? <p className="muted">Loading…</p> : <>
        {m.critical.length > 0 && <div className="card pad critical-banner"><h3>Critical — to finish today ({m.critical.length})</h3><ul className="msgs">{m.critical.map((i: any) => <Item key={i.id} i={i} />)}</ul></div>}
        {m.overdue.length > 0 && group('Overdue', 'overdue', m.overdue, 'Past their date and still open')}
        {group(`Today · ${fmtDate(m.days[0].date)}`, 'today', m.days[0].items)}
        {group(`Tomorrow · ${fmtDate(m.days[1].date)}`, 'tomorrow', m.days[1].items)}
        {group(`Day after tomorrow · ${fmtDate(m.days[2].date)}`, 'later', m.days[2].items)}
        {m.undatedCalls.length > 0 && group('Calls to make (no date set)', 'later', m.undatedCalls.map((c: any) => ({ ...c, kind: 'call', date: '', person: null })), 'Open Calls to set a day for them')}
      </>}
    </section>
  );
}

// ───────────────────────── Calendar ─────────────────────────
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function Calendar() {
  const { companyId } = useApp(); const [view, setView] = useState<'month' | 'agenda'>('month');
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [sel, setSel] = useState<string>(today());
  const [show, setShow] = useState<Record<string, boolean>>({ task: true, subtask: true, call: true, followup: true, waiting: true });
  const first = new Date(cursor); first.setDate(1 - first.getDay());               // Sunday on/before the 1st
  const from = ymd(first); const to = addDays(from, 41);
  const q = useQuery({ queryKey: ['calendar', from, companyId], queryFn: () => api<{ items: any[] }>(`/calendar?from=${from}&to=${to}${companyId ? `&companyId=${companyId}` : ''}`).then((r) => r.items) });
  const items = (q.data ?? []).filter((i) => show[i.kind]);
  const byDay = new Map<string, any[]>(); for (const i of items) byDay.set(i.date, [...(byDay.get(i.date) ?? []), i]);
  const cells = Array.from({ length: 42 }, (_, n) => addDays(from, n));
  const t = today(); const month = cursor.getMonth();
  const move = (n: number) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + n, 1));
  if (view === 'agenda') return <section><div className="tabs"><button onClick={() => setView('month')}>Month</button><button className="on">Agenda — today, tomorrow &amp; day after</button></div><div style={{ marginTop: '0.75rem' }}><Messages /></div></section>;
  return (
    <section>
      <div className="page-head"><div><h2>Calendar</h2><p className="muted">Pending tasks, subtasks, calls, follow-ups and discussions by date. Completed items disappear.</p></div></div>
      <div className="tabs"><button className="on">Month</button><button onClick={() => setView('agenda')}>Agenda — today, tomorrow &amp; day after</button></div>
      <div className="toolbar cal-bar" style={{ marginTop: '0.625rem' }}>
        <button onClick={() => move(-1)} aria-label="Previous month">‹</button>
        <b className="cal-title">{cursor.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</b>
        <button onClick={() => move(1)} aria-label="Next month">›</button>
        <button className="ghost" onClick={() => { const d = new Date(); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)); setSel(today()); }}>Today</button>
        <span className="spacer" />
        {Object.entries(KIND).map(([k, v]) => <label key={k} className="toggle"><input type="checkbox" checked={show[k]} onChange={(e) => setShow({ ...show, [k]: e.target.checked })} />{v.icon} {v.label.split(' ')[0]}</label>)}
      </div>
      <div className="cal-layout">
        <div className="card cal">
          {DOW.map((d) => <div key={d} className="cal-dow">{d}</div>)}
          {cells.map((d) => { const list = byDay.get(d) ?? []; const overdue = d < t;
            return (
              <button key={d} className={'cal-cell' + (d === t ? ' today' : '') + (d === sel ? ' sel' : '') + (new Date(d + 'T00:00:00').getMonth() !== month ? ' dim' : '')} onClick={() => setSel(d)}>
                <span className="cal-num">{Number(d.slice(8))}</span>
                {list.slice(0, 3).map((i) => <span key={i.kind + i.id + d} className={'chip p' + i.priority + (overdue ? ' late' : '')} title={i.title}>{kindOf(i).icon} {i.title}</span>)}
                {list.length > 3 && <span className="more-chip">+{list.length - 3} more</span>}
              </button>); })}
        </div>
        <div className="card pad cal-side">
          <h3>{fmtDate(sel)}</h3>
          {(byDay.get(sel) ?? []).length ? <ul className="msgs">{(byDay.get(sel) ?? []).map((i) => <Item key={i.kind + i.id} i={i} />)}</ul> : <p className="muted">Nothing pending on this day.</p>}
          {q.isLoading && <p className="muted">Loading…</p>}
        </div>
      </div>
    </section>
  );
}

// ───────────────────────── Performance ─────────────────────────
const COLS: { key: string; label: string; tip: string; fmt?: (v: any) => any }[] = [
  { key: 'assigned', label: 'Assigned', tip: 'Tasks delegated to this person' }, { key: 'completed', label: 'Done', tip: 'Completed tasks' },
  { key: 'onTime', label: 'On time', tip: 'Completed on or before the due date (or no due date)' }, { key: 'late', label: 'Late', tip: 'Completed after the due date' },
  { key: 'avgDelayDays', label: 'Avg delay', tip: 'Average days late, among late tasks', fmt: (v) => (v ? `${v} d` : '—') }, { key: 'maxDelayDays', label: 'Worst delay', tip: 'Longest delay on a finished task', fmt: (v) => (v ? `${v} d` : '—') },
  { key: 'open', label: 'Open', tip: 'Not finished yet' }, { key: 'overdueOpen', label: 'Overdue now', tip: 'Open tasks already past their due date' },
  { key: 'openOverdueDays', label: 'Days overdue', tip: 'Total days overdue across open tasks' }, { key: 'postponements', label: 'Postponed', tip: 'Times due dates were pushed later' },
  { key: 'avgTurnaroundDays', label: 'Avg turnaround', tip: 'Average days from assigning to completion', fmt: (v) => (v === null ? '—' : `${v} d`) },
  { key: 'subAssigned', label: 'Subtasks given', tip: 'Subtasks assigned to this person (even under someone else’s task)' }, { key: 'subDone', label: 'Sub done', tip: 'Subtasks completed' },
  { key: 'subLate', label: 'Sub late', tip: 'Subtasks completed after their due date' }, { key: 'subOverdueNow', label: 'Sub overdue', tip: 'Open subtasks past their due date' },
  { key: 'onTimeRate', label: 'On-time %', tip: 'Share of completed tasks finished on time', fmt: (v) => (v === null ? '—' : `${v}%`) },
];

function PersonTasks({ id, companyId }: { id: string; companyId: string }) {
  const q = useQuery({ queryKey: ['person-tasks', id, companyId], queryFn: () => api<{ items: any[] }>(`/tasks?personId=${id}&completed=all&sort=due&limit=100${companyId ? `&companyId=${companyId}` : ''}`).then((r) => r.items) });
  const w = useQuery({ queryKey: ['workload', id], queryFn: () => api<any>(`/people/${id}/workload`) });
  const t = today();
  return (
    <div className="person-tasks">
      {w.data?.subtasks.length > 0 && <><h5>Subtasks assigned to them · {w.data.subtasks.length}</h5>{w.data.subtasks.map((x: any) => (
        <div key={x.id} className="pt-row" onClick={() => goto('tasks', x.taskId)}><span>{PRIORITY_DOT[x.priority]}</span><b>{x.title}</b><small className="muted">in {x.taskTitle}</small><span className={x.dueDate && x.dueDate < t ? 'red-text' : 'muted'}>due {fmtDate(x.dueDate)}</span></div>))}</>}
      {(w.data?.discussions.length > 0 || w.data?.communications.length > 0) && <p className="muted fine">Also pending with them: {w.data.discussions.length} discussion(s) · {w.data.communications.length} call/mail(s) — <a href="#discussions">open Discussions</a></p>}
      <h5>Tasks delegated to them</h5>
      {q.data?.map((x) => {
        const done = x.status === 'DONE'; const late = done && x.dueDate && x.completedAt ? diffDays(x.dueDate, x.completedAt.slice(0, 10)) : 0;
        const over = !done && x.dueDate && x.dueDate < t ? diffDays(x.dueDate, t) : 0;
        return (
          <div key={x.id} className="pt-row" onClick={() => goto('tasks', x.id)}>
            <span>{PRIORITY_DOT[x.priority]}</span><b>{x.title}</b><small className="muted">{x.companyName}</small>
            <Badge tone={done ? 'green' : 'blue'}>{STATUS_LABEL[x.status]}</Badge>
            <span className="muted">due {fmtDate(x.dueDate)}</span>
            {late > 0 && <Badge tone="red">{late} d late</Badge>}{over > 0 && <Badge tone="red">{over} d overdue</Badge>}{done && late <= 0 && x.dueDate && <Badge tone="green">on time</Badge>}
          </div>); })}
      {q.data && !q.data.length && <p className="muted">No tasks.</p>}
    </div>
  );
}

export function Performance({ embedded }: { embedded?: boolean } = {}) {
  const { companyId } = useApp();
  const [days, setDays] = useState(0); const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: 'name', dir: 1 }); const [open, setOpen] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['performance', companyId, days], queryFn: () => api<{ items: any[] }>(`/people/performance?days=${days}&today=${today()}${companyId ? `&companyId=${companyId}` : ''}`).then((r) => r.items) });
  const rows = [...(q.data ?? [])].sort((a, b) => { const x = a[sort.key], y = b[sort.key]; return (typeof x === 'string' ? x.localeCompare(y) : (x ?? -1) - (y ?? -1)) * sort.dir; });
  const th = (key: string, label: string, tip?: string) => <th key={key} title={tip} className="sortable" onClick={() => setSort({ key, dir: sort.key === key ? (-sort.dir as 1 | -1) : key === 'name' ? 1 : -1 })}>{label}{sort.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}</th>;
  return (
    <section>
      {!embedded && <div className="page-head"><div><h2>Performance</h2><p className="muted">How the people you delegate to are doing — based on the tasks you assigned them. Click a column to sort, a row to see their tasks.</p></div></div>}
      <div className="toolbar"><label className="inline-label">Period <select value={days} onChange={(e) => setDays(Number(e.target.value))}><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option><option value={365}>Last 12 months</option><option value={0}>All time</option></select></label></div>
      <div className="card table-wrap">
        <table className="perf">
          <thead><tr>{th('name', 'Person')}{COLS.map((c) => th(c.key, c.label, c.tip))}</tr></thead>
          <tbody>{rows.map((r) => (<Fragment key={r.personId}>
            <tr className={'clickable' + (open === r.personId ? ' selected' : '')} onClick={() => setOpen(open === r.personId ? null : r.personId)}>
              <td><b>{r.name}</b><br /><small className="muted">{[r.designation, r.company].filter(Boolean).join(' · ')}</small></td>
              {COLS.map((c) => { const v = r[c.key]; const bad = (c.key === 'late' || c.key === 'overdueOpen' || c.key === 'subLate' || c.key === 'subOverdueNow') && v > 0; return <td key={c.key} className={bad ? 'red-text' : ''}>{c.fmt ? c.fmt(v) : v}</td>; })}
            </tr>
            {open === r.personId && <tr className="detail-row"><td colSpan={COLS.length + 1}><PersonTasks id={r.personId} companyId={companyId} /></td></tr>}
          </Fragment>))}</tbody>
        </table>
        {q.data && !q.data.length && <Empty>Nobody has been delegated a task yet. Assign a task to a person (Tasks → Edit → Delegated to) and their record will appear here.</Empty>}
      </div>
      <p className="muted fine">Delay is counted in whole days between the due date and the day the task was marked complete. Tasks without a due date count as on time.</p>
    </section>
  );
}
