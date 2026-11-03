import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, CHANNEL, fmtDate, today } from './api';
import { useAllPeople, useList } from './hooks';
import { EmailWindow } from './pages-ai';
import { Badge, Check, Empty, FormModal, toast, useApp, roleIn, type Draft } from './ui';

/** Add a communication to make — a call, an email or a WhatsApp — against a task (and optionally one of its subtasks). The contact can be anyone. */
export function CallForm({ taskId, subtaskId, subtasks, onClose, onSaved, draft, channel }: {
  taskId?: string; subtaskId?: string | null; subtasks?: { id: string; title: string }[]; onClose: () => void; onSaved: () => void; draft?: Draft | null; channel?: string;
}) {
  const people = useAllPeople();
  const tasks = useList('call-task-options', '/tasks', { completed: 'false', sort: 'title' }, !taskId);
  const d = draft?.data ?? {};
  const fields = (v: any) => [
    ...(taskId ? [] : [{ key: 'taskId', label: 'Task', type: 'select' as const, required: true, options: tasks.items.map((t) => ({ value: t.id, label: `${t.title} — ${t.companyName}` })) }]),
    ...(subtasks?.length ? [{ key: 'subtaskId', label: 'Subtask (optional)', type: 'select' as const, options: subtasks.map((s) => ({ value: s.id, label: s.title })) }] : []),
    { key: 'channel', label: 'How', type: 'select' as const, required: true, half: true, options: Object.entries(CHANNEL).map(([value, c]) => ({ value, label: `${c.icon} ${c.label}` })) },
    { key: 'dueDate', label: 'Do it on', type: 'date' as const, half: true },
    { key: 'personId', label: 'Who (from your people)', type: 'select' as const, options: (people.data ?? []).map((p) => ({ value: p.id, label: p.name + (p.companyName ? ` — ${p.companyName}` : ' — shared') })) },
    { key: 'contactName', label: 'Or type a name', type: 'text' as const, hint: 'For anyone not in the People list — a vendor, officer, bank contact…', required: !v.personId },
    ...(v.channel === 'EMAIL' ? [{ key: 'email', label: 'Email address', type: 'email' as const }] : [{ key: 'phone', label: 'Phone', type: 'text' as const }]),
    { key: 'note', label: 'Note — what to ask or say', type: 'textarea' as const },
  ];
  return <FormModal title="Add a call / mail to do" fields={fields} initial={{ taskId: taskId ?? d.taskId ?? '', subtaskId: subtaskId ?? d.subtaskId ?? '', channel: d.channel ?? channel ?? 'CALL', personId: d.personId ?? '', contactName: d.contactName ?? '', phone: d.phone ?? '', email: d.email ?? '', dueDate: d.dueDate ?? '', note: d.note ?? '' }}
    draftId={draft?.id} draft={{ kind: 'call', title: (v) => v.contactName || v.note || 'Call / mail' }} submitLabel="Add" onClose={onClose}
    bulk={{ field: 'note', noun: 'call / mail', create: async (lines, v) => { if (!(taskId ?? v.taskId) || (!v.personId && !v.contactName)) throw new Error('Choose the task and who it is for first, then paste the list.'); for (const l of lines) await api('/calls', { method: 'POST', body: { ...v, note: l, taskId: taskId ?? v.taskId } }); onSaved(); } }}
    onSubmit={async (v) => { await api('/calls', { method: 'POST', body: { ...v, taskId: taskId ?? v.taskId } }); toast('Call / mail added.'); onSaved(); onClose(); }} />;
}

export function CallRow({ c, onChanged, showTask }: { c: any; onChanged: () => void; showTask?: boolean }) {
  const [finishing, setFinishing] = useState(false); const [composing, setComposing] = useState(false); const [err, setErr] = useState(''); const [leaving, setLeaving] = useState(false);
  const who = c.personName ?? c.contactName; const phone = c.phone ?? c.personPhone; const email = c.email ?? c.personEmail; const ch = CHANNEL[c.channel] ?? CHANNEL.CALL;
  const overdue = c.dueDate && !c.doneAt && c.dueDate < today();
  const patch = (body: any) => api(`/calls/${c.id}`, { method: 'PATCH', body: { expectedUpdatedAt: c.updatedAt, ...body } });
  return (
    <li className={'call' + (c.doneAt ? ' done' : '') + (leaving ? ' leaving' : '')}>
      {!c.doneAt && <Check title={c.channel === 'EMAIL' ? 'Mark done (without writing here)' : 'Mark done'} onDone={() => setFinishing(true)} />}
      <div className="call-main">
        <b>{ch.icon} {ch.label}: {who}</b>{!c.personId && <Badge tone="grey">not in people list</Badge>}
        {c.channel === 'EMAIL' ? (email && <> · <a href={`mailto:${email}`}>{email}</a></>) : (phone && <> · <a href={c.channel === 'WHATSAPP' ? `https://wa.me/${String(phone).replace(/\D/g, '')}` : `tel:${String(phone).replace(/\s/g, '')}`} target={c.channel === 'WHATSAPP' ? '_blank' : undefined} rel="noreferrer">{phone}</a></>)}
        {c.dueDate && <Badge tone={overdue ? 'red' : c.dueDate === today() ? 'amber' : 'grey'}>{c.doneAt ? 'was ' : ''}{fmtDate(c.dueDate)}</Badge>}
        {c.note && <p className="call-note">{c.note}</p>}
        {c.result && <p className="call-note result">✓ {c.result}</p>}
        {showTask && <small className="muted">{c.taskTitle}{c.subtaskTitle ? ` › ${c.subtaskTitle}` : ''} · {c.companyName}</small>}
        {!showTask && c.subtaskTitle && <small className="muted">re: {c.subtaskTitle}</small>}
        {err && <p className="error">{err}</p>}
      </div>
      <div className="call-actions">
        {c.channel === 'EMAIL' && !c.doneAt && <button className="primary small" onClick={() => setComposing(true)}>✉ Write email</button>}
        {c.channel === 'EMAIL' && c.doneAt && c.sentAt && <Badge tone="green">Sent</Badge>}
        {c.doneAt && <button className="ghost small" onClick={() => patch({ done: false }).then(onChanged).catch((e) => setErr(e.message))}>Undo</button>}
        <button className="ghost small" aria-label="Remove" onClick={() => confirm('Remove this from the list? (It is archived, not erased.)') && api(`/calls/${c.id}/archive`, { method: 'POST' }).then(onChanged)}>✕</button>
      </div>
      {composing && <EmailWindow link={{ type: 'TASK', id: c.taskId, title: c.taskTitle, companyId: c.companyId }} preset={{ matter: c.note ?? '', recipient: who ?? '' }} compose={{ call: { id: c.id, updatedAt: c.updatedAt, email }, onSent: () => { setLeaving(true); setTimeout(onChanged, 320); } }} onClose={() => setComposing(false)} />}
      {finishing && <FormModal title={`${ch.label} — ${who}`} submitLabel="Mark done" initial={{ result: '' }} onClose={() => setFinishing(false)}
        fields={[{ key: 'result', label: 'Feedback — what happened? (required; it is added to the task’s notes)', type: 'textarea', required: true }]}
        onSubmit={async (v) => { await patch({ done: true, result: v.result }); setFinishing(false); setLeaving(true); toast(`${ch.label} completed — moved to history.`); setTimeout(onChanged, 320); }} />}
    </li>
  );
}

export function Calls() {
  const { me, companyId, resume, setResume } = useApp(); const qc = useQueryClient();
  const [tab, setTab] = useState<'pending' | 'done'>(() => { const t = sessionStorage.getItem('cc.callTab'); sessionStorage.removeItem('cc.callTab'); return t === 'done' ? 'done' : 'pending'; }); const [channel, setChannel] = useState('');
  const [adding, setAdding] = useState<Draft | true | null>(resume?.kind === 'call' ? resume : null);
  if (resume?.kind === 'call') setResume(null);
  const q = useQuery({ queryKey: ['calls', tab, companyId, channel], queryFn: () => api<{ items: any[] }>(`/calls?status=${tab}${companyId ? `&companyId=${companyId}` : ''}${channel ? `&channel=${channel}` : ''}`).then((r) => r.items) });
  const refresh = () => qc.invalidateQueries();
  const mails = useQuery({ queryKey: ['calls', 'pending-email', companyId], queryFn: () => api<{ items: any[] }>(`/calls?status=pending&channel=EMAIL${companyId ? `&companyId=${companyId}` : ''}`).then((r) => r.items) });
  const canAdd = me.user.isAdmin ? me.memberships.length > 0 : me.memberships.some((m) => roleIn(me, m.companyId) !== 'VIEWER');
  return (
    <section>
      <div className="page-head"><div><h2>Calls</h2><p className="muted">Everyone to ring, email or message about your tasks — with a note, and feedback once it’s done.</p></div>
        {canAdd && <button className="primary" onClick={() => setAdding(true)}>+ Call / mail</button>}</div>
      {!!mails.data?.length && <div className="mail-alert" role="status"><b>✉ {mails.data.length} email{mails.data.length > 1 ? 's' : ''} waiting to be written</b>
        <ul>{mails.data.slice(0, 6).map((m) => <li key={m.id}><span>{m.personName ?? m.contactName}<small className="muted"> — {m.note || m.taskTitle}{m.dueDate ? ` · ${m.dueDate < today() ? 'overdue' : fmtDate(m.dueDate)}` : ''}</small></span><button className="primary small" onClick={() => { setTab('pending'); setChannel('EMAIL'); }}>Show &amp; write</button></li>)}</ul>
        {mails.data.length > 6 && <small className="muted">…and {mails.data.length - 6} more (filter “Emails” below).</small>}<small className="muted block">Press “✉ Write email” on an email, draft it here, then “Done — mark as sent”. It moves to Completed.</small></div>}
      <div className="tabs"><button className={tab === 'pending' ? 'on' : ''} onClick={() => setTab('pending')}>Calls &amp; mails to do</button><button className={tab === 'done' ? 'on' : ''} onClick={() => setTab('done')}>Completed (activity history)</button></div>
      <div className="toolbar"><label className="inline-label">Show <select value={channel} onChange={(e) => setChannel(e.target.value)}><option value="">All</option>{Object.entries(CHANNEL).map(([k, c]) => <option key={k} value={k}>{c.icon} {c.label}s</option>)}</select></label></div>
      <div className="card pad">
        <ul className="calls">{q.data?.map((c) => <CallRow key={c.id} c={c} showTask onChanged={refresh} />)}</ul>
        {q.data && !q.data.length && <Empty>{tab === 'pending' ? 'Nothing waiting. Add one here, or from a task or subtask ().' : 'Nothing completed yet. Finished calls and mails are kept here with their feedback.'}</Empty>}
      </div>
      {adding && <CallForm draft={adding === true ? null : adding} onClose={() => setAdding(null)} onSaved={refresh} />}
    </section>
  );
}
