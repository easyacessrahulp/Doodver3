import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, api, fmtDate, goto, today } from './api';
import { useAllPeople, useList } from './hooks';
import { Badge, Check, Empty, FormModal, toast, useApp, roleIn, type Draft } from './ui';
import { EmailWindow } from './pages-ai';

export const FU_TYPES = [['PHONE', 'Phone call'], ['WHATSAPP', 'WhatsApp'], ['EMAIL', '✉️ Email'], ['MEETING', 'Meeting'], ['PERSONAL', 'In person'], ['DOCUMENT_PENDING', 'Document pending'], ['PAYMENT_PENDING', 'Payment pending'], ['APPROVAL_PENDING', 'Approval pending'], ['OTHER', 'Other']] as const;
const ICON: Record<string, string> = Object.fromEntries(FU_TYPES.map(([k, l]) => [k, l.split(' ')[0]]));

/** Plan a follow-up against a task: who to chase, how, and when. Pasting several lines offers one follow-up per line. */
export function FollowupForm({ taskId, subtask, onClose, onSaved, draft }: { taskId?: string; subtask?: { id: string; title: string; assigneeId?: string | null }; onClose: () => void; onSaved: () => void; draft?: Draft | null }) {
  const people = useAllPeople(); const tasks = useList('fu-task-options', '/tasks', { completed: 'false', sort: 'title' }, !taskId); const d = draft?.data ?? {};
  const fields = (v: any) => [
    ...(taskId ? [] : [{ key: 'taskId', label: 'Task', type: 'select' as const, required: true, options: tasks.items.map((t) => ({ value: t.id, label: `${t.title} — ${t.companyName}` })) }]),
    { key: 'type', label: 'How', type: 'select' as const, required: true, half: true, options: FU_TYPES.map(([value, label]) => ({ value, label })) },
    { key: 'dueDate', label: 'Follow up on', type: 'date' as const, required: true, half: true },
    { key: 'personId', label: 'Chase (from your people)', type: 'select' as const, half: true, options: (people.data ?? []).map((p) => ({ value: p.id, label: p.name + (p.companyName ? ` — ${p.companyName}` : '') })) },
    { key: 'contactName', label: 'Or type a name', type: 'text' as const, half: true, required: false },
    { key: 'note', label: 'What to follow up on', type: 'textarea' as const, hint: v.note ? undefined : 'Paste a list to create several follow-ups at once.' },
  ];
  const make = (v: any, note: string | null) => api('/followups', { method: 'POST', body: { taskId: taskId ?? v.taskId, subtaskId: subtask?.id ?? null, type: v.type, personId: v.personId, contactName: v.contactName, dueDate: v.dueDate, note } });
  return <FormModal title={subtask ? `Follow-up — ${subtask.title}` : 'Plan a follow-up'} fields={fields} submitLabel="Add follow-up" onClose={onClose} draftId={draft?.id} draft={{ kind: 'followup', title: (v) => v.note || v.contactName || 'Follow-up' }}
    initial={{ taskId: taskId ?? d.taskId ?? '', type: d.type ?? 'PHONE', dueDate: d.dueDate ?? addDays(today(), 1), personId: d.personId ?? subtask?.assigneeId ?? '', contactName: d.contactName ?? '', note: d.note ?? '' }}
    bulk={{ field: 'note', noun: 'follow-up', create: async (lines, v) => { if (!(taskId ?? v.taskId) || !v.dueDate) throw new Error('Choose the task and the date first, then paste the list.'); for (const l of lines) await make(v, l); onSaved(); } }}
    onSubmit={async (v) => { await make(v, v.note); toast('Follow-up created.'); onSaved(); onClose(); }} />;
}

export function FollowupRow({ f, onChanged }: { f: any; onChanged: () => void }) {
  const [finishing, setFinishing] = useState(false); const [moving, setMoving] = useState(false); const [leaving, setLeaving] = useState(false); const [email, setEmail] = useState(false);
  const who = f.personName ?? f.contactName; const overdue = !f.doneAt && f.dueDate < today();
  const patch = (body: any) => api(`/followups/${f.id}`, { method: 'PATCH', body: { expectedUpdatedAt: f.updatedAt, ...body } });
  return (
    <li className={'call' + (f.doneAt ? ' done' : '') + (leaving ? ' leaving' : '')}>
      {!f.doneAt && <Check title="Mark done" onDone={() => setFinishing(true)} />}
      <div className="call-main" onClick={() => goto('tasks', f.taskId)} style={{ cursor: 'pointer' }}>
        <b>{ICON[f.type] ?? ''} {f.taskTitle}</b>{f.subtaskTitle && <small className="muted">↳ subtask: {f.subtaskTitle}</small>}
        <small className="muted">{who ? `Chase ${who} · ` : ''}{f.companyName}</small>
        <span>{f.doneAt ? <Badge tone="green">done {fmtDate(f.doneAt)}</Badge> : <Badge tone={overdue ? 'red' : f.dueDate === today() ? 'amber' : 'grey'}>{overdue ? 'Overdue · ' : ''}{fmtDate(f.dueDate)}</Badge>}</span>
        {f.notes && <p className="call-note">{f.notes}</p>}{f.result && <p className="call-note result">✓ {f.result}</p>}
      </div>
      <div className="call-actions">{!f.doneAt && <button className="ghost small" onClick={() => setEmail(true)}>✉ Email</button>}{!f.doneAt && <button className="ghost small" onClick={() => setMoving(true)}>Reschedule</button>}
        <button className="ghost small" aria-label="Remove" onClick={() => confirm('Remove this follow-up? (Archived, not erased.)') && api(`/followups/${f.id}/archive`, { method: 'POST' }).then(onChanged)}>✕</button></div>
      {finishing && <FormModal wide title={`Follow-up — ${f.taskTitle}`} submitLabel="Mark done" onClose={() => { setFinishing(false); }} initial={{ result: '', nextDate: '' }}
        fields={[{ key: 'result', label: 'What happened? (required — added to the task’s notes)', type: 'textarea', required: true }, { key: 'nextDate', label: 'Follow up again on (optional)', type: 'date', hint: 'Leave empty if nothing more is needed.' }]}
        onSubmit={async (v) => { await patch({ done: true, result: v.result, nextDate: v.nextDate }); setFinishing(false); setLeaving(true); toast('Follow-up completed.'); setTimeout(onChanged, 320); }} />}
      {email && <EmailWindow link={{ type: 'TASK', id: f.taskId, title: f.taskTitle, companyId: f.companyId }} followup={{ id: f.id, matter: f.notes ? `Follow-up: ${f.notes}` : `Follow up on: ${f.taskTitle}`, recipient: who ?? '' }} onClose={() => setEmail(false)} />}
      {moving && <FormModal title="Reschedule follow-up" initial={{ dueDate: f.dueDate }} onClose={() => setMoving(false)} fields={[{ key: 'dueDate', label: 'New date', type: 'date', required: true }]} onSubmit={async (v) => { await patch({ dueDate: v.dueDate }); setMoving(false); onChanged(); }} />}
    </li>
  );
}

export function Followups() {
  const { me, companyId, resume, setResume } = useApp(); const qc = useQueryClient();
  const [tab, setTab] = useState<'overdue' | 'today' | 'upcoming' | 'done'>(() => (sessionStorage.getItem('cc.fuTab') as any) ?? 'today'); sessionStorage.removeItem('cc.fuTab');
  const [adding, setAdding] = useState<Draft | true | null>(resume?.kind === 'followup' ? resume : null); if (resume?.kind === 'followup') setResume(null);
  const c = companyId ? `&companyId=${companyId}` : '';
  const counts = useQuery({ queryKey: ['fu-counts', companyId], queryFn: async () => { const g = async (b: string) => (await api<any>(`/followups?bucket=${b}&today=${today()}${c}`)).items.length; return { overdue: await g('overdue'), today: await g('today'), upcoming: await g('upcoming') }; } });
  const q = useQuery({ queryKey: ['followups', tab, companyId], queryFn: () => api<{ items: any[] }>(tab === 'done' ? `/followups?status=done${c}` : `/followups?status=pending&bucket=${tab}&today=${today()}${c}`).then((r) => r.items) });
  const refresh = () => qc.invalidateQueries();
  const canAdd = me.user.isAdmin ? me.memberships.length > 0 : me.memberships.some((m) => roleIn(me, m.companyId) !== 'VIEWER');
  const tabs: [typeof tab, string, number | undefined][] = [['overdue', 'Overdue', counts.data?.overdue], ['today', 'Due today', counts.data?.today], ['upcoming', 'Upcoming', counts.data?.upcoming], ['done', 'Completed (history)', undefined]];
  return (
    <section>
      <div className="page-head"><div><h2>Follow-ups</h2><p className="muted">Everyone you need to chase, and when. Finish one with a note of what happened — it goes into the task’s notes.</p></div>{canAdd && <button className="primary" onClick={() => setAdding(true)}>+ Follow-up</button>}</div>
      <div className="tabs">{tabs.map(([k, l, n]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}{n !== undefined && <em className={'nav-badge' + (k === 'overdue' && n ? ' red' : '')}>{n}</em>}</button>)}</div>
      <div className="card pad" style={{ marginTop: '0.75rem' }}>
        <ul className="calls">{q.data?.map((f) => <FollowupRow key={f.id} f={f} onChanged={refresh} />)}</ul>
        {q.data && !q.data.length && <Empty>{tab === 'done' ? 'Nothing completed yet.' : tab === 'overdue' ? 'Nothing overdue. ' : 'No follow-ups here.'}</Empty>}
      </div>
      {adding && <FollowupForm draft={adding === true ? null : adding} onClose={() => setAdding(null)} onSaved={refresh} />}
    </section>
  );
}
