import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, fmtMinutes, fmtTime, goto, today } from './api';
import { Empty, useApp } from './ui';
import { useFocus } from './timer';

export function FocusPage() {
  const { companyId } = useApp(); const focus = useFocus(); const [days, setDays] = useState(30);
  const h = useQuery({ queryKey: ['focus-history', days], queryFn: () => api<any>(`/focus/history?days=${days}&tzOffsetMinutes=${new Date().getTimezoneOffset()}`) });
  const att = useQuery({ queryKey: ['focus-suggest', companyId], queryFn: () => api<any>(`/attention?today=${today()}&limit=5${companyId ? `&companyId=${companyId}` : ''}`) });
  const d = h.data; const keys = Array.from({ length: Math.min(days, 14) }, (_, i) => { const x = new Date(); x.setDate(x.getDate() - (Math.min(days, 14) - 1) + i); return x; });
  const key = (x: Date) => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
  const max = d ? Math.max(1, ...keys.map((x) => d.byDay[key(x)] ?? 0)) : 1;
  return (
    <section>
      <div className="page-head"><div><h2>Focus</h2><p className="muted">Pomodoro sessions on your tasks and subtasks. Start one from any task (▶), or pick from what needs you most.</p></div></div>
      <div className="card pad panel"><div className="panel-head"><h3>Start a session</h3></div>
        <ul className="mini-list">{att.data?.items.map((x: any) => <li key={x.id}><b>{x.title}</b><small className="muted">{x.reasons[0]?.text ?? x.company}</small><button className="small primary" onClick={() => focus.start({ taskId: x.id, title: x.title })}>▶ Focus</button></li>)}</ul>
        {att.data && !att.data.items.length && <p className="muted">Nothing is pressing. Open any task and press ▶ Focus.</p>}</div>
      <div className="toolbar"><label className="inline-label">History <select value={days} onChange={(e) => setDays(Number(e.target.value))}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select></label></div>
      {d && <>
        <div className="counters"><div className="counter blue"><b>{d.sessions}</b><span>Sessions</span></div><div className="counter green"><b>{fmtMinutes(d.minutes)}</b><span>Focused</span></div><div className="counter grey"><b>{d.averageMinutes}m</b><span>Average session</span></div><div className="counter amber"><b>{d.completedPomodoros}</b><span>Completed pomodoros</span></div></div>
        <div className="two-col">
          <div className="col"><div className="card pad panel"><h3>By day</h3><div className="bars">{keys.map((x) => { const v = d.byDay[key(x)] ?? 0; return <div key={key(x)} className="bar"><i style={{ height: `${(Math.round((v / max) * 90) + 4) / 16}rem` }} title={fmtMinutes(v)} /><small>{x.toLocaleDateString('en-IN', { weekday: 'short' }).slice(0, 2)}</small></div>; })}</div></div>
            <div className="card pad panel"><h3>Most-focused tasks</h3>{d.topTasks.map((t: any) => <div className="line link" key={t.taskId} onClick={() => goto('tasks', t.taskId)}><span>{t.title}</span><b>{fmtMinutes(t.minutes)} · {t.sessions}×</b></div>)}{!d.topTasks.length && <p className="muted">No sessions yet.</p>}
              {d.topProjects.length > 0 && <><h3 style={{ marginTop: '0.875rem' }}>Projects</h3>{d.topProjects.map((p: any) => <div className="line" key={p.project}><span>{p.project}</span><b>{fmtMinutes(p.minutes)}</b></div>)}</>}</div></div>
          <div className="card pad panel"><h3>Recent sessions</h3><ul className="mini-list">{d.recent.map((s: any) => <li key={s.id} onClick={() => goto('tasks', s.taskId)}><b>{s.taskTitle}{s.subtaskTitle ? ` › ${s.subtaskTitle}` : ''}</b><small className="muted">{fmtTime(s.startedAt)} · {s.actualMinutes} of {s.plannedMinutes} min{s.completed ? '' : ' (stopped early)'}{s.note ? ` — ${s.note}` : ''}</small></li>)}</ul>{!d.recent.length && <Empty>No sessions in this period.</Empty>}</div>
        </div></>}
    </section>
  );
}
