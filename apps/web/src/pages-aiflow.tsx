// The AI assistants (Quick add, Read a letter, Smart follow-up + Reply reader) and the small global pop-ups (search palette, focus picker).
// AI only SUGGESTS: every screen shows what Dood understood, and nothing is saved, sent or completed until the person presses the button.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, addDays, copyText, fileToBase64, fmtDate, goto, today } from './api';
import { Modal, toast, useApp, roleIn } from './ui';
import { useAllPeople, useProjectsOf, useList } from './hooks';
import { useFocus } from './timer';
import { Ic } from './icons';
import { openLetter, openQuickAdd, openWhatsApp, type FollowDetail } from './bus';
import { useAiStatus } from './pages-ai';

const msgOf = (e: any) => String(e?.message ?? 'Something went wrong');
const isNoAi = (e: any) => e?.code === 'AI_NOT_SET_UP';
const Skipped = ({ n }: { n: number }) => n > 0 ? <p className="ai-note"><Ic n="lock" s={14} />{n} task{n === 1 ? '' : 's'} marked Private · no AI {n === 1 ? 'was' : 'were'} skipped and not sent to AI.</p> : null;

// ───────────────────────── Quick add ─────────────────────────
export function useRecorder(onText: (t: string) => void, onError: (m: string) => void) {
  const [rec, setRec] = useState(false); const [busy, setBusy] = useState(false); const mr = useRef<MediaRecorder | null>(null); const chunks = useRef<Blob[]>([]);
  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const m = new MediaRecorder(stream); mr.current = m; chunks.current = [];
      m.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      m.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop()); setBusy(true);
        try { const blob = new Blob(chunks.current, { type: m.mimeType || 'audio/webm' }); const b64 = await fileToBase64(new File([blob], 'v')); const r = await api<{ text: string }>('/ai/transcribe', { method: 'POST', body: { audioBase64: b64, mimeType: blob.type } }); if (r.text) onText(r.text); else onError('Nothing was heard. Please try again.'); }
        catch (e) { onError(isNoAi(e) ? 'Voice needs AI, which is not set up on this computer yet.' : msgOf(e)); } finally { setBusy(false); }
      };
      m.start(); setRec(true);
    } catch { onError('The microphone could not be opened. Allow the microphone for this site, or type instead.'); }
  };
  const stop = () => { mr.current?.stop(); setRec(false); };
  return { rec, busy, toggle: () => (rec ? stop() : start()) };
}

export function QuickAdd({ initialText, onClose }: { initialText?: string; onClose: () => void }) {
  const { me, companyId } = useApp(); const qc = useQueryClient(); const ai = useAiStatus();
  const [text, setText] = useState(initialText ?? ''); const [busy, setBusy] = useState(false); const [note, setNote] = useState<{ cls: string; t: string } | null>(null); const [skipped, setSkipped] = useState(0);
  const writable = me.memberships.filter((m) => roleIn(me, m.companyId) !== 'VIEWER');
  const [d, setD] = useState<any>({ kind: 'task', title: '', companyId: companyId || writable[0]?.companyId || '', projectId: '', parentTaskId: '', personId: '', dueDate: '', followUpDate: '', priority: 3 });
  const [understood, setUnderstood] = useState(false); const [saving, setSaving] = useState(false);
  const people = useAllPeople(); const projects = useProjectsOf(d.companyId);
  const tasks = useList('qa-tasks', '/tasks', { completed: 'false', sort: 'title' }, d.kind === 'subtask');
  const mic = useRecorder((t) => { setText(t); run(t); }, (m) => setNote({ cls: 'err', t: m }));
  const set = (k: string, v: any) => setD((x: any) => ({ ...x, [k]: v }));
  const run = async (t = text) => {
    if (t.trim().length < 2) return; setBusy(true); setNote(null);
    try {
      const r = await api<any>('/ai/quickadd', { method: 'POST', body: { text: t.trim(), today: today() } });
      setD((x: any) => ({ ...x, ...Object.fromEntries(Object.entries(r.draft).map(([k, v]) => [k, v ?? (k === 'priority' ? 3 : '')])), companyId: r.draft.companyId ?? x.companyId })); setSkipped(r.skippedPrivate ?? 0); setUnderstood(true);
    } catch (e) { setNote({ cls: 'warn', t: (isNoAi(e) ? 'AI is not set up on this computer, so please fill the fields below yourself. ' : msgOf(e) + ' ') + 'You can still add it by hand.' }); setD((x: any) => ({ ...x, title: x.title || t.trim().slice(0, 200) })); setUnderstood(true); }
    finally { setBusy(false); }
  };
  const create = async () => {
    if (!d.title.trim()) { setNote({ cls: 'err', t: 'Give it a title first.' }); return; }
    setSaving(true);
    try {
      let taskId = d.parentTaskId, subId: string | null = null, coId = d.companyId;
      if (d.kind === 'subtask' && d.parentTaskId) {
        const s = await api<any>(`/tasks/${d.parentTaskId}/subtasks`, { method: 'POST', body: { title: d.title.trim(), dueDate: d.dueDate || null, assigneeId: d.personId || null, priority: Number(d.priority) || 3 } }); subId = s.id;
        coId = tasks.items.find((t) => t.id === d.parentTaskId)?.companyId ?? coId;
      } else {
        if (!d.companyId) throw new Error('Choose the company first.');
        const t = await api<any>('/tasks', { method: 'POST', body: { companyId: d.companyId, title: d.title.trim(), projectId: d.projectId || null, priority: Number(d.priority) || 3, status: d.personId ? 'DELEGATED' : 'TODO', dueDate: d.dueDate || null, delegatedToId: d.personId || null, nextFollowupDate: d.followUpDate || null, description: d.notes || null } }); taskId = t.id;
      }
      if (d.followUpDate && taskId) await api('/followups', { method: 'POST', body: { taskId, subtaskId: subId, type: 'WHATSAPP', personId: d.personId || null, dueDate: d.followUpDate, note: d.title.trim() } });
      void coId; toast(d.kind === 'subtask' ? 'Subtask added.' : 'Task created.'); qc.invalidateQueries(); onClose();
    } catch (e) { setNote({ cls: 'err', t: msgOf(e) }); } finally { setSaving(false); }
  };
  const person = (people.data ?? []).find((p: any) => p.id === d.personId);
  return (
    <Modal wide title="Quick add" onClose={onClose}>
      <div className="wiz-grid">
        <div>
          <label className="field"><span>Say it or type it. English or Malayalam.</span><textarea rows={3} autoFocus value={text} placeholder="Ask Anil for the end-use letter by Friday, remind me on Thursday" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) run(); }} /></label>
          <div className="actions left" style={{ marginTop: '0.5rem' }}>
            <button className="primary" disabled={busy || text.trim().length < 2} onClick={() => run()}><Ic n="sparkles" />{busy ? 'Reading…' : 'Understand'}</button>
            <button className={mic.rec ? '' : ''} disabled={mic.busy} onClick={mic.toggle} title="Speak">{mic.rec ? <><i className="rec-dot" />Stop</> : <><Ic n="mic" />{mic.busy ? 'Listening…' : 'Speak'}</>}</button>
            {!understood && <button className="ghost" onClick={() => setUnderstood(true)}>Fill it in myself</button>}
          </div>
          {ai.data && !ai.data.enabled && <p className="ai-note warn"><Ic n="info" s={14} />AI is not set up here, so Dood cannot read sentences yet. You can still add things by hand.</p>}
        </div>
        {note && <p className={'ai-note ' + note.cls}><Ic n={note.cls === 'err' ? 'alert' : 'info'} s={14} />{note.t}</p>}
        <Skipped n={skipped} />
        {understood && (
          <div className="wiz-card">
            <h3 style={{ marginBottom: '0.6rem' }}>Dood will create</h3>
            <div className="form">
              <label className="field half"><span>What</span><select value={d.kind} onChange={(e) => set('kind', e.target.value)}><option value="task">A task</option><option value="subtask">A subtask of a task</option></select></label>
              {d.kind === 'subtask' ? <label className="field half"><span>Under task</span><select value={d.parentTaskId} onChange={(e) => set('parentTaskId', e.target.value)}><option value="">Choose…</option>{tasks.items.map((t: any) => <option key={t.id} value={t.id}>{t.title} · {t.companyName}</option>)}</select></label>
                : <label className="field half"><span>Company</span><select value={d.companyId} onChange={(e) => set('companyId', e.target.value)}>{writable.map((m) => <option key={m.companyId} value={m.companyId}>{m.companyName}</option>)}</select></label>}
              <label className="field"><span>Title</span><input value={d.title} onChange={(e) => set('title', e.target.value)} /></label>
              {d.kind === 'task' && <label className="field half"><span>Project</span><select value={d.projectId} onChange={(e) => set('projectId', e.target.value)}><option value="">None</option>{(projects.data ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
              <label className="field half"><span>Person</span><select value={d.personId} onChange={(e) => set('personId', e.target.value)}><option value="">Me / nobody</option>{(people.data ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.name}{p.companyName ? ` (${p.companyName})` : ''}</option>)}</select></label>
              <label className="field half"><span>Due date</span><input type="date" value={d.dueDate ?? ''} onChange={(e) => set('dueDate', e.target.value)} /></label>
              <label className="field half"><span>Follow-up on</span><input type="date" value={d.followUpDate ?? ''} onChange={(e) => set('followUpDate', e.target.value)} /></label>
              <label className="field half"><span>Priority</span><select value={d.priority} onChange={(e) => set('priority', e.target.value)}>{[[1, 'Critical'], [2, 'High'], [3, 'Medium'], [4, 'Low']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            </div>
            <p className="muted" style={{ fontSize: 12 }}>{person ? `${person.name} will be given this. ` : ''}Nothing is saved until you press Create.</p>
            <div className="actions"><button className="ghost" onClick={onClose}>Cancel</button><button className="primary" disabled={saving} onClick={create}>{saving ? 'Creating…' : 'Create'}</button></div>
          </div>)}
      </div>
    </Modal>
  );
}

// ───────────────────────── Read a letter ─────────────────────────
export function LetterReader({ taskId, onClose }: { taskId?: string; onClose: () => void }) {
  const qc = useQueryClient(); const [file, setFile] = useState<File | null>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const [r, setR] = useState<any>(null); const [sel, setSel] = useState<string>(taskId ?? ''); const [subs, setSubs] = useState<any[]>([]); const [reply, setReply] = useState<any>(null); const [working, setWorking] = useState('');
  const read = async (f: File) => {
    setFile(f); setErr(''); setR(null); setReply(null);
    if (f.size > 15 * 1024 * 1024) { setErr('That file is over 15 MB.'); return; }
    if (!/^(application\/pdf|image\/(png|jpe?g|webp))$/.test(f.type)) { setErr('Please choose a PDF or a photo (JPG or PNG).'); return; }
    setBusy(true);
    try {
      const x = await api<any>('/ai/letter', { method: 'POST', body: { fileName: f.name, mimeType: f.type === 'image/jpg' ? 'image/jpeg' : f.type, dataBase64: await fileToBase64(f), today: today() } });
      setR(x); setSel((s) => s || x.matchedTaskId || ''); setSubs(x.suggestions.map((s: any, i: number) => ({ ...s, id: i, on: true })));
    } catch (e) { setErr(isNoAi(e) ? 'AI is not set up on this computer, so the letter cannot be read yet. You can still save it to a task from the task screen.' : msgOf(e)); } finally { setBusy(false); }
  };
  const createSubs = async () => {
    if (!sel) { setErr('Choose the task these belong to.'); return; } setWorking('subs'); setErr('');
    try { for (const s of subs.filter((x) => x.on && x.title.trim())) await api(`/tasks/${sel}/subtasks`, { method: 'POST', body: { title: s.title.trim(), dueDate: s.dueDate || null, assigneeId: s.personId || null } }); toast('Subtasks created.'); qc.invalidateQueries(); } catch (e) { setErr(msgOf(e)); } finally { setWorking(''); }
  };
  const saveFile = async () => {
    if (!sel || !file) { setErr('Choose the task to save the letter to.'); return; } setWorking('file'); setErr('');
    try { await api(`/tasks/${sel}/attachments`, { method: 'POST', body: { fileName: file.name, mimeType: file.type, dataBase64: await fileToBase64(file) } }); toast('Letter saved to the task files.'); qc.invalidateQueries(); } catch (e) { setErr(msgOf(e)); } finally { setWorking(''); }
  };
  const draft = async () => {
    setWorking('reply'); setErr('');
    try { setReply(await api<any>('/ai/letter/reply', { method: 'POST', body: { from: r.from, subject: r.subject, summary: r.summary, asks: r.asks, replyDeadline: r.replyDeadline } })); } catch (e) { setErr(msgOf(e)); } finally { setWorking(''); }
  };
  return (
    <Modal wide title="Read a letter" onClose={onClose}>
      <div className="wiz-grid">
        <label className="field"><span>Upload a PDF or a photo of a letter, notice or email</span><input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(e) => e.target.files?.[0] && read(e.target.files[0])} /></label>
        {busy && <p className="ai-note"><Ic n="sparkles" s={14} />Reading the letter…</p>}
        {err && <p className="ai-note err"><Ic n="alert" s={14} />{err}</p>}
        {r && <>
          <Skipped n={r.skippedPrivate} />
          <div className="wiz-card">
            <h3>{r.subject || 'Summary'}{r.from ? <span className="muted" style={{ fontWeight: 400 }}> · from {r.from}</span> : null}</h3>
            <p style={{ margin: '0.4rem 0' }}>{r.summary}</p>
            {r.asks.length > 0 && <><h4 style={{ marginTop: '0.6rem' }}>What is being asked</h4><ul style={{ margin: '0.2rem 0', paddingLeft: '1.1rem' }}>{r.asks.map((a: string, i: number) => <li key={i}>{a}</li>)}</ul></>}
            <p style={{ marginTop: '0.6rem' }}><b>Reply by:</b> {r.replyDeadline ? <span className="chip amber">{fmtDate(r.replyDeadline)}</span> : <span className="muted">no deadline stated</span>}</p>
          </div>
          <div className="wiz-card">
            <label className="field"><span>Matching task {r.matchedTaskId ? '(Dood found this one)' : '(none matched, choose one if any)'}</span>
              <select value={sel} onChange={(e) => setSel(e.target.value)}><option value="">No task</option>{r.tasks.map((t: any) => <option key={t.id} value={t.id}>{t.title} · {t.company}</option>)}</select></label>
            <h4 style={{ margin: '0.8rem 0 0.2rem' }}>Suggested subtasks</h4>
            {!subs.length && <p className="muted">No steps suggested.</p>}
            {subs.map((s, i) => (
              <div className="tickrow" key={s.id}><input type="checkbox" checked={s.on} onChange={(e) => setSubs(subs.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))} aria-label="Include" />
                <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  <input style={{ flex: '1 1 14rem' }} value={s.title} onChange={(e) => setSubs(subs.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
                  <select style={{ width: 'auto' }} value={s.personId ?? ''} onChange={(e) => setSubs(subs.map((x, j) => (j === i ? { ...x, personId: e.target.value } : x)))}><option value="">Nobody</option>{r.people.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                  <input style={{ width: 'auto' }} type="date" value={s.dueDate ?? ''} onChange={(e) => setSubs(subs.map((x, j) => (j === i ? { ...x, dueDate: e.target.value } : x)))} /></div></div>))}
            <div className="actions left" style={{ marginTop: '0.8rem' }}>
              <button className="primary" disabled={!sel || !subs.some((s) => s.on) || working === 'subs'} onClick={createSubs}>Create subtasks</button>
              <button disabled={working === 'reply'} onClick={draft}><Ic n="file" />{working === 'reply' ? 'Writing…' : 'Draft reply letter'}</button>
              <button disabled={!sel || working === 'file'} onClick={saveFile}><Ic n="clip" />Save letter to task files</button></div>
          </div>
          {reply && <div className="wiz-card"><h3>{reply.subject}</h3><textarea className="msg-box" rows={10} value={reply.body} onChange={(e) => setReply({ ...reply, body: e.target.value })} />
            <div className="actions left"><button onClick={() => { copyText(`${reply.subject}\n\n${reply.body}`); toast('Copied.'); }}><Ic n="copy" />Copy</button></div></div>}
        </>}
      </div>
    </Modal>
  );
}

// ───────────────────────── Smart follow-up + Reply reader ─────────────────────────
const TONE_L = { gentle: '1st · Gentle', firm: '2nd · Firm', escalate: '3rd · Escalate' } as const;
const maskPhone = (p?: string | null) => { const d = String(p ?? '').replace(/\D/g, ''); return d.length >= 4 ? `+91 ••••• ••${d.slice(-3)}` : 'no phone saved'; };

export function FollowUpWizard({ f, onClose }: { f: FollowDetail; onClose: () => void }) {
  const qc = useQueryClient(); const [tone, setTone] = useState<keyof typeof TONE_L | null>(null); const [lang, setLang] = useState<'en' | 'ml'>('en');
  const [m, setM] = useState<any>(null); const [text, setText] = useState(''); const [edit, setEdit] = useState(false); const [err, setErr] = useState(''); const [busy, setBusy] = useState(true);
  const [sent, setSent] = useState<null | 'whatsapp' | 'email' | 'copy'>(null); const [next, setNext] = useState(''); const [logging, setLogging] = useState(false);
  const [reply, setReply] = useState(''); const [rd, setRd] = useState<any>(null); const [rbusy, setRbusy] = useState(false); const [ticks, setTicks] = useState<Record<string, boolean>>({}); const [rerr, setRerr] = useState('');
  const load = async (t: typeof tone, l = lang) => {
    setBusy(true); setErr('');
    try { const r = await api<any>('/ai/followup-message', { method: 'POST', body: { taskId: f.taskId, subtaskId: f.subtaskId ?? null, personId: f.personId ?? null, tone: t ?? undefined, language: l, today: today() } }); setM(r); setText(r.message); setTone((x) => x ?? r.tone); setNext((n) => n || addDays(today(), r.tone === 'gentle' ? 3 : r.tone === 'firm' ? 2 : 1)); }
    catch (e) { setErr(msgOf(e)); } finally { setBusy(false); }
  };
  useEffect(() => { load(null); }, []);
  const pick = (t: keyof typeof TONE_L) => { setTone(t); setSent(null); setNext(addDays(today(), t === 'gentle' ? 3 : t === 'firm' ? 2 : 1)); load(t); };
  const to = m?.to; const mgr = m?.manager;
  const open = () => { openWhatsApp(to?.phone, text); setSent('whatsapp'); };
  const mail = () => { const q = new URLSearchParams(); const subj = `Reminder: ${m?.itemTitle ?? ''}`; const cc = mgr?.email ? `&cc=${encodeURIComponent(mgr.email)}` : ''; window.open(`mailto:${encodeURIComponent(to?.email ?? '')}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(text)}${cc}`, '_self'); void q; setSent('email'); };
  const copy = async () => { await copyText(text); toast('Copied.'); setSent('copy'); };
  const log = async () => {
    if (!sent || !tone) return; setLogging(true); setErr('');
    try {
      await api(`/tasks/${f.taskId}/followups`, { method: 'POST', body: { type: sent === 'email' ? 'EMAIL' : 'WHATSAPP', subtaskId: f.subtaskId ?? null, personId: to?.id ?? f.personId ?? null, notes: `Reminder (${TONE_L[tone]}) ${sent === 'copy' ? 'copied to send' : 'sent on ' + (sent === 'email' ? 'email' : 'WhatsApp')}: ${text}`, nextDate: next || null, today: today(), reminder: { tone, via: sent, message: text } } });
      toast(next ? `Logged. Next follow-up on ${fmtDate(next)}.` : 'Logged.'); qc.invalidateQueries(); setSent(null); load(tone);
    } catch (e) { setErr(msgOf(e)); } finally { setLogging(false); }
  };
  const read = async () => {
    setRbusy(true); setRerr(''); setRd(null);
    try { const r = await api<any>('/ai/reply-read', { method: 'POST', body: { taskId: f.taskId, subtaskId: f.subtaskId ?? null, personId: f.personId ?? to?.id ?? null, replyText: reply, today: today() } }); setRd(r); setTicks(Object.fromEntries(r.updates.map((u: any) => [u.id, true]))); }
    catch (e) { setRerr(isNoAi(e) ? 'AI is not set up on this computer, so the reply cannot be read. You can update the task by hand.' : msgOf(e)); } finally { setRbusy(false); }
  };
  const apply = async () => {
    setRbusy(true); setRerr('');
    try {
      for (const u of rd.updates.filter((x: any) => ticks[x.id])) {
        if (u.kind === 'SUBTASK_DONE' || u.kind === 'SUBTASK_DOING') { const subs = await api<{ items: any[] }>(`/tasks/${f.taskId}/subtasks`); const s = subs.items.find((x) => x.id === f.subtaskId); if (s) await api(`/subtasks/${s.id}`, { method: 'PATCH', body: { expectedUpdatedAt: s.updatedAt, status: u.kind === 'SUBTASK_DONE' ? 'DONE' : 'DOING' } }); }
        if (u.kind === 'NEXT_FOLLOWUP') await api('/followups', { method: 'POST', body: { taskId: f.taskId, subtaskId: f.subtaskId ?? null, type: 'WHATSAPP', personId: f.personId ?? to?.id ?? null, dueDate: u.date, note: 'Check on the reply' } });
        if (u.kind === 'HISTORY_NOTE') await api('/comments', { method: 'POST', body: { entityType: 'TASK', entityId: f.taskId, body: u.note } });
      }
      toast('Updates applied.'); qc.invalidateQueries(); setRd(null); setReply('');
    } catch (e) { setRerr(msgOf(e)); } finally { setRbusy(false); }
  };
  const nTick = rd ? rd.updates.filter((u: any) => ticks[u.id]).length : 0;
  const statusL: Record<string, string> = { done: 'Done', partly_done: 'Partly done', new_date: 'New date promised', no_update: 'No update' };
  return (
    <Modal wide title={m ? `Follow up with ${to?.name ?? 'the person'}${m.subtaskId ? ' · ' + m.itemTitle : ''}` : 'Follow up'} onClose={onClose}>
      <div className="wiz-grid">
        {m && <p className="muted" style={{ marginTop: -8 }}>{m.company} › {m.taskTitle}{m.overdueDays ? ` · overdue ${m.overdueDays} day${m.overdueDays === 1 ? '' : 's'}` : ''} · {m.priorReminders ? `reminded ${m.priorReminders} time${m.priorReminders === 1 ? '' : 's'}${m.lastReminded ? ', last on ' + fmtDate(m.lastReminded) : ''}` : 'no reminder sent yet'}</p>}
        {err && <p className="ai-note err"><Ic n="alert" s={14} />{err}</p>}
        <div className="wiz-card">
          <h3 style={{ marginBottom: '0.6rem' }}>1 · Smart follow-up message</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
            <div><small className="muted">Tone</small><br /><div className="tone-seg">{(Object.keys(TONE_L) as (keyof typeof TONE_L)[]).map((k) => <button key={k} className={tone === k ? 'on' : ''} onClick={() => pick(k)}>{TONE_L[k]}</button>)}</div></div>
            <div><small className="muted">Language</small><br /><div className="tone-seg"><button className={lang === 'en' ? 'on' : ''} onClick={() => { setLang('en'); load(tone, 'en'); }}>English</button><button className={lang === 'ml' ? 'on' : ''} onClick={() => { setLang('ml'); load(tone, 'ml'); }}>മലയാളം</button></div></div>
          </div>
          {m && <p className="muted" style={{ margin: '0.7rem 0 0', fontSize: 13 }}>To: <b>{to?.name ?? 'no person chosen'}</b> · {maskPhone(to?.phone)}{mgr ? <> · copy: <b>{mgr.name}</b> (his manager)</> : tone === 'escalate' && !mgr ? ' · no manager saved for this person' : ''}</p>}
          {busy ? <p className="msg-box muted">Writing…</p> : edit ? <textarea className="msg-box" rows={6} value={text} onChange={(e) => setText(e.target.value)} /> : <div className="msg-box">{text}</div>}
          {m && m.suggestedTone && !busy && <p className="muted" style={{ fontSize: 12 }}>Dood suggests {TONE_L[m.suggestedTone as keyof typeof TONE_L]} because {m.priorReminders ? `${m.priorReminders} reminder${m.priorReminders === 1 ? ' has' : 's have'} already gone` : 'this is the first reminder'}. You can edit the text before sending.</p>}
          {m?.note && <p className="ai-note warn"><Ic n="info" s={14} />{m.note}</p>}
          <div className="actions left"><button className="primary" disabled={busy || !text} onClick={open}><Ic n="whatsapp" />Open in WhatsApp</button><button disabled={busy || !text} onClick={mail}><Ic n="mail" />Send as email</button><button disabled={busy || !text} onClick={copy}><Ic n="copy" />Copy</button><button className="ghost" onClick={() => setEdit(!edit)}><Ic n="pencil" />{edit ? 'Done editing' : 'Edit text'}</button></div>
          {m && to && !to.phone && <p className="muted" style={{ fontSize: 12 }}>No phone saved for {to.name}. WhatsApp will open without a number. Add one under More › Contacts.</p>}
          {sent && <div className="ai-note"><Ic n="info" s={14} /><div style={{ flex: 1 }}>Did you send it? Dood will log it in the task history and set the next follow-up.
            <div className="actions left" style={{ marginTop: 6, alignItems: 'center' }}><label className="field" style={{ margin: 0, flexDirection: 'row', alignItems: 'center', gap: 6 }}><span>Next follow-up</span><input type="date" style={{ width: 'auto' }} value={next} onChange={(e) => setNext(e.target.value)} /></label><button className="primary small" disabled={logging} onClick={log}>{logging ? 'Saving…' : 'Yes, log it'}</button><button className="small ghost" onClick={() => setSent(null)}>Not yet</button></div></div></div>}
          <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>After you send, Dood logs it in the task history and sets the next follow-up.</p>
        </div>
        <div className="wiz-card">
          <h3 style={{ marginBottom: '0.6rem' }}>2 · Reply reader</h3>
          <label className="field"><span>Paste {to?.name?.split(' ')[0] ?? 'the person'}’s reply</span><textarea rows={3} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Sir, letter is signed. Will send the scan by tomorrow 11 am." /></label>
          <div className="actions left"><button disabled={rbusy || reply.trim().length < 2} onClick={read}><Ic n="sparkles" />{rbusy && !rd ? 'Reading…' : 'Read the reply'}</button></div>
          {rerr && <p className="ai-note err"><Ic n="alert" s={14} />{rerr}</p>}
          {rd && <div style={{ marginTop: '0.7rem' }}>
            <p><b>Dood understood</b> <span className={'chip ' + (rd.status === 'done' ? 'green' : rd.status === 'no_update' ? '' : 'amber')}>{statusL[rd.status]}</span> {rd.promisedDate && <span className="chip teal">Promised {fmtDate(rd.promisedDate)}</span>}</p>
            <p className="muted">{rd.summary}</p>
            {rd.updates.map((u: any) => <label className="tickrow" key={u.id}><input type="checkbox" checked={!!ticks[u.id]} onChange={(e) => setTicks({ ...ticks, [u.id]: e.target.checked })} /><span>{u.text}</span></label>)}
            <div className="actions left"><button className="primary" disabled={rbusy || !nTick} onClick={apply}>Apply {nTick} update{nTick === 1 ? '' : 's'}</button><button className="ghost" onClick={() => setRd(null)}>Ignore</button></div></div>}
        </div>
      </div>
    </Modal>
  );
}

// ───────────────────────── Search palette (Ctrl+K) and Focus picker ─────────────────────────
const JUMPS: [string, string, string][] = [['home', 'Today', 'home'], ['kanban', 'Kanban', 'columns'], ['calendar', 'Calendar', 'calendar'], ['calls', 'Calls', 'phone'], ['chat', 'Messages', 'message'], ['meetings', 'Meetings', 'video'], ['notes', 'Notes', 'file'], ['reports', 'Reports', 'chart'], ['ask', 'Ask Dood', 'sparkles'],
  ['followups', 'Follow-ups', 'message'], ['tasks', 'All tasks', 'list'], ['attention', 'My Attention', 'flag'], ['workload', 'People', 'users'], ['companies', 'Companies', 'building'], ['projects', 'Projects', 'folder'], ['people', 'Contacts', 'user'], ['settings', 'Settings', 'settings'], ['announcements', 'Announcements', 'megaphone'], ['drafts', 'Drafts', 'pencil']];
function Palette({ onClose }: { onClose: () => void }) {
  const { companyId } = useApp(); const [q, setQ] = useState(''); const [i, setI] = useState(0); const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const t = q.trim().toLowerCase();
  const found = useQuery({ queryKey: ['palette', t, companyId], enabled: t.length >= 2, queryFn: () => api<any>(`/search?q=${encodeURIComponent(q.trim())}${companyId ? `&companyId=${companyId}` : ''}`) });
  const rows = useMemo(() => {
    const out: { k: string; label: string; icon: string; run: () => void }[] = [];
    out.push({ k: 'new', label: 'New task (Quick add)', icon: 'plus', run: () => openQuickAdd() }, { k: 'letter', label: 'Read a letter', icon: 'upload', run: () => openLetter() });
    if (t.length >= 2) out.push({ k: 'ask', label: `Ask Dood: “${q.trim()}”`, icon: 'sparkles', run: () => { sessionStorage.setItem('cc.ask', q.trim()); goto('ask'); } });
    for (const [id, label, icon] of JUMPS) if (!t || label.toLowerCase().includes(t)) out.push({ k: 'j' + id, label: `Go to ${label}`, icon, run: () => goto(id) });
    for (const x of (found.data?.results ?? []).filter((r: any) => r.taskId || r.type === 'task').slice(0, 7)) out.push({ k: 'r' + x.id, label: x.title + (x.company ? ` · ${x.company}` : ''), icon: 'right', run: () => goto('tasks', x.taskId ?? x.id) });
    if (t.length >= 2) out.push({ k: 'all', label: `Search everything for “${q.trim()}”`, icon: 'search', run: () => { sessionStorage.setItem('cc.q', q.trim()); goto('search'); dispatchEvent(new Event('cc-search')); } });
    return out;
  }, [t, found.data, q]);
  useEffect(() => setI(0), [t]);
  const go = (r: (typeof rows)[number]) => { onClose(); setTimeout(r.run, 0); };
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal palette" role="dialog" aria-label="Search" onKeyDown={(e) => { if (e.key === 'Escape') onClose(); else if (e.key === 'ArrowDown') { e.preventDefault(); setI((x) => Math.min(rows.length - 1, x + 1)); } else if (e.key === 'ArrowUp') { e.preventDefault(); setI((x) => Math.max(0, x - 1)); } else if (e.key === 'Enter' && rows[i]) go(rows[i]); }}>
        <div className="pal-top"><input ref={ref} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks, people, or jump to a page…" aria-label="Search" /><button className="icon" aria-label="Close" title="Close (Esc)" onClick={onClose}>✕</button></div>
        <ul>{rows.map((r, n) => <li key={r.k}><button className={n === i ? 'on' : ''} onMouseEnter={() => setI(n)} onClick={() => go(r)}><Ic n={r.icon} />{r.label}</button></li>)}</ul>
      </div>
    </div>
  );
}
function FocusPicker({ onClose }: { onClose: () => void }) {
  const focus = useFocus(); const { companyId } = useApp();
  const q = useQuery({ queryKey: ['focus-pick', companyId], queryFn: () => api<any>(`/attention?today=${today()}&limit=8${companyId ? `&companyId=${companyId}` : ''}`).then((r) => r.items as any[]) });
  return <Modal title="What will you focus on?" onClose={onClose}>
    {q.data && !q.data.length && <p className="muted">Nothing needs you right now. Pick any task from its own screen.</p>}
    <div style={{ display: 'grid', gap: 6 }}>{q.data?.map((x) => <button key={x.id} style={{ justifyContent: 'space-between' }} onClick={() => { onClose(); focus.start({ taskId: x.id, title: x.title }); }}><span>{x.title}</span><small className="muted">{x.company}</small></button>)}</div>
  </Modal>;
}

/** Hosts every pop-up that can be opened from anywhere (N, Ctrl+K, the Focus button, hover actions). */
export function AiHosts() {
  const [qa, setQa] = useState<{ text?: string } | null>(null); const [letter, setLetter] = useState<{ taskId?: string } | null>(null); const [fu, setFu] = useState<FollowDetail | null>(null); const [pal, setPal] = useState(false); const [fp, setFp] = useState(false);
  useEffect(() => {
    const a = (e: Event) => setQa((e as CustomEvent).detail ?? {}); const b = (e: Event) => setLetter((e as CustomEvent).detail ?? {}); const c = (e: Event) => setFu((e as CustomEvent).detail); const d = () => setPal(true); const f = () => setFp(true);
    addEventListener('cc-quickadd', a); addEventListener('cc-letter', b); addEventListener('cc-followup', c); addEventListener('cc-palette', d); addEventListener('cc-focus-picker', f);
    return () => { removeEventListener('cc-quickadd', a); removeEventListener('cc-letter', b); removeEventListener('cc-followup', c); removeEventListener('cc-palette', d); removeEventListener('cc-focus-picker', f); };
  }, []);
  return <>{qa && <QuickAdd initialText={qa.text} onClose={() => setQa(null)} />}{letter && <LetterReader taskId={letter.taskId} onClose={() => setLetter(null)} />}{fu && <FollowUpWizard f={fu} onClose={() => setFu(null)} />}{pal && <Palette onClose={() => setPal(false)} />}{fp && <FocusPicker onClose={() => setFp(false)} />}</>;
}
