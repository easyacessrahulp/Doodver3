import { Ic } from './icons';
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, copyText, exportTextToWord, fmtDate, fmtTime, goto, PRIORITY, PRIORITY_DOT, PROJECT_STATUS, STATUS_LABEL, today } from './api';
import { useList } from './hooks';
import { Badge, Empty, Modal, toast, useApp } from './ui';

export const useAiStatus = () => useQuery({ queryKey: ['ai-status'], queryFn: () => api<any>('/ai/status'), staleTime: 30_000 });
const PLACEHOLDER = /\[confirm:[^\]]*\]/gi;
const LEVEL: Record<string, [string, string]> = { on_track: ['On track', 'green'], at_risk: ['At risk', 'amber'], blocked: ['Blocked', 'red'], waiting: ['Waiting', 'amber'], overdue: ['Overdue', 'red'], done: ['Done', 'green'], not_started: ['Not started', 'grey'] };

// ───────────────────────── Status card (summary) ─────────────────────────
/** The AI "Status" card for a task or project. Opening a page only READS the saved summary; the AI is called only when you press the button. */
export function AiStatusCard({ type, id, record, canEdit, projectExcluded, onDraftEmail, onChanged }: { type: 'TASK' | 'PROJECT'; id: string; record: any; canEdit: boolean; projectExcluded?: boolean; onDraftEmail?: () => void; onChanged: () => void }) {
  const qc = useQueryClient(); const st = useAiStatus();
  const q = useQuery({ queryKey: ['ai-summary', type, id], staleTime: 0, refetchOnMount: 'always', queryFn: () => api<any>(`/ai/summary?entityType=${type}&entityId=${id}`) });   // reading is free (no AI call), so always re-check "out of date"
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const excluded = !!record.aiExcluded; const blocked = excluded || !!projectExcluded;
  const sm = q.data?.summary; const enabled = st.data?.enabled;
  const refresh = async () => {
    setBusy(true); setErr('');
    try { const r = await api<any>('/ai/summary/refresh', { method: 'POST', body: { entityType: type, entityId: id, today: today() } }); qc.setQueryData(['ai-summary', type, id], r); qc.invalidateQueries({ queryKey: ['ai-status'] }); toast('Summary updated.'); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const toggle = async () => {
    try { await api(`/${type === 'TASK' ? 'tasks' : 'projects'}/${id}`, { method: 'PATCH', body: { expectedUpdatedAt: record.updatedAt, aiExcluded: !excluded } }); toast(!excluded ? 'Excluded from AI.' : 'AI is allowed again for this item.'); onChanged(); }
    catch (e: any) { setErr(e.message); }
  };
  const lvl = sm ? LEVEL[sm.statusLevel] ?? ['', 'grey'] : null;
  return (
    <section className={'aisum' + (blocked ? ' off' : '')}>
      <div className="ai-head" style={{ marginBottom: 6 }}>
        <h3 style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Ic n="sparkles" s={15} />AI summary</h3>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          {sm && !sm.stale && <small className="muted">Updated {fmtTime(sm.generatedAt)}</small>}
          {sm?.stale && <span className="chip amber">Out of date</span>}
          {sm && !blocked && <button className="small" title="Save this summary as a Word file" onClick={() => exportTextToWord(`AI summary - ${record?.title ?? record?.name ?? (type === 'TASK' ? 'Task' : 'Project')}`, ['Where it stands', sm.status, '', 'Next step', sm.nextAction?.text ?? '', '', ...(sm.done?.length ? ['Done', ...sm.done.map((x: string) => '- ' + x), ''] : []), ...(sm.pending?.length ? ['Pending', ...sm.pending.map((x: string) => '- ' + x), ''] : []), ...(sm.risks?.length ? ['Risks', ...sm.risks.map((x: string) => '- ' + x), ''] : []), ...(sm.keyPoints?.length ? ['Key points', ...sm.keyPoints.map((x: string) => '- ' + x)] : [])].join('\n'), { subtitle: 'Written by Dood (AI) - please check before use' }).catch((e) => toast(e.message))}><Ic n="download" s={13} /> Export to Word</button>}
          {canEdit && <label className="priv-sw" title="When on, nothing from this item is ever sent to the AI"><input type="checkbox" checked={excluded} onChange={toggle} /><Ic n="lock" s={13} />Private · no AI</label>}
        </div>
      </div>
      {!st.data ? <p className="muted">Loading…</p>
        : blocked ? <p className="muted"><Ic n="lock" s={13} /> {excluded ? 'This item is marked Private · no AI.' : 'Its project is marked Private · no AI.'} Nothing from it is sent to OpenAI.</p>
        : !enabled ? <p className="muted">AI is not set up on this computer, so there is no summary. Everything else works as usual.</p>
        : !sm ? <p className="muted">No summary yet. {q.isLoading ? '' : 'Press the button to create one (this uses one AI request).'}</p>
        : <div>
            <h4 style={{ marginTop: 4 }}>Where it stands</h4><p>{sm.status}</p>
            <h4>Next step</h4><p>{sm.nextAction.text}{sm.nextAction.suggestedDate && <> <span className="chip teal">suggested {fmtDate(sm.nextAction.suggestedDate)}</span></>}</p>
            <details style={{ marginTop: 8 }}><summary className="muted" style={{ cursor: 'pointer' }}>More detail</summary>
              <div className="ai-body" style={{ marginTop: 6 }}>
                {sm.done.length > 0 && <div><h5>Done</h5><ul>{sm.done.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></div>}
                {sm.pending.length > 0 && <div><h5>Pending</h5><ul>{sm.pending.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></div>}
                {sm.risks.length > 0 && <div><h5>Risks</h5><ul className="risks">{sm.risks.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></div>}
                <div><h5>Key points</h5><ul>{sm.keyPoints.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></div>
              </div></details>
          </div>}
      {err && <p className="error">{err}</p>}
      <div className="actions left" style={{ marginTop: 10 }}>
        {enabled && !blocked && <button className="small" disabled={busy || !canEdit} onClick={refresh}><Ic n="refresh" s={13} />{busy ? 'Thinking…' : sm ? 'Refresh summary' : 'Generate summary'}</button>}
        {onDraftEmail && <button className="small" onClick={onDraftEmail}><Ic n="mail" s={13} />Draft email from this</button>}
      </div>
    </section>
  );
}

// ───────────────────────── Email drafting window ─────────────────────────
export interface EmailLink { type: 'TASK' | 'PROJECT'; id: string; title: string; companyId?: string }
interface SavedDraft { id: string; entityType: string | null; entityId: string | null; followupId: string | null; subject: string; body: string; params: any; updatedAt: string; linkedTitle: string | null }

/** `compose`: the window was opened from a pending email in Calls — pressing Done marks that email as sent and moves it to Completed. */
export interface ComposeFor { call: { id: string; updatedAt: string; email?: string | null }; onSent: () => void }
export function EmailWindow({ link: fixed, followup, draft, preset, compose, onClose }: { link?: EmailLink; followup?: { id: string; matter?: string; recipient?: string }; draft?: SavedDraft; preset?: { matter?: string; recipient?: string }; compose?: ComposeFor; onClose: () => void }) {
  const { me } = useApp(); const qc = useQueryClient(); const st = useAiStatus(); const enabled = !!st.data?.enabled;
  const P = draft?.params ?? {};
  const [pick, setPick] = useState<{ taskId: string; projectId: string }>({ taskId: draft?.entityType === 'TASK' ? draft.entityId ?? '' : '', projectId: draft?.entityType === 'PROJECT' ? draft.entityId ?? '' : '' });
  const tasks = useList('email-task-options', '/tasks', { completed: 'false', sort: 'title' }, !fixed);
  const projects = useQuery({ queryKey: ['email-projects'], enabled: !fixed, queryFn: () => api<{ items: any[] }>('/projects?limit=200').then((r) => r.items) });
  const link: EmailLink | null = fixed ?? (pick.taskId ? { type: 'TASK', id: pick.taskId, title: tasks.items.find((t) => t.id === pick.taskId)?.title ?? '', companyId: tasks.items.find((t) => t.id === pick.taskId)?.companyId } :
    pick.projectId ? { type: 'PROJECT', id: pick.projectId, title: projects.data?.find((p) => p.id === pick.projectId)?.name ?? '', companyId: projects.data?.find((p) => p.id === pick.projectId)?.companyId } : null);
  const companyName = (cid?: string) => me.memberships.find((m) => m.companyId === cid)?.companyName ?? '';
  const [f, setF] = useState({ matter: P.matter ?? followup?.matter ?? preset?.matter ?? '', recipient: P.recipient ?? followup?.recipient ?? preset?.recipient ?? '', company: P.company ?? companyName(fixed?.companyId), tone: P.tone ?? 'polite', length: P.length ?? 'medium', extra: P.extra ?? '' });
  useEffect(() => { if (!f.company && link?.companyId) setF((x) => ({ ...x, company: companyName(link.companyId) })); }, [link?.companyId]);
  const [out, setOut] = useState<{ subject: string; body: string; aiUsed: boolean; notice?: string } | null>(draft ? { subject: draft.subject, body: draft.body, aiUsed: true } : null);
  const [savedId, setSavedId] = useState<string | null>(draft?.id ?? null); const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(''); const [err, setErr] = useState('');

  const sum = useQuery({ queryKey: ['ai-summary', link?.type, link?.id], enabled: !!link && enabled, queryFn: () => api<any>(`/ai/summary?entityType=${link!.type}&entityId=${link!.id}`) });
  const kp: string[] = sum.data?.summary?.keyPoints ?? [];
  const [off, setOff] = useState<Set<string>>(new Set(P.keyPointsOff ?? []));                 // all ticked by default
  const ticked = kp.filter((k) => !off.has(k));
  const saved = useQuery({ queryKey: ['email-drafts', link?.type, link?.id], enabled: !!link, queryFn: () => api<{ items: SavedDraft[] }>(`/ai/email/drafts?entityType=${link!.type}&entityId=${link!.id}`).then((r) => r.items) });

  const placeholders = useMemo(() => [...new Set(`${out?.subject ?? ''}\n${out?.body ?? ''}`.match(PLACEHOLDER) ?? [])], [out?.subject, out?.body]);
  const payload = (mode: 'ai' | 'template') => ({ ...f, entityType: link?.type ?? null, entityId: link?.id ?? null, followupId: followup?.id ?? null, keyPoints: link ? ticked : [], today: today(), mode });
  const generate = async (mode: 'ai' | 'template') => {
    if (!f.matter.trim()) { setErr('Say what the email is about first.'); return; }
    setBusy(mode === 'template' ? 'template' : 'generate'); setErr('');
    try { const r = await api<any>('/ai/email/generate', { method: 'POST', body: payload(mode) }); setOut({ subject: r.subject, body: r.body, aiUsed: r.aiUsed, notice: r.notice }); setDirty(true); qc.invalidateQueries({ queryKey: ['ai-status'] }); }
    catch (e: any) { setErr(e.message); } finally { setBusy(''); }
  };
  const refine = async (action: 'shorter' | 'firmer' | 'softer') => {
    if (!out) return; setBusy(action); setErr('');
    try { const r = await api<any>('/ai/email/refine', { method: 'POST', body: { ...payload('ai'), action, subject: out.subject, body: out.body } }); setOut({ ...out, subject: r.subject, body: r.body, aiUsed: true }); setDirty(true); qc.invalidateQueries({ queryKey: ['ai-status'] }); }
    catch (e: any) { setErr(e.message); } finally { setBusy(''); }
  };
  const save = async () => {
    if (!out) return; setBusy('save'); setErr('');
    try { const d = await api<SavedDraft>('/ai/email/drafts', { method: 'POST', body: { id: savedId ?? undefined, entityType: link?.type ?? null, entityId: link?.id ?? null, followupId: followup?.id ?? null, subject: out.subject, body: out.body, params: { ...f, keyPointsOff: [...off] } } });
      setSavedId(d.id); setDirty(false); toast('Email draft saved.'); qc.invalidateQueries({ queryKey: ['email-drafts'] }); }
    catch (e: any) { setErr(e.message); } finally { setBusy(''); }
  };
  const markSent = async () => {
    if (!out || !compose) return;
    if (placeholders.length && !confirm(`${placeholders.length} detail(s) are still marked [confirm: …]. Mark as sent anyway?`)) return;
    if (!confirm('Mark this email as SENT and move it to Completed?\n\n(DOOD does not send email itself — copy it or use “Open in mail app” first.)')) return;
    setBusy('sent'); setErr('');
    try { await api(`/calls/${compose.call.id}`, { method: 'PATCH', body: { expectedUpdatedAt: compose.call.updatedAt, done: true, sent: true, emailSubject: out.subject, emailBody: out.body } });
      toast('Email marked as sent — moved to Completed.'); qc.invalidateQueries(); compose.onSent(); onClose(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(''); }
  };
  const mailto = () => { if (!out) return; const to = compose?.call.email ?? ''; location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(out.subject)}&body=${encodeURIComponent(out.body)}`; };
  const copy = async (what: 'subject' | 'body' | 'all') => { if (!out) return; await copyText(what === 'subject' ? out.subject : what === 'body' ? out.body : `Subject: ${out.subject}\n\n${out.body}`); toast(what === 'subject' ? 'Subject copied.' : what === 'body' ? 'Body copied.' : 'Subject and body copied.'); };
  const open = (d: SavedDraft) => { setOut({ subject: d.subject, body: d.body, aiUsed: true }); setSavedId(d.id); setDirty(false); setF({ ...f, ...d.params }); setOff(new Set(d.params?.keyPointsOff ?? [])); };
  const close = () => { if (out && dirty && !confirm('This email has not been saved. Close without saving?')) return; onClose(); };
  const set = (k: keyof typeof f) => (e: any) => setF({ ...f, [k]: e.target.value });

  return (
    <Modal wide title="✉ Draft email" onClose={close}>
      {st.data && !enabled && <div className="notice"><b>AI not set up.</b> You can still create a plain template to copy. To turn on AI drafting, add your OpenAI key in Settings → AI.</div>}
      {saved.data && saved.data.length > 0 && <div className="saved-row"><small className="muted">Saved drafts{link ? ` for “${link.title}”` : ''}:</small> {saved.data.map((d) => <button key={d.id} className={'chip-btn' + (d.id === savedId ? ' on' : '')} onClick={() => open(d)}>{d.subject.slice(0, 34)}<em>{fmtDate(d.updatedAt)}</em></button>)}</div>}
      <div className="email-grid">
        <div className="email-col">
          {fixed ? <p className="linked">{fixed.type === 'TASK' ? 'Task' : 'Project'}: <b>{fixed.title}</b></p> : (
            <div className="form"><label className="field half"><span>Link to a task (optional)</span><select value={pick.taskId} onChange={(e) => setPick({ taskId: e.target.value, projectId: '' })}><option value="">—</option>{tasks.items.map((t) => <option key={t.id} value={t.id}>{t.title} — {t.companyName}</option>)}</select></label>
              <label className="field half"><span>…or to a project</span><select value={pick.projectId} onChange={(e) => setPick({ taskId: '', projectId: e.target.value })}><option value="">—</option>{projects.data?.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.companyName}</option>)}</select></label></div>)}
          <div className="form">
            <label className="field"><span>What is the email about? *</span><textarea rows={3} value={f.matter} onChange={set('matter')} placeholder="e.g. Ask the bank to release the collateral and confirm the date" /></label>
            <label className="field half"><span>To (recipient)</span><input value={f.recipient} onChange={set('recipient')} placeholder="Name / designation" /></label>
            <label className="field half"><span>From company</span><input list="company-names" value={f.company} onChange={set('company')} /><datalist id="company-names">{[...me.memberships.map((m) => m.companyName), 'Other'].map((n) => <option key={n} value={n} />)}</datalist></label>
            <label className="field half"><span>Tone</span><select value={f.tone} onChange={set('tone')}><option value="formal">Formal</option><option value="polite">Polite</option><option value="friendly">Friendly</option><option value="firm">Firm</option></select></label>
            <label className="field half"><span>Length</span><select value={f.length} onChange={set('length')}><option value="short">Short</option><option value="medium">Medium</option><option value="long">Long</option></select></label>
            <label className="field"><span>Extra instructions (optional)</span><textarea rows={2} value={f.extra} onChange={set('extra')} placeholder="e.g. mention that we paid on 5 March; keep it under 100 words" /></label>
          </div>
          {link && <div className="kp-box"><h5>History to include {sum.data?.summary?.stale && <Badge tone="amber">summary out of date</Badge>}</h5>
            {!enabled ? <small className="muted">Turn on AI to use the summary’s key points here.</small>
              : sum.data?.excluded ? <small className="muted">Excluded from AI — no history will be used.</small>
              : kp.length ? <div className="kp-chips">{kp.map((k) => <label key={k} className={'kp-chip' + (off.has(k) ? '' : ' on')}><input type="checkbox" checked={!off.has(k)} onChange={() => { const n = new Set(off); n.has(k) ? n.delete(k) : n.add(k); setOff(n); }} />{k}</label>)}</div>
              : <small className="muted">No summary yet for this {link.type.toLowerCase()}. Open it and press “Generate summary” to get tick-box history here.</small>}</div>}
          <div className="actions left">
            <button className="primary" disabled={!!busy} onClick={() => generate(enabled ? 'ai' : 'template')}>{busy === 'generate' ? 'Writing…' : busy === 'template' ? 'Creating…' : enabled ? (out ? '↻ Regenerate' : 'Generate email') : 'Create plain template'}</button>
            {enabled && <button disabled={!!busy} onClick={() => generate('template')}>Use plain template</button>}
          </div>
          {err && <p className="error">{err}</p>}
        </div>
        <div className="email-col">
          {!out ? <div className="email-empty"><p className="muted">Your email will appear here. You can edit it before copying.</p></div> : <>
            {out.notice && <small className="muted block">{out.notice}</small>}
            <label className="field"><span>Subject</span><input value={out.subject} onChange={(e) => { setOut({ ...out, subject: e.target.value }); setDirty(true); }} /></label>
            <label className="field"><span>Body</span><textarea className="email-body" rows={14} value={out.body} onChange={(e) => { setOut({ ...out, body: e.target.value }); setDirty(true); }} /></label>
            {placeholders.length > 0 && <div className="warn-banner"><b>{placeholders.length} detail{placeholders.length > 1 ? 's' : ''} still to confirm</b> before sending: {placeholders.join(' · ')}</div>}
            <div className="copy-row"><button onClick={() => copy('subject')}>Copy subject</button><button onClick={() => copy('body')}>Copy body</button><button className="primary" onClick={() => copy('all')}>Copy all</button><button onClick={() => out && exportTextToWord(out.subject || 'Email', out.body, { subtitle: 'Email draft' }).catch((e) => toast(e.message))}><Ic n="download" s={13} /> Export to Word</button></div>
            <div className="copy-row"><button disabled={!!busy || !enabled} onClick={() => refine('shorter')}>{busy === 'shorter' ? '…' : 'Make shorter'}</button><button disabled={!!busy || !enabled} onClick={() => refine('firmer')}>{busy === 'firmer' ? '…' : 'Make firmer'}</button><button disabled={!!busy || !enabled} onClick={() => refine('softer')}>{busy === 'softer' ? '…' : 'Make softer'}</button>
              <span className="spacer" /><button disabled={!!busy} onClick={save}>{busy === 'save' ? 'Saving…' : savedId && !dirty ? '✓ Saved' : 'Save draft'}</button></div>
            {compose && <div className="copy-row"><button onClick={mailto}>✉ Open in mail app</button><span className="spacer" /><button className="primary" disabled={!!busy} onClick={markSent}>{busy === 'sent' ? 'Saving…' : '✓ Done — mark as sent'}</button></div>}
          </>}
        </div>
      </div>
    </Modal>
  );
}

// ───────────────────────── Emails page (main menu) ─────────────────────────
export function EmailsPage() {
  const qc = useQueryClient(); const st = useAiStatus(); const [win, setWin] = useState<SavedDraft | true | null>(null);
  const q = useQuery({ queryKey: ['email-drafts-all'], queryFn: () => api<{ items: SavedDraft[] }>('/ai/email/drafts').then((r) => r.items) });
  const del = async (d: SavedDraft) => { if (!confirm('Remove this saved email draft?')) return; await api(`/ai/email/drafts/${d.id}`, { method: 'DELETE' }); qc.invalidateQueries({ queryKey: ['email-drafts-all'] }); qc.invalidateQueries({ queryKey: ['email-drafts'] }); };
  return (
    <section>
      <div className="page-head"><div><h2>Emails</h2><p className="muted">Draft emails with the AI’s help (or from a plain template), copy them into your mail program, and keep drafts against the task or project they belong to.</p></div><button className="primary" onClick={() => setWin(true)}>✉ Draft email</button></div>
      {st.data && !st.data.enabled && <p className="notice"><b>AI not set up.</b> Emails will use a plain template you can copy and fill in. <a href="#settings/ai">Set up AI →</a></p>}
      <div className="card pad"><h3>Saved drafts</h3>
        <ul className="mini-list">{q.data?.map((d) => (
          <li key={d.id} onClick={() => setWin(d)}><b>{d.subject}</b><small className="muted">{d.linkedTitle ? `${d.linkedTitle} · ` : ''}edited {fmtTime(d.updatedAt)}</small>
            <span className="row-actions-inline">{(d as any).placeholders?.length > 0 && <Badge tone="amber">{(d as any).placeholders.length} to confirm</Badge>}<button className="ghost small" onClick={(e) => { e.stopPropagation(); del(d); }}>Remove</button></span></li>))}</ul>
        {q.data && !q.data.length && <Empty>No saved drafts yet.</Empty>}</div>
      {win && <EmailWindow draft={win === true ? undefined : win} onClose={() => setWin(null)} />}
    </section>
  );
}

// ───────────────────────── Settings → AI ─────────────────────────
export function AiSettings() {
  const { me } = useApp(); const qc = useQueryClient(); const q = useAiStatus(); const s = q.data;
  const [busy, setBusy] = useState(false); const [res, setRes] = useState<{ ok: boolean; text: string } | null>(null);
  const test = async () => { setBusy(true); setRes(null); try { const r = await api<any>('/ai/test', { method: 'POST' }); setRes({ ok: true, text: `✓ ${r.message} (model ${r.model})` }); } catch (e: any) { setRes({ ok: false, text: e.message }); } finally { setBusy(false); qc.invalidateQueries({ queryKey: ['ai-status'] }); } };
  if (!s) return <p className="muted">Loading…</p>;
  const m = s.monthly;
  return (
    <>
      <div className="card pad"><h3>AI status</h3>
        <p><Badge tone={s.enabled ? 'green' : 'grey'}>{s.enabled ? 'Enabled' : 'AI not set up'}</Badge> <span className="muted">Provider: {s.provider} · Model: <b>{s.model}</b></span></p>
        {s.enabled ? <>
          <p className="muted">The AI key is stored only on the computer running DOOD, in <code>apps\api\.env</code>. It is never shown here and never sent to your browser.</p>
          {me.user.isAdmin && <div className="actions left"><button className="primary" disabled={busy} onClick={test}>{busy ? 'Testing…' : 'Test connection'}</button></div>}
          {res && <p className={res.ok ? 'ok-text' : 'error'}>{res.text}</p>}
        </> : <div className="notice"><b>How to turn AI on</b><ol><li>On this computer, open the folder <code>apps\api</code> inside the DOOD folder.</li><li>Open the file named <code>.env</code> in Notepad (if it does not exist, copy <code>.env.example</code> and rename the copy to <code>.env</code>).</li><li>Make sure it has these two lines: <code>OPENAI_API_KEY=your key here</code> and <code>OPENAI_MODEL=gpt-4o-mini</code>. Save the file.</li><li>Close the black DOOD window and start DOOD again.</li></ol></div>}
      </div>
      <div className="card pad"><h3>Usage</h3>
        <div className="counters"><div className="counter blue"><b>{s.usedToday}<small> / {s.dailyLimit}</small></b><span>Your requests today (daily limit)</span></div><div className="counter green"><b>{m.calls}</b><span>Requests this month ({s.month}), everyone</span></div>
          <div className="counter grey"><b>{m.totalTokens.toLocaleString('en-IN')}</b><span>Tokens this month</span></div><div className={'counter ' + (m.failed ? 'amber' : 'grey')}><b>{m.failed}</b><span>Failed requests</span></div></div>
        <p className="muted fine">Tokens: {m.promptTokens.toLocaleString('en-IN')} sent + {m.completionTokens.toLocaleString('en-IN')} received. {m.byKind.map((k: any) => `${k.kind}: ${k.calls}`).join(' · ')}. Change the daily limit with <code>AI_DAILY_LIMIT=</code> in <code>.env</code>.</p></div>
      <div className="card pad"><h3>What is sent, and how to keep things private</h3>
        <ul className="plain"><li>Nothing is sent when you just open a task or project — only when you press <b>Generate / Refresh summary</b> or <b>Generate email</b>.</li>
          <li>A summary sends that task’s (or project’s) text: title, notes, subtasks, follow-ups, calls &amp; mails, discussions and focus-session notes.</li>
          <li>Use <b>Private · no AI</b> on any task or project to stop anything from it ever being sent. This is enforced on the server.</li>
          <li>Emails use only what you type, plus any key points you leave ticked. Missing details are shown as <code>[confirm: …]</code> — check them before sending.</li></ul></div>
    </>
  );
}

// ───────────────────────── Project page (drawer) ─────────────────────────
export function ProjectDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { me } = useApp(); const qc = useQueryClient(); const [email, setEmail] = useState(false);
  const p = useQuery({ queryKey: ['project', id], queryFn: () => api<any>(`/projects/${id}`) });
  const tasks = useQuery({ queryKey: ['project-tasks', id], queryFn: () => api<{ items: any[] }>(`/tasks?projectId=${id}&completed=false&sort=due&limit=15`).then((r) => r.items) });
  const x = p.data; if (!x) return <aside className="drawer"><div className="drawer-body">Loading…</div></aside>;
  const canEdit = me.user.isAdmin || me.memberships.find((m) => m.companyId === x.companyId)?.role === 'MANAGER';
  const reload = () => { qc.invalidateQueries(); };
  return (
    <aside className="drawer">
      <div className="drawer-head"><div><small className="muted">{me.memberships.find((m) => m.companyId === x.companyId)?.companyName}</small><h3>{x.name}</h3></div><button className="icon" aria-label="Close" onClick={onClose}>✕</button></div>
      <div className="drawer-body">
        <div className="chips"><Badge tone={x.status === 'ACTIVE' ? 'green' : x.status === 'ON_HOLD' ? 'amber' : 'grey'}>{PROJECT_STATUS[x.status]}</Badge><Badge tone="grey">{PRIORITY_DOT[x.priority]} {PRIORITY[x.priority]}</Badge>{x.aiExcluded && <Badge tone="grey">Excluded from AI</Badge>}</div>
        <dl className="facts"><dt>Start</dt><dd>{fmtDate(x.startDate)}</dd><dt>Target</dt><dd>{fmtDate(x.targetDate)}</dd></dl>
        {x.description && <p className="desc">{x.description}</p>}
        <AiStatusCard type="PROJECT" id={id} record={x} canEdit={canEdit} onDraftEmail={() => setEmail(true)} onChanged={reload} />
        <div className="detail-section"><div className="section-head"><h4>Open tasks <span className="muted">· {tasks.data?.length ?? 0}{(tasks.data?.length ?? 0) >= 15 ? '+' : ''}</span></h4><button className="ghost small" onClick={() => goto('tasks')}>All tasks</button></div>
          <ul className="mini-list">{tasks.data?.map((t) => <li key={t.id} onClick={() => goto('tasks', t.id)}><b>{PRIORITY_DOT[t.priority]} {t.title}</b><small className="muted">{STATUS_LABEL[t.status]}{t.delegatedToName ? ` · ${t.delegatedToName}` : ''}</small>{t.dueDate && <Badge tone={t.dueDate < today() ? 'red' : 'grey'}>{fmtDate(t.dueDate)}</Badge>}</li>)}</ul>
          {tasks.data && !tasks.data.length && <p className="muted">No open tasks.</p>}</div>
      </div>
      {email && <EmailWindow link={{ type: 'PROJECT', id, title: x.name, companyId: x.companyId }} onClose={() => setEmail(false)} />}
    </aside>
  );
}
