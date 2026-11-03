import { useEffect, useState } from 'react';
import { api, goto, today } from './api';
import { toast, useApp } from './ui';
import { Ic } from './icons';
import { openFollowUp } from './bus';

const TRIES = ['Which tasks have not moved for a week?', 'What did Divya finish this week?', 'Summarise GRMS for this month', 'What is due across all companies on Monday?'];
const RKEY = 'cc.ask.recent';
export function AskDood() {
  const { companyId } = useApp(); void companyId;
  const [q, setQ] = useState(''); const [busy, setBusy] = useState(false); const [r, setR] = useState<any>(null); const [err, setErr] = useState('');
  const [recent, setRecent] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(RKEY) ?? '[]'); } catch { return []; } });
  const ask = async (text = q) => {
    const t = text.trim(); if (t.length < 3) return; setQ(t); setBusy(true); setErr(''); setR(null);
    try { const x = await api<any>('/ai/ask', { method: 'POST', body: { question: t, today: today() } }); setR({ ...x, question: t }); const n = [t, ...recent.filter((y) => y !== t)].slice(0, 6); setRecent(n); try { localStorage.setItem(RKEY, JSON.stringify(n)); } catch { /* ok */ } }
    catch (e: any) { setErr(e.code === 'AI_NOT_SET_UP' ? 'AI is not set up on this computer yet, so Ask Dood cannot answer. Everything else in DOOD works as usual. Ask your admin to add the OpenAI key (Set-AI-Key.bat).' : e.message); } finally { setBusy(false); }
  };
  useEffect(() => { const s = sessionStorage.getItem('cc.ask'); if (s) { sessionStorage.removeItem('cc.ask'); ask(s); } }, []);
  return (
    <section>
      <div className="ask-layout">
        <aside className="ask-side"><h4>Try asking</h4>{TRIES.map((t) => <button key={t} onClick={() => ask(t)}>{t}</button>)}{recent.length > 0 && <><h4>Recent</h4>{recent.map((t) => <button key={t} onClick={() => ask(t)}>{t}</button>)}</>}</aside>
        <div>
          <h1>Ask Dood</h1><p className="muted" style={{ margin: '4px 0 1rem' }}>Ask anything about your tasks, notes, follow-ups and history. Every answer shows where it came from.</p>
          <form className="ask-box" onSubmit={(e) => { e.preventDefault(); ask(); }}><input aria-label="Your question" placeholder="Your question" value={q} onChange={(e) => setQ(e.target.value)} autoFocus /><button className="primary" disabled={busy || q.trim().length < 3}><Ic n="send" />{busy ? 'Thinking…' : 'Ask'}</button></form>
          {err && <p className="ai-note err" style={{ marginTop: 12 }}><Ic n="alert" s={14} />{err}</p>}
          {r && <div className="wiz-card" style={{ marginTop: '1rem' }}>
            <div className="meta muted" style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}><Ic n="sparkles" s={14} />Answer</div>
            <h3 style={{ margin: '0.3rem 0 0.6rem' }}>{r.headline}</h3>
            <div style={{ display: 'grid', gap: '0.5rem' }}>{r.answer.map((a: any, i: number) => <p key={i}>{a.text}{a.sources.map((n: number) => <sup className="cite" key={n}>{n}</sup>)}</p>)}</div>
            <div className="actions left" style={{ marginTop: '0.8rem' }}>
              {r.actions.map((a: any, i: number) => a.kind === 'followup' ? <button key={i} onClick={() => openFollowUp({ taskId: a.taskId, personId: a.personId })}><Ic n="message" />{a.label}</button> : <button key={i} onClick={() => { const [p, id] = String(a.link).slice(1).split('/'); goto(p, id); }}><Ic n="right" />{a.label}</button>)}
              <button onClick={async () => { try { const res = await fetch('/api/v1/ai/ask/export', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'command-centre' }, body: JSON.stringify({ question: r.question, headline: r.headline, answer: r.answer, sources: r.sources.map((s: any) => ({ n: s.n, label: s.label })) }) }); if (!res.ok) throw new Error('Could not make the Word file.'); const url = URL.createObjectURL(await res.blob()); const a = document.createElement('a'); a.href = url; a.download = 'dood-answer.docx'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 4000); } catch (e: any) { toast(e.message); } }}><Ic n="download" />Export answer to Word</button></div>
            {r.sources.length > 0 && <><h4 style={{ margin: '1rem 0 0.3rem' }}>Sources</h4><ul className="src-list">{r.sources.map((s: any) => <li key={s.n}><b>{s.n}</b> · <button className="linklike" onClick={() => { const [p, id] = String(s.link).slice(1).split('/'); goto(p, id); }}>{s.label}</button></li>)}</ul></>}
            {r.skippedPrivate > 0 && <p className="ai-note" style={{ marginTop: 12 }}><Ic n="lock" s={14} />{r.skippedPrivate} task{r.skippedPrivate === 1 ? '' : 's'} marked Private · no AI {r.skippedPrivate === 1 ? 'was' : 'were'} not searched.</p>}
          </div>}
        </div>
      </div>
    </section>
  );
}
