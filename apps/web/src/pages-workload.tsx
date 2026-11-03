import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, diffDays, downloadFile, goto, today } from './api';
import { Empty, Modal, toast, useApp } from './ui';
import { Avatar } from './pages-team';
import { Ic, CoDot, companyColor } from './icons';
import { Chip } from './pages-today';
import { openFollowUp, openWhatsApp } from './bus';

type Item = { key: string; kind: 'Task' | 'Subtask' | 'Follow-up'; title: string; sub: string; taskId: string; subtaskId?: string | null; dueDate: string | null; overdue: boolean; companyId: string; companyName: string };
const rank = (i: Item) => (i.overdue ? 0 : i.dueDate === today() ? 1 : 2);

/** People tab: tick one or more people to see everything pending with them across companies — overdue first — with Follow up and WhatsApp on each row. */
export function Workload() {
  const { me, companyId } = useApp();
  const q = useQuery({ queryKey: ['workload', companyId], refetchInterval: 60_000, queryFn: () => api<{ items: any[] }>(`/workload${companyId ? `?companyId=${companyId}` : ''}`).then((r) => r.items) });
  const [sel, setSel] = useState<Set<string>>(new Set()); const [find, setFind] = useState(''); const [kinds, setKinds] = useState<Record<string, boolean>>({ Task: true, Subtask: true, 'Follow-up': true });
  const [onlyOver, setOnlyOver] = useState(false); const [status, setStatus] = useState<any[] | null>(null); const [busy, setBusy] = useState(false);
  const all = q.data ?? [];
  const people = all.filter((p) => !find.trim() || p.name.toLowerCase().includes(find.trim().toLowerCase()));
  const chosen = all.filter((p) => sel.has(p.personId));
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const itemsOf = (p: any): Item[] => [
    ...p.tasks.map((t: any): Item => ({ key: 't' + t.id, kind: 'Task', title: t.title, sub: t.companyName, taskId: t.id, dueDate: t.dueDate, overdue: t.overdue, companyId: t.companyId, companyName: t.companyName })),
    ...p.subtasks.map((s: any): Item => ({ key: 's' + s.id, kind: 'Subtask', title: s.title, sub: `in ${s.taskTitle}`, taskId: s.taskId, subtaskId: s.id, dueDate: s.dueDate, overdue: s.overdue, companyId: s.companyId, companyName: s.companyName })),
    ...(p.followupItems ?? []).map((f: any): Item => ({ key: 'f' + f.id, kind: 'Follow-up', title: f.taskTitle, sub: 'Chase', taskId: f.taskId, subtaskId: f.subtaskId, dueDate: f.dueDate, overdue: f.overdue, companyId: f.companyId, companyName: f.companyName })),
  ].filter((i) => kinds[i.kind] && (!onlyOver || i.overdue)).sort((a, b) => rank(a) - rank(b) || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
  const word = async () => {
    setBusy(true); try { await downloadFile(`/export-word/pending-jobs?today=${today()}${companyId ? `&companyId=${companyId}` : ''}&personIds=${[...sel].join(',')}`, 'pending-jobs.docx'); toast('Word file ready. Forward it to the people for their updates.'); } catch (e: any) { toast(e.message); } finally { setBusy(false); }
  };
  const askAll = async () => {
    setBusy(true); try { const r = await api<{ items: any[] }>('/workload/status-messages', { method: 'POST', body: { personIds: [...sel], companyId: companyId || undefined } }); setStatus(r.items); } catch (e: any) { toast(e.message); } finally { setBusy(false); }
  };
  const nItems = useMemo(() => chosen.reduce((n, p) => n + p.openTasks + p.openSubtasks + p.followups, 0), [chosen]);
  return (
    <section>
      <div className="today-head"><div><h1>People</h1><p>Tick one or more people to see everything pending with them{companyId ? ' in this company' : ' across companies'}, overdue first.</p></div></div>
      {q.isLoading && <p className="muted">Loading…</p>}
      {q.data && !q.data.length && <div className="panel2"><div className="empty2" style={{ border: 0 }}><Ic n="users" s={22} />Nobody has pending work{companyId ? ' in this company' : ''}. Give a task or subtask to a person and it will show here.</div></div>}
      {!!q.data?.length && <div className="ppl-layout">
        <aside>
          <input placeholder="Find a person…" aria-label="Find a person" value={find} onChange={(e) => setFind(e.target.value)} style={{ marginBottom: 8 }} />
          <div className="ppl-list">{people.map((p) => (
            <label key={p.personId} className={'pitem' + (sel.has(p.personId) ? ' on' : '')}><input type="checkbox" checked={sel.has(p.personId)} onChange={() => toggle(p.personId)} />
              <Avatar name={p.name} size={30} /><span className="pm"><b>{p.name}</b><small>{p.designation ?? p.companyName ?? (p.isTeam ? 'Team' : '')}</small></span>
              {p.overdue > 0 && <em className="red" title="Overdue">{p.overdue}</em>}<em title="Pending tasks, subtasks and follow-ups">{p.openTasks + p.openSubtasks + p.followups}</em></label>))}
            {!people.length && <p className="muted" style={{ padding: 8 }}>No one found.</p>}</div>
          {all.length > 1 && <div className="actions left" style={{ marginTop: 8 }}><button className="small ghost" onClick={() => setSel(new Set(people.map((p) => p.personId)))}>Select all</button><button className="small ghost" onClick={() => setSel(new Set())}>Clear</button></div>}
        </aside>
        <div>
          {!chosen.length ? <div className="panel2"><div className="empty2" style={{ border: 0 }}><Ic n="users" s={22} />Tick a person on the left to see their pending work.</div></div> : <>
            <div className="ppl-bar">
              <div className="seg2">{(['Task', 'Subtask', 'Follow-up'] as const).map((k) => <button key={k} className={kinds[k] ? 'on' : ''} onClick={() => setKinds({ ...kinds, [k]: !kinds[k] })}>{k === 'Follow-up' ? 'Follow-ups' : k + 's'}</button>)}<button className={onlyOver ? 'on' : ''} onClick={() => setOnlyOver(!onlyOver)}>Overdue only</button></div>
              <span className="grow muted" style={{ fontSize: 13 }}>{chosen.length} {chosen.length === 1 ? 'person' : 'people'} · {nItems} pending</span>
              <button disabled={busy} onClick={askAll}><Ic n="message" />Ask all for status</button><button disabled={busy} onClick={word}><Ic n="download" />Export to Word</button>
            </div>
            {chosen.map((p) => { const rows = itemsOf(p); return (
              <div className="pgroup" key={p.personId}>
                <header><Avatar name={p.name} size={36} /><div className="grow"><b>{p.name}</b><br /><small className="muted">{[p.designation, p.companyName, p.phone].filter(Boolean).join(' · ')}</small></div>
                  <span className="muted" style={{ fontSize: 13 }}>{p.openTasks} tasks · {p.openSubtasks} subtasks · {p.followups} follow-ups{p.overdue ? <b className="red-text"> · {p.overdue} overdue</b> : ''}</span>
                  <button className="small" onClick={() => { const text = `Hi ${p.name.split(' ')[0]}, could you please share a quick status on your pending items in DOOD? Thank you.`; openWhatsApp(p.phone, text); }}><Ic n="whatsapp" s={13} />WhatsApp</button></header>
                {rows.map((i) => (
                  <div className="trow" key={i.key} role="listitem" onClick={() => goto('tasks', i.taskId)}>
                    <span className="kind">{i.kind}</span><CoDot color={companyColor({ color: me.memberships.find((m) => m.companyId === i.companyId)?.color, companyId: i.companyId, companyName: i.companyName })} />
                    <div className="tmain"><div className="ttitle">{i.title}</div><div className="tsub">{i.sub}{i.kind !== 'Task' && i.sub !== i.companyName ? ` · ${i.companyName}` : ''}</div></div>
                    <div className="tmeta" onClick={(e) => e.stopPropagation()}><Chip due={i.dueDate} />
                      <button className="small" onClick={() => openFollowUp({ taskId: i.taskId, subtaskId: i.subtaskId, personId: p.personId, title: i.title })}><Ic n="message" s={13} />Follow up</button>
                      <button className="ibtn" title="WhatsApp" aria-label="WhatsApp" onClick={() => openFollowUp({ taskId: i.taskId, subtaskId: i.subtaskId, personId: p.personId, title: i.title })}><Ic n="whatsapp" /></button></div>
                  </div>))}
                {!rows.length && <div className="empty2"><Ic n="checkcircle" s={20} />Nothing pending that matches.</div>}
              </div>); })}
          </>}
        </div>
      </div>}
      {status && <Modal wide title="Ask all for status" onClose={() => setStatus(null)}>
        <p className="muted">One message per person, listing what is pending with them. Nothing is sent until you open each one and press Send in WhatsApp.</p>
        {status.map((s) => <div className="wiz-card" key={s.personId} style={{ marginTop: 10 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}><b>{s.name}</b><span className="muted" style={{ fontSize: 12 }}>{s.count} pending{s.phone ? '' : ' · no phone saved'}</span></div>
          <div className="msg-box">{s.message}</div><div className="actions left"><button className="primary small" onClick={() => openWhatsApp(s.phone, s.message)}><Ic n="whatsapp" s={13} />Open in WhatsApp</button><button className="small" onClick={() => { navigator.clipboard?.writeText(s.message); toast('Copied.'); }}><Ic n="copy" s={13} />Copy</button></div></div>)}
      </Modal>}
    </section>
  );
}
void diffDays; void Empty;
