// v8 — Chase queue, Templates, Document vault, Approvals, Weekly review, Daily digest, phone install.
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, api, copyText, exportTextToWord, downloadFile, fileToBase64, fmtDate, fmtSize, goto, today } from './api';
import { Badge, Empty, FormModal, Modal, toast, useApp, roleIn } from './ui';
import { Ic } from './icons';
import { openFollowUp, openWhatsApp } from './bus';
import { desktopNotify } from './timer';

const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');
const Dot = ({ c }: { c?: string | null }) => <i className="v8dot" style={{ background: c || 'var(--accent)' }} />;
const canWrite = (me: any) => me.user.isAdmin ? me.memberships.length > 0 : me.memberships.some((m: any) => roleIn(me, m.companyId) !== 'VIEWER');
const writableCompanies = (me: any) => me.memberships.filter((m: any) => me.user.isAdmin || roleIn(me, m.companyId) !== 'VIEWER');

// ───────────────────────── Chase ─────────────────────────
function useChase(limit = 30) { return useQuery({ queryKey: ['chase', limit], refetchInterval: 120_000, queryFn: () => api<any>(`/chase?today=${today()}&limit=${limit}`) }); }

function ChaseRow({ it, onDone }: { it: any; onDone: () => void }) {
  const tone = it.tone as string;
  const sendWa = async () => {
    if (!it.person?.phone) { toast('No phone number saved for this person — add it in Contacts, or use “Send reminder”.'); return; }
    openWhatsApp(it.person.phone, it.message);
    try { await api(`/tasks/${it.taskId}/followups`, { method: 'POST', body: { type: 'WHATSAPP', personId: it.person.id, subtaskId: it.subtaskId ?? null, notes: `Reminder sent on WhatsApp (${tone}).`, reminder: { tone, via: 'whatsapp', message: it.message } } }); toast('Logged as sent.'); onDone(); } catch (e) { toast(errMsg(e)); }
  };
  const snooze = async (days: number) => { try { await api('/chase/snooze', { method: 'POST', body: { taskId: it.taskId, subtaskId: it.subtaskId ?? null, days, today: today() } }); toast(`Hidden for ${days} day${days > 1 ? 's' : ''}.`); onDone(); } catch (e) { toast(errMsg(e)); } };
  return (
    <div className="v8row">
      <div className="v8main" onClick={() => goto('tasks', it.taskId)}>
        <b><Dot c={it.companyColor} />{it.person?.name ?? 'Someone'} <span className="muted">· {it.title}</span></b>
        <span className="tsub">{it.reason.join(' · ')}{it.isPrivate ? ' · Private' : ''}</span>
      </div>
      <Badge tone={tone === 'gentle' ? 'blue' : tone === 'firm' ? 'amber' : 'red'}>{tone === 'gentle' ? 'Gentle nudge' : tone === 'firm' ? 'Firm reminder' : 'Escalate'}</Badge>
      <div className="v8acts">
        <button className="small primary" onClick={() => openFollowUp({ taskId: it.taskId, subtaskId: it.subtaskId, personId: it.person?.id, title: it.taskTitle ?? it.title })}>Send reminder</button>
        <button className="small" onClick={sendWa} title="Opens WhatsApp with the message ready"><Ic n="whatsapp" s={13} /> WhatsApp</button>
        <select className="small" aria-label="Snooze" value="" onChange={(e) => { if (e.target.value) void snooze(Number(e.target.value)); }}><option value="">Snooze…</option><option value="1">1 day</option><option value="3">3 days</option><option value="7">7 days</option></select>
      </div>
    </div>
  );
}

export function ChasePage() {
  const qc = useQueryClient(); const q = useChase(50); const items = q.data?.items ?? [];
  return (
    <section>
      <div className="page-head"><div><h2>People to chase</h2><p className="muted">DOOD looks at what people owe you — overdue, waiting, delegated — and suggests who to remind and how firmly. Nothing is sent by DOOD; you tap to send.</p></div></div>
      {q.isLoading ? <p className="muted">Loading…</p> : !items.length ? <Empty>Nobody needs a nudge right now.</Empty> :
        <div className="panel2">{items.map((it: any) => <ChaseRow key={it.key} it={it} onDone={() => qc.invalidateQueries()} />)}</div>}
    </section>
  );
}

// ───────────────────────── Today cards ─────────────────────────
export function TodayV8Cards() {
  const chase = useChase(5);
  const ap = useQuery({ queryKey: ['approvals-inbox'], refetchInterval: 90_000, queryFn: () => api<any>('/approvals?box=inbox&status=PENDING').then((r) => r.items) });
  const vx = useQuery({ queryKey: ['vault-expiring'], refetchInterval: 300_000, queryFn: () => api<any>(`/vault/expiring?today=${today()}`).then((r) => r.items as any[]).catch(() => [] as any[]) });
  const ci = chase.data?.items ?? []; const ai = ap.data ?? []; const vi = vx.data ?? [];
  return (<>
    {!!ai.length && <section className="panel2"><header><h2>Waiting for your approval <span>· {ai.length}</span></h2><button className="small ghost" onClick={() => goto('approvals')}>Open</button></header>
      {ai.slice(0, 4).map((a: any) => <div className="side-row" key={a.id}><Ic n="shield" s={16} className="muted" /><div className="tmain"><b>{a.title}</b><span className="tsub">{a.requesterName}{a.amount ? ` · ${a.amount}` : ''}</span></div><button className="small" onClick={() => goto('approvals')}>Review</button></div>)}</section>}
    {!!ci.length && <section className="panel2"><header><h2>People to chase <span>· {chase.data?.total ?? ci.length}</span></h2><button className="small ghost" onClick={() => goto('chase')}>All</button></header>
      {ci.slice(0, 3).map((it: any) => <div className="side-row" key={it.key}><span className="v8dotbox"><Dot c={it.companyColor} /></span><div className="tmain"><b>{it.person?.name ?? 'Someone'}</b><span className="tsub">{it.title}{it.overdueDays ? ` · ${it.overdueDays}d overdue` : ''}</span></div>
        <button className="small" onClick={() => openFollowUp({ taskId: it.taskId, subtaskId: it.subtaskId, personId: it.person?.id, title: it.taskTitle ?? it.title })}>Remind</button></div>)}
      </section>}
    {!!vi.length && <section className="panel2"><header><h2>Documents expiring <span>· {vi.length}</span></h2><button className="small ghost" onClick={() => goto('vault')}>Vault</button></header>
      {vi.slice(0, 4).map((d: any) => <div className="side-row" key={d.id} style={{ cursor: 'pointer' }} onClick={() => goto('vault')}><Ic n="file" s={16} className="muted" /><div className="tmain"><b>{d.title}</b><span className="tsub">{d.companyName}</span></div><ExpiryBadge d={{ ...d, status: d.daysLeft < 0 ? 'expired' : 'soon' }} /></div>)}</section>}
  </>);
}

// ───────────────────────── Templates ─────────────────────────
const FREQ = [{ value: '', label: 'Does not repeat' }, { value: 'DAILY', label: 'Every day' }, { value: 'WEEKLY', label: 'Every week' }, { value: 'MONTHLY', label: 'Every month' }, { value: 'QUARTERLY', label: 'Every 3 months' }, { value: 'YEARLY', label: 'Every year' }];

export function TemplatesPage() {
  const { me, companyId } = useApp(); const qc = useQueryClient();
  const q = useQuery({ queryKey: ['templates'], queryFn: () => api<any>('/templates').then((r) => r.items as any[]) });
  const [edit, setEdit] = useState<any>(null); const [use, setUse] = useState<any>(null);
  const cos = writableCompanies(me);
  const form = (t: any) => ({ name: t?.name ?? '', title: t?.title ?? '', description: t?.description ?? '', priority: String(t?.priority ?? 3), repeatFrequency: t?.repeatFrequency ?? '', repeatInterval: t?.repeatInterval ?? 1,
    dueInDays: t?.dueInDays ?? '', remindDaysBefore: t?.remindDaysBefore ?? '', subtasks: (t?.subtasks ?? []).map((s: any) => s.title).join('\n'), shared: !!t?.shared, companyId: t?.companyId ?? '' });
  const save = async (t: any, v: any) => {
    const body = { name: v.name, title: v.title, description: v.description, priority: Number(v.priority), companyId: v.companyId || null, repeatFrequency: v.repeatFrequency || null, repeatInterval: Number(v.repeatInterval) || 1,
      dueInDays: v.dueInDays === null || v.dueInDays === '' ? null : Number(v.dueInDays), remindDaysBefore: v.remindDaysBefore === null || v.remindDaysBefore === '' ? null : Number(v.remindDaysBefore),
      subtasks: String(v.subtasks ?? '').split('\n').map((s) => s.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, '').trim()).filter(Boolean).map((title) => ({ title })), shared: !!v.shared };
    if (t?.id) await api(`/templates/${t.id}`, { method: 'PATCH', body }); else await api('/templates', { method: 'POST', body });
    setEdit(null); toast('Template saved.'); qc.invalidateQueries({ queryKey: ['templates'] });
  };
  return (
    <section>
      <div className="page-head"><div><h2>Templates &amp; repeating tasks</h2><p className="muted">Save a task you create again and again — GST filing, month-end close, new-hire checklist — with its steps. “Use” makes a fresh copy. Set “Repeat” and DOOD makes the next one by itself when you finish.</p></div>
        {canWrite(me) && <button className="primary" onClick={() => setEdit({})}><Ic n="plus" s={14} /> New template</button>}</div>
      {q.isLoading ? <p className="muted">Loading…</p> : !(q.data ?? []).length ? <Empty>No templates yet. Create one for work you do every week or month.</Empty> :
        <div className="panel2">{(q.data ?? []).map((t: any) => (
          <div className="v8row" key={t.id}>
            <div className="v8main"><b>{t.name} {t.shared && <Badge tone="blue">Shared</Badge>}{t.repeatFrequency && <Badge tone="green">Repeats {FREQ.find((f) => f.value === t.repeatFrequency)?.label.toLowerCase().replace('every ', 'every ')}</Badge>}</b>
              <span className="tsub">{t.title}{t.subtasks.length ? ` · ${t.subtasks.length} steps` : ''}{t.dueInDays != null ? ` · due ${t.dueInDays} day${t.dueInDays === 1 ? '' : 's'} after` : ''}{t.companyName ? ` · ${t.companyName}` : ''} · by {t.ownerName}</span></div>
            <div className="v8acts">{canWrite(me) && <button className="small primary" onClick={() => setUse(t)}>Use</button>}
              {(t.ownerId === me.user.id || me.user.isAdmin) && <><button className="small" onClick={() => setEdit(t)}>Edit</button>
                <button className="small ghost" onClick={async () => { if (!confirm(`Delete the template “${t.name}”? Tasks already made from it are not affected.`)) return; await api(`/templates/${t.id}/archive`, { method: 'POST' }); qc.invalidateQueries({ queryKey: ['templates'] }); }}>Delete</button></>}</div>
          </div>))}</div>}
      {edit && <FormModal wide title={edit.id ? 'Edit template' : 'New template'} initial={form(edit.id ? edit : null)} onClose={() => setEdit(null)} onSubmit={(v) => save(edit, v)}
        fields={[
          { key: 'name', label: 'Template name', type: 'text', required: true, hint: 'e.g. Monthly GST filing' },
          { key: 'title', label: 'Task title it creates', type: 'text', required: true },
          { key: 'description', label: 'Details', type: 'textarea' },
          { key: 'subtasks', label: 'Steps (one per line)', type: 'textarea', hint: 'Each line becomes a subtask.' },
          { key: 'priority', label: 'Priority', type: 'select', half: true, options: [{ value: '1', label: 'Critical' }, { value: '2', label: 'High' }, { value: '3', label: 'Medium' }, { value: '4', label: 'Low' }] },
          { key: 'dueInDays', label: 'Due after (days)', type: 'number', half: true, hint: 'Leave empty for no due date.' },
          { key: 'repeatFrequency', label: 'Repeat', type: 'select', half: true, options: FREQ },
          { key: 'repeatInterval', label: 'Every how many?', type: 'number', half: true },
          { key: 'remindDaysBefore', label: 'Remind me (days before due)', type: 'number', half: true },
          { key: 'companyId', label: 'Company (optional)', type: 'select', half: true, options: [{ value: '', label: 'Any company' }, ...cos.map((m: any) => ({ value: m.companyId, label: m.companyName }))] },
          { key: 'shared', label: 'Share with my team', type: 'checkbox' },
        ]} />}
      {use && <FormModal title={`Use “${use.name}”`} submitLabel="Create task" initial={{ companyId: use.companyId || companyId || cos[0]?.companyId || '', title: use.title, dueDate: use.dueInDays != null ? addDays(today(), use.dueInDays) : '' }} onClose={() => setUse(null)}
        fields={[{ key: 'companyId', label: 'Company', type: 'select', required: true, options: cos.map((m: any) => ({ value: m.companyId, label: m.companyName })) }, { key: 'title', label: 'Title', type: 'text', required: true }, { key: 'dueDate', label: 'Due date', type: 'date' }]}
        onSubmit={async (v) => {
          const t = await api<any>('/tasks', { method: 'POST', body: { companyId: v.companyId, title: v.title, description: use.description || null, priority: use.priority, dueDate: v.dueDate || null, remindDaysBefore: use.remindDaysBefore ?? null,
            ...(use.repeatFrequency ? { repeat: use.repeatFrequency, repeatEvery: use.repeatInterval || 1 } : {}) } });
          if (use.subtasks.length) await api(`/tasks/${t.id}/subtasks/bulk`, { method: 'POST', body: { items: use.subtasks.map((s: any) => ({ title: s.title, dueDate: v.dueDate || null })) } });
          setUse(null); toast('Task created from the template.'); qc.invalidateQueries(); goto('tasks', t.id);
        }} />}
    </section>
  );
}

// ───────────────────────── Vault ─────────────────────────
function ExpiryBadge({ d }: { d: any }) {
  if (d.status === 'expired') return <Badge tone="red">Expired {Math.abs(d.daysLeft)}d ago</Badge>;
  if (d.status === 'soon') return <Badge tone="amber">{d.daysLeft === 0 ? 'Expires today' : `${d.daysLeft} day${d.daysLeft === 1 ? '' : 's'} left`}</Badge>;
  if (d.status === 'ok') return <Badge tone="green">Valid · {fmtDate(d.expiresOn)}</Badge>;
  return <Badge tone="grey">No expiry</Badge>;
}

function VaultDoc({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { me } = useApp(); const qc = useQueryClient();
  const q = useQuery({ queryKey: ['vault-doc', id], queryFn: () => api<any>(`/vault/${id}`) });
  const [editing, setEditing] = useState(false); const [question, setQuestion] = useState(''); const [ans, setAns] = useState<any>(null); const [busy, setBusy] = useState(false);
  const cats = useQuery({ queryKey: ['vault-cats'], queryFn: () => api<any>('/vault/categories').then((r) => r.items as string[]) });
  const d = q.data; const writable = d && roleIn(me, d.companyId) !== 'VIEWER';
  const refresh = () => { qc.invalidateQueries({ queryKey: ['vault-doc', id] }); onChanged(); };
  if (!d) return <Modal title="Document" onClose={onClose}><p className="muted">Loading…</p></Modal>;
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    for (const f of Array.from(files)) { try { await api(`/vault/${id}/files`, { method: 'POST', body: { fileName: f.name, mimeType: f.type || 'application/octet-stream', dataBase64: await fileToBase64(f) } }); } catch (e) { toast(`${f.name}: ${errMsg(e)}`); } }
    refresh();
  };
  const ask = async () => { setBusy(true); setAns(null); try { setAns(await api(`/vault/${id}/ask`, { method: 'POST', body: { question } })); } catch (e) { setAns({ error: errMsg(e) }); } finally { setBusy(false); } };
  return (
    <Modal wide title={d.title} onClose={onClose}>
      <p><ExpiryBadge d={d} /> <Badge tone="grey">{d.category}</Badge> <span className="muted">{d.companyName}</span>{d.aiExcluded && <Badge tone="grey">Private · no AI</Badge>}</p>
      <dl className="v8dl">
        {d.docNumber && <><dt>Number</dt><dd>{d.docNumber}</dd></>}{d.party && <><dt>With</dt><dd>{d.party}</dd></>}
        <dt>Issued</dt><dd>{fmtDate(d.issuedOn)}</dd><dt>Expires</dt><dd>{fmtDate(d.expiresOn)}{d.expiresOn ? ` · reminder ${d.remindDays} days before` : ''}</dd>
        {d.notes && <><dt>Notes</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{d.notes}</dd></>}
      </dl>
      <h4>Files</h4>
      {!d.files.length ? <p className="muted">No file attached yet.</p> : d.files.map((f: any) => (
        <div className="side-row" key={f.id} style={{ padding: '.4rem 0' }}><Ic n="file" s={15} className="muted" /><div className="tmain"><b>{f.fileName}</b><span className="tsub">{fmtSize(f.sizeBytes)}</span></div>
          <button className="small" onClick={() => downloadFile(`/vault/files/${f.id}/download`, f.fileName).catch((e) => toast(errMsg(e)))}><Ic n="download" s={13} /> Download</button>
          {writable && <button className="small ghost" onClick={async () => { await api(`/vault/files/${f.id}/archive`, { method: 'POST' }); refresh(); }}>Remove</button>}</div>))}
      {writable && <label className="small btnlike"><Ic n="upload" s={13} /> Add files<input type="file" multiple hidden onChange={(e) => { void upload(e.target.files); e.target.value = ''; }} /></label>}
      <h4>Ask about this document</h4>
      {d.aiExcluded ? <p className="muted">Marked “Private · no AI”, so it is never sent to the AI.</p> : !d.files.length ? <p className="muted">Add a file first, then you can ask questions about it.</p> : <>
        <div className="v8ask"><input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. What is the notice period? When does the rent increase?" onKeyDown={(e) => { if (e.key === 'Enter' && question.trim().length >= 3 && !busy) void ask(); }} />
          <button className="primary" disabled={busy || question.trim().length < 3} onClick={ask}>{busy ? 'Reading…' : 'Ask'}</button></div>
        {ans?.error && <p className="error">{ans.error}</p>}
        {ans?.answer && <div className="v8answer"><p>{ans.answer}</p><small className="muted">{ans.found ? 'From' : 'Not found in'}: {(ans.filesRead ?? []).join(', ')}. Please check the original before acting on it.</small></div>}</>}
      {writable && <div className="modal-actions" style={{ display: 'flex', gap: '.5rem', marginTop: '1rem' }}>
        <button onClick={() => setEditing(true)}><Ic n="pencil" s={13} /> Edit details</button>
        <button className="ghost" onClick={async () => { if (!confirm('Remove this document from the vault?')) return; await api(`/vault/${id}`, { method: 'PATCH', body: { expectedUpdatedAt: d.updatedAt, archived: true } }); onChanged(); onClose(); }}>Remove</button></div>}
      {editing && <VaultForm doc={d} cats={cats.data ?? []} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); refresh(); }} />}
    </Modal>
  );
}

function VaultForm({ doc, cats, onClose, onSaved }: { doc?: any; cats: string[]; onClose: () => void; onSaved: (id: string) => void }) {
  const { me, companyId } = useApp(); const cos = writableCompanies(me);
  const [co, setCo] = useState(doc?.companyId ?? (companyId || cos[0]?.companyId || ''));
  const proj = useQuery({ enabled: !!co, queryKey: ['vault-proj', co], queryFn: () => api<{ items: any[] }>(`/projects?companyId=${co}&limit=200`).then((r) => r.items) });
  return (
    <FormModal wide title={doc ? 'Edit document' : 'Add a document'} onValues={(v) => { if (!doc && v.companyId !== co) setCo(v.companyId); }}
      initial={{ companyId: co, title: doc?.title ?? '', category: doc?.category ?? 'Agreement', docNumber: doc?.docNumber ?? '', party: doc?.party ?? '', issuedOn: doc?.issuedOn ?? '', expiresOn: doc?.expiresOn ?? '', remindDays: doc?.remindDays ?? 30, projectId: doc?.projectId ?? '', notes: doc?.notes ?? '', aiExcluded: !!doc?.aiExcluded }}
      fields={[
        ...(doc ? [] : [{ key: 'companyId', label: 'Company', type: 'select' as const, required: true, options: cos.map((m: any) => ({ value: m.companyId, label: m.companyName })) }]),
        { key: 'title', label: 'Document name', type: 'text', required: true, hint: 'e.g. Factory licence, Office rent agreement' },
        { key: 'category', label: 'Category', type: 'select', half: true, options: cats.map((c) => ({ value: c, label: c })) },
        { key: 'docNumber', label: 'Number / reference', type: 'text', half: true },
        { key: 'party', label: 'Issued by / signed with', type: 'text' },
        { key: 'issuedOn', label: 'Issued on', type: 'date', half: true }, { key: 'expiresOn', label: 'Expires on', type: 'date', half: true, hint: 'DOOD reminds you before this date.' },
        { key: 'remindDays', label: 'Remind me (days before expiry)', type: 'number', half: true },
        { key: 'projectId', label: 'Project (optional)', type: 'select', half: true, options: [{ value: '', label: 'None' }, ...(proj.data ?? []).map((p: any) => ({ value: p.id, label: p.name }))] },
        { key: 'notes', label: 'Notes', type: 'textarea' },
        { key: 'aiExcluded', label: 'Private · no AI (never sent to the AI)', type: 'checkbox' },
      ]}
      onClose={onClose}
      onSubmit={async (v) => {
        const body: any = { title: v.title, category: v.category, docNumber: v.docNumber || null, party: v.party || null, issuedOn: v.issuedOn || null, expiresOn: v.expiresOn || null, remindDays: Number(v.remindDays ?? 30), projectId: v.projectId || null, notes: v.notes || null, aiExcluded: !!v.aiExcluded };
        if (doc) { await api(`/vault/${doc.id}`, { method: 'PATCH', body: { ...body, expectedUpdatedAt: doc.updatedAt } }); onSaved(doc.id); }
        else { const r = await api<any>('/vault', { method: 'POST', body: { ...body, companyId: v.companyId } }); toast('Added. Now attach the file.'); onSaved(r.id); }
      }} />
  );
}

export function VaultPage() {
  const { me, companyId, arg } = useApp(); const qc = useQueryClient();
  const [cat, setCat] = useState(''); const [text, setText] = useState(''); const [soon, setSoon] = useState(false); const [open, setOpen] = useState<string | null>(arg ?? null); const [adding, setAdding] = useState(false);
  const cats = useQuery({ queryKey: ['vault-cats'], queryFn: () => api<any>('/vault/categories').then((r) => r.items as string[]) });
  const q = useQuery({ queryKey: ['vault', companyId, cat, text, soon], queryFn: () => api<any>(`/vault?today=${today()}${companyId ? `&companyId=${companyId}` : ''}${cat ? `&category=${encodeURIComponent(cat)}` : ''}${text ? `&q=${encodeURIComponent(text)}` : ''}${soon ? '&expiring=1' : ''}`) });
  const items = q.data?.items ?? []; const counts = q.data?.counts;
  const changed = () => { qc.invalidateQueries({ queryKey: ['vault'] }); qc.invalidateQueries({ queryKey: ['vault-expiring'] }); };
  return (
    <section>
      <div className="page-head"><div><h2>Document vault</h2><p className="muted">Agreements, licences, insurance, loans — one safe place, with a reminder before anything expires. Open a document to attach the file and ask questions about it.</p></div>
        {canWrite(me) && <button className="primary" onClick={() => setAdding(true)}><Ic n="plus" s={14} /> Add document</button>}</div>
      <div className="chips-bar">
        <button className={'chip-btn' + (!soon ? ' on' : '')} onClick={() => setSoon(false)}>All {counts ? `(${counts.total})` : ''}</button>
        <button className={'chip-btn' + (soon ? ' on' : '')} onClick={() => setSoon(true)}>Expiring or expired {counts ? `(${counts.expired + counts.soon})` : ''}</button>
        <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category"><option value="">All categories</option>{(cats.data ?? []).map((c) => <option key={c}>{c}</option>)}</select>
        <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Search name, number, party, file…" style={{ minWidth: 220 }} />
      </div>
      {q.isLoading ? <p className="muted">Loading…</p> : !items.length ? <Empty>{soon ? 'Nothing is expiring.' : 'No documents yet. Add your first agreement or licence.'}</Empty> :
        <div className="panel2">{items.map((d: any) => (
          <div className="v8row" key={d.id} style={{ cursor: 'pointer' }} onClick={() => setOpen(d.id)}>
            <div className="v8main"><b><Dot c={d.companyColor} />{d.title}</b><span className="tsub">{d.category}{d.party ? ` · ${d.party}` : ''}{d.docNumber ? ` · ${d.docNumber}` : ''} · {d.companyName}{d.fileCount ? ` · ${d.fileCount} file${d.fileCount > 1 ? 's' : ''}` : ' · no file yet'}</span></div>
            <ExpiryBadge d={d} /></div>))}</div>}
      {adding && <VaultForm cats={cats.data ?? []} onClose={() => setAdding(false)} onSaved={(id) => { setAdding(false); changed(); setOpen(id); }} />}
      {open && <VaultDoc id={open} onClose={() => setOpen(null)} onChanged={changed} />}
    </section>
  );
}

// ───────────────────────── Approvals ─────────────────────────
export function ApprovalsPage() {
  const { me, companyId } = useApp(); const qc = useQueryClient();
  const [box, setBox] = useState<'inbox' | 'sent'>('inbox'); const [adding, setAdding] = useState(false); const [reject, setReject] = useState<any>(null); const [co, setCo] = useState(companyId || '');
  const q = useQuery({ queryKey: ['approvals', box], refetchInterval: 60_000, queryFn: () => api<any>(`/approvals?box=${box}`).then((r) => r.items as any[]) });
  const cos = writableCompanies(me); const useCo = co || cos[0]?.companyId || '';
  const ppl = useQuery({ enabled: !!adding && !!useCo, queryKey: ['approvers', useCo], queryFn: () => api<any>(`/approvals/approvers?companyId=${useCo}`).then((r) => r.items as any[]) });
  const done = () => { qc.invalidateQueries({ queryKey: ['approvals'] }); qc.invalidateQueries({ queryKey: ['approvals-inbox'] }); };
  const decide = async (a: any, decision: string, note?: string) => { try { await api(`/approvals/${a.id}/decide`, { method: 'POST', body: { decision, note: note ?? null } }); toast(decision === 'APPROVED' ? 'Approved.' : 'Rejected.'); done(); } catch (e) { toast(errMsg(e)); } };
  const tone = (s: string) => (s === 'APPROVED' ? 'green' : s === 'REJECTED' ? 'red' : s === 'PENDING' ? 'amber' : 'grey');
  return (
    <section>
      <div className="page-head"><div><h2>Approvals</h2><p className="muted">Ask someone to say yes or no — a payment, a discount, a purchase — and keep the answer on record.</p></div>
        {canWrite(me) && <button className="primary" onClick={() => setAdding(true)}><Ic n="plus" s={14} /> Ask for approval</button>}</div>
      <div className="chips-bar"><button className={'chip-btn' + (box === 'inbox' ? ' on' : '')} onClick={() => setBox('inbox')}>Waiting for me</button><button className={'chip-btn' + (box === 'sent' ? ' on' : '')} onClick={() => setBox('sent')}>I asked</button></div>
      {q.isLoading ? <p className="muted">Loading…</p> : !(q.data ?? []).length ? <Empty>{box === 'inbox' ? 'Nothing is waiting for you.' : 'You have not asked anyone yet.'}</Empty> :
        <div className="panel2">{(q.data ?? []).map((a: any) => (
          <div className="v8row" key={a.id}>
            <div className="v8main"><b><Dot c={a.companyColor} />{a.title} {a.amount && <span className="muted">· {a.amount}</span>}</b>
              <span className="tsub">{box === 'inbox' ? `From ${a.requesterName}` : `Asked ${a.approverName}`} · {a.companyName}{a.taskTitle ? ` · task: ${a.taskTitle}` : ''}</span>
              {a.details && <span className="tsub" style={{ whiteSpace: 'pre-wrap' }}>{a.details}</span>}
              {a.decisionNote && <span className="tsub">Note: {a.decisionNote}</span>}</div>
            <Badge tone={tone(a.status)}>{a.status === 'PENDING' ? 'Waiting' : a.status === 'APPROVED' ? 'Approved' : a.status === 'REJECTED' ? 'Rejected' : 'Cancelled'}</Badge>
            <div className="v8acts">{a.canDecide && <><button className="small primary" onClick={() => decide(a, 'APPROVED')}>Approve</button><button className="small" onClick={() => setReject(a)}>Reject</button></>}
              {a.canCancel && <button className="small ghost" onClick={async () => { await api(`/approvals/${a.id}/cancel`, { method: 'POST' }); done(); }}>Cancel</button>}</div>
          </div>))}</div>}
      {reject && <FormModal title={`Reject: ${reject.title}`} submitLabel="Reject" initial={{ note: '' }} fields={[{ key: 'note', label: 'Why? (the person will see this)', type: 'textarea', required: true }]} onClose={() => setReject(null)} onSubmit={async (v) => { await decide(reject, 'REJECTED', v.note); setReject(null); }} />}
      {adding && <FormModal title="Ask for approval" submitLabel="Send request" initial={{ companyId: useCo, approverId: '', title: '', amount: '', details: '' }} onClose={() => setAdding(false)} onValues={(v) => { if (v.companyId && v.companyId !== co) setCo(v.companyId); }}
        fields={[{ key: 'companyId', label: 'Company', type: 'select', required: true, options: cos.map((m: any) => ({ value: m.companyId, label: m.companyName })) },
          { key: 'approverId', label: 'Who should approve?', type: 'select', required: true, options: [{ value: '', label: 'Choose…' }, ...(ppl.data ?? []).map((p: any) => ({ value: p.id, label: p.name }))] },
          { key: 'title', label: 'What needs approval?', type: 'text', required: true, hint: 'e.g. Purchase of lab centrifuge' },
          { key: 'amount', label: 'Amount (optional)', type: 'text', half: true, hint: 'e.g. ₹85,000' },
          { key: 'details', label: 'Details', type: 'textarea' }]}
        onSubmit={async (v) => { await api('/approvals', { method: 'POST', body: { companyId: v.companyId, approverId: v.approverId, title: v.title, amount: v.amount || null, details: v.details || null } }); setAdding(false); setBox('sent'); toast('Request sent.'); done(); }} />}
    </section>
  );
}

// ───────────────────────── Weekly review ─────────────────────────
export function WeeklyPage() {
  const { me } = useApp(); const [end, setEnd] = useState(today()); const [ai, setAi] = useState<any>(null); const [busy, setBusy] = useState(false);
  const q = useQuery({ queryKey: ['weekly', end], queryFn: () => api<any>(`/owner/weekly?end=${end}`) });
  const w = q.data; const t = w?.totals;
  const runAi = async () => { setBusy(true); setAi(null); try { setAi(await api('/owner/weekly/ai', { method: 'POST', body: { end } })); } catch (e) { setAi({ error: errMsg(e) }); } finally { setBusy(false); } };
  void me;
  const List = ({ title, items, note }: { title: string; items: any[]; note: (x: any) => string }) => !items?.length ? null : (
    <section className="panel2"><header><h2>{title} <span>· {items.length}</span></h2></header>
      {items.map((x: any) => <div className="side-row" key={x.id} style={{ cursor: 'pointer' }} onClick={() => goto('tasks', x.id)}><div className="tmain"><b><Dot c={x.companyColor} />{x.isPrivate ? 'Private task' : x.title}</b><span className="tsub">{x.company}{x.person ? ` · ${x.person}` : ''} · {note(x)}</span></div></div>)}</section>);
  return (
    <section>
      <div className="page-head"><div><h2>Weekly review</h2><p className="muted">How the week went across your companies: what got done, what is stuck, and who needs a push.</p></div>
        <div className="v8acts"><button className="small" onClick={() => setEnd(addDays(end, -7))}>← Previous week</button>{end < today() && <button className="small" onClick={() => setEnd(addDays(end, 7) > today() ? today() : addDays(end, 7))}>Next week →</button>}
          <button className="small primary" disabled={busy} onClick={runAi}><Ic n="sparkles" s={13} /> {busy ? 'Thinking…' : 'AI review'}</button></div></div>
      {!w ? <p className="muted">Loading…</p> : <>
        <p className="muted">{fmtDate(w.start)} to {fmtDate(w.end)}</p>
        <div className="tiles" role="list">
          <div className="tile green" role="listitem"><small>Done</small><b>{t.done}</b><small>last week {t.donePrev}</small></div>
          <div className="tile" role="listitem"><small>Created</small><b>{t.created}</b></div>
          <div className="tile red" role="listitem"><small>Overdue</small><b>{t.overdue}</b></div>
          <div className="tile amber" role="listitem"><small>No update 7+ days</small><b>{t.stalled}</b></div>
          <div className="tile" role="listitem"><small>On time</small><b>{t.onTimePct == null ? '—' : t.onTimePct + '%'}</b></div>
        </div>
        {ai && <div className="v8answer">{ai.error ? <p className="error">{ai.error}</p> : <><b>{ai.headline}</b>
          {!!ai.wins?.length && <><h4>Good news</h4><ul>{ai.wins.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></>}
          {!!ai.concerns?.length && <><h4>Worries</h4><ul>{ai.concerns.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></>}
          {!!ai.suggestions?.length && <><h4>Do next week</h4><ul>{ai.suggestions.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></>}
          <small className="muted">AI suggestion based on the numbers below — private tasks are never sent.</small>
          <div style={{ marginTop: '.5rem' }}><button className="small" onClick={() => exportTextToWord(`Weekly review ${w?.start ?? ''} to ${w?.end ?? ''}`, [ai.headline, '', ...(ai.wins?.length ? ['Good news', ...ai.wins.map((x: string) => '- ' + x), ''] : []), ...(ai.concerns?.length ? ['Worries', ...ai.concerns.map((x: string) => '- ' + x), ''] : []), ...(ai.suggestions?.length ? ['Do next week', ...ai.suggestions.map((x: string) => '- ' + x)] : [])].join('\n'), { subtitle: 'Written by Dood (AI) - please check before use' }).catch((e) => toast(errMsg(e)))}><Ic n="download" s={13} /> Export to Word</button></div></>}</div>}
        <div className="v8cols">
          <section className="panel2"><header><h2>By company</h2></header>{w.companies.map((c: any) => <div className="side-row" key={c.companyId}><div className="tmain"><b><Dot c={c.color} />{c.name}</b><span className="tsub">{c.done} done · {c.created} new · {c.open} open</span></div>{c.overdue > 0 && <Badge tone="red">{c.overdue} overdue</Badge>}</div>)}</section>
          <section className="panel2"><header><h2>By person</h2></header>{!w.people.length && <div className="empty2">Nobody has work delegated to them.</div>}{w.people.map((p: any) => <div className="side-row" key={p.name}><div className="tmain"><b>{p.name}</b><span className="tsub">{p.done} done this week · {p.open} open</span></div>{p.overdue > 0 && <Badge tone="red">{p.overdue} overdue</Badge>}</div>)}</section>
        </div>
        <div className="v8cols">
          <List title="Overdue" items={w.overdue} note={(x) => `${x.overdueDays} days late`} />
          <List title="No update for a week or more" items={w.stalled} note={(x) => `quiet ${x.quietDays} days`} />
          <List title="Postponed again and again" items={w.slipping} note={(x) => `postponed ${x.postponed} times`} />
        </div>
        {!!w.concerns.length && <p className="muted"><b>Watch:</b> {w.concerns.join(' ')}</p>}</>}
    </section>
  );
}

// ───────────────────────── Daily digest + phone ─────────────────────────
const secure = () => typeof window !== 'undefined' && (window.isSecureContext || location.hostname === 'localhost');

export function DigestPage() {
  const qc = useQueryClient(); const [kind, setKind] = useState<'morning' | 'evening'>(new Date().getHours() < 14 ? 'morning' : 'evening');
  const prefs = useQuery({ queryKey: ['digest-prefs'], queryFn: () => api<any>('/digest/prefs') });
  const dg = useQuery({ queryKey: ['digest', kind], queryFn: () => api<any>(`/digest?kind=${kind}&today=${today()}`) });
  const [p, setP] = useState<any>(null); useEffect(() => { if (prefs.data && !p) setP(prefs.data); }, [prefs.data, p]);
  const [install, setInstall] = useState<any>((window as any).__ccInstall ?? null);
  useEffect(() => { const h = () => setInstall((window as any).__ccInstall ?? null); addEventListener('cc-installable', h); return () => removeEventListener('cc-installable', h); }, []);
  const perm = typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';
  const savePrefs = async () => { try { await api('/digest/prefs', { method: 'PUT', body: { enabled: !!p.enabled, morning: p.morning, evening: p.evening, phone: p.phone || null } }); toast('Saved.'); qc.invalidateQueries({ queryKey: ['digest-prefs'] }); qc.invalidateQueries({ queryKey: ['digest'] }); } catch (e) { toast(errMsg(e)); } };
  const text: string = dg.data?.text ?? ''; const phone: string | null = p?.phone || dg.data?.phone || null;
  return (
    <section>
      <div className="page-head"><div><h2>Daily digest &amp; phone</h2><p className="muted">A short summary of your day. DOOD puts it in your bell at the times you choose; one tap sends it to your own WhatsApp.</p></div></div>
      <div className="v8cols">
        <section className="panel2"><header><h2>Your {kind} digest</h2><div className="seg2"><button className={kind === 'morning' ? 'on' : ''} onClick={() => setKind('morning')}>Morning</button><button className={kind === 'evening' ? 'on' : ''} onClick={() => setKind('evening')}>Evening</button></div></header>
          <pre className="v8pre">{dg.isLoading ? 'Loading…' : text || 'Nothing to report.'}</pre>
          <div className="v8acts" style={{ padding: '0 1.2rem 1rem' }}>
            <button className="small" onClick={async () => { await copyText(text); toast('Copied.'); }}><Ic n="copy" s={13} /> Copy</button>
            <button className="small primary" onClick={() => { if (!phone) { toast('Add your WhatsApp number on the right first.'); return; } openWhatsApp(phone, text); }}><Ic n="whatsapp" s={13} /> Send to my WhatsApp</button></div></section>
        <section className="panel2"><header><h2>Settings</h2></header>
          {!p ? <p className="muted" style={{ padding: '0 1.2rem' }}>Loading…</p> : <div style={{ padding: '0 1.2rem 1.2rem', display: 'grid', gap: '.7rem' }}>
            <label className="v8chk"><input type="checkbox" checked={!!p.enabled} onChange={(e) => setP({ ...p, enabled: e.target.checked })} /> Put my digest in the notification bell</label>
            <label>Morning digest at<input type="time" value={p.morning} onChange={(e) => setP({ ...p, morning: e.target.value })} /></label>
            <label>Evening digest at<input type="time" value={p.evening} onChange={(e) => setP({ ...p, evening: e.target.value })} /></label>
            <label>My WhatsApp number<input value={p.phone ?? ''} placeholder="+91 98xxxxxxxx" onChange={(e) => setP({ ...p, phone: e.target.value })} /></label>
            <button className="primary" onClick={savePrefs}>Save settings</button>
            <small className="muted">DOOD does not send WhatsApp messages by itself (that needs a paid WhatsApp Business account). You tap “Send to my WhatsApp” and your own WhatsApp opens with the message ready.</small></div>}
        </section>
      </div>
      <section className="panel2" style={{ marginTop: '1rem' }}><header><h2>Use DOOD on your phone</h2></header>
        <div style={{ padding: '0 1.2rem 1.2rem', display: 'grid', gap: '.6rem' }}>
          <p>Open DOOD in your phone’s browser and add it to your home screen — it then opens like an app, full screen.</p>
          {install && <div><button className="primary" onClick={async () => { install.prompt(); await install.userChoice; (window as any).__ccInstall = null; setInstall(null); }}>Install DOOD on this device</button></div>}
          <div className="v8acts">
            {perm === 'granted' ? <Badge tone="green">Alerts are on for this device</Badge> : perm === 'denied' ? <Badge tone="red">Alerts are blocked in this browser’s settings</Badge> :
              perm === 'unsupported' ? <Badge tone="grey">This browser cannot show alerts</Badge> :
                <button className="small" onClick={async () => { const r = await Notification.requestPermission(); if (r === 'granted') { desktopNotify('DOOD', 'Alerts are on. You will see reminders here while DOOD is open.'); toast('Alerts are on.'); } else toast('Alerts were not allowed.'); }}>Turn on alerts on this device</button>}
          </div>
          {!secure() && <small className="muted"><b>Note:</b> you opened DOOD through a plain office-network address (http://…). Phones only allow “Install app” and background alerts on a secure (https) address. DOOD works normally here — alerts appear while the page is open. Ask your IT person to put DOOD behind https if you want the full app experience.</small>}
        </div></section>
    </section>
  );
}

// ───────────────────────── Activity: work given to others ─────────────────────────
export function ActivityPage() {
  const { companyId } = useApp();
  const q = useQuery({ queryKey: ['workload', companyId], refetchInterval: 60_000, queryFn: () => api<{ items: any[] }>(`/workload${companyId ? `?companyId=${companyId}` : ''}`).then((r) => r.items) });
  const [find, setFind] = useState(''); const [onlyOver, setOnlyOver] = useState(false); const [all, setAll] = useState<Record<string, boolean>>({});
  const people = (q.data ?? []).filter((p) => (!find.trim() || p.name.toLowerCase().includes(find.trim().toLowerCase())) && (!onlyOver || p.overdue > 0))
    .sort((a, b) => b.overdue - a.overdue || (b.openTasks + b.openSubtasks + b.followups) - (a.openTasks + a.openSubtasks + a.followups));
  const tot = (q.data ?? []).reduce((s, p) => ({ pending: s.pending + p.openTasks + p.openSubtasks, over: s.over + p.overdue, fu: s.fu + p.followups }), { pending: 0, over: 0, fu: 0 });
  const rowsOf = (p: any) => [
    ...p.tasks.map((t: any) => ({ key: 't' + t.id, kind: 'Task', title: t.title, sub: t.companyName, taskId: t.id, subtaskId: null, dueDate: t.dueDate, overdue: t.overdue })),
    ...p.subtasks.map((s: any) => ({ key: 's' + s.id, kind: 'Subtask', title: s.title, sub: `in ${s.taskTitle}`, taskId: s.taskId, subtaskId: s.id, dueDate: s.dueDate, overdue: s.overdue })),
    ...(p.followupItems ?? []).map((f: any) => ({ key: 'f' + f.id, kind: 'Follow-up', title: f.taskTitle, sub: 'Chase', taskId: f.taskId, subtaskId: f.subtaskId, dueDate: f.dueDate, overdue: f.overdue })),
  ].sort((a, b) => Number(b.overdue) - Number(a.overdue) || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
  return (
    <section>
      <div className="page-head"><div><h2>Activity</h2><p className="muted">Everything you have given to other people{companyId ? ' in this company' : ' across your companies'}, and where it stands. Most overdue first.</p></div>
        <button className="small" onClick={() => goto('workload')}><Ic n="users" s={13} /> Pick people (People tab)</button></div>
      <div className="tiles" role="list">
        <div className="tile" role="listitem"><small>People with work</small><b>{q.data?.length ?? 0}</b></div>
        <div className="tile blue" role="listitem"><small>Pending tasks &amp; subtasks</small><b>{tot.pending}</b></div>
        <div className="tile red" role="listitem"><small>Overdue</small><b>{tot.over}</b></div>
        <div className="tile amber" role="listitem"><small>Follow-ups waiting</small><b>{tot.fu}</b></div>
      </div>
      <div className="chips-bar"><input type="search" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find a person…" />
        <button className={'chip-btn' + (onlyOver ? ' on' : '')} onClick={() => setOnlyOver(!onlyOver)}>Only people with overdue work</button></div>
      {q.isLoading ? <p className="muted">Loading…</p> : !people.length ? <Empty>Nobody has pending work. Give a task or subtask to a person and it shows here.</Empty> :
        people.map((p) => { const rows = rowsOf(p); const shown = all[p.personId] ? rows : rows.slice(0, 4); return (
          <section className="panel2" key={p.personId} style={{ marginBottom: '1rem' }}>
            <header><h2 style={{ display: 'flex', gap: '.6rem', alignItems: 'center' }}><span className="ini">{p.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('')}</span><span>{p.name}<small className="muted" style={{ display: 'block', fontWeight: 400, fontSize: 12 }}>{[p.designation, p.companyName].filter(Boolean).join(' · ')}</small></span></h2>
              <span className="v8acts"><Badge tone="blue">{p.openTasks} {p.openTasks === 1 ? 'task' : 'tasks'}</Badge><Badge tone="blue">{p.openSubtasks} {p.openSubtasks === 1 ? 'subtask' : 'subtasks'}</Badge>{p.followups > 0 && <Badge tone="amber">{p.followups} {p.followups === 1 ? 'follow-up' : 'follow-ups'}</Badge>}{p.overdue > 0 && <Badge tone="red">{p.overdue} overdue</Badge>}</span></header>
            {shown.map((r: any) => (
              <div className="side-row" key={r.key} style={{ cursor: 'pointer' }} onClick={() => goto('tasks', r.taskId)}>
                <div className="tmain"><b>{r.title}</b><span className="tsub">{r.kind} · {r.sub}</span></div>
                {r.dueDate ? <Badge tone={r.overdue ? 'red' : r.dueDate === today() ? 'amber' : 'grey'}>{r.overdue ? `${Math.max(1, Math.round((Date.parse(today()) - Date.parse(r.dueDate)) / 864e5))}d overdue` : r.dueDate === today() ? 'Today' : fmtDate(r.dueDate)}</Badge> : <Badge tone="grey">No date</Badge>}
                <button className="small" onClick={(e) => { e.stopPropagation(); openFollowUp({ taskId: r.taskId, subtaskId: r.subtaskId, personId: p.personId, title: r.title }); }}>Follow up</button>
              </div>))}
            {rows.length > 4 && <button className="small ghost" style={{ margin: '.4rem 1.2rem .8rem' }} onClick={() => setAll({ ...all, [p.personId]: !all[p.personId] })}>{all[p.personId] ? 'Show fewer' : `Show all ${rows.length}`}</button>}
          </section>); })}
    </section>
  );
}
