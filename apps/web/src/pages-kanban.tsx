import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, fmtDate, goto, PRIORITY, PRIORITY_DOT, today } from './api';
import { useAllPeople, useList, useProjectsOf } from './hooks';
import { Badge, Progress, toast, useApp } from './ui';

const COLS = [{ key: 'BACKLOG', label: 'Backlog', set: 'BACKLOG', has: ['BACKLOG'] }, { key: 'TODO', label: 'To do', set: 'TODO', has: ['TODO'] }, { key: 'DOING', label: 'In progress', set: 'DOING', has: ['DOING', 'DELEGATED'] },
  { key: 'WAITING', label: 'Waiting', set: 'WAITING', has: ['WAITING'] }, { key: 'DONE', label: 'Completed', set: 'DONE', has: ['DONE'] }] as const;
const TYPES = [['', 'All task types'], ['own', 'My own tasks'], ['delegated', 'Delegated'], ['recurring', 'Recurring'], ['calls', 'With calls / mails'], ['followups', 'With follow-ups'], ['discussions', 'With discussions']] as const;

export function Kanban() {
  const { me, companyId } = useApp(); const qc = useQueryClient();
  const [co, setCo] = useState(companyId || me.memberships[0]?.companyId || '');
  useEffect(() => { if (companyId) setCo(companyId); }, [companyId]);
  const [f, setF] = useState({ projectId: '', personId: '', priority: '', due: '', type: '', status: '' });
  const [drag, setDrag] = useState<string | null>(null); const [over, setOver] = useState<string | null>(null); const [landed, setLanded] = useState<string | null>(null);
  const projects = useProjectsOf(co); const people = useAllPeople();
  const since = (() => { const d = new Date(); d.setDate(d.getDate() - 14); return d.toISOString().slice(0, 10); })();
  const active = useList('kanban-active', '/tasks', { companyId: co, completed: 'false', sort: 'priority', projectId: f.projectId, personId: f.personId, priority: f.priority }, !!co);
  const done = useList('kanban-done', '/tasks', { companyId: co, completed: 'true', doneSince: since, sort: 'priority', projectId: f.projectId, personId: f.personId, priority: f.priority }, !!co);
  const t = today(); const week = (() => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); })();
  const ok = (x: any) => {
    if (f.due === 'overdue' && !(x.dueDate && x.dueDate < t && x.status !== 'DONE')) return false;
    if (f.due === 'today' && x.dueDate !== t) return false; if (f.due === 'week' && !(x.dueDate && x.dueDate >= t && x.dueDate <= week)) return false; if (f.due === 'none' && x.dueDate) return false;
    if (f.type === 'own' && x.delegatedToId) return false; if (f.type === 'delegated' && !x.delegatedToId) return false; if (f.type === 'recurring' && !x.repeat) return false;
    if (f.type === 'calls' && !x.pendingCalls) return false; if (f.type === 'followups' && !x.pendingFollowups) return false; if (f.type === 'discussions' && !x.pendingDiscussions) return false;
    return true;
  };
  const all = [...active.items, ...done.items].filter(ok);
  const move = async (id: string, col: (typeof COLS)[number]) => {
    const x = all.find((y) => y.id === id); if (!x || (col.has as readonly string[]).includes(x.status)) return;
    try { await api(`/tasks/${id}`, { method: 'PATCH', body: { expectedUpdatedAt: x.updatedAt, status: col.set, today: today() } }); setLanded(id); setTimeout(() => setLanded(null), 700); toast(col.key === 'DONE' ? 'Task completed.' : `Moved to ${col.label}.`); qc.invalidateQueries(); }
    catch (e: any) { toast(e.message); }
  };
  const shown = COLS.filter((c) => !f.status || c.key === f.status);
  return (
    <section>
      <div className="page-head"><div><h2>Kanban</h2><p className="muted">Pick a company and move its work across the board. Dragging a card updates its status.</p></div></div>
      <div className="toolbar kanban-bar">
        <label className="inline-label"><b>Company</b><select value={co} onChange={(e) => setCo(e.target.value)}><option value="" disabled>Select company…</option>{me.memberships.map((m) => <option key={m.companyId} value={m.companyId}>{m.companyName}</option>)}</select></label>
        <select value={f.projectId} onChange={(e) => setF({ ...f, projectId: e.target.value })} aria-label="Project"><option value="">All projects</option>{projects.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <select value={f.personId} onChange={(e) => setF({ ...f, personId: e.target.value })} aria-label="Person"><option value="">Anyone</option>{people.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })} aria-label="Priority"><option value="">Any priority</option>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{PRIORITY_DOT[n]} {PRIORITY[n]}</option>)}</select>
        <select value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} aria-label="Due date"><option value="">Any due date</option><option value="overdue">Overdue</option><option value="today">Due today</option><option value="week">Next 7 days</option><option value="none">No due date</option></select>
        <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} aria-label="Task type">{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} aria-label="Status"><option value="">All statuses</option>{COLS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
      </div>
      {!co ? <div className="card pad"><p className="muted">Select a company to see its board.</p></div> :
      <div className="board" style={{ gridTemplateColumns: `repeat(${shown.length}, minmax(15rem, 1fr))` }}>{shown.map((c) => {
        const cards = all.filter((x) => (c.has as readonly string[]).includes(x.status));
        return (
          <div key={c.key} className={'column' + (over === c.key ? ' over' : '')} onDragOver={(e) => { e.preventDefault(); setOver(c.key); }} onDragLeave={() => setOver(null)} onDrop={(e) => { e.preventDefault(); setOver(null); setDrag(null); move(e.dataTransfer.getData('text/plain'), c); }}>
            <h4>{c.label} <span className="muted">· {cards.length}</span></h4>
            {cards.map((x) => { const od = x.dueDate && x.dueDate < t && x.status !== 'DONE';
              return (
                <div key={x.id} className={'kcard p' + x.priority + (drag === x.id ? ' dragging' : '') + (landed === x.id ? ' landed' : '')} draggable onDragStart={(e) => { e.dataTransfer.setData('text/plain', x.id); setDrag(x.id); }} onDragEnd={() => { setDrag(null); setOver(null); }} onClick={() => goto('tasks', x.id)}>
                  <b>{x.title}</b>
                  <small className="muted">{x.projectName ?? 'No project'} · {x.companyName}</small>
                  <div className="kmeta">{x.dueDate && <span className={od ? 'red-text' : 'muted'}>{fmtDate(x.dueDate)}</span>}<span title={PRIORITY[x.priority]}>{PRIORITY_DOT[x.priority]}</span>{x.delegatedToName && <span className="muted">{x.delegatedToName}</span>}{x.blocked && <Badge tone="red">Blocked</Badge>}{x.repeat && <span title="Repeats">↻</span>}</div>
                  <div className="kicons">{x.subtaskCount > 0 && <span title="Subtasks done">☑ {x.subtaskDoneCount}/{x.subtaskCount}</span>}{x.pendingCalls > 0 && <span title="Calls / mails to do">{x.pendingCalls}</span>}{x.pendingFollowups > 0 && <span title="Follow-ups">{x.pendingFollowups}</span>}{x.pendingDiscussions > 0 && <span title="Discussions">{x.pendingDiscussions}</span>}</div>
                  {x.subtaskCount > 0 && <Progress value={x.progress} />}
                </div>); })}
            {!cards.length && <p className="muted col-empty">{c.key === 'DONE' ? 'Nothing completed in the last 14 days.' : 'Drop cards here'}</p>}
          </div>); })}</div>}
      {co && (active.hasNextPage || done.hasNextPage) && <button className="ghost more" onClick={() => { active.fetchNextPage(); done.fetchNextPage(); }}>Load more cards</button>}
    </section>
  );
}
