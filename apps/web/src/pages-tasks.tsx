import { Fragment, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, CHANNEL, diffDays, fileToBase64, fmtDate, fmtMinutes, fmtSize, fmtTime, goto, PRIORITY, PRIORITY_DOT, STATUS_LABEL, takeTasksFilter, today } from './api';
import { useAllPeople, useList, useProjectsOf } from './hooks';
import { Ic } from './icons';
import { initials } from './pages-team';
import { useTaskActions } from './task-actions';
import { openFollowUp } from './bus';
import { Badge, Empty, FormModal, Progress, toast, useApp, useConflict, roleIn, type Draft, type Field } from './ui';
import { useFocus } from './timer';
import { CallForm, CallRow } from './pages-calls';
import { DiscussionForm, DiscussionRow } from './pages-discussions';
import { FollowupForm, FollowupRow } from './pages-followups';
import { AiStatusCard, EmailWindow } from './pages-ai';
import { TaskReviews } from './pages-team';
import { NotesPanel, QuickProject, TaskNotesSection, offerMove } from './pages-v5';

const VIEWS = [
  { id: 'active', label: 'Active', params: () => ({ completed: 'false' }) }, { id: 'overdue', label: 'Overdue', params: () => ({ overdue: 'true' }) },
  { id: 'today', label: 'Due today', params: () => ({ completed: 'false', dueOn: today() }) }, { id: 'critical', label: 'Critical', params: () => ({ completed: 'false', priority: 1 }) },
  { id: 'high', label: 'High priority', params: () => ({ completed: 'false', maxPriority: 2 }) }, { id: 'delegated', label: 'Delegated', params: () => ({ delegated: 'true' }) },
  { id: 'waiting', label: 'Waiting', params: () => ({ waiting: 'true' }) }, { id: 'done', label: 'Completed', params: () => ({ completed: 'true' }) }, { id: 'archived', label: 'Archived', params: () => ({ archived: 'true', completed: 'all' }) },
] as const;
const SORTS = [['created', 'Newest first'], ['due', 'Due date'], ['priority', 'Priority'], ['person', 'Person (A–Z)'], ['title', 'Task name']] as const;
const REPEATS = [['NONE', 'Does not repeat'], ['DAILY', 'Daily'], ['WEEKLY', 'Weekly'], ['MONTHLY', 'Monthly'], ['QUARTERLY', 'Quarterly'], ['YEARLY', 'Yearly']] as const;

export function TaskForm({ task, companyId, onClose, onSaved, draft }: { task: any | null; companyId: string; onClose: () => void; onSaved: () => void; draft?: Draft | null }) {
  const { me } = useApp();
  const writable = me.memberships.filter((m) => m.role !== 'VIEWER');
  const start = draft?.data ?? (task ? { ...task, repeat: task.repeat ?? 'NONE', repeatEvery: task.repeatEvery ?? 1 } : { companyId: companyId || writable[0]?.companyId, priority: 3, status: 'TODO', repeat: 'NONE', repeatEvery: 1 });
  const [co, setCo] = useState<string>(start.companyId ?? companyId ?? writable[0]?.companyId);
  const projects = useProjectsOf(co); const people = useAllPeople();
  const siblings = useList('dep-options', '/tasks', { companyId: co, completed: 'all' }, !!co);
  const { guarded, node } = useConflict(onSaved);
  const [quick, setQuick] = useState<{ set: (v: any) => void; name?: string } | null>(null);
  const personOpts = (people.data ?? []).map((p) => ({ value: p.id, label: p.name + (p.companyId && p.companyId !== co ? ` (${p.companyName})` : p.companyId ? '' : ' (shared)') }));
  const fields = (v: any): Field[] => [
    ...(task ? [] : [{ key: 'companyId', label: 'Company', type: 'select' as const, required: true, options: writable.map((m) => ({ value: m.companyId, label: m.companyName })) }]),
    { key: 'title', label: 'Task', type: 'text', required: true },
    { key: 'projectId', label: 'Project', type: 'select', half: true, options: (projects.data ?? []).map((p) => ({ value: p.id, label: p.name })),
      ...(['MEMBER', 'MANAGER', 'ADMIN'].includes(roleIn(me, v.companyId ?? co ?? task?.companyId) ?? '') ? { action: { label: '＋ New project', onClick: (set: (x: any) => void) => setQuick({ set }) } } : {}) },
    { key: 'priority', label: 'Priority', type: 'select', required: true, half: true, options: [1, 2, 3, 4].map((n) => ({ value: n, label: `${PRIORITY_DOT[n]} ${PRIORITY[n]}` })) },
    { key: 'status', label: 'Status', type: 'select', required: true, half: true, options: Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label })) },
    { key: 'dueDate', label: 'Due date', type: 'date', half: true },
    { key: 'description', label: 'Description', type: 'textarea' },
    { key: 'delegatedToId', label: 'Delegated to (any company)', type: 'select', half: true, options: personOpts },
    { key: 'reviewerId', label: 'Reviewer', type: 'select', half: true, options: personOpts },
    { key: 'waitingFor', label: 'Waiting for', type: 'text', half: true }, { key: 'waitingExpectedDate', label: 'Expected by', type: 'date', half: true },
    { key: 'nextAction', label: 'Next action', type: 'text', half: true }, { key: 'nextFollowupDate', label: 'Next follow-up', type: 'date', half: true },
    { key: 'repeat', label: 'Repeats', type: 'select', required: true, half: true, options: REPEATS.map(([value, label]) => ({ value, label })) },
    ...(v.repeat && v.repeat !== 'NONE' ? [{ key: 'repeatEvery', label: 'Every (number)', type: 'number' as const, half: true, hint: 'The next one is created when you complete this one' }] : []),
    { key: 'dependsOnId', label: 'Blocked by (must finish first)', type: 'select', options: siblings.items.filter((t) => t.id !== task?.id && t.status !== 'DONE').map((t) => ({ value: t.id, label: t.title })) },
    ...(v.status === 'DONE' ? [{ key: 'completionNote', label: 'Completion note', type: 'textarea' as const }] : []),
  ];
  const submit = async (values: any) => {
    if (values.repeatEvery == null) delete values.repeatEvery;
    if (!task) { await api('/tasks', { method: 'POST', body: values }); toast('Task created.'); onSaved(); onClose(); return; }
    const { companyId: _c, ...rest } = values;
    await guarded((u) => api(`/tasks/${task.id}`, { method: 'PATCH', body: { expectedUpdatedAt: u ?? task.updatedAt, today: today(), ...rest } }).then(() => undefined));
    onClose();
  };
  return (<>
    <FormModal wide title={task ? 'Edit task' : 'New task'} fields={fields} initial={start} onSubmit={submit} onClose={onClose}
      draft={task ? undefined : { kind: 'task', title: (v) => v.title }} draftId={draft?.id}
      bulk={task ? undefined : { field: 'title', noun: 'task', create: async (lines, v) => { const { repeatEvery, ...rest } = v; if (!rest.companyId) throw new Error('Choose the company first, then paste the list.'); for (const l of lines) await api('/tasks', { method: 'POST', body: { ...rest, title: l, ...(rest.repeat && rest.repeat !== 'NONE' ? { repeatEvery: repeatEvery ?? 1 } : {}) } }); onSaved(); } }}
      onValues={(v) => v.companyId && v.companyId !== co && !task && setCo(v.companyId)} />
    {node}
    {quick && <QuickProject companyId={co ?? task?.companyId} onClose={() => setQuick(null)} onCreated={(p) => { quick.set(p.id); }} />}
  </>);
}

function Section({ title, children, count, actions }: { title: string; children: React.ReactNode; count?: number; actions?: React.ReactNode }) {
  return <div className="detail-section"><div className="section-head"><h4>{title}{count !== undefined && <span className="muted"> · {count}</span>}</h4>{actions}</div>{children}</div>;
}

const describe = (h: any) => {
  let d: any = null; try { d = h.detail ? JSON.parse(h.detail) : null; } catch { d = null; }
  const words = h.action.replaceAll('_', ' ').toLowerCase();
  switch (h.action) {
    case 'FOCUS_SESSION': return `focus session · ${d?.minutes ?? 0} min${d?.completed === false ? ' (stopped early)' : ''}${d?.note ? ` — “${d.note}”` : ''}`;
    case 'CALL_ADDED': return `${(CHANNEL[d?.channel] ?? CHANNEL.CALL).label.toLowerCase()} planned: ${d?.who ?? ''}${d?.note ? ` — ${d.note}` : ''}`;
    case 'CALL_DONE': return `${(CHANNEL[d?.channel] ?? CHANNEL.CALL).label.toLowerCase()} done: ${d?.who ?? ''}${d?.result ? ` — ${d.result}` : ''}`;
    case 'DISCUSSION_ADDED': return `${d?.kind === 'MEETING' ? 'meeting' : 'discussion'} planned with ${d?.who ?? ''}: ${d?.topic ?? ''}`;
    case 'DISCUSSION_DONE': return `discussed with ${d?.who ?? ''}: ${d?.topic ?? ''}${d?.decisions ? ` → ${d.decisions}` : ''}`;
    case 'ATTACHMENT_ADDED': return `file attached: ${d?.file ?? ''}`;
    case 'FOLLOWUP_LOGGED': return `follow-up logged${d?.who ? ` (${d.who})` : ''}${d?.next ? ` · next ${d.next}` : ''}`;
    case 'RECURRED': return `next occurrence created, due ${d?.due ?? ''}`;
    case 'COMMENT_ADDED': return `note: ${h.detail ?? ''}`;
    case 'IMPORTED': return 'imported from the old prototype';
    default: return h.auto ? `${words} (automatic)` : words;
  }
};

function Attachments({ taskId, subtasks, canWrite, onChanged }: { taskId: string; subtasks: any[]; canWrite: boolean; onChanged: () => void }) {
  const q = useQuery({ queryKey: ['attachments', taskId], queryFn: () => api<{ items: any[] }>(`/tasks/${taskId}/attachments`).then((r) => r.items) });
  const [target, setTarget] = useState(''); const [busy, setBusy] = useState(false); const input = useRef<HTMLInputElement>(null);
  const upload = async (files: FileList | null) => {
    if (!files?.length) return; setBusy(true);
    try { for (const f of Array.from(files)) {
      if (f.size > 15 * 1024 * 1024) { toast(`“${f.name}” is over 15 MB and was skipped.`); continue; }
      await api(`/tasks/${taskId}/attachments`, { method: 'POST', body: { fileName: f.name, mimeType: f.type || 'application/octet-stream', dataBase64: await fileToBase64(f), subtaskId: target || null } }); }
      onChanged(); } catch (e: any) { toast(e.message); } finally { setBusy(false); if (input.current) input.current.value = ''; }
  };
  return (
    <Section title="Attachments" count={q.data?.length}>
      <ul className="files">{q.data?.map((a) => (
        <li key={a.id}><a href={`/api/v1/attachments/${a.id}/download`}>{a.fileName}</a> <small className="muted">{fmtSize(a.sizeBytes)}{a.subtaskTitle ? ` · on subtask “${a.subtaskTitle}”` : ''} · {fmtDate(a.createdAt)}</small>
          {canWrite && <button className="ghost small" aria-label="Remove file" onClick={() => confirm('Remove this attachment from the task? (The file is kept in storage.)') && api(`/attachments/${a.id}/archive`, { method: 'POST' }).then(onChanged)}>✕</button>}</li>))}</ul>
      {q.data && !q.data.length && <p className="muted">No files attached.</p>}
      {canWrite && <div className="inline">
        <select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Attach to"><option value="">To the task</option>{subtasks.map((s) => <option key={s.id} value={s.id}>To subtask: {s.title}</option>)}</select>
        <input ref={input} type="file" multiple disabled={busy} onChange={(e) => upload(e.target.files)} aria-label="Choose files" />
      </div>}
      {busy && <p className="muted">Uploading…</p>}
    </Section>
  );
}

export function TaskDetail({ id, onClose, onChanged, page }: { id: string; onClose: () => void; onChanged: () => void; page?: boolean }) {
  const { me } = useApp(); const qc = useQueryClient(); const focus = useFocus();
  const task = useQuery({ queryKey: ['task', id], queryFn: () => api<any>(`/tasks/${id}`) });
  const subs = useQuery({ queryKey: ['subtasks', id], queryFn: () => api<{ items: any[] }>(`/tasks/${id}/subtasks`).then((r) => r.items) });
  const notes = useQuery({ queryKey: ['comments', id], queryFn: () => api<{ items: any[] }>(`/comments?entityType=TASK&entityId=${id}&includeSubtasks=true`).then((r) => r.items) });
  const hist = useQuery({ queryKey: ['history', id], queryFn: () => api<{ items: any[] }>(`/tasks/${id}/history`).then((r) => r.items) });
  const calls = useQuery({ queryKey: ['calls-of', id], queryFn: () => api<{ items: any[] }>(`/calls?taskId=${id}&status=all`).then((r) => r.items) });
  const discs = useQuery({ queryKey: ['discs-of', id], queryFn: () => api<{ items: any[] }>(`/discussions?taskId=${id}&status=all`).then((r) => r.items) });
  const fus = useQuery({ queryKey: ['followups-of', id], queryFn: () => api<{ items: any[] }>(`/tasks/${id}/followups`).then((r) => r.items) });
  const fsum = useQuery({ queryKey: ['focus', id], queryFn: () => api<any>(`/tasks/${id}/focus`) });
  const people = useAllPeople();
  const [editing, setEditing] = useState(false); const [note, setNote] = useState(''); const [err, setErr] = useState('');
  const [addingSub, setAddingSub] = useState(false); const [subKey, setSubKey] = useState(0);
  const [completing, setCompleting] = useState(false); const [callFor, setCallFor] = useState<string | null | false>(false); const [discFor, setDiscFor] = useState<string | null | false>(false);
  const [editSub, setEditSub] = useState<any>(null); const [followup, setFollowup] = useState(false); const [fuSub, setFuSub] = useState<any>(null);
  const [notesFor, setNotesFor] = useState<{ id: string; title: string } | null>(null); const [subProject, setSubProject] = useState<string | null>(null);
  const [leavingSub, setLeavingSub] = useState<string | null>(null); const [email, setEmail] = useState(false);
  const t = task.data; const role = t ? roleIn(me, t.companyId) : null; const canWrite = !!role && role !== 'VIEWER';
  const reload = () => { qc.invalidateQueries(); onChanged(); };
  const run = async (fn: () => Promise<any>) => { setErr(''); try { await fn(); reload(); } catch (e: any) { setErr(e.message); } };
  const { setCompanyId } = useApp(); const acts = useTaskActions(reload); const [menu, setMenu] = useState(false); const [moving, setMoving] = useState(false); const [newSub, setNewSub] = useState({ title: '', assigneeId: '', dueDate: '' }); const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!menu) return; const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false); }; addEventListener('mousedown', h); return () => removeEventListener('mousedown', h); }, [menu]);
  const projects = useProjectsOf(t?.companyId);
  if (!t) return page ? <div className="muted">Loading…</div> : <aside className="drawer"><div className="drawer-body">Loading…</div></aside>;
  const overdue = t.dueDate && t.dueDate < today() && t.status !== 'DONE';
  const open = !t.archivedAt && t.status !== 'DONE';
  const pending = calls.data?.filter((c) => !c.doneAt) ?? []; const doneCalls = calls.data?.filter((c) => c.doneAt) ?? [];
  const pendDisc = discs.data?.filter((c) => !c.doneAt) ?? []; const doneDisc = discs.data?.filter((c) => c.doneAt) ?? [];
  const openSubs = subs.data?.filter((s) => s.status !== 'DONE') ?? [];
  const pendFu = fus.data?.filter((f) => !f.doneAt) ?? []; const doneFu = fus.data?.filter((f) => f.doneAt) ?? [];
  const personName = (p: any) => p.name + (p.companyName ? ` (${p.companyName})` : '');
  const subTotal = subs.data?.length ?? 0; const subDone = subs.data?.filter((s) => s.status === 'DONE').length ?? 0;
  const od = t.dueDate && t.status !== 'DONE' ? diffDays(t.dueDate, today()) : 0;
  const metaDue = t.status === 'DONE' ? (t.completedAt ? `Completed ${fmtDate(t.completedAt.slice(0, 10))}` : 'Completed') : od > 0 ? `Overdue ${od} day${od === 1 ? '' : 's'} · was due ${fmtDate(t.dueDate)}` : t.dueDate ? (od === 0 ? 'Due today' : `Due ${fmtDate(t.dueDate)}`) : 'No due date';
  const writeOk = canWrite && !t.archivedAt;
  const addSub = async () => { if (!newSub.title.trim()) return; await run(async () => { await api(`/tasks/${id}/subtasks`, { method: 'POST', body: { title: newSub.title.trim(), assigneeId: newSub.assigneeId || null, dueDate: newSub.dueDate || null } }); setNewSub({ title: '', assigneeId: '', dueDate: '' }); }); };
  const duplicate = async () => {
    try { const c = await api<any>('/tasks', { method: 'POST', body: { companyId: t.companyId, projectId: t.projectId, title: `${t.title} (copy)`, priority: t.priority, status: 'TODO', dueDate: t.dueDate, description: t.description, delegatedToId: t.delegatedToId } });
      if (subs.data?.length) await api(`/tasks/${c.id}/subtasks/bulk`, { method: 'POST', body: { items: subs.data.map((s) => ({ title: s.title, dueDate: s.dueDate, assigneeId: s.assigneeId, priority: s.priority })) } });
      toast('Duplicated.'); reload(); goto('tasks', c.id); } catch (e: any) { toast(e.message); }
  };
  const body = (<>
    {page && <div className="crumbs"><button onClick={() => { setCompanyId(t.companyId); goto('home'); }}>{t.companyName}</button>{t.projectName && <><Ic n="right" s={12} /><button onClick={() => goto('projects')}>{t.projectName}</button></>}<Ic n="right" s={12} /><span>{t.title}</span></div>}
    {page ? <h1 className="ts-title">{t.title}</h1> : <div className="drawer-head" style={{ padding: 0, border: 0 }}><div><small className="muted">{t.companyName}{t.projectName ? ` › ${t.projectName}` : ''}</small><h3>{t.title}</h3></div><button className="icon" aria-label="Close" onClick={onClose}><Ic n="x" /></button></div>}
    <div className="ts-meta">
      <span className={od > 0 ? 'red-text' : ''}>{metaDue}</span>
      <span className={'chip ' + (t.priority === 1 ? 'red' : t.priority === 2 ? 'amber' : '')}>{PRIORITY[t.priority]} priority</span>
      <span>Owner: {t.ownerId === me.user.id ? 'You' : t.ownerName}</span>
      {t.delegatedToName && <span>With: {t.delegatedToName}</span>}
      <span>Started {fmtDate(t.createdAt.slice(0, 10))}{t.focusMinutes > 0 ? ` · ${fsum.data?.sessionCount ?? ''} focus session${fsum.data?.sessionCount === 1 ? '' : 's'} (${fmtMinutes(t.focusMinutes)})` : ''}</span>
      <Badge tone={t.status === 'DONE' ? 'green' : t.status === 'WAITING' ? 'amber' : 'blue'}>{STATUS_LABEL[t.status]}</Badge>
      {t.blocked && <span className="chip red">Blocked</span>}{t.archivedAt && <span className="chip">Archived</span>}{t.repeat && <span className="chip teal">Repeats {t.repeat.toLowerCase()}</span>}{t.postponeCount > 0 && <span className="chip amber">Postponed {t.postponeCount}×</span>}
    </div>
    {(t.waitingFor || t.nextAction || t.nextFollowupDate || t.completionNote) && <p className="muted" style={{ marginTop: -6, marginBottom: 12 }}>{t.waitingFor ? `Waiting for ${t.waitingFor}${t.waitingExpectedDate ? ` (by ${fmtDate(t.waitingExpectedDate)})` : ''}. ` : ''}{t.nextAction || t.nextFollowupDate ? `Next: ${t.nextAction ?? ''}${t.nextFollowupDate ? ` · follow up ${fmtDate(t.nextFollowupDate)}` : ''}. ` : ''}{t.completionNote ? `Note: ${t.completionNote}` : ''}</p>}
    {err && <p className="error">{err}</p>}
    {writeOk && (
      <div className="ts-actions">
        {open && <button className="primary" onClick={() => focus.start({ taskId: id, title: t.title })}><Ic n="play" s={14} />Focus 25 min</button>}
        {open && <button onClick={() => openFollowUp({ taskId: id, title: t.title, personId: t.delegatedToId })}><Ic n="message" />Follow up</button>}
        {open && <button onClick={() => acts.act('delegate', t)}><Ic n="user" />Delegate</button>}
        {open && <button onClick={() => acts.act('reschedule', t)}><Ic n="calendar" />Reschedule</button>}
        <button onClick={() => setEmail(true)}><Ic n="mail" />Write email</button>
        {open ? <button onClick={() => setCompleting(true)}><Ic n="check" />Complete</button> : <button onClick={() => run(() => api(`/tasks/${id}/reopen`, { method: 'POST' }))}><Ic n="undo" />Reopen</button>}
        <div className="menu-wrap" ref={menuRef}><button onClick={() => setMenu(!menu)} aria-expanded={menu}>More <Ic n="down" s={14} /></button>
          {menu && <div className="menu-pop card" onClick={() => setMenu(false)}>
            <button onClick={() => setMoving(true)}><Ic n="folder" />Move to project</button><button onClick={() => setSubProject('')}><Ic n="plus" />Create new project</button>
            <button onClick={() => setCallFor(null)}><Ic n="phone" />Link a call</button><button onClick={() => setDiscFor(null)}><Ic n="users" />Discuss / meeting</button><button onClick={() => goto('chat', 'task:' + id)}><Ic n="message" />Task chat</button><button onClick={() => setEditing(true)}><Ic n="pencil" />Edit task details</button><hr />
            <button onClick={duplicate}><Ic n="copy" />Duplicate</button><button onClick={() => confirm('Archive this task? It can be restored later.') && run(() => api(`/tasks/${id}/archive`, { method: 'POST' }))}><Ic n="archive" />Archive</button>
            <button className="danger" onClick={() => confirm('Delete this task? It is archived, not erased, and can be restored from Tasks › Archived.') && run(() => api(`/tasks/${id}/archive`, { method: 'POST' }).then(() => goto('home')))}><Ic n="trash" />Delete</button></div>}</div>
      </div>)}
    {canWrite && t.archivedAt && <div className="ts-actions"><button onClick={() => run(() => api(`/tasks/${id}/restore`, { method: 'POST' }))}><Ic n="undo" />Restore</button></div>}
    {t.description && <p className="desc" style={{ marginBottom: 12 }}>{t.description}</p>}

    <AiStatusCard type="TASK" id={id} record={t} canEdit={!!canWrite} projectExcluded={!!t.projectAiExcluded} onDraftEmail={() => setEmail(true)} onChanged={reload} />

    <section className="ts-section">
      <header><h3>Subtasks</h3><div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><span className="muted" style={{ fontSize: 13 }}>{subDone} of {subTotal} done</span><div className="progress2" style={{ width: '7rem' }} title={`${subDone} of ${subTotal} done`}><i style={{ width: subTotal ? `${Math.round((subDone / subTotal) * 100)}%` : '0%' }} /></div></div></header>
      {subs.data?.map((s) => { const isDone = s.status === 'DONE'; const od2 = s.dueDate && !isDone ? diffDays(s.dueDate, today()) : 0; const fu = (fus.data ?? []).filter((f: any) => f.subtaskId === s.id && !f.doneAt);
        return (
          <div key={s.id} className={'sub2' + (isDone ? ' done' : '') + (leavingSub === s.id ? ' tick' : '')}>
            <input className="cb" type="checkbox" aria-label={isDone ? 'Reopen subtask' : 'Mark subtask done'} disabled={!writeOk} checked={isDone}
              onChange={() => { setLeavingSub(s.id); run(() => api(`/subtasks/${s.id}`, { method: 'PATCH', body: { expectedUpdatedAt: s.updatedAt, status: isDone ? 'TODO' : 'DONE' } })).then(() => setLeavingSub(null)); }} />
            <div className="stitle"><span>{s.title}</span>{isDone ? <small className="muted" style={{ display: 'block' }}>Done{s.completedAt ? ` ${fmtDate(s.completedAt.slice(0, 10))}` : ''}{s.assigneeName ? ` · ticked for ${s.assigneeName}` : ''}</small>
              : fu.length > 0 ? <small className="muted" style={{ display: 'block' }}>Follow-up planned {fmtDate(fu[0].dueDate)}</small> : null}</div>
            <span className="who">{s.assigneeName ? <><span className="ini">{initials(s.assigneeName)}</span>{s.assigneeName}</> : <span className="muted">Unassigned</span>}</span>
            {s.dueDate && <span className={'chip ' + (od2 > 0 ? 'red' : isDone ? '' : od2 === 0 ? 'amber' : '')}>{isDone ? fmtDate(s.dueDate) : od2 > 0 ? `Overdue ${od2} day${od2 === 1 ? '' : 's'}` : od2 === 0 ? 'Today' : `Due ${fmtDate(s.dueDate)}`}</span>}
            {writeOk && <span className="sub-extra">
              {!isDone && <button className="small" title={`Remind ${s.assigneeName ?? 'them'} about this subtask`} onClick={() => openFollowUp({ taskId: id, subtaskId: s.id, personId: s.assigneeId, title: s.title })}><Ic n="message" s={13} />Follow up</button>}
              {!isDone && <button className="ibtn" title="Focus on this subtask" aria-label="Focus" onClick={() => focus.start({ taskId: id, subtaskId: s.id, title: `${t.title} › ${s.title}` })}><Ic n="play" s={14} /></button>}
              <button className="ibtn" title="Call / mail about this subtask" aria-label="Call" onClick={() => setCallFor(s.id)}><Ic n="phone" s={14} /></button>
              <button className="ibtn" title="Discuss / meeting about this subtask" aria-label="Discuss" onClick={() => setDiscFor(s.id)}><Ic n="message" s={14} /></button>
              <button className="ibtn" title="Notes for this subtask" aria-label="Notes" onClick={() => setNotesFor({ id: s.id, title: s.title })}><Ic n="file" s={14} /></button>
              <button className="ibtn" title="Edit (due date, person…)" aria-label="Edit" onClick={() => setEditSub(s)}><Ic n="pencil" s={14} /></button>
              <button className="ibtn" aria-label="Archive subtask" title="Remove" onClick={() => run(() => api(`/subtasks/${s.id}/archive`, { method: 'POST' }))}><Ic n="x" s={14} /></button></span>}
          </div>); })}
      {!subTotal && <p className="muted">No subtasks yet. Break the work into steps and give each to a person.</p>}
      {writeOk && <div className="subadd"><input type="text" placeholder="New subtask" aria-label="New subtask" value={newSub.title} onChange={(e) => setNewSub({ ...newSub, title: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && addSub()} />
        <select aria-label="Assign to" value={newSub.assigneeId} onChange={(e) => setNewSub({ ...newSub, assigneeId: e.target.value })}><option value="">Assign to</option>{(people.data ?? []).map((p: any) => <option key={p.id} value={p.id}>{personName(p)}</option>)}</select>
        <input type="date" aria-label="Due date" value={newSub.dueDate} onChange={(e) => setNewSub({ ...newSub, dueDate: e.target.value })} /><button className="primary" disabled={!newSub.title.trim()} onClick={addSub}>Add</button>
        <button className="ghost small" title="Paste a list, add details" onClick={() => setAddingSub(true)}>More options</button></div>}
    </section>

    <section className="ts-section"><header><h3>Working notes</h3></header><TaskNotesSection taskId={id} canWrite={writeOk} /></section>

    <section className="ts-section">
      <header><h3>Activity &amp; follow-ups</h3></header>
      <ul className="timeline">{[...(hist.data ?? []).map((h) => ({ at: h.createdAt, kind: h.action.replaceAll('_', ' ').toLowerCase(), text: describe(h), by: h.userName }))].sort((x, y) => y.at.localeCompare(x.at)).slice(0, 30).map((h, i) => <li key={i}><span className="muted">{fmtDate(h.at.slice(0, 10)).replace(/ \d{4}$/, '')}</span><span className="k">{h.kind.replace(/^./, (c: string) => c.toUpperCase())}</span><span>{h.text}{h.by ? <small className="muted"> · {h.by}</small> : ''}</span></li>)}</ul>
      {!hist.data?.length && <p className="muted">Nothing yet.</p>}
    </section>

    <section className="ts-section">
      <header><h3>Follow-ups</h3>{writeOk && <button className="small" onClick={() => setFollowup(true)}><Ic n="plus" s={13} />Plan one</button>}</header>
      <ul className="calls">{pendFu.map((f) => <FollowupRow key={f.id} f={f} onChanged={reload} />)}</ul>{!pendFu.length && <p className="muted">No follow-ups planned.</p>}
      {doneFu.length > 0 && <details><summary className="muted">Done ({doneFu.length})</summary><ul className="calls">{doneFu.map((f) => <FollowupRow key={f.id} f={f} onChanged={reload} />)}</ul></details>}
    </section>

    <section className="ts-section">
      <header><h3>Calls &amp; mails to do</h3>{writeOk && <button className="small" onClick={() => setCallFor(null)}><Ic n="plus" s={13} />Add</button>}</header>
      <ul className="calls">{pending.map((c) => <CallRow key={c.id} c={c} onChanged={reload} />)}</ul>{!pending.length && <p className="muted">Nothing pending.</p>}
      {doneCalls.length > 0 && <details><summary className="muted">Done ({doneCalls.length})</summary><ul className="calls">{doneCalls.map((c) => <CallRow key={c.id} c={c} onChanged={reload} />)}</ul></details>}
    </section>

    <section className="ts-section">
      <header><h3>Discussions &amp; meetings</h3>{writeOk && <button className="small" onClick={() => setDiscFor(null)}><Ic n="plus" s={13} />Add</button>}</header>
      <ul className="calls">{pendDisc.map((d) => <DiscussionRow key={d.id} d={d} onChanged={reload} />)}</ul>{!pendDisc.length && <p className="muted">Nothing to discuss.</p>}
      {doneDisc.length > 0 && <details><summary className="muted">Decided ({doneDisc.length})</summary><ul className="calls">{doneDisc.map((d) => <DiscussionRow key={d.id} d={d} onChanged={reload} />)}</ul></details>}
    </section>

    <TaskReviews taskId={id} />
    <Attachments taskId={id} subtasks={subs.data ?? []} canWrite={writeOk} onChanged={reload} />

    <section className="ts-section">
      <header><h3>Notes</h3></header>
      {notes.data?.map((c) => <div className="comment" key={c.id}><b>{c.authorName}</b> <small className="muted">{fmtTime(c.createdAt)}{c.subtaskTitle ? ` · on subtask “${c.subtaskTitle}”` : ''}</small><p>{c.body}</p></div>)}
      {canWrite && <form className="inline" onSubmit={(e) => { e.preventDefault(); if (note.trim()) run(async () => { await api('/comments', { method: 'POST', body: { entityType: 'TASK', entityId: id, body: note.trim() } }); setNote(''); }); }}>
        <input placeholder="Add a note (permanent)…" value={note} onChange={(e) => setNote(e.target.value)} /><button className="ghost">Post</button></form>}
      <p className="muted fine">Call/mail feedback and discussion decisions are added here automatically.</p>
    </section>
  </>);
  return (
    <>
      {page ? <div className="ts-main">{body}</div> : <aside className="drawer"><div className="drawer-body">{body}</div></aside>}
      {acts.node}
      {moving && <FormModal title="Move to project" submitLabel="Move" onClose={() => setMoving(false)} initial={{ projectId: t.projectId ?? '' }} fields={[{ key: 'projectId', label: 'Project', type: 'select', options: (projects.data ?? []).map((p: any) => ({ value: p.id, label: p.name })) }]}
        onSubmit={async (v) => { await api(`/tasks/${id}`, { method: 'PATCH', body: { expectedUpdatedAt: t.updatedAt, today: today(), projectId: v.projectId } }); setMoving(false); toast('Moved.'); reload(); }} />}
      {editing && <TaskForm task={t} companyId={t.companyId} onClose={() => setEditing(false)} onSaved={reload} />}
      {completing && <FormModal title="Complete task" submitLabel="Mark complete" fields={[{ key: 'note', label: 'What was accomplished? (optional)', type: 'textarea' }]} initial={{}}
        onSubmit={async (v) => { await api(`/tasks/${id}/complete`, { method: 'POST', body: { note: v.note, today: today() } }); setCompleting(false); toast('Task completed.'); reload(); }} onClose={() => setCompleting(false)} />}
      {addingSub && <FormModal key={subKey} wide title={`Add subtask — ${t.title}`} submitLabel="Add subtask" onClose={() => setAddingSub(false)}
        initial={{ title: '', description: '', dueDate: '', assigneeId: '', priority: 3, another: false }}
        fields={[{ key: 'title', label: 'Subtask', type: 'textarea', required: true, hint: 'Write it in full. Pasting a list from Word? You’ll be offered to create one subtask per line.', action: (['MEMBER', 'MANAGER', 'ADMIN'].includes(roleIn(me, t.companyId) ?? '')) ? { label: '＋ Create project from this subtask', onClick: (_set: any, vals: any) => setSubProject(vals.title ?? '') } : undefined },
          { key: 'description', label: 'Details (optional)', type: 'textarea' },
          { key: 'dueDate', label: 'Due date', type: 'date', half: true },
          { key: 'priority', label: 'Priority', type: 'select', required: true, half: true, options: [1, 2, 3, 4].map((n) => ({ value: n, label: `${PRIORITY_DOT[n]} ${PRIORITY[n]}` })) },
          { key: 'assigneeId', label: 'Assign to (can differ from the task’s person)', type: 'select', options: (people.data ?? []).map((p) => ({ value: p.id, label: personName(p) })) },
          { key: 'another', label: 'Add another subtask after this one', type: 'checkbox' }]}
        bulk={{ field: 'title', noun: 'subtask', create: async (lines, v) => { await api(`/tasks/${id}/subtasks/bulk`, { method: 'POST', body: { items: lines.map((title) => ({ title, dueDate: v.dueDate, assigneeId: v.assigneeId, priority: v.priority })) } }); reload(); } }}
        onSubmit={async (v) => {
          await api(`/tasks/${id}/subtasks`, { method: 'POST', body: { title: v.title, description: v.description, dueDate: v.dueDate, assigneeId: v.assigneeId, priority: v.priority } });
          reload();
          if (v.another) { setSubKey((k) => k + 1); toast('Subtask added — add the next one.'); } else setAddingSub(false);
        }} />}
      {callFor !== false && <CallForm taskId={id} subtaskId={callFor} subtasks={openSubs} onClose={() => setCallFor(false)} onSaved={reload} />}
      {discFor !== false && <DiscussionForm taskId={id} subtaskId={discFor} subtasks={openSubs} onClose={() => setDiscFor(false)} onSaved={reload} />}
      {email && <EmailWindow link={{ type: 'TASK', id, title: t.title, companyId: t.companyId }} onClose={() => setEmail(false)} />}
      {notesFor && <NotesPanel taskId={id} subtaskId={notesFor.id} subtaskTitle={notesFor.title} onClose={() => setNotesFor(null)} />}
      {subProject !== null && <QuickProject companyId={t.companyId} name={subProject} onClose={() => setSubProject(null)} onCreated={async (p) => { try { await offerMove(t, p); } catch (e: any) { toast(e.message); } reload(); }} />}
      {followup && <FollowupForm taskId={id} onClose={() => setFollowup(false)} onSaved={reload} />}
      {fuSub && <FollowupForm taskId={id} subtask={{ id: fuSub.id, title: fuSub.title, assigneeId: fuSub.assigneeId }} onClose={() => setFuSub(null)} onSaved={reload} />}
      {editSub && <FormModal wide title="Edit subtask" initial={{ title: editSub.title, description: editSub.description ?? '', dueDate: editSub.dueDate ?? '', assigneeId: editSub.assigneeId ?? '', priority: editSub.priority }} onClose={() => setEditSub(null)}
        fields={[{ key: 'title', label: 'Subtask', type: 'textarea', required: true, action: (['MEMBER', 'MANAGER', 'ADMIN'].includes(roleIn(me, t.companyId) ?? '')) ? { label: '＋ Create project from this subtask', onClick: (_set: any, vals: any) => setSubProject(vals.title ?? '') } : undefined }, { key: 'description', label: 'Details (optional)', type: 'textarea' }, { key: 'dueDate', label: 'Due date', type: 'date', half: true },
          { key: 'priority', label: 'Priority', type: 'select', required: true, half: true, options: [1, 2, 3, 4].map((n) => ({ value: n, label: `${PRIORITY_DOT[n]} ${PRIORITY[n]}` })) },
          { key: 'assigneeId', label: 'Assigned to (can differ from the task’s person)', type: 'select', options: (people.data ?? []).map((p) => ({ value: p.id, label: personName(p) })) }]}
        onSubmit={async (v) => { await api(`/subtasks/${editSub.id}`, { method: 'PATCH', body: { expectedUpdatedAt: editSub.updatedAt, ...v } }); setEditSub(null); reload(); }} />}
    </>
  );
}

export function Tasks() {
  const { me, companyId, arg, resume, setResume } = useApp(); const qc = useQueryClient();
  const [view, setView] = useState<(typeof VIEWS)[number]['id']>('active'); const [sort, setSort] = useState<(typeof SORTS)[number][0]>('created');
  const [q, setQ] = useState(''); const [projectId, setProjectId] = useState(''); const [involvedId, setInvolvedId] = useState('');
  const [open, setOpen] = useState<string | null>(arg ?? null); const [creating, setCreating] = useState<Draft | true | null>(resume?.kind === 'task' ? resume : null);
  useEffect(() => { setOpen(arg ?? null); }, [arg]);
  useEffect(() => { if (resume?.kind === 'task') setResume(null); }, []);
  // A card on Home can hand over a filter (e.g. "Overdue", "High priority").
  useEffect(() => { const apply = () => { const f = takeTasksFilter(); if (f?.view && VIEWS.some((v) => v.id === f.view)) setView(f.view); if (f?.sort) setSort(f.sort); }; apply(); addEventListener('cc-tasks-filter', apply); return () => removeEventListener('cc-tasks-filter', apply); }, []);
  const projects = useProjectsOf(companyId); const people = useAllPeople();
  const params = { ...VIEWS.find((v) => v.id === view)!.params(), companyId, projectId, involvedId, q, sort };
  const list = useList('tasks', '/tasks', params);
  const refresh = () => qc.invalidateQueries();
  const canCreate = me.memberships.some((m) => m.role !== 'VIEWER');
  const byPerson = sort === 'person';
  const rail = useQuery({ queryKey: ['rail', companyId], enabled: !!open, queryFn: () => api<any>(`/attention?today=${today()}&limit=14${companyId ? `&companyId=${companyId}` : ''}`).then((r) => r.items as any[]) });
  if (open) return (
    <section>
      <div className="ts-layout">
        <aside className="ts-rail"><h4>My Attention</h4>{rail.data?.map((x) => { const n = x.dueDate && x.status !== 'DONE' ? diffDays(x.dueDate, today()) : null; return <button key={x.id} className={'rail-item' + (x.id === open ? ' on' : '')} onClick={() => goto('tasks', x.id)}><span className="t">{x.title}</span><small style={{ color: n != null && n > 0 ? 'var(--red)' : n === 0 ? 'var(--amber)' : 'var(--muted)' }}>{n == null ? '' : n > 0 ? 'Overdue' : n === 0 ? 'Today' : fmtDate(x.dueDate).replace(/ \d{4}$/, '')}</small></button>; })}<button className="ghost small" onClick={() => goto('home')}>Back to Today</button></aside>
        <div><TaskDetail page key={open} id={open} onClose={() => goto('tasks')} onChanged={refresh} /></div>
      </div>
    </section>);
  return (
    <section>
      <div className="page-head"><div><h2>Tasks</h2><p className="muted">Everything you are tracking, across companies. For a board view use Kanban.</p></div>{canCreate && <button id="new-task-btn" className="primary" onClick={() => setCreating(true)}>+ Task</button>}</div>
      {!canCreate && <p className="notice">{me.memberships.length === 0 ? 'Create a company first (Companies → + New company), then you can add tasks here.' : 'You have view-only access to your companies, so you cannot add tasks.'}</p>}
      <div className="tabs" role="tablist">{VIEWS.map((v) => <button key={v.id} role="tab" aria-selected={view === v.id} className={view === v.id ? 'on' : ''} onClick={() => setView(v.id)}>{v.label}</button>)}</div>
      <div className="toolbar">
        <input className="search" placeholder="Search tasks…" value={q} onChange={(e) => setQ(e.target.value)} />
        {companyId && <select value={projectId} onChange={(e) => setProjectId(e.target.value)}><option value="">All projects</option>{projects.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
        <select value={involvedId} onChange={(e) => setInvolvedId(e.target.value)} aria-label="Person"><option value="">Anyone</option>{people.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <label className="inline-label">Sort by <select value={sort} onChange={(e) => setSort(e.target.value as any)}>{SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      </div>
      <div className="card table-wrap">
        <table>
          <thead><tr><th /><th>Task</th><th>Company / project</th><th>Assigned to</th><th>Due</th><th>Status</th><th>Progress</th></tr></thead>
          <tbody>{list.items.map((t, i) => {
            const overdue = t.dueDate && t.dueDate < today() && t.status !== 'DONE';
            const header = byPerson && (i === 0 || list.items[i - 1].delegatedToName !== t.delegatedToName);
            const count = byPerson ? list.items.filter((x) => x.delegatedToName === t.delegatedToName).length : 0;
            return (
              <Fragment key={t.id}>
                {header && <tr className="group-row"><td colSpan={7}>{t.delegatedToName ? `${t.delegatedToName}` : 'Not delegated (yours)'} <span className="muted">· {count}{list.hasNextPage ? '+' : ''} task{count === 1 ? '' : 's'}</span></td></tr>}
                <tr className={'clickable row-in' + (t.archivedAt ? ' archived' : '') + (open === t.id ? ' selected' : '')} onClick={() => goto('tasks', t.id)}>
                  <td title={PRIORITY[t.priority]}>{PRIORITY_DOT[t.priority]}</td>
                  <td><b>{t.title}</b>{t.blocked && <Badge tone="red">Blocked</Badge>}{t.repeat && <Badge tone="blue">↻</Badge>}</td>
                  <td><span className="muted">{t.companyName}</span>{t.projectName ? <><br /><small>{t.projectName}</small></> : null}</td>
                  <td>{t.delegatedToName ?? <span className="muted">{t.ownerName}</span>}</td>
                  <td className={overdue ? 'red-text' : ''}>{fmtDate(t.dueDate)}</td>
                  <td><Badge tone={t.status === 'DONE' ? 'green' : t.status === 'WAITING' ? 'amber' : t.status === 'DELEGATED' ? 'blue' : 'grey'}>{STATUS_LABEL[t.status]}</Badge></td>
                  <td style={{ width: '6.875rem' }}><Progress value={t.progress} /></td>
                </tr></Fragment>);
          })}</tbody>
        </table>
        {!list.isLoading && !list.items.length && <Empty>No tasks here. {canCreate && view === 'active' ? 'Create one with “+ Task”, or load the demo data from Settings.' : ''}</Empty>}
        {list.hasNextPage && <button className="ghost more" onClick={() => list.fetchNextPage()}>Load more</button>}
      </div>
      {creating && <TaskForm task={null} draft={creating === true ? null : creating} companyId={companyId} onClose={() => setCreating(null)} onSaved={refresh} />}
    </section>
  );
}
