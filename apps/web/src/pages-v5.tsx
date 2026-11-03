import { ReadFilesPanel } from './pages-notebook';
import Doodu, { DOODU_LINES } from './components/Doodu';
import { Ic } from './icons';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, downloadFile, fmtDate, fmtTime, goto, PRIORITY, PRIORITY_DOT, STATUS_LABEL, today } from './api';
import { useAllPeople } from './hooks';
import { Badge, Empty, FormModal, Modal, Progress, toast, useApp, roleIn } from './ui';
import { TaskDetail } from './pages-tasks';
import { CallRow } from './pages-calls';
import { DiscussionRow } from './pages-discussions';
import { desktopNotify } from './timer';
import { dueReminders, type ReminderKind, type ReminderSettings, type ReminderState } from './reminders-logic';

const isManager = (me: any, companyId?: string | null) => !!companyId && ['MEMBER', 'MANAGER', 'ADMIN'].includes(roleIn(me, companyId) ?? '');

// ───────────────────────── Create a project without leaving the task / subtask window ─────────────────────────
export function QuickProject({ companyId, name, onClose, onCreated }: { companyId: string; name?: string; onClose: () => void; onCreated: (p: any) => void }) {
  const qc = useQueryClient();
  return <FormModal title="New project" submitLabel="Create project" onClose={onClose} initial={{ name: name ?? '', description: '', priority: 3, targetDate: '' }}
    fields={[{ key: 'name', label: 'Project name', type: 'text', required: true }, { key: 'description', label: 'Description (optional)', type: 'textarea' },
      { key: 'priority', label: 'Priority', type: 'select', required: true, half: true, options: [1, 2, 3, 4].map((n) => ({ value: n, label: `${PRIORITY_DOT[n]} ${PRIORITY[n]}` })) }, { key: 'targetDate', label: 'Target date', type: 'date', half: true }]}
    onSubmit={async (v) => { const p = await api('/projects', { method: 'POST', body: { ...v, companyId } }); toast(`Project “${p.name}” created.`); qc.invalidateQueries({ queryKey: ['projects-of'] }); qc.invalidateQueries({ queryKey: ['projects-all'] }); onCreated(p); onClose(); }} />;
}

/** Asks (once) whether the task being worked on should be placed in the project that was just created from it. */
export async function offerMove(task: { id: string; updatedAt: string; title: string; projectId?: string | null }, project: any) {
  if (task.projectId === project.id) return false;
  if (!confirm(`Also move “${task.title}” into the new project “${project.name}”?`)) return false;
  await api(`/tasks/${task.id}`, { method: 'PATCH', body: { expectedUpdatedAt: task.updatedAt, today: today(), projectId: project.id } });
  toast('Task moved into the new project.'); return true;
}

// ───────────────────────── Notes (task / subtask) ─────────────────────────
const bulletize = (text: string, a: number, b: number, mark: (i: number) => string) => {
  const start = text.lastIndexOf('\n', a - 1) + 1; let end = text.indexOf('\n', b); if (end < 0) end = text.length;
  const block = text.slice(start, end).split('\n').map((l, i) => (l.trim() ? mark(i) + l.replace(/^\s*([-*•]|\d+[.)])\s+/, '') : l)).join('\n');
  return { text: text.slice(0, start) + block + text.slice(end), at: start + block.length };
};

export function NoteEditor({ noteId, taskId, subtaskId, subtaskTitle, onClose, onChanged }: { noteId?: string; taskId?: string; subtaskId?: string | null; subtaskTitle?: string; onClose: () => void; onChanged?: () => void }) {
  const [readFiles, setReadFiles] = useState(false);
  const { me } = useApp(); const qc = useQueryClient(); const people = useAllPeople(); const ta = useRef<HTMLTextAreaElement>(null);
  const [id, setId] = useState<string | undefined>(noteId);
  const full = useQuery({ queryKey: ['note', id], enabled: !!id, queryFn: () => api<any>(`/notes/${id}`) });
  const n = full.data;
  const [title, setTitle] = useState(subtaskTitle ? `Notes — ${subtaskTitle}` : ''); const [body, setBody] = useState(''); const [change, setChange] = useState('');
  const [loaded, setLoaded] = useState(!noteId); const [busy, setBusy] = useState(''); const [err, setErr] = useState(''); const [showHist, setShowHist] = useState(false); const [sharing, setSharing] = useState(false);
  const [share, setShare] = useState({ personId: '', contactName: '', dueDate: '' }); const [proper, setProper] = useState(false); const [hdrCo, setHdrCo] = useState(''); const [hdrColor, setHdrColor] = useState('navy');
  useEffect(() => { if (n && !loaded) { setTitle(n.title); setBody(n.body); setLoaded(true); } }, [n, loaded]);
  const dirty = loaded && (n ? title !== n.title || body !== n.body : title.trim() !== '' && (body.trim() !== '' || title !== (subtaskTitle ? `Notes — ${subtaskTitle}` : '')));
  const canWrite = !n || ['MEMBER', 'USER', 'MANAGER', 'ADMIN'].includes(roleIn(me, n.companyId) ?? '');
  const refresh = () => { qc.invalidateQueries({ queryKey: ['note'] }); qc.invalidateQueries({ queryKey: ['notes'] }); onChanged?.(); };

  const save = async (): Promise<string | undefined> => {
    if (!title.trim()) { setErr('Give the note a title.'); return undefined; }
    setBusy('save'); setErr('');
    try {
      let nid = id;
      if (!id) { const c = await api('/notes', { method: 'POST', body: { taskId, subtaskId: subtaskId ?? null, title, body } }); nid = c.id; setId(c.id); toast('Note saved.'); }
      else if (dirty) { const cur = await api(`/notes/${id}`); const r = await api(`/notes/${id}`, { method: 'PATCH', body: { expectedUpdatedAt: cur.updatedAt, title, body, changeNote: change.trim() || null } }); setChange(''); toast(`Saved as version ${r.version}.`); }
      await qc.invalidateQueries({ queryKey: ['note'] }); refresh(); return nid;
    } catch (e: any) { setErr(e.message); return undefined; } finally { setBusy(''); }
  };
  const setKind = async (kind: 'INTERNAL' | 'DRAFT') => {
    const nid = await save(); if (!nid) return; setBusy('kind');
    try { const cur = await api(`/notes/${nid}`); await api(`/notes/${nid}`, { method: 'PATCH', body: { expectedUpdatedAt: cur.updatedAt, kind } }); toast(kind === 'INTERNAL' ? `Now an internal note of ${cur.companyName}.` : 'No longer marked internal.'); refresh(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(''); }
  };
  const word = async (fmt?: 'raw') => { const nid = await save(); if (!nid) return; try { await downloadFile(`/notes/${nid}/export.docx${fmt ? `?format=${fmt}&companyId=${hdrCo || n?.companyId || ''}&color=${hdrColor}` : ''}`, 'note.docx'); } catch (e: any) { setErr(e.message); } };
  const openProper = async () => { const nid = await save(); if (!nid) return; if (!body.trim()) { setErr('Write your points first.'); return; } await qc.invalidateQueries({ queryKey: ['note'] }); setProper(true); };
  const doShare = async () => {
    const nid = await save(); if (!nid) return; setBusy('share'); setErr('');
    try { const r = await api(`/notes/${nid}/share`, { method: 'POST', body: { personId: share.personId || null, contactName: share.contactName || null, dueDate: share.dueDate || null } });
      toast(r.updated ? 'The pending discussion now carries the latest version.' : 'Shared to Discussions — find it there to record the outcome.'); setSharing(false); refresh(); qc.invalidateQueries({ queryKey: ['discussions'] }); }
    catch (e: any) { setErr(e.message); } finally { setBusy(''); }
  };
  const mark = (kind: 'bullet' | 'number') => {
    const el = ta.current; if (!el) return; const r = bulletize(body, el.selectionStart, el.selectionEnd, (i) => (kind === 'bullet' ? '- ' : `${i + 1}. `));
    setBody(r.text); setTimeout(() => { el.focus(); el.setSelectionRange(r.at, r.at); }, 0);
  };
  const pullOutcome = () => {
    const d = n?.discussion; if (!d?.doneAt) return;
    const add = ['', `--- After discussion (${fmtDate(d.doneAt)}) ---`, d.discussionNotes ? `Discussed: ${d.discussionNotes}` : '', d.decisions ? `Decisions: ${d.decisions}` : ''].filter((x, i) => i === 0 || x).join('\n');
    setBody((b) => b.replace(/\s+$/, '') + '\n' + add); setChange((c) => c || 'Incorporated the outcome of the discussion'); toast('Outcome added at the end — edit it into the text, then save.');
  };
  const close = () => { if (dirty && !confirm('You have unsaved changes in this note. Close without saving?')) return; onClose(); };
  const sharedOld = n?.discussion && n.sharedVersion !== n.version;

  return (
    <Modal wide title={`${id ? 'Note' : 'New note'}${n ? ` · v${n.version}` : ''}`} onClose={close}>
      {!loaded ? <p className="muted">Loading…</p> : <div className="form note-editor">
        {n && <p className="linked">{n.companyName} › {n.taskTitle}{n.subtaskTitle ? ` › ${n.subtaskTitle}` : ''} {n.kind === 'INTERNAL' && <Badge tone="blue">Internal note</Badge>} {n.discussion && <Badge tone={n.discussion.doneAt ? 'green' : 'amber'}>{n.discussion.doneAt ? 'Discussed' : 'In Discussions'}</Badge>}</p>}
        <label className="field"><span>Title</span><input value={title} onChange={(e) => setTitle(e.target.value)} disabled={!canWrite} autoFocus={!id} /></label>
        <div className="note-tools"><button type="button" onClick={() => mark('bullet')} disabled={!canWrite} title="Turn the selected lines into bullet points">• Bullets</button><button type="button" onClick={() => mark('number')} disabled={!canWrite} title="Number the selected lines">1. Numbers</button>
          <button type="button" onClick={() => setBody((b) => b + (b && !b.endsWith('\n') ? '\n' : '') + `${fmtDate(today())}: `)} disabled={!canWrite}>+ Date</button><button type="button" onClick={() => setReadFiles((v) => !v)} disabled={!canWrite} title="Attach files and let the AI add what is in them">+ From a file (AI)</button><span className="muted fine">Write text or points. Lines starting with “-” become bullets in Word.</span></div>
        {readFiles && <ReadFilesPanel taskId={n?.taskId ?? taskId} companyId={n?.companyId} existing={body} onUse={(t) => setBody((b) => b + (b && !b.endsWith('\n') ? '\n\n' : '') + t)} onClose={() => setReadFiles(false)} />}
        <textarea ref={ta} className="note-body" rows={14} value={body} disabled={!canWrite} onChange={(e) => setBody(e.target.value)} placeholder={'Write here…\n- point one\n- point two'} />
        {n && (dirty || change) && <label className="field"><span>What changed in this version? (shown in the Word file’s revision history)</span><input value={change} onChange={(e) => setChange(e.target.value)} placeholder="e.g. Added the decision on payment terms" /></label>}
        {n?.draft && n.draftFromVersion !== n.version && <div className="notice">The proper note was written from an earlier version of your points. Open it and press <b>Rewrite with AI</b> to bring it up to date.</div>}
        {sharedOld && <div className="notice">You changed this note after sharing it (shared as v{n.sharedVersion}, now v{n.version}). Use <b>Share to Discussions</b> again to circulate the latest version.</div>}
        {n?.discussion?.doneAt && canWrite && <div className="notice">The discussion is complete. <button type="button" className="linklike" onClick={pullOutcome}>Add its outcome to this note</button> so the decisions are included in the next version.</div>}
        {err && <p className="error">{err}</p>}
        {n && <HeaderPick companyId={hdrCo || n.companyId} color={hdrColor} onCompany={setHdrCo} onColor={setHdrColor} />}
        <div className="actions left wrap">
          {canWrite && <button className="primary" disabled={!!busy || (!!id && !dirty)} onClick={save}>{busy === 'save' ? 'Saving…' : id ? (dirty ? `Save as v${(n?.version ?? 0) + 1}` : '✓ Saved') : 'Save note'}</button>}
          {canWrite && <button disabled={!!busy} onClick={() => setKind(n?.kind === 'INTERNAL' ? 'DRAFT' : 'INTERNAL')}>{n?.kind === 'INTERNAL' ? 'Remove “internal”' : 'Make internal note'}</button>}
          {canWrite && <button className="primary" disabled={!!busy} onClick={openProper}>{n?.draft ? 'Open proper note' : 'Make proper note'}</button>}
          <button disabled={!!busy} onClick={() => word(n?.draft ? undefined : 'raw')}>⬇ Word{n?.draft ? ' — proper note' : ' (points)'}</button>
          {n?.draft && <button className="ghost" disabled={!!busy} onClick={() => word('raw')}>⬇ Word — raw points</button>}
          {canWrite && <button disabled={!!busy} onClick={() => setSharing(true)}>{n?.discussionId ? 'Share latest to Discussions' : 'Share to Discussions'}</button>}
          {n && n.versions.length > 1 && <button className="ghost" onClick={() => setShowHist(!showHist)}>Versions ({n.versions.length})</button>}
          <span className="spacer" /><button className="ghost" onClick={close}>Close</button>
        </div>
        {showHist && n && <ul className="history note-versions">{n.versions.map((v: any) => (
          <li key={v.id}><b>v{v.version}</b> <small className="muted">{fmtTime(v.createdAt)} · {v.authorName ?? ''}</small> {v.changeNote && <em> — {v.changeNote}</em>}
            {v.version !== n.version && canWrite && <button className="ghost small" onClick={() => { if (confirm(`Load v${v.version} into the editor? Your current text will be replaced (it stays in the history until you save).`)) { setTitle(v.title); setBody(v.body); setChange(`Restored v${v.version}`); setShowHist(false); } }}>Restore</button>}</li>))}</ul>}
      </div>}
      {proper && n && <ProperNote key={n.updatedAt + n.version} note={n} onClose={() => setProper(false)} onSaved={() => { qc.invalidateQueries({ queryKey: ['note'] }); onChanged?.(); }} />}
      {sharing && <Modal title="Share to Discussions" onClose={() => setSharing(false)}>
        <div className="form"><p className="muted">This creates a discussion item (or updates the pending one) carrying the note’s text as its agenda. When you settle it, the decisions can be pulled back into the note.</p>
          <label className="field"><span>Discuss with</span><select value={share.personId} onChange={(e) => setShare({ ...share, personId: e.target.value })}><option value="">— no one in particular —</option>{(people.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}{p.companyName ? ` — ${p.companyName}` : ' — shared'}</option>)}</select></label>
          {!share.personId && <label className="field"><span>…or type a name / group</span><input value={share.contactName} onChange={(e) => setShare({ ...share, contactName: e.target.value })} placeholder="Internal review" /></label>}
          <label className="field"><span>Discuss by (optional)</span><input type="date" value={share.dueDate} onChange={(e) => setShare({ ...share, dueDate: e.target.value })} /></label>
          <div className="actions"><button className="ghost" onClick={() => setSharing(false)}>Cancel</button><button className="primary" disabled={busy === 'share'} onClick={doShare}>{busy === 'share' ? 'Sharing…' : 'Share'}</button></div></div></Modal>}
    </Modal>
  );
}


// ───────────────────────── "Proper note": AI writes the rough points in the formal note format ─────────────────────────
interface Formal { headerCompanyId?: string | null; headerColor?: string | null; subject: string; salutation: string; points: { text: string; sub: string[] }[]; closing: string; signerTitle: string; date: string }
const toText = (pts: Formal['points']) => pts.map((p) => [p.text, ...p.sub.map((x) => `    - ${x}`)].join('\n')).join('\n');
const fromText = (t: string): Formal['points'] => { const out: Formal['points'] = [];
  for (const raw of t.replace(/\r\n/g, '\n').split('\n')) { if (!raw.trim()) continue; const ind = /^\s{2,}|^\t/.test(raw); const x = raw.trim().replace(/^([-*•–]|\d+[.)]|[a-z][.)])\s+/i, '');
    if (ind && out.length) out[out.length - 1].sub.push(x); else out.push({ text: x, sub: [] }); } return out; };

export const NOTE_COLORS: [string, string, string][] = [['navy', 'Navy blue', '#1F3864'], ['teal', 'Teal', '#0F766E'], ['crimson', 'Crimson', '#9F1239'], ['amber', 'Amber', '#B45309'], ['purple', 'Purple', '#6D28D9'], ['green', 'Green', '#15803D'], ['slate', 'Slate', '#334155']];
/** Which company's name and colour go in the header of the Word note. */
function HeaderPick({ companyId, color, onCompany, onColor, disabled }: { companyId: string; color: string; onCompany: (v: string) => void; onColor: (v: string) => void; disabled?: boolean }) {
  const { me } = useApp();
  const all = useQuery({ enabled: me.user.isAdmin, queryKey: ['companies-all'], queryFn: () => api<{ items: any[] }>('/companies?limit=200').then((r) => r.items) });
  const list = me.user.isAdmin ? (all.data ?? []).map((c) => ({ id: c.id, name: c.name })) : me.memberships.map((m) => ({ id: m.companyId, name: m.companyName }));
  return <div className="hdr-pick"><label className="field half"><span>Company in the note header</span><select value={companyId} disabled={disabled} onChange={(e) => onCompany(e.target.value)}>{list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    <label className="field half"><span>Colour</span><select value={color} disabled={disabled} onChange={(e) => onColor(e.target.value)}>{NOTE_COLORS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label></div>;
}
const hexFor = (key: string, _seed: string) => NOTE_COLORS.find((c) => c[0] === key)?.[2] ?? '#1F3864';
const mono = (n: string) => { const w = n.replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean); return (w.length > 1 ? w[0][0] + w[1][0] : (w[0] ?? 'D').slice(0, 2)).toUpperCase(); };

function PaperBanner({ companyId, color }: { companyId: string; color: string }) {
  const { me } = useApp(); const all = useQuery({ enabled: me.user.isAdmin, queryKey: ['companies-all'], queryFn: () => api<{ items: any[] }>('/companies?limit=200').then((r) => r.items) });
  const name = (me.user.isAdmin ? all.data?.find((c) => c.id === companyId)?.name : me.memberships.find((m) => m.companyId === companyId)?.companyName) ?? ''; const hex = hexFor(color, companyId);
  return <div className="paper-banner"><div className="pb-stripe"><i style={{ background: hex }} /><i style={{ background: hex + '99' }} /><i style={{ background: hex + '33' }} /></div>
    <div className="pb-row"><span className="pb-logo" style={{ background: hex }}>{mono(name)}</span><span className="pb-name" style={{ background: hex + '18', color: hex }}>{name.toUpperCase()}<small>INTERNAL NOTE</small></span></div><div className="pb-rule" style={{ background: hex }} /></div>;
}

function ProperNote({ note, onClose, onSaved }: { note: any; onClose: () => void; onSaved: () => void }) {
  const { me } = useApp(); const canWrite = ['MEMBER', 'USER', 'MANAGER', 'ADMIN'].includes(roleIn(me, note.companyId) ?? '');
  const [d, setD] = useState<Formal | null>(note.draft ?? null); const [txt, setTxt] = useState(note.draft ? toText(note.draft.points) : '');
  const [hdrCo, setHdrCo] = useState<string>(note.draft?.headerCompanyId || note.companyId); const [hdrColor, setHdrColor] = useState<string>(note.draft?.headerColor || 'navy');
  const [instruction, setInstruction] = useState(''); const [busy, setBusy] = useState(''); const [err, setErr] = useState(''); const [notice, setNotice] = useState(''); const [dirty, setDirty] = useState(false);
  const generate = async () => {
    setBusy('gen'); setErr('');
    try { const r = await api<any>(`/notes/${note.id}/draft/generate`, { method: 'POST', body: { instruction, headerCompanyId: hdrCo, headerColor: hdrColor, signerTitle: d?.signerTitle || undefined, salutation: d?.salutation || undefined, today: today() } });
      setD(r.draft); setTxt(toText(r.draft.points)); setNotice(r.notice ?? ''); setDirty(true); }
    catch (e: any) { setErr(e.message); } finally { setBusy(''); }
  };
  useEffect(() => { if (!note.draft && canWrite) generate(); }, []);
  const cur = (): Formal | null => d && { ...d, points: fromText(txt), headerCompanyId: hdrCo, headerColor: hdrColor } as Formal;
  const save = async (): Promise<boolean> => {
    const c = cur(); if (!c) return false; if (!c.points.length) { setErr('Add at least one point.'); return false; }
    setBusy('save'); setErr('');
    try { await api(`/notes/${note.id}/draft`, { method: 'PUT', body: { draft: c } }); setDirty(false); toast('Proper note saved.'); onSaved(); return true; }
    catch (e: any) { setErr(e.message); return false; } finally { setBusy(''); }
  };
  const word = async () => { if (dirty && !(await save())) return; try { await downloadFile(`/notes/${note.id}/export.docx?format=proper`, 'note.docx'); } catch (e: any) { setErr(e.message); } };
  const close = () => { if (dirty && !confirm('This draft has changes that are not saved. Close without saving?')) return; onClose(); };
  const set = (k: keyof Formal) => (e: any) => { setD({ ...(d as Formal), [k]: e.target.value }); setDirty(true); };
  const c = cur(); const left = [...new Set(`${c?.subject}\n${txt}`.match(/\[confirm:[^\]]*\]/gi) ?? [])];
  return (
    <Modal wide title="Proper note — draft" onClose={close}>
      <div className="proper-grid">
        <div className="form">
          <p className="muted fine">Your points are turned into a note in the office format. Check and edit the draft; the final goes to Word. Your original points stay untouched.</p>
          {notice && <div className="notice">{notice}</div>}
          <HeaderPick companyId={hdrCo} color={hdrColor} disabled={!canWrite} onCompany={(v) => { setHdrCo(v); setDirty(true); }} onColor={(v) => { setHdrColor(v); setDirty(true); }} />
          {!d ? <p className="muted">{busy === 'gen' ? 'Writing the note…' : 'No draft yet.'}</p> : <>
            <label className="field"><span>Subject (after “SUB:”)</span><input value={d.subject} onChange={set('subject')} disabled={!canWrite} /></label>
            <label className="field half"><span>Salutation</span><input value={d.salutation} onChange={set('salutation')} disabled={!canWrite} /></label>
            <label className="field half"><span>Closing</span><input value={d.closing} onChange={set('closing')} disabled={!canWrite} /></label>
            <label className="field"><span>Points (one per line; indent or “-” for a lettered sub-point)</span><textarea className="note-body" rows={12} value={txt} onChange={(e) => { setTxt(e.target.value); setDirty(true); }} disabled={!canWrite} /></label>
            <label className="field half"><span>Signed (designation)</span><input value={d.signerTitle} onChange={set('signerTitle')} disabled={!canWrite} /></label>
            <label className="field half"><span>Date</span><input value={d.date} onChange={set('date')} disabled={!canWrite} /></label></>}
          {canWrite && <label className="field"><span>Ask the AI to change something (optional)</span><input value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="e.g. make it shorter · group the costs as sub-points · more formal" /></label>}
          {left.length > 0 && <div className="warn-banner"><b>{left.length} detail{left.length > 1 ? 's' : ''} to confirm</b> before this goes out: {left.join(' · ')}</div>}
          {err && <p className="error">{err}</p>}
          <div className="actions left wrap">
            {canWrite && <button disabled={!!busy} onClick={generate}>{busy === 'gen' ? 'Writing…' : d ? '↻ Rewrite with AI' : 'Write it'}</button>}
            {canWrite && d && <button disabled={!!busy || !dirty} onClick={save}>{busy === 'save' ? 'Saving…' : dirty ? 'Save draft' : '✓ Saved'}</button>}
            {d && <button className="primary" disabled={!!busy} onClick={word}>⬇ Word — final note</button>}
            <span className="spacer" /><button className="ghost" onClick={close}>Close</button></div>
        </div>
        <div className="paper" aria-label="Preview">{c ? <>
          <PaperBanner companyId={hdrCo} color={hdrColor} />
          <p className="paper-sub" style={{ background: hexFor(hdrColor, hdrCo) + '18', borderColor: hexFor(hdrColor, hdrCo), color: hexFor(hdrColor, hdrCo) }}><b>SUB: {c.subject.replace(/^SUB:\s*/i, '').toUpperCase()}</b></p><p>{c.salutation}</p>
          <ol>{c.points.map((p, i) => <li key={i}>{p.text}{p.sub.length > 0 && <ol type="a">{p.sub.map((x, j) => <li key={j}>{x}</li>)}</ol>}</li>)}</ol>
          <p className="paper-close">{c.closing}</p><p>{c.signerTitle}<br />{c.date}</p></> : <p className="muted">The preview appears here.</p>}</div>
      </div>
    </Modal>
  );
}

/** The notes of one subtask (or of a whole task) — open from the button. */
export function NotesPanel({ taskId, subtaskId, subtaskTitle, onClose }: { taskId: string; subtaskId?: string; subtaskTitle?: string; onClose: () => void }) {
  const q = useQuery({ queryKey: ['notes', taskId, subtaskId ?? 'all'], queryFn: () => api<{ items: any[] }>(`/notes?taskId=${taskId}${subtaskId ? `&subtaskId=${subtaskId}` : ''}`).then((r) => r.items) });
  const [open, setOpen] = useState<{ id?: string } | null>(null);
  return (
    <Modal wide title={`Notes${subtaskTitle ? ` — ${subtaskTitle}` : ''}`} onClose={onClose}>
      <NotesList items={q.data} onOpen={(id) => setOpen({ id })} />
      <div className="actions left"><button className="primary" onClick={() => setOpen({})}>＋ New note</button><button className="ghost" onClick={onClose}>Close</button></div>
      {open && <NoteEditor noteId={open.id} taskId={taskId} subtaskId={subtaskId ?? null} subtaskTitle={subtaskTitle} onClose={() => setOpen(null)} onChanged={() => q.refetch()} />}
    </Modal>
  );
}
function NotesList({ items, onOpen, showWhere }: { items?: any[]; onOpen: (id: string) => void; showWhere?: boolean }) {
  if (items && !items.length) return <Empty>No notes yet. Write one with text or points; it can become an internal note, go to Word, and be shared to Discussions.</Empty>;
  return <ul className="calls note-list">{items?.map((n) => (
    <li key={n.id} className="call"><div className="call-main"><button className="linklike" onClick={() => onOpen(n.id)}><b>{n.title}</b></button> <Badge tone="grey">v{n.version}</Badge>{n.kind === 'INTERNAL' && <Badge tone="blue">Internal</Badge>}{n.discussionId && <Badge tone={n.discussionDoneAt ? 'green' : 'amber'}>{n.discussionDoneAt ? 'Discussed' : 'Shared'}</Badge>}
      <p className="call-note">{String(n.body).slice(0, 160)}{n.body.length > 160 ? '…' : ''}</p><small className="muted">{showWhere ? `${n.companyName} › ${n.taskTitle}${n.subtaskTitle ? ` › ${n.subtaskTitle}` : ''} · ` : n.subtaskTitle ? `on subtask “${n.subtaskTitle}” · ` : ''}updated {fmtTime(n.updatedAt)}</small></div>
      <div className="call-actions"><button className="ghost small" onClick={() => downloadFile(`/notes/${n.id}/export.docx`, 'note.docx').catch((e) => toast(e.message))}>⬇ Word</button></div></li>))}</ul>;
}

/** Task-level section inside the task window: every note of the task and its subtasks. */
export function TaskNotesSection({ taskId, canWrite }: { taskId: string; canWrite: boolean }) {
  const q = useQuery({ queryKey: ['notes', taskId, 'all'], queryFn: () => api<{ items: any[] }>(`/notes?taskId=${taskId}`).then((r) => r.items) });
  const [open, setOpen] = useState<{ id?: string } | null>(null);
  return <div>
    <NotesList items={q.data} onOpen={(id) => setOpen({ id })} />
    {canWrite && <button className="ghost add-sub-btn" onClick={() => setOpen({})}>＋ New note</button>}
    {open && <NoteEditor noteId={open.id} taskId={taskId} onClose={() => setOpen(null)} onChanged={() => q.refetch()} />}
  </div>;
}

/** Page: all notes, with the company's internal notes one click away. */
export function NotesPage() {
  const { companyId } = useApp(); const [kind, setKind] = useState<'' | 'INTERNAL'>('INTERNAL'); const [text, setText] = useState(''); const [open, setOpen] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['notes', 'page', companyId, kind, text], queryFn: () => api<{ items: any[] }>(`/notes?${companyId ? `companyId=${companyId}&` : ''}${kind ? `kind=${kind}&` : ''}${text ? `q=${encodeURIComponent(text)}` : ''}`).then((r) => r.items) });
  return <section>
    <div className="page-head"><div><h2>Notes</h2><p className="muted">Notes written against tasks and subtasks. Internal notes belong to a company; any note can be exported to Word or shared to Discussions. Create notes from the button on a task or subtask.</p></div></div>
    <div className="tabs"><button className={kind === 'INTERNAL' ? 'on' : ''} onClick={() => setKind('INTERNAL')}>Internal notes</button><button className={kind === '' ? 'on' : ''} onClick={() => setKind('')}>All notes</button></div>
    <div className="toolbar"><input className="search" placeholder="Search notes…" value={text} onChange={(e) => setText(e.target.value)} /></div>
    <div className="card pad"><NotesList items={q.data} showWhere onOpen={setOpen} /></div>
    {open && <NoteEditor noteId={open} onClose={() => setOpen(null)} onChanged={() => q.refetch()} />}
  </section>;
}

// ───────────────────────── Drill-down: Company → Project → Task → Subtask ─────────────────────────
type Where = { companyId?: string; projectId?: string; taskId?: string; subtaskId?: string };
export function Explorer() {
  const { me } = useApp(); const qc = useQueryClient();
  const [w, setW] = useState<Where>(() => { try { return JSON.parse(sessionStorage.getItem('cc.explore') ?? '{}'); } catch { return {}; } });
  const go = (n: Where) => { setW(n); try { sessionStorage.setItem('cc.explore', JSON.stringify(n)); } catch { /* ignore */ } };
  const [newProject, setNewProject] = useState<{ name?: string } | null>(null); const [taskOpen, setTaskOpen] = useState<string | null>(null); const [notesFor, setNotesFor] = useState<any>(null); const [addSub, setAddSub] = useState(false);
  const refresh = () => qc.invalidateQueries();

  const companies = useQuery({ queryKey: ['explore', 'c', today()], queryFn: () => api<any>(`/explore?today=${today()}`) });
  const projects = useQuery({ queryKey: ['explore', 'p', w.companyId], enabled: !!w.companyId, queryFn: () => api<any>(`/explore?companyId=${w.companyId}&today=${today()}`) });
  const tasks = useQuery({ queryKey: ['explore', 't', w.companyId, w.projectId], enabled: !!w.companyId && !!w.projectId, queryFn: () => api<{ items: any[] }>(`/tasks?companyId=${w.companyId}&projectId=${w.projectId}&completed=all&sort=due&limit=200`).then((r) => r.items) });
  const task = useQuery({ queryKey: ['task', w.taskId], enabled: !!w.taskId, queryFn: () => api<any>(`/tasks/${w.taskId}`) });
  const subs = useQuery({ queryKey: ['explore', 's', w.taskId], enabled: !!w.taskId, queryFn: () => api<{ items: any[] }>(`/tasks/${w.taskId}/subtasks`).then((r) => r.items) });
  const sub = subs.data?.find((s) => s.id === w.subtaskId);
  const subCalls = useQuery({ queryKey: ['explore', 'calls', w.taskId], enabled: !!w.subtaskId, queryFn: () => api<{ items: any[] }>(`/calls?status=all&taskId=${w.taskId}`).then((r) => r.items.filter((c) => c.subtaskId === w.subtaskId)) });
  const subDisc = useQuery({ queryKey: ['explore', 'disc', w.taskId], enabled: !!w.subtaskId, queryFn: () => api<{ items: any[] }>(`/discussions?status=all&taskId=${w.taskId}`).then((r) => r.items.filter((d) => d.subtaskId === w.subtaskId)) });
  const subNotes = useQuery({ queryKey: ['notes', w.taskId, w.subtaskId], enabled: !!w.subtaskId, queryFn: () => api<{ items: any[] }>(`/notes?taskId=${w.taskId}&subtaskId=${w.subtaskId}`).then((r) => r.items) });

  const co = me.memberships.find((m) => m.companyId === w.companyId);
  const companyName = co?.companyName ?? companies.data?.items.find((c: any) => c.id === w.companyId)?.name ?? '';
  const projectName = w.projectId === 'none' ? 'No project' : projects.data?.items.find((p: any) => p.id === w.projectId)?.name ?? task.data?.projectName ?? '';
  const mayCreateProject = isManager(me, w.companyId);

  const crumbs: [string, () => void][] = [['All companies', () => go({})]];
  if (w.companyId) crumbs.push([companyName || 'Company', () => go({ companyId: w.companyId })]);
  if (w.projectId) crumbs.push([projectName || 'Project', () => go({ companyId: w.companyId, projectId: w.projectId })]);
  if (w.taskId) crumbs.push([task.data?.title ?? 'Task', () => go({ companyId: w.companyId, projectId: w.projectId, taskId: w.taskId })]);
  if (w.subtaskId) crumbs.push([sub?.title ?? 'Subtask', () => undefined]);
  const stat = (open: number, over: number) => <><Badge tone="grey">{open} open</Badge>{over > 0 && <Badge tone="red">{over} overdue</Badge>}</>;

  return (
    <section>
      <div className="page-head"><div><h2>Drill-down</h2><p className="muted">Company → Project → Task → Subtask. Click to go deeper; click the trail above to come back.</p></div>
        {w.companyId && mayCreateProject && <button className="primary" onClick={() => setNewProject({})}>＋ New project</button>}</div>
      <nav className="crumbs" aria-label="Where you are">{crumbs.map(([label, fn], i) => <span key={i}>{i > 0 && <i> › </i>}{i === crumbs.length - 1 ? <b>{label}</b> : <button className="linklike" onClick={fn}>{label}</button>}</span>)}</nav>

      {!w.companyId && <div className="cards-grid">{companies.data?.items.map((c: any) => (
        <button key={c.id} className="drill-card" onClick={() => go({ companyId: c.id })}><b>{c.name}</b><small className="muted">{c.projects} project{c.projects === 1 ? '' : 's'}</small><span>{stat(c.openTasks, c.overdue)}</span></button>))}
        {companies.data && !companies.data.items.length && <Empty>No companies yet.</Empty>}</div>}

      {w.companyId && !w.projectId && <div className="cards-grid">
        {projects.data?.items.map((p: any) => (<button key={p.id} className="drill-card" onClick={() => go({ companyId: w.companyId, projectId: p.id })}><b>{p.name}</b><small className="muted">{PRIORITY_DOT[p.priority]} {p.status.replace('_', ' ').toLowerCase()}{p.targetDate ? ` · target ${fmtDate(p.targetDate)}` : ''}</small>
          <span>{stat(p.openTasks, p.overdue)}{p.doneTasks > 0 && <Badge tone="green">{p.doneTasks} done</Badge>}</span></button>))}
        {projects.data?.noProject?.openTasks > 0 && <button className="drill-card dashed" onClick={() => go({ companyId: w.companyId, projectId: 'none' })}><b>Tasks without a project</b><span>{stat(projects.data.noProject.openTasks, projects.data.noProject.overdue)}</span></button>}
        {projects.data && !projects.data.items.length && !projects.data.noProject?.openTasks && <Empty>No projects yet. {mayCreateProject ? 'Use “＋ New project” above.' : ''}</Empty>}</div>}

      {w.projectId && !w.taskId && <div className="card table-wrap"><table><thead><tr><th /><th>Task</th><th>Assigned to</th><th>Due</th><th>Status</th><th>Progress</th></tr></thead>
        <tbody>{tasks.data?.map((t) => (<tr key={t.id} className="clickable" onClick={() => go({ companyId: w.companyId, projectId: w.projectId, taskId: t.id })}><td>{PRIORITY_DOT[t.priority]}</td><td><b>{t.title}</b></td><td>{t.delegatedToName ?? <span className="muted">{t.ownerName}</span>}</td>
          <td className={t.dueDate && t.dueDate < today() && t.status !== 'DONE' ? 'red-text' : ''}>{fmtDate(t.dueDate)}</td><td><Badge tone={t.status === 'DONE' ? 'green' : 'grey'}>{STATUS_LABEL[t.status]}</Badge></td><td style={{ width: '6.5rem' }}><Progress value={t.progress} /></td></tr>))}</tbody></table>
        {tasks.data && !tasks.data.length && <Empty>No tasks in this project yet.</Empty>}</div>}

      {w.taskId && !w.subtaskId && task.data && <>
        <div className="card pad"><h3>{PRIORITY_DOT[task.data.priority]} {task.data.title}</h3>
          <p className="muted">{STATUS_LABEL[task.data.status]} · due {fmtDate(task.data.dueDate)}{task.data.delegatedToName ? ` · ${task.data.delegatedToName}` : ''}</p>
          <div className="actions left wrap"><button onClick={() => setTaskOpen(task.data.id)}>Open full task</button><button onClick={() => setNotesFor({ taskId: task.data.id })}>Task notes</button>
            {mayCreateProject && <button onClick={() => setNewProject({ name: task.data.title })}>＋ New project from this task</button>}
            {roleIn(me, task.data.companyId) !== 'VIEWER' && <button onClick={() => setAddSub(true)}>＋ Subtask</button>}</div></div>
        <h4 className="section-h">Subtasks ({subs.data?.length ?? 0})</h4>
        <div className="cards-grid">{subs.data?.map((s) => (<button key={s.id} className={'drill-card' + (s.status === 'DONE' ? ' is-done' : '')} onClick={() => go({ ...w, subtaskId: s.id })}><b>{s.status === 'DONE' ? '✓ ' : '◻ '}{s.title}</b>
          <small className="muted">{s.assigneeName ? `${s.assigneeName}` : 'unassigned'}{s.dueDate ? ` · due ${fmtDate(s.dueDate)}` : ''}</small></button>))}
          {subs.data && !subs.data.length && <Empty>No subtasks yet.</Empty>}</div></>}

      {w.subtaskId && sub && task.data && <>
        <div className="card pad"><h3>{sub.status === 'DONE' ? '✓ ' : ''}{sub.title}</h3><p className="muted">on “{task.data.title}” · {sub.assigneeName ? `${sub.assigneeName} · ` : ''}{sub.dueDate ? `due ${fmtDate(sub.dueDate)}` : 'no due date'}{sub.description ? ` — ${sub.description}` : ''}</p>
          <div className="actions left wrap"><button onClick={() => setNotesFor({ taskId: task.data.id, subtaskId: sub.id, subtaskTitle: sub.title })}>Notes</button>
            {mayCreateProject && <button onClick={() => setNewProject({ name: sub.title })}>＋ New project from this subtask</button>}<button onClick={() => setTaskOpen(task.data.id)}>Open full task</button></div></div>
        <h4 className="section-h">Notes ({subNotes.data?.length ?? 0})</h4>
        <NotesList items={subNotes.data} onOpen={(id) => setNotesFor({ taskId: task.data.id, subtaskId: sub.id, subtaskTitle: sub.title, noteId: id })} />
        <h4 className="section-h">Calls &amp; mails</h4><ul className="calls">{subCalls.data?.map((c) => <CallRow key={c.id} c={c} onChanged={refresh} />)}</ul>{subCalls.data && !subCalls.data.length && <p className="muted">None for this subtask.</p>}
        <h4 className="section-h">Discussions</h4><ul className="calls">{subDisc.data?.map((d) => <DiscussionRow key={d.id} d={d} onChanged={refresh} />)}</ul>{subDisc.data && !subDisc.data.length && <p className="muted">None for this subtask.</p>}</>}

      {newProject && w.companyId && <QuickProject companyId={w.companyId} name={newProject.name} onClose={() => setNewProject(null)}
        onCreated={async (p) => { qc.invalidateQueries({ queryKey: ['explore'] }); if (task.data && newProject.name) { try { if (await offerMove(task.data, p)) { go({ companyId: w.companyId, projectId: p.id, taskId: task.data.id, subtaskId: w.subtaskId }); refresh(); } } catch (e: any) { toast(e.message); } } }} />}
      {taskOpen && <TaskDetail key={taskOpen} id={taskOpen} onClose={() => setTaskOpen(null)} onChanged={refresh} />}
      {notesFor?.noteId ? <NoteEditor noteId={notesFor.noteId} onClose={() => setNotesFor(null)} onChanged={refresh} /> : notesFor ? <NotesPanel taskId={notesFor.taskId} subtaskId={notesFor.subtaskId} subtaskTitle={notesFor.subtaskTitle} onClose={() => setNotesFor(null)} /> : null}
      {addSub && task.data && <FormModal wide title={`Add subtask — ${task.data.title}`} submitLabel="Add subtask" onClose={() => setAddSub(false)} initial={{ title: '' }}
        fields={[{ key: 'title', label: 'Subtask', type: 'textarea', required: true, hint: 'Pasting a list from Word? You’ll be offered one subtask per line.' }]}
        bulk={{ field: 'title', noun: 'subtask', create: async (lines) => { await api(`/tasks/${task.data.id}/subtasks/bulk`, { method: 'POST', body: { items: lines.map((title) => ({ title })) } }); refresh(); } }}
        onSubmit={async (v) => { await api(`/tasks/${task.data.id}/subtasks`, { method: 'POST', body: { title: v.title } }); setAddSub(false); refresh(); }} />}
    </section>
  );
}

// ───────────────────────── Pending jobs → Word ─────────────────────────
export function PendingJobsCard() {
  const { companyId } = useApp(); const people = useAllPeople(); const [pid, setPid] = useState(''); const [busy, setBusy] = useState(false);
  const go = async () => { setBusy(true); try { await downloadFile(`/export-word/pending-jobs?today=${today()}${companyId ? `&companyId=${companyId}` : ''}${pid ? `&personId=${pid}` : ''}`, 'pending-jobs.docx'); toast('Word file ready — forward it to the person for their updates.'); } catch (e: any) { toast(e.message); } finally { setBusy(false); } };
  return <div className="card pad"><h3>Pending jobs — send to people (Word)</h3>
    <p className="muted">One Word file listing the open tasks and subtasks assigned to each person{companyId ? ' (for the company chosen at the top)' : ' (all companies you can see)'}, with an empty “Your update” column. Choose one person, or everyone (one page each).</p>
    <div className="inline"><select value={pid} onChange={(e) => setPid(e.target.value)}><option value="">Everyone with pending jobs</option>{(people.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}{p.companyName ? ` — ${p.companyName}` : ''}</option>)}</select>
      <button className="primary" disabled={busy} onClick={go}>{busy ? 'Preparing…' : '⬇ Download Word file'}</button></div></div>;
}

// ───────────────────────── Reminders: AI "today" briefing, water, walk ─────────────────────────
const SET_KEY = 'cc.rem.settings', ST_KEY = 'cc.rem.state';
const read = <T,>(k: string, d: T): T => { try { return { ...d, ...JSON.parse(localStorage.getItem(k) ?? '{}') }; } catch { return d; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };
export const loadReminderSettings = (): ReminderSettings => read<ReminderSettings>(SET_KEY, { water: true, walk: true, briefing: true, snoozeUntil: 0 });
interface Pop { id: number; kind: ReminderKind; briefing?: any }
const TEXT = {
  water: { icon: 'droplet', title: 'Water and a 5-minute break', body: 'Have a glass of water and look away from the screen for a few minutes.' },
  walk: { icon: 'walk', title: 'Time to move', body: 'Stand up and walk for 10 minutes. Your tasks will still be here.' },
} as const;
const HEALTH_KEY = 'cc.health';
const bump = (k: 'water' | 'walk') => { const d = today(); const h = read<{ date: string; water: number; walk: number }>(HEALTH_KEY, { date: d, water: 0, walk: 0 }); const n = h.date === d ? h : { date: d, water: 0, walk: 0 }; n[k] += 1; write(HEALTH_KEY, n); dispatchEvent(new Event('cc-health')); };
/** What the Today screen shows in its health strip: glasses of water so far, when the next walk and break are due. */
export function healthSnapshot() {
  const d = today(); const h = read<{ date: string; water: number; walk: number }>(HEALTH_KEY, { date: d, water: 0, walk: 0 }); const st = read<any>(ST_KEY, { dayStart: Date.now(), lastWalk: 0, lastWater: 0 }); const set = loadReminderSettings();
  const start = st.date === d ? st.dayStart : Date.now(); const now = Date.now();
  const nextWalk = start + (Math.floor((now - start) / 60_000 / 45) + 1) * 45 * 60_000; const nextBreak = start + (Math.floor((now - start) / 60_000 / 60) + 1) * 60 * 60_000;
  return { water: h.date === d ? h.water : 0, walks: h.date === d ? h.walk : 0, walkAt: nextWalk, breakInMin: Math.max(1, Math.round((nextBreak - now) / 60_000)), on: set.water || set.walk };
}

export function Reminders() {
  const { companyId } = useApp(); const [pops, setPops] = useState<Pop[]>([]); const seq = useRef(1);
  const add = (p: Omit<Pop, 'id'>) => setPops((x) => [...x, { ...p, id: seq.current++ }]);
  const briefing = async () => {
    try { const b = await api<any>('/ai/briefing', { method: 'POST', body: { today: today(), companyId: companyId || undefined } }); add({ kind: 'briefing', briefing: b }); if (b.counts.total) desktopNotify('DOOD — today', b.message.slice(0, 160)); }
    catch { /* offline or signed out — try again at the next slot */ }
  };
  useEffect(() => {
    const tick = () => {
      const now = Date.now(); const d = today(); let st = read<ReminderState & { date?: string }>(ST_KEY, { dayStart: now, lastWalk: 0, lastWater: 0, lastBriefing: -1 });
      if (st.date !== d) st = { date: d, dayStart: now, lastWalk: 0, lastWater: 0, lastBriefing: -1 };
      const r = dueReminders(now, st, loadReminderSettings()); write(ST_KEY, { ...r.state, date: d });
      for (const k of r.due) { if (k === 'briefing') briefing(); else { add({ kind: k }); desktopNotify(TEXT[k].title, TEXT[k].body); } }
    };
    tick(); const t = setInterval(tick, 20_000);
    const test = (e: Event) => { const k = (e as CustomEvent).detail as ReminderKind; if (k === 'briefing') briefing(); else add({ kind: k }); };
    addEventListener('cc-remind-test', test); return () => { clearInterval(t); removeEventListener('cc-remind-test', test); };
  }, [companyId]);
  if (!pops.length) return null;
  const close = (id: number) => setPops((x) => x.filter((p) => p.id !== id));
  const snooze = (p: Pop, min: number) => { close(p.id); setTimeout(() => (p.kind === 'briefing' ? briefing() : add({ kind: p.kind })), min * 60_000); };
  const worked = (() => { const st = read<any>(ST_KEY, { dayStart: Date.now() }); return Math.max(1, Math.round((Date.now() - (st.dayStart ?? Date.now())) / 60_000)); })();
  return <div className="reminder-stack" role="status" aria-live="polite">{pops.map((p) => p.kind === 'briefing' ? (
    <div key={p.id} className="reminder-card brief"><header><span><Ic n="sparkles" /></span> <b>Today at a glance</b><button className="icon x-close" aria-label="Close" title="Close" onClick={() => close(p.id)}>✕</button></header>
      <div className="doodu-row"><Doodu pose="briefing" size={72} /><p>{p.briefing.message}</p></div>
      {p.briefing.notice && <small className="muted">{p.briefing.notice}</small>}
      <div className="actions"><button className="small ghost" onClick={() => snooze(p, 60)}>Remind in 1 hour</button><button className="small" onClick={() => { close(p.id); goto('home'); }}>Open Today</button><button className="small primary" onClick={() => close(p.id)}>Got it</button></div></div>
  ) : (
    <div key={p.id} className={'reminder-card ' + p.kind}><header><span><Ic n={TEXT[p.kind].icon} /></span> <b>{TEXT[p.kind].title}</b><button className="icon x-close" aria-label="Close" title="Close" onClick={() => close(p.id)}>✕</button></header><div className="doodu-row"><Doodu pose={p.kind as 'water' | 'walk'} size={72} /><p>{p.kind === 'water' ? `You have been working for ${worked} minutes. ` : ''}{TEXT[p.kind].body}</p></div>
      <div className="actions"><button className="small primary" onClick={() => { bump(p.kind as 'water' | 'walk'); close(p.id); }}>Done</button><button className="small ghost" onClick={() => snooze(p, 10)}>Snooze 10 min</button></div></div>))}</div>;
}

export function ReminderCard() {
  const [s, setS] = useState<ReminderSettings>(loadReminderSettings());
  const upd = (patch: Partial<ReminderSettings>) => { const n = { ...s, ...patch }; setS(n); write(SET_KEY, n); };
  const snoozed = s.snoozeUntil > Date.now();
  const row = (k: 'briefing' | 'water' | 'walk', label: string, hint: string) => <label className="rem-row"><input type="checkbox" checked={s[k]} onChange={(e) => upd({ [k]: e.target.checked })} /><span><b>{label}</b><small className="muted">{hint}</small></span><button type="button" className="ghost small" onClick={() => dispatchEvent(new CustomEvent('cc-remind-test', { detail: k }))}>Preview</button></label>;
  return <div className="card pad"><h3>Reminders &amp; health</h3>
    <p className="muted">Pop-ups appear while DOOD is open in your browser. Walk and water reminders are counted from the first time you open DOOD each day. These settings are saved on this computer.</p>
    {row('briefing', 'Today’s pending work (AI message)', 'When you open DOOD, then every 3 hours. Items marked “Private · no AI” are listed but never sent to the AI.')}
    {row('water', 'Drink water + 5-minute break', 'Every hour.')}
    {row('walk', 'Stand up and walk for 10 minutes', 'Every 45 minutes from your first open of the day.')}
    <div className="actions left"><button className="ghost" onClick={() => upd({ snoozeUntil: snoozed ? 0 : Date.now() + 3_600_000 })}>{snoozed ? 'Resume reminders now' : 'Pause all for 1 hour'}</button>
      {!snoozed && <button className="ghost" onClick={() => { const e = new Date(); e.setHours(24, 0, 0, 0); upd({ snoozeUntil: e.getTime() }); }}>Pause for today</button>}</div>
    {snoozed && <p className="muted">Paused until {new Date(s.snoozeUntil).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}.</p>}</div>;
}
