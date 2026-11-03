import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, CHANNEL, fmtDate, goto, today } from './api';
import { useAllPeople, useList } from './hooks';
import { Badge, Empty, FormModal, Modal, toast, useApp, type Draft } from './ui';

/** Add something to discuss (or a meeting to schedule) against a task / subtask. The other person may be in People or just typed. */
export function DiscussionForm({ taskId, subtaskId, subtasks, onClose, onSaved, draft }: { taskId?: string; subtaskId?: string | null; subtasks?: { id: string; title: string }[]; onClose: () => void; onSaved: () => void; draft?: Draft | null }) {
  const people = useAllPeople(); const d = draft?.data ?? {}; const tasks = useList('disc-task-options', '/tasks', { completed: 'false', sort: 'title' }, !taskId);
  const fields = (v: any) => [
    ...(taskId ? [] : [{ key: 'taskId', label: 'Task', type: 'select' as const, required: true, options: tasks.items.map((t) => ({ value: t.id, label: `${t.title} — ${t.companyName}` })) }]),
    ...(subtasks?.length ? [{ key: 'subtaskId', label: 'Subtask (optional)', type: 'select' as const, options: subtasks.map((s) => ({ value: s.id, label: s.title })) }] : []),
    { key: 'kind', label: 'Type', type: 'select' as const, required: true, half: true, options: [{ value: 'DISCUSSION', label: 'Discussion' }, { value: 'MEETING', label: 'Meeting' }] },
    { key: 'dueDate', label: v.kind === 'MEETING' ? 'Meeting date' : 'Discuss by', type: 'date' as const, half: true },
    ...(v.kind === 'MEETING' ? [{ key: 'meetingTime', label: 'Time', type: 'text' as const, half: true, hint: '24-hour, e.g. 15:30' }] : []),
    { key: 'topic', label: 'What needs to be discussed / decided?', type: 'textarea' as const, required: true, hint: 'Paste a list to create one discussion item per line.' },
    { key: 'personId', label: 'With (from your people)', type: 'select' as const, options: (people.data ?? []).map((p) => ({ value: p.id, label: p.name + (p.companyName ? ` — ${p.companyName}` : ' — shared') })) },
    { key: 'contactName', label: 'Or type a name', type: 'text' as const, hint: 'For anyone not in the People list', required: !v.personId },
    { key: 'agenda', label: 'Points to raise / preparation', type: 'textarea' as const },
  ];
  return <FormModal title="Add a discussion / meeting" fields={fields} initial={{ taskId: taskId ?? d.taskId ?? '', subtaskId: subtaskId ?? d.subtaskId ?? '', kind: d.kind ?? 'DISCUSSION', dueDate: d.dueDate ?? '', meetingTime: d.meetingTime ?? '', topic: d.topic ?? '', personId: d.personId ?? '', contactName: d.contactName ?? '', agenda: d.agenda ?? '' }}
    draftId={draft?.id} draft={{ kind: 'discussion', title: (v) => v.topic }} submitLabel="Add" onClose={onClose}
    bulk={{ field: 'topic', noun: 'discussion point', create: async (lines, v) => { if (!(taskId ?? v.taskId) || (!v.personId && !v.contactName)) throw new Error('Choose the task and who it is with first, then paste the list.'); for (const l of lines) await api('/discussions', { method: 'POST', body: { ...v, topic: l, taskId: taskId ?? v.taskId, meetingTime: v.kind === 'MEETING' ? v.meetingTime : null } }); onSaved(); } }}
    onSubmit={async (v) => { await api('/discussions', { method: 'POST', body: { ...v, taskId: taskId ?? v.taskId, meetingTime: v.kind === 'MEETING' ? v.meetingTime : null } }); toast('Discussion added.'); onSaved(); onClose(); }} />;
}

export function DiscussionRow({ d, onChanged }: { d: any; onChanged: () => void }) {
  const [finishing, setFinishing] = useState(false); const overdue = d.dueDate && !d.doneAt && d.dueDate < today(); const who = d.personName ?? d.contactName;
  return (
    <li className={'call' + (d.doneAt ? ' done' : '')}>
      <div className="call-main">
        <b>{d.kind === 'MEETING' ? '' : ''} {d.topic}</b> <small className="muted">with {who}</small>{!d.personId && <Badge tone="grey">not in people list</Badge>}
        {d.dueDate && <Badge tone={overdue ? 'red' : d.dueDate === today() ? 'amber' : 'grey'}>{fmtDate(d.dueDate)}{d.meetingTime ? ` ${d.meetingTime}` : ''}</Badge>}
        {d.agenda && <p className="call-note">{d.agenda}</p>}
        {d.discussionNotes && <p className="call-note result"><b>Discussed:</b> {d.discussionNotes}</p>}
        {d.decisions && <p className="call-note result"><b>Decision:</b> {d.decisions}</p>}
        {d.subtaskTitle && <small className="muted">re: {d.subtaskTitle}</small>}
      </div>
      <div className="call-actions">
        {d.doneAt ? <button className="ghost small" onClick={() => api(`/discussions/${d.id}`, { method: 'PATCH', body: { expectedUpdatedAt: d.updatedAt, done: false } }).then(onChanged)}>Undo</button> : <button className="small" onClick={() => setFinishing(true)}>✓ Done</button>}
        <button className="ghost small" aria-label="Remove" onClick={() => confirm('Remove this item? (Archived, not erased.)') && api(`/discussions/${d.id}/archive`, { method: 'POST' }).then(onChanged)}>✕</button>
      </div>
      {finishing && <FormModal wide title={`${d.kind === 'MEETING' ? 'Meeting' : 'Discussion'} — ${d.topic}`} submitLabel="Save & mark done" onClose={() => setFinishing(false)} initial={{ discussionNotes: d.discussionNotes ?? '', decisions: d.decisions ?? '' }}
        fields={[{ key: 'discussionNotes', label: 'What was discussed?', type: 'textarea' }, { key: 'decisions', label: 'Decision / action points', type: 'textarea', hint: 'Fill at least one. Both are added to the task’s notes.' }]}
        onSubmit={async (v) => { await api(`/discussions/${d.id}`, { method: 'PATCH', body: { expectedUpdatedAt: d.updatedAt, done: true, discussionNotes: v.discussionNotes, decisions: v.decisions } }); setFinishing(false); onChanged(); }} />}
    </li>
  );
}

/** One sheet for one person: every pending item, with space for the discussion and decision on each — settle them in one sitting. */
function MeetingSheet({ g, onClose, onSaved }: { g: any; onClose: () => void; onSaved: () => void }) {
  const [vals, setVals] = useState<Record<string, { n: string; d: string }>>({}); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const set = (id: string, k: 'n' | 'd', v: string) => setVals({ ...vals, [id]: { n: vals[id]?.n ?? '', d: vals[id]?.d ?? '', [k]: v } });
  const filled = g.discussions.filter((x: any) => (vals[x.id]?.n ?? '').trim() || (vals[x.id]?.d ?? '').trim());
  const save = async () => {
    setBusy(true); setErr('');
    try { const r = await api<any>('/discussions/batch-finish', { method: 'POST', body: { items: filled.map((x: any) => ({ id: x.id, discussionNotes: vals[x.id].n || null, decisions: vals[x.id].d || null })) } });
      toast(`${r.finished.length} item${r.finished.length === 1 ? '' : 's'} marked done and added to the task notes.`); onSaved(); onClose(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal wide title={`Meeting sheet — ${g.name}`} onClose={() => { if (!filled.length || confirm('Close without saving what you typed?')) onClose(); }}>
      <p className="muted" style={{ marginBottom: '0.625rem' }}>{g.discussions.length} thing{g.discussions.length === 1 ? '' : 's'} to settle. Write the discussion and decision against each; items you leave blank stay pending.</p>
      <div className="sheet">
        {g.discussions.map((x: any, i: number) => (
          <div className="sheet-item" key={x.id}>
            <div><b>{i + 1}. {x.topic}</b> {x.kind === 'MEETING' && <Badge tone="blue">Meeting</Badge>}{x.dueDate && <Badge tone={x.dueDate < today() ? 'red' : 'grey'}>{fmtDate(x.dueDate)}</Badge>}</div>
            <small className="muted">{x.taskTitle}{x.subtaskTitle ? ` › ${x.subtaskTitle}` : ''} · {x.companyName}</small>
            {x.agenda && <p className="call-note">{x.agenda}</p>}
            <textarea rows={2} placeholder="What was discussed…" value={vals[x.id]?.n ?? ''} onChange={(e) => set(x.id, 'n', e.target.value)} />
            <textarea rows={2} placeholder="Decision / action points…" value={vals[x.id]?.d ?? ''} onChange={(e) => set(x.id, 'd', e.target.value)} />
          </div>))}
      </div>
      {g.communications.length > 0 && <div className="sheet-extra"><b>Also pending with {g.name}:</b><ul>{g.communications.map((c: any) => <li key={c.id}>{CHANNEL[c.channel]?.icon} {c.note || 'No note'} <small className="muted">— {c.taskTitle}</small></li>)}</ul></div>}
      {err && <p className="error">{err}</p>}
      <div className="actions"><button className="ghost" onClick={() => window.print()}>Print</button><button className="primary" disabled={busy || !filled.length} onClick={save}>{busy ? 'Saving…' : `Mark ${filled.length || ''} done`}</button></div>
    </Modal>
  );
}

export function Discussions() {
  const { companyId, resume, setResume } = useApp(); const qc = useQueryClient(); const [sheet, setSheet] = useState<any>(null); const [adding, setAdding] = useState<Draft | true | null>(resume?.kind === 'discussion' ? resume : null); if (resume?.kind === 'discussion') setResume(null); const [tab, setTab] = useState<'person' | 'done'>('person');
  const groups = useQuery({ queryKey: ['disc-by-person', companyId], queryFn: () => api<{ items: any[] }>(`/discussions/by-person${companyId ? `?companyId=${companyId}` : ''}`).then((r) => r.items) });
  const done = useQuery({ queryKey: ['disc-done', companyId], enabled: tab === 'done', queryFn: () => api<{ items: any[] }>(`/discussions?status=done${companyId ? `&companyId=${companyId}` : ''}`).then((r) => r.items) });
  const refresh = () => qc.invalidateQueries();
  return (
    <section>
      <div className="page-head"><div><h2>Discussions</h2><p className="muted">Everything waiting to be discussed, gathered under each person — so you can settle several things in one conversation.</p></div><button className="primary" onClick={() => setAdding(true)}>+ Discussion</button></div>
      <div className="tabs"><button className={tab === 'person' ? 'on' : ''} onClick={() => setTab('person')}>Pending, by person</button><button className={tab === 'done' ? 'on' : ''} onClick={() => setTab('done')}>Decided</button></div>
      {tab === 'person' ? <div className="groups">
        {groups.data?.map((g) => (
          <div className="card pad group-card" key={g.key}>
            <div className="group-head"><div><h3>{g.name}</h3><small className="muted">{g.discussions.length} to discuss{g.communications.length ? ` · ${g.communications.length} call/mail${g.communications.length > 1 ? 's' : ''} pending` : ''}{g.phone ? ` · ${g.phone}` : ''}</small></div>
              <button className="primary" onClick={() => setSheet(g)}>Open meeting sheet</button></div>
            <ol className="agenda">{g.discussions.map((x: any) => (
              <li key={x.id} onClick={() => goto('tasks', x.taskId)}><b>{x.topic}</b>{x.dueDate && <Badge tone={x.dueDate < today() ? 'red' : 'grey'}>{fmtDate(x.dueDate)}</Badge>}<br /><small className="muted">{x.taskTitle}{x.subtaskTitle ? ` › ${x.subtaskTitle}` : ''} · {x.companyName}</small></li>))}</ol>
          </div>))}
        {groups.data && !groups.data.length && <div className="card"><Empty>Nothing waiting to be discussed. Add a discussion from any task or subtask ().</Empty></div>}
      </div> : <div className="card pad"><ul className="calls">{done.data?.map((d) => <DiscussionRow key={d.id} d={d} onChanged={refresh} />)}</ul>{done.data && !done.data.length && <Empty>No finished discussions yet.</Empty>}</div>}
      {sheet && <MeetingSheet g={sheet} onClose={() => setSheet(null)} onSaved={refresh} />}
      {adding && <DiscussionForm draft={adding === true ? null : adding} onClose={() => setAdding(null)} onSaved={refresh} />}
    </section>
  );
}
