// Floating "+" button on every page: New task, New subtask, New project.
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, goto, today } from './api';
import { FormModal, toast, useApp, roleIn } from './ui';
import { Ic } from './icons';
import { openQuickAdd } from './bus';

const route = () => { const [p, a] = location.hash.slice(1).split('/'); return { page: p || 'home', arg: a || undefined }; };

export function Fab() {
  const { me, companyId } = useApp(); const qc = useQueryClient();
  const [open, setOpen] = useState(false); const [form, setForm] = useState<null | 'subtask' | 'project'>(null); const [r, setR] = useState(route());
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const h = () => { setR(route()); setOpen(false); }; addEventListener('hashchange', h); return () => removeEventListener('hashchange', h); }, []);
  useEffect(() => { const t = () => setOpen((o) => !o); addEventListener('cc-fab-toggle', t); return () => removeEventListener('cc-fab-toggle', t); }, []);
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); }; const m = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }; addEventListener('keydown', k); addEventListener('mousedown', m); return () => { removeEventListener('keydown', k); removeEventListener('mousedown', m); }; }, [open]);
  const writable = me.user.isAdmin ? me.memberships : me.memberships.filter((m) => roleIn(me, m.companyId) !== 'VIEWER');
  const onTask = r.page === 'tasks' && !!r.arg;
  const tasks = useQuery({ enabled: form === 'subtask' && !onTask, queryKey: ['fab-tasks', companyId], queryFn: () => api<{ items: any[] }>(`/tasks?completed=false&sort=title&limit=200${companyId ? `&companyId=${companyId}` : ''}`).then((x) => x.items) });
  const people = useQuery({ enabled: form === 'subtask', queryKey: ['fab-people'], queryFn: () => api<{ items: any[] }>('/people?limit=300').then((x) => x.items) });
  if (!writable.length) return null;
  const done = () => qc.invalidateQueries();
  return (
    <>
      {open && <div className="fab-scrim" onClick={() => setOpen(false)} />}
      <div className="fab" ref={ref} aria-label="Add">
        {open && <>
          <div className="fab-opt"><span className="fab-lab">New project</span><button className="fab-mini" aria-label="New project" onClick={() => { setOpen(false); setForm('project'); }}><Ic n="folder" s={20} /></button></div>
          <div className="fab-opt"><span className="fab-lab">{onTask ? 'New subtask (in this task)' : 'New subtask'}</span><button className="fab-mini" aria-label="New subtask" onClick={() => { setOpen(false); setForm('subtask'); }}><Ic n="sub" s={20} /></button></div>
          <div className="fab-opt"><span className="fab-lab">New task</span><button className="fab-mini" aria-label="New task" onClick={() => { setOpen(false); openQuickAdd({}); }}><Ic n="checkcircle" s={20} /></button></div>
        </>}
        <button className={'fab-main' + (open ? ' on' : '')} aria-label={open ? 'Close add menu' : 'Add task, subtask or project'} aria-expanded={open} title="Add" onClick={() => setOpen(!open)}><Ic n={open ? 'x' : 'plus'} s={26} /></button>
      </div>

      {form === 'project' && <FormModal wide title="New project" submitLabel="Create project" onClose={() => setForm(null)}
        initial={{ companyId: companyId || writable[0]?.companyId || '', name: '', description: '', targetDate: '', priority: '3' }}
        fields={[{ key: 'companyId', label: 'Company', type: 'select', required: true, options: writable.map((m) => ({ value: m.companyId, label: m.companyName })) },
          { key: 'name', label: 'Project name', type: 'text', required: true }, { key: 'description', label: 'What is it about?', type: 'textarea' },
          { key: 'priority', label: 'Priority', type: 'select', half: true, options: [{ value: 1, label: 'Critical' }, { value: 2, label: 'High' }, { value: 3, label: 'Medium' }, { value: 4, label: 'Low' }] },
          { key: 'targetDate', label: 'Target date', type: 'date', half: true }]}
        onSubmit={async (v) => { const p = await api<any>('/projects', { method: 'POST', body: { companyId: v.companyId, name: v.name, description: v.description || null, priority: Number(v.priority) || 3, targetDate: v.targetDate || null } }); setForm(null); toast('Project created.'); done(); goto('projects'); void p; }} />}

      {form === 'subtask' && <FormModal wide title={onTask ? 'New subtask in this task' : 'New subtask'} submitLabel="Add subtask" onClose={() => setForm(null)}
        initial={{ taskId: onTask ? r.arg : '', title: '', assigneeId: '', dueDate: '' }}
        fields={[...(onTask ? [] : [{ key: 'taskId', label: 'Which task?', type: 'select' as const, required: true, options: [{ value: '', label: tasks.isLoading ? 'Loading…' : 'Choose a task…' }, ...(tasks.data ?? []).map((t: any) => ({ value: t.id, label: `${t.title} — ${t.companyName}` }))] }]),
          { key: 'title', label: 'Subtask', type: 'text', required: true }, { key: 'assigneeId', label: 'Give it to', type: 'select', half: true, options: [{ value: '', label: 'Nobody yet' }, ...(people.data ?? []).map((p: any) => ({ value: p.id, label: p.name }))] },
          { key: 'dueDate', label: 'Due date', type: 'date', half: true }]}
        onSubmit={async (v) => { if (!v.taskId) throw new Error('Choose which task this belongs to'); await api(`/tasks/${v.taskId}/subtasks`, { method: 'POST', body: { title: v.title, assigneeId: v.assigneeId || null, dueDate: v.dueDate || null } }); setForm(null); toast('Subtask added.'); done(); if (!onTask) goto('tasks', v.taskId); }} />}
    </>
  );
}
void today;
