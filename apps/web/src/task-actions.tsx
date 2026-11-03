import { useState } from 'react';
import { api, today } from './api';
import { useAllPeople } from './hooks';
import { FormModal, toast } from './ui';
import { EmailWindow } from './pages-ai';
import { openFollowUp } from './bus';

export type ActionKind = 'delegate' | 'reschedule' | 'complete' | 'email' | 'followup';
/** The hover actions on a task (Follow up, Delegate, Reschedule, Complete, Write email) — one place so every screen behaves the same. */
export function useTaskActions(onChanged: () => void) {
  const people = useAllPeople(); const [cur, setCur] = useState<{ kind: ActionKind; task: any } | null>(null);
  const act = async (kind: ActionKind, t: { id: string; title?: string; companyId?: string }) => {
    if (kind === 'followup') { openFollowUp({ taskId: t.id, title: t.title }); return; }
    if (kind === 'email') { setCur({ kind, task: t }); return; }
    try { setCur({ kind, task: await api<any>(`/tasks/${t.id}`) }); } catch (e: any) { toast(e.message); }
  };
  const done = () => { setCur(null); onChanged(); };
  const t = cur?.task;
  const node = <>
    {cur?.kind === 'delegate' && <FormModal title={`Delegate — ${t.title}`} submitLabel="Delegate" onClose={() => setCur(null)} initial={{ delegatedToId: t.delegatedToId ?? '', delegationInstructions: t.delegationInstructions ?? '' }}
      fields={[{ key: 'delegatedToId', label: 'Give it to', type: 'select', required: true, options: (people.data ?? []).map((p: any) => ({ value: p.id, label: p.name + (p.companyName ? ` (${p.companyName})` : '') })) }, { key: 'delegationInstructions', label: 'Instructions (optional)', type: 'textarea' }]}
      onSubmit={async (v) => { await api(`/tasks/${t.id}`, { method: 'PATCH', body: { expectedUpdatedAt: t.updatedAt, today: today(), delegatedToId: v.delegatedToId, delegationInstructions: v.delegationInstructions } }); toast('Delegated.'); done(); }} />}
    {cur?.kind === 'reschedule' && <FormModal title={`Reschedule — ${t.title}`} submitLabel="Move" onClose={() => setCur(null)} initial={{ dueDate: t.dueDate ?? '' }}
      fields={[{ key: 'dueDate', label: 'New due date', type: 'date', required: true }]}
      onSubmit={async (v) => { await api(`/tasks/${t.id}`, { method: 'PATCH', body: { expectedUpdatedAt: t.updatedAt, today: today(), dueDate: v.dueDate } }); toast('Due date changed.'); done(); }} />}
    {cur?.kind === 'complete' && <FormModal title={`Complete — ${t.title}`} submitLabel="Mark complete" onClose={() => setCur(null)} initial={{}}
      fields={[{ key: 'note', label: 'What was accomplished? (optional)', type: 'textarea' }]}
      onSubmit={async (v) => { await api(`/tasks/${t.id}/complete`, { method: 'POST', body: { note: v.note, today: today() } }); toast('Task completed.'); done(); }} />}
    {cur?.kind === 'email' && <EmailWindow link={{ type: 'TASK', id: t.id, title: t.title, companyId: t.companyId }} onClose={() => setCur(null)} />}
  </>;
  return { act, node };
}
