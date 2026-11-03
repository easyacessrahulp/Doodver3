import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, downloadFile, fmtDate, fmtMinutes, goto, PRIORITY_DOT, STATUS_LABEL, today } from './api';
import { Badge, Empty, toast, useApp } from './ui';

const List = ({ items, empty }: { items: any[]; empty: string }) => items.length ? <ul className="msgs">{items.map((x) => (
  <li className="msg" key={x.id} onClick={() => goto('tasks', x.id)}><div className="msg-main"><b>{PRIORITY_DOT[x.priority]} {x.title}</b><small className="muted">{x.company ?? x.companyName}{x.person ? ` · ${x.person}` : ''}{x.dueDate ? ` · due ${fmtDate(x.dueDate)}` : ''}</small>{x.reasons?.length > 0 && <small className="msg-note">{x.reasons.join(' · ')}</small>}</div></li>))}</ul> : <p className="muted">{empty}</p>;

export function Review({ embedded }: { embedded?: boolean } = {}) {
  const { companyId } = useApp(); const [tab, setTab] = useState<'daily' | 'weekly' | 'table'>('daily');
  const dayStart = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); })();
  const wk = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - 6); return d.toISOString(); })();
  const c = companyId ? `&companyId=${companyId}` : '';
  const daily = useQuery({ queryKey: ['rev-daily', companyId], enabled: tab === 'daily', queryFn: () => api<any>(`/reviews/daily?today=${today()}&dayStart=${encodeURIComponent(dayStart)}${c}`) });
  const weekly = useQuery({ queryKey: ['rev-weekly', companyId], enabled: tab === 'weekly', queryFn: () => api<any>(`/reviews/weekly?today=${today()}&weekStart=${encodeURIComponent(wk)}&tzOffsetMinutes=${new Date().getTimezoneOffset()}${c}`) });
  const table = useQuery({ queryKey: ['rev-table', companyId], enabled: tab === 'table', queryFn: () => api<any>(`/reviews/management?today=${today()}${c}`) });
  const d = daily.data, w = weekly.data, m = table.data;
  const maxMin = w ? Math.max(1, ...Object.values<number>(w.focusByDay)) : 1;
  return (
    <section>
      {!embedded && <div className="page-head"><div><h2>Review</h2><p className="muted">Close the day, plan the week, and see everything open in one table.</p></div></div>}
      <div className="tabs"><button className={tab === 'daily' ? 'on' : ''} onClick={() => setTab('daily')}>End of day</button><button className={tab === 'weekly' ? 'on' : ''} onClick={() => setTab('weekly')}>Weekly</button><button className={tab === 'table' ? 'on' : ''} onClick={() => setTab('table')}>Review table</button></div>
      {tab === 'daily' && d && <div className="two-col" style={{ marginTop: '0.875rem' }}>
        <div className="col">
          <div className="card pad"><h3>Done today · {d.completed.length}</h3><List items={d.completed.map((x: any) => ({ ...x, reasons: x.completionNote ? [x.completionNote] : [] }))} empty="Nothing completed today." /></div>
          <div className="card pad"><h3>Focus today</h3><p><b>{fmtMinutes(d.focus.minutes)}</b> in {d.focus.sessions} session{d.focus.sessions === 1 ? '' : 's'} · {d.notesAdded} note{d.notesAdded === 1 ? '' : 's'} added</p></div>
          <div className="card pad"><h3>Still due today · {d.stillDueToday.length}</h3><List items={d.stillDueToday} empty="All done for today ✓" /></div>
        </div>
        <div className="col">
          <div className="card pad"><h3>Overdue · {d.overdue.length}</h3><List items={d.overdue} empty="Nothing overdue." /></div>
          <div className="card pad"><h3>Tomorrow · {d.tomorrow.length}</h3><List items={d.tomorrow} empty="Nothing due tomorrow." /></div>
          {d.suggestedFirstFocus && <div className="card pad"><h3>Start tomorrow with</h3><p><b>{d.suggestedFirstFocus.title}</b><br /><small className="muted">{d.suggestedFirstFocus.reasons.join(' · ')}</small></p></div>}
        </div>
      </div>}
      {tab === 'weekly' && w && <div style={{ marginTop: '0.875rem' }}>
        <div className="counters"><div className="counter green"><b>{w.completedCount}</b><span>Completed (7 days)</span></div><div className="counter blue"><b>{w.created}</b><span>Created</span></div><div className="counter amber"><b>{w.postponed}</b><span>Postponed</span></div><div className="counter grey"><b>{fmtMinutes(w.focusMinutes)}</b><span>Focused</span></div></div>
        <div className="two-col">
          <div className="col"><div className="card pad"><h3>Focus by day</h3><div className="bars">{Array.from({ length: 7 }, (_, i) => { const dt = new Date(); dt.setDate(dt.getDate() - 6 + i); const k = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0'); const v = w.focusByDay[k] ?? 0;
            return <div key={k} className="bar"><i style={{ height: `${(Math.round((v / maxMin) * 90) + 4) / 16}rem` }} title={fmtMinutes(v)} /><small>{dt.toLocaleDateString('en-IN', { weekday: 'short' })}</small></div>; })}</div></div>
            <div className="card pad"><h3>Where you finished things</h3>{w.topProjects.length ? w.topProjects.map((p: any) => <div className="line" key={p.project}><span>{p.project}</span><b>{p.completed}</b></div>) : <p className="muted">Nothing completed this week.</p>}</div></div>
          <div className="col"><div className="card pad"><h3>Overdue now · {w.overdueNow.length}</h3><List items={w.overdueNow} empty="Nothing overdue " /></div>
            <div className="card pad"><h3>Delegated, no update · {w.delegatedNoUpdate.length}</h3><List items={w.delegatedNoUpdate} empty="Everyone is reporting back." /></div>
            <div className="card pad"><h3>At risk · {w.atRisk.length}</h3><List items={w.atRisk} empty="Nothing at risk." /></div></div>
        </div></div>}
      {tab === 'table' && m && <div style={{ marginTop: '0.875rem' }}>
        <div className="toolbar"><span className="muted">{m.totals.tasks} open · {m.totals.overdue} overdue · {m.totals.delegated} delegated · {m.totals.waiting} waiting · avg progress {m.totals.avgProgress}%</span><span className="spacer" />
          <button className="ghost" onClick={() => downloadFile(`/export/xlsx?dataset=tasks&scope=active&today=${today()}${c}`, 'tasks.xlsx').catch((e) => toast(e.message))}>⬇ Excel</button></div>
        <div className="card table-wrap"><table className="mini review-table"><thead><tr><th>Company</th><th>Project</th><th>Task</th><th>Person</th><th>Due</th><th>Status</th><th>Progress</th><th>Last update</th><th>Next follow-up</th></tr></thead>
          <tbody>{m.rows.map((r: any) => <tr key={r.id} className="clickable" onClick={() => goto('tasks', r.id)}><td>{r.company}</td><td>{r.project ?? '—'}</td><td><b>{r.task}</b></td><td>{r.person}</td><td className={r.dueDate && r.dueDate < today() ? 'red-text' : ''}>{fmtDate(r.dueDate)}</td>
            <td><Badge tone={r.status === 'WAITING' ? 'amber' : 'grey'}>{STATUS_LABEL[r.status]}</Badge></td><td>{r.progress}%</td><td>{fmtDate(r.lastUpdate)}</td><td>{fmtDate(r.nextFollowupDate)}</td></tr>)}</tbody></table>
          {!m.rows.length && <Empty>No open tasks.</Empty>}</div></div>}
    </section>
  );
}
