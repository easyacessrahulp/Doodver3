// "Notes": a digital notebook that is NOT tied to any task. Notebooks, pages, company tag, speak / photo-of-handwriting, and an AI write-up from points.
// The AI only suggests: its draft is shown in a panel and nothing changes in the note until the person presses Add or Replace.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api, downloadFile, exportTextToWord, fileToBase64, fmtTime, goto, today } from './api';
import { Modal, toast, useApp } from './ui';
import { Ic } from './icons';
import { companyColor } from './icons';
import { useRecorder } from './pages-aiflow';
import { useAiStatus } from './pages-ai';
import { openQuickAdd } from './bus';

const BOOK_COLORS = ['#0F766E', '#D97706', '#7C3AED', '#2563EB', '#BE185D', '#4D7C0F'];
const tint = (hex: string, a = 0.12) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
const msgOf = (e: any) => String(e?.message ?? 'Something went wrong');
const dayLabel = (iso: string) => { const d = new Date(iso); const t = new Date(); const y = new Date(Date.now() - 86400000); const same = (a: Date, b: Date) => a.toDateString() === b.toDateString(); return same(d, t) ? 'Today' : same(d, y) ? 'Yesterday' : Date.now() - d.getTime() < 7 * 86400000 ? 'Earlier this week' : 'Older'; };
export const todosOf = (body: string) => body.split('\n').map((l, i) => ({ i, m: /^\s*[-*]\s*\[( |x|X)\]\s*(.+)$/.exec(l) })).filter((x) => x.m).map((x) => ({ line: x.i, done: x.m![1] !== ' ', text: x.m![2].trim() }));

export const FILE_ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx,.txt,.csv,.md,.json';
export const sizeLabel = (n: number) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
async function uploadTo(noteId: string, f: File) { return api<any>(`/journal/${noteId}/files`, { method: 'POST', body: { fileName: f.name, mimeType: f.type || 'application/octet-stream', dataBase64: await fileToBase64(f) } }); }

export function useCompanies() { const { me } = useApp(); return me.memberships.map((m) => ({ id: m.companyId, name: m.companyName, color: companyColor({ color: (m as any).color, companyId: m.companyId, companyName: m.companyName }) })); }

/** Save a new note from the Quick note card (Today). */
export function QuickNoteCard() {
  const qc = useQueryClient(); const companies = useCompanies(); const ai = useAiStatus();
  const books = useQuery({ queryKey: ['notebooks'], queryFn: () => api<any>('/notebooks') });
  const [text, setText] = useState(() => { try { return localStorage.getItem('cc.quicknote') ?? ''; } catch { return ''; } });
  const [companyId, setCompanyId] = useState(''); const [bookId, setBookId] = useState(''); const [busy, setBusy] = useState(false); const [note, setNote] = useState(''); const [files, setFiles] = useState<File[]>([]); const docs = useRef<HTMLInputElement>(null);
  const addFiles = (l: FileList | null) => { const a = [...(l ?? [])]; if (docs.current) docs.current.value = ''; const big = a.find((f) => f.size > 15 * 1024 * 1024); if (big) { setNote(`“${big.name}” is larger than 15 MB.`); return; } setFiles((x) => [...x, ...a].slice(0, 6)); };
  useEffect(() => { try { localStorage.setItem('cc.quicknote', text); } catch { /* private mode */ } }, [text]);
  useEffect(() => { if (!bookId && books.data) setBookId(books.data.items.find((b: any) => b.name === 'Loose notes')?.id ?? books.data.items[0]?.id ?? ''); }, [books.data, bookId]);
  const mic = useRecorder((t) => setText((x) => (x ? x + '\n' : '') + t), (m) => setNote(m));
  const file = useRef<HTMLInputElement>(null);
  const photo = async (f?: File) => {
    if (!f) return; setBusy(true); setNote('');
    try { const r = await api<any>('/journal/ai/handwriting', { method: 'POST', body: { mimeType: f.type, dataBase64: await fileToBase64(f), fileName: f.name } }); setText((x) => (x ? x + '\n' : '') + r.text); }
    catch (e: any) { setNote(e?.code === 'AI_NOT_SET_UP' ? 'Reading handwriting needs AI, which is not set up on this computer yet.' : msgOf(e)); } finally { setBusy(false); if (file.current) file.current.value = ''; }
  };
  const save = async () => {
    if (!text.trim() && !files.length) return; setBusy(true);
    try { const first = (text.trim().split('\n')[0] || files[0]?.name || 'Untitled note').slice(0, 80); const n = await api<any>('/journal', { method: 'POST', body: { title: first, body: text, notebookId: bookId || null, companyId: companyId || null } }); for (const f of files) await uploadTo(n.id, f); setFiles([]); setText(''); qc.invalidateQueries({ queryKey: ['notebooks'] }); qc.invalidateQueries({ queryKey: ['journal'] }); toast('Note saved.'); void n; }
    catch (e: any) { setNote(msgOf(e)); } finally { setBusy(false); }
  };
  const [open, setOpen] = useState(false); const expanded = open || !!text || !!files.length;
  const writeUp = async () => { if (!text.trim() && !files.length) { setNote('Write a few points or attach a file first.'); return; } setBusy(true); try { const n = await api<any>('/journal', { method: 'POST', body: { title: (text.trim().split('\n')[0] || files[0]?.name || 'Untitled note').slice(0, 80), body: text, notebookId: bookId || null, companyId: companyId || null } }); for (const f of files) await uploadTo(n.id, f); setText(''); setFiles([]); qc.invalidateQueries({ queryKey: ['notebooks'] }); qc.invalidateQueries({ queryKey: ['journal'] }); goto('notes', n.id + '?ai=1'); } catch (e: any) { setNote(msgOf(e)); } finally { setBusy(false); } };
  if (!expanded) return (
    <section className="qn-bar" aria-label="Quick note">
      <Ic n="pencil" s={18} /><input aria-label="Jot a quick note" placeholder="Jot a quick note… (not linked to any task)" onFocus={() => setOpen(true)} />
      <button title="Speak a note" onClick={() => { setOpen(true); mic.toggle(); }}><Ic n="mic" />Speak</button>
      <button title="Photo of handwriting" onClick={() => { setOpen(true); file.current?.click(); }}><Ic n="camera" />Photo</button>
      <button title="Attach a file" onClick={() => { setOpen(true); docs.current?.click(); }}><Ic n="clip" />File</button>
      <input ref={file} type="file" accept="image/*" hidden onChange={(e) => photo(e.target.files?.[0])} /><input ref={docs} type="file" multiple accept={FILE_ACCEPT} hidden onChange={(e) => addFiles(e.target.files)} />
      <button className="primary" onClick={() => goto('notes')}><Ic n="book" />Open Notebook</button>
    </section>);
  return (
    <section className="qn-card" aria-label="Quick note">
      <header><Ic n="pencil" s={18} /><h2>Quick note</h2><span className="qn-chip">Not linked to any task</span><span className="grow" /><button className="small ghost" onClick={() => goto('notes')}><Ic n="book" s={14} />Open Notebook</button><button className="small ghost" aria-label="Close quick note" onClick={() => { if (!text.trim() && !files.length) setOpen(false); else toast('Save or clear the note first.'); }}><Ic n="x" s={14} /></button></header>
      <textarea className="ruled" rows={3} autoFocus={open} aria-label="Write a quick note" placeholder="Jot anything: points, a number to call, an idea…" value={text} onChange={(e) => setText(e.target.value)} />
      <footer>
        <button className="ai-btn" disabled={busy || !ai.data?.enabled} title={ai.data?.enabled ? '' : 'AI is not set up'} onClick={writeUp}><Ic n="sparkles" />Write up with AI</button>
        <button onClick={mic.toggle} disabled={mic.busy}><Ic n="mic" />{mic.rec ? 'Stop' : mic.busy ? 'Listening…' : 'Speak'}</button>
        <button onClick={() => file.current?.click()} disabled={busy}><Ic n="camera" />Photo of handwriting</button>
        <input ref={file} type="file" accept="image/*" hidden onChange={(e) => photo(e.target.files?.[0])} />
        <button onClick={() => docs.current?.click()} disabled={busy}><Ic n="clip" />Attach file</button>
        <input ref={docs} type="file" multiple accept={FILE_ACCEPT} hidden onChange={(e) => addFiles(e.target.files)} />
        <span className="grow" />
        <label className="sr-only" htmlFor="qn-co">Company</label>
        <select id="qn-co" value={companyId} onChange={(e) => setCompanyId(e.target.value)}><option value="">No company</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <label className="sr-only" htmlFor="qn-bk">Save in</label>
        <select id="qn-bk" value={bookId} onChange={(e) => setBookId(e.target.value)}>{books.data?.items.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        <button className="primary" disabled={busy || !text.trim()} onClick={save}>Save note</button>
      </footer>
      {!!files.length && <div className="filechips" aria-label="Attached files">{files.map((f, i) => <span className="fchip" key={i}><Ic n="clip" s={13} />{f.name}<small>{sizeLabel(f.size)}</small><button aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}><Ic n="x" s={12} /></button></span>)}<small className="muted">Press “Write up with AI” and Dood will read these files.</small></div>}
      {note && <p className="ai-note"><Ic n="info" s={14} />{note}</p>}
    </section>
  );
}

/** The Notes page: notebooks | pages | the page itself. */
export function Notebook() {
  const { arg, me } = useApp(); const qc = useQueryClient(); const companies = useCompanies();
  const [book, setBook] = useState<string>('all'); const [co, setCo] = useState(''); const [find, setFind] = useState(''); const [adding, setAdding] = useState(false); const [newBook, setNewBook] = useState('');
  const openId = (arg ?? '').split('?')[0] || ''; const wantAi = (arg ?? '').includes('ai=1');
  const books = useQuery({ queryKey: ['notebooks'], queryFn: () => api<any>('/notebooks') });
  const list = useQuery({ queryKey: ['journal', book, co, find], queryFn: () => { const p = new URLSearchParams(); if (book === 'pinned') p.set('pinned', 'true'); else if (book === 'linked') p.set('linked', 'true'); else if (book !== 'all') p.set('notebookId', book); if (co) p.set('companyId', co); if (find.trim()) p.set('q', find.trim()); return api<{ items: any[] }>(`/journal?${p}`).then((r) => r.items); } });
  const groups = useMemo(() => { const g: Record<string, any[]> = {}; for (const n of list.data ?? []) (g[n.pinned ? 'Pinned' : dayLabel(n.updatedAt)] ??= []).push(n); return ['Pinned', 'Today', 'Yesterday', 'Earlier this week', 'Older'].filter((k) => g[k]).map((k) => [k, g[k]] as const); }, [list.data]);
  const refresh = () => { qc.invalidateQueries({ queryKey: ['journal'] }); qc.invalidateQueries({ queryKey: ['notebooks'] }); };
  const create = async () => { const b = book !== 'all' && book !== 'pinned' && book !== 'linked' ? book : books.data?.items.find((x: any) => x.name === 'Daily journal')?.id ?? null; const n = await api<any>('/journal', { method: 'POST', body: { title: 'Untitled note', body: '', notebookId: b, companyId: co || null } }); refresh(); goto('notes', n.id); };
  const addBook = async () => { if (!newBook.trim()) return; await api('/notebooks', { method: 'POST', body: { name: newBook.trim(), color: BOOK_COLORS[(books.data?.items.length ?? 0) % BOOK_COLORS.length] } }); setNewBook(''); setAdding(false); refresh(); };
  void me;
  return (
    <section className="nb-layout">
      <aside className="nb-side">
        <button className="primary" onClick={create}><Ic n="plus" />New page</button>
        <h4>Notebooks</h4>
        <button className={'nb-book' + (book === 'all' ? ' on' : '')} style={{ ['--bc' as any]: '#5E6470' }} onClick={() => setBook('all')}><span>All notes</span><em>{books.data?.total ?? 0}</em></button>
        {books.data?.items.map((b: any) => <button key={b.id} className={'nb-book' + (book === b.id ? ' on' : '')} style={{ ['--bc' as any]: b.color, ['--bt' as any]: tint(b.color) }} onClick={() => setBook(b.id)}><span>{b.name}</span><em>{b.pages}</em></button>)}
        {adding ? <div className="nb-add"><input autoFocus placeholder="Notebook name" value={newBook} onChange={(e) => setNewBook(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addBook()} /><button className="small primary" onClick={addBook}>Add</button></div> : <button className="ghost small" onClick={() => setAdding(true)}><Ic n="plus" s={14} />New notebook</button>}
        <h4>By company</h4>
        {companies.map((c) => <button key={c.id} className={'nb-co' + (co === c.id ? ' on' : '')} onClick={() => setCo(co === c.id ? '' : c.id)}><i className="codot" style={{ background: c.color }} />{c.name}</button>)}
        <h4>Other</h4>
        <button className={'nb-co' + (book === 'pinned' ? ' on' : '')} onClick={() => setBook('pinned')}><Ic n="pin" s={14} />Pinned</button>
        <button className={'nb-co' + (book === 'linked' ? ' on' : '')} onClick={() => setBook('linked')}><Ic n="link" s={14} />Linked to tasks</button>
        <button className="nb-co" onClick={() => goto('tasknotes')}><Ic n="file" s={14} />Task notes (old list)</button>
      </aside>
      <div className="nb-pages">
        <div className="nb-search"><Ic n="search" s={15} /><input placeholder="Search every note" aria-label="Search every note" value={find} onChange={(e) => setFind(e.target.value)} /></div>
        <div className="nb-list">
          {groups.map(([k, items]) => <div key={k}><div className="nb-grp">{k}</div>{items.map((n) => { const color = n.companyColor || n.notebookColor || '#0F766E'; return (
            <button key={n.id} className={'nb-item' + (openId === n.id ? ' on' : '')} style={{ ['--ic' as any]: n.companyId ? companies.find((c) => c.id === n.companyId)?.color ?? color : n.notebookColor ?? color }} onClick={() => goto('notes', n.id)}>
              <b>{n.pinned && <Ic n="pin" s={12} />}{n.title}</b><span className="snip">{n.snippet || 'Empty page'}</span>
              <span className="meta">{n.companyName ? <em style={{ color: companies.find((c) => c.id === n.companyId)?.color }}>{n.companyName}</em> : null}{n.taskTitle ? <em>Task: {n.taskTitle}</em> : null}<span>{fmtTime(n.updatedAt)}</span></span></button>); })}</div>)}
          {list.data && !list.data.length && <div className="empty2"><Ic n="book" s={22} />No notes here yet. Press New page, or jot something in Quick note on Today.</div>}
        </div>
      </div>
      <div className="nb-page">{openId ? <NoteEditor key={openId} id={openId} startAi={wantAi} onChanged={refresh} onGone={() => goto('notes')} /> : <div className="empty2" style={{ border: 0, marginTop: 40 }}><Ic n="pencil" s={26} />Pick a note on the left, or press New page to start a fresh one.</div>}</div>
    </section>
  );
}

function NoteEditor({ id, startAi, onChanged, onGone }: { id: string; startAi: boolean; onChanged: () => void; onGone: () => void }) {
  const qc = useQueryClient(); const companies = useCompanies(); const ai = useAiStatus();
  const q = useQuery({ queryKey: ['journal-note', id], queryFn: () => api<any>(`/journal/${id}`) });
  const [title, setTitle] = useState(''); const [body, setBody] = useState(''); const [saved, setSaved] = useState<'idle' | 'dirty' | 'saving' | 'saved' | 'error'>('idle'); const [msg, setMsg] = useState('');
  const upd = useRef<string>(''); const loaded = useRef(false); const timer = useRef<any>(null); const area = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState<any>(null); const [aiOpen, setAiOpen] = useState(startAi); const [kind, setKind] = useState('Meeting note'); const [lang, setLang] = useState<'en' | 'ml'>('en'); const [extra, setExtra] = useState(''); const [working, setWorking] = useState(false);
  const [hist, setHist] = useState(false); const [linkOpen, setLinkOpen] = useState(false); const docs = useRef<HTMLInputElement>(null); const [skip, setSkip] = useState<Set<string>>(new Set());
  const n = q.data;
  useEffect(() => { if (n && !loaded.current) { loaded.current = true; setTitle(n.title); setBody(n.body ?? ''); upd.current = n.updatedAt; } }, [n]);
  const patch = async (p: Record<string, any>) => {
    setSaved('saving');
    try { const r = await api<any>(`/journal/${id}`, { method: 'PATCH', body: { ...p, expectedUpdatedAt: upd.current } }); upd.current = r.updatedAt; setSaved('saved'); qc.setQueryData(['journal-note', id], (o: any) => ({ ...o, ...r, body: p.body ?? o?.body })); onChanged(); return r; }
    catch (e: any) { if (e instanceof ApiError && e.status === 409) { setMsg('This note was changed somewhere else. Reload the page to see the latest.'); } else setMsg(msgOf(e)); setSaved('error'); }
  };
  const later = (p: Record<string, any>) => { setSaved('dirty'); clearTimeout(timer.current); timer.current = setTimeout(() => patch(p), 1200); };
  useEffect(() => () => clearTimeout(timer.current), []);
  const edit = (t: string, b: string) => { setTitle(t); setBody(b); later({ title: t, body: b }); };
  const insert = (prefix: string) => { const el = area.current; if (!el) return; const s = el.selectionStart; const lineStart = body.lastIndexOf('\n', s - 1) + 1; const nb = body.slice(0, lineStart) + prefix + body.slice(lineStart); edit(title, nb); setTimeout(() => { el.focus(); el.setSelectionRange(s + prefix.length, s + prefix.length); }, 0); };
  const append = (t: string) => edit(title, body + (body && !body.endsWith('\n') ? '\n' : '') + t);
  const mic = useRecorder((t) => append(t), (m) => setMsg(m));
  const file = useRef<HTMLInputElement>(null);
  const attach = async (l: FileList | null) => { const a = [...(l ?? [])]; if (docs.current) docs.current.value = ''; setWorking(true); setMsg(''); try { for (const f of a) { if (f.size > 15 * 1024 * 1024) throw new Error(`“${f.name}” is larger than 15 MB.`); await uploadTo(id, f); } await q.refetch(); setAiOpen(true); } catch (e: any) { setMsg(msgOf(e)); } finally { setWorking(false); } };
  const dropFile = async (fid: string) => { await api(`/journal/files/${fid}/archive`, { method: 'POST' }); setSkip((x) => { const y = new Set(x); y.delete(fid); return y; }); await q.refetch(); };
  const useFiles = (n?.files ?? []).filter((f: any) => !skip.has(f.id));
  const photo = async (f?: File) => { if (!f) return; setWorking(true); setMsg(''); try { const r = await api<any>('/journal/ai/handwriting', { method: 'POST', body: { mimeType: f.type, dataBase64: await fileToBase64(f), fileName: f.name } }); append(r.text); if (!title.trim() || title === 'Untitled note') setTitle(r.title); toast('Handwriting typed in. Please check it.'); } catch (e: any) { setMsg(e?.code === 'AI_NOT_SET_UP' ? 'Reading handwriting needs AI, which is not set up on this computer yet.' : msgOf(e)); } finally { setWorking(false); if (file.current) file.current.value = ''; } };
  const write = async () => {
    if (!body.trim() && !useFiles.length) { setMsg('Write a few points or attach a file first.'); return; } setWorking(true); setMsg(''); setDraft(null);
    try { await patch({ title, body }); setDraft(await api<any>('/journal/ai/writeup', { method: 'POST', body: { points: body, kind, language: lang, companyId: n?.companyId ?? null, noteId: id, instruction: extra || undefined, fileIds: useFiles.map((f: any) => f.id) } })); }
    catch (e: any) { setMsg(e?.code === 'AI_NOT_SET_UP' ? 'AI is not set up on this computer yet (Settings → AI).' : msgOf(e)); } finally { setWorking(false); }
  };
  useEffect(() => { if (startAi && n && (body.trim() || (n.files?.length ?? 0) > 0) && !draft && !working && ai.data?.enabled) { setAiOpen(true); void write(); } /* eslint-disable-next-line */ }, [startAi, n?.id, ai.data?.enabled]);
  const color = companies.find((c) => c.id === n?.companyId)?.color ?? n?.notebookColor ?? '#0F766E';
  const todos = todosOf(body);
  const toggleTodo = (line: number) => { const L = body.split('\n'); L[line] = L[line].replace(/\[( |x|X)\]/, (m, c) => (c === ' ' ? '[x]' : '[ ]')); edit(title, L.join('\n')); };
  if (q.isError) return <div className="empty2">This note could not be opened.</div>;
  if (!n) return <p className="muted">Loading…</p>;
  const priv = !!n.aiExcluded;
  return (
    <div className="nb-editor">
      <div className="nb-head" style={{ ['--hc' as any]: color, background: tint(color, 0.1), borderBottom: `3px solid ${color}` }}>
        <span className="muted">{n.notebookName ?? 'No notebook'} › {new Date(n.createdAt).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span><span className="grow" />
        <span className={'saved ' + saved}>{saved === 'saving' ? 'Saving…' : saved === 'dirty' ? 'Typing…' : saved === 'error' ? 'Not saved' : 'Saved'}</span>
        <button className="small" onClick={() => downloadFile(`/journal/${id}/export.docx`, `${title || 'note'}.docx`).catch((e) => toast(msgOf(e)))}><Ic n="download" s={14} />Export to Word</button>
        <button className="small ghost" title={n.pinned ? 'Unpin' : 'Pin'} onClick={() => patch({ pinned: !n.pinned })}><Ic n="pin" s={14} />{n.pinned ? 'Pinned' : 'Pin'}</button>
      </div>
      <div className="nb-tools">
        <button title="Heading" onClick={() => insert('# ')}>H</button><button title="Bullet" onClick={() => insert('- ')}><Ic n="list" s={15} /></button><button title="Tick box" onClick={() => insert('- [ ] ')}><Ic n="checkcircle" s={15} /></button>
        <button title="Date" onClick={() => append(new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }))}>Date</button><span className="sep" />
        <button className="ai-btn" disabled={priv} title={priv ? 'This note is Private · no AI' : ''} onClick={() => setAiOpen(true)}><Ic n="sparkles" s={15} />Write up with AI</button>
        <button className="voice" onClick={mic.toggle} disabled={mic.busy}><Ic n="mic" s={15} />{mic.rec ? 'Stop' : mic.busy ? 'Listening…' : 'Speak'}</button>
        <button className="photo" onClick={() => file.current?.click()} disabled={working}><Ic n="camera" s={15} />Handwriting to text</button>
        <input ref={file} type="file" accept="image/*" hidden onChange={(e) => photo(e.target.files?.[0])} />
        <button className="attach" onClick={() => docs.current?.click()} disabled={working}><Ic n="clip" s={15} />Attach file</button>
        <input ref={docs} type="file" multiple accept={FILE_ACCEPT} hidden onChange={(e) => attach(e.target.files)} />
      </div>
      <div className="nb-body">
        <input className="nb-title" aria-label="Note title" value={title} placeholder="Title" onChange={(e) => edit(e.target.value, body)} />
        <div className="nb-cos"><span className="muted">Company</span>
          {companies.map((c) => <button key={c.id} className={'cochip' + (n.companyId === c.id ? ' on' : '')} style={{ ['--cc' as any]: c.color, ['--ct' as any]: tint(c.color, 0.14) }} onClick={() => patch({ companyId: c.id })}><i className="codot" style={{ background: c.color }} />{c.name}</button>)}
          <button className={'cochip' + (!n.companyId ? ' on' : '')} onClick={() => patch({ companyId: null })}>No company</button></div>
        {!!n.files?.length && <div className="filechips" aria-label="Files in this note">{n.files.map((f: any) => <span className="fchip" key={f.id}><Ic n="clip" s={13} /><a href={`/api/v1/journal/files/${f.id}/download`}>{f.fileName}</a><small>{sizeLabel(f.sizeBytes)}</small><button aria-label={`Remove ${f.fileName}`} onClick={() => dropFile(f.id)}><Ic n="x" s={12} /></button></span>)}</div>}
        <textarea ref={area} className="ruled big" aria-label="Note" rows={14} placeholder="Write your points here. Start a line with “- [ ]” for a to-do." value={body} onChange={(e) => edit(title, e.target.value)} />
        {!!todos.length && <div className="nb-todos"><h4>To-dos in this note</h4>{todos.map((t) => <div className="tickrow" key={t.line}><input type="checkbox" className="cb" checked={t.done} onChange={() => toggleTodo(t.line)} aria-label={t.text} /><span className={t.done ? 'done' : ''}>{t.text}</span>{!t.done && <button className="small primary" onClick={() => openQuickAdd({ text: t.text })}>Make task</button>}</div>)}<small className="muted">Make task opens Quick add so you can check it before anything is saved.</small></div>}
        {aiOpen && !priv && <div className="ai-panel"><header><Ic n="sparkles" s={16} /><b>Dood’s draft from your points</b><span className="grow" />
          <label htmlFor="wk">Write as</label><select id="wk" value={kind} onChange={(e) => setKind(e.target.value)}>{['Meeting note', 'Letter', 'Email', 'Summary', 'Report'].map((k) => <option key={k}>{k}</option>)}</select>
          <label htmlFor="wl">Language</label><select id="wl" value={lang} onChange={(e) => setLang(e.target.value as any)}><option value="en">English</option><option value="ml">Malayalam</option></select></header>
          <div className="ai-body">{working ? <p className="muted">Writing…</p> : draft ? <><p><b>{draft.title}</b></p><div style={{ whiteSpace: 'pre-wrap' }}>{draft.body}</div></> : <p className="muted">Write your points above and/or attach files, tell Dood what you want, then press Write it. Your note is not changed until you press Add or Replace.</p>}
            {!working && !!n.files?.length && <div className="useFiles"><b>Files Dood will read:</b>{n.files.map((f: any) => <label key={f.id}><input type="checkbox" checked={!skip.has(f.id)} onChange={() => setSkip((x) => { const y = new Set(x); y.has(f.id) ? y.delete(f.id) : y.add(f.id); return y; })} />{f.fileName}</label>)}</div>}
            {!working && <input placeholder="What should Dood do? e.g. “Put the penalty clauses from the notice into this note”" aria-label="What should Dood do" value={extra} onChange={(e) => setExtra(e.target.value)} />}</div>
          <footer>{<button className="primary" disabled={working} onClick={write}><Ic n="sparkles" s={14} />{draft ? 'Write again' : 'Write it'}</button>}
            {draft && <><button className="primary" onClick={() => { append('\n' + draft.title + '\n' + draft.body); setDraft(null); setAiOpen(false); toast('Added below your points.'); }}>Add below my points</button>
              <button onClick={() => { edit(title && title !== 'Untitled note' ? title : draft.title, draft.body); setDraft(null); setAiOpen(false); }}>Replace my points</button>
              <button onClick={() => exportTextToWord(draft.title || title || 'Note', draft.body, { subtitle: kind, companyId: n?.companyId ?? null }).catch((e) => toast(msgOf(e)))}><Ic n="download" s={14} />Export to Word</button></>}
            <span className="grow" /><button className="ghost" onClick={() => { setAiOpen(false); setDraft(null); }}>Close</button></footer>
          <small className="muted" style={{ padding: '0 14px 10px' }}>Please check names and dates before you use the draft.</small></div>}
        {msg && <p className="ai-note"><Ic n="info" s={14} />{msg}</p>}
      </div>
      <div className="nb-foot">
        <span className="muted">Linked to</span>
        {n.taskTitle ? <span className="qn-chip">Task: {n.taskTitle}</span> : n.projectName ? <span className="qn-chip">Project: {n.projectName}</span> : <span className="qn-chip">Nothing (standalone note)</span>}
        <button className="small" onClick={() => setLinkOpen(true)}>{n.taskId ? 'Change link' : 'Link to a task'}</button>{(n.taskId || n.projectId) && <button className="small ghost" onClick={() => patch({ taskId: null, projectId: null })}>Unlink</button>}
        <span className="grow" />
        <label className="priv"><input type="checkbox" checked={priv} onChange={(e) => patch({ aiExcluded: e.target.checked })} /><Ic n="lock" s={14} />Private · no AI</label>
        <button className="small" onClick={() => setHist(true)}>Versions ({n.versions?.length ?? 1})</button>
        <button className="small ghost" onClick={async () => { if (!confirm('Archive this note? It is kept, not erased.')) return; await patch({ archived: true }); onGone(); }}><Ic n="archive" s={14} />Archive</button>
      </div>
      {hist && <Modal wide title="Earlier versions" onClose={() => setHist(false)}><p className="muted">Pick a version to put back. The current text is kept as a new version.</p>
        {n.versions?.map((v: any) => <div className="wiz-card" key={v.id} style={{ marginTop: 8 }}><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><b>Version {v.version}</b><span className="muted">{fmtTime(v.updatedAt)}</span><span className="grow" /><button className="small" onClick={() => { edit(v.title, v.body); setHist(false); toast('Version put back. Check it, then carry on.'); }}>Use this</button></div><div className="msg-box" style={{ maxHeight: 120, overflow: 'auto' }}>{v.body || '(empty)'}</div></div>)}</Modal>}
      {linkOpen && <LinkTask onClose={() => setLinkOpen(false)} onPick={async (t) => { await patch({ taskId: t.id }); setLinkOpen(false); qc.invalidateQueries({ queryKey: ['journal-note', id] }); }} />}
    </div>
  );
}

function LinkTask({ onClose, onPick }: { onClose: () => void; onPick: (t: any) => void }) {
  const [f, setF] = useState('');
  const q = useQuery({ queryKey: ['link-tasks', f], queryFn: () => api<any>(`/tasks?completed=false&limit=15${f.trim() ? `&q=${encodeURIComponent(f.trim())}` : ''}`).then((r) => r.items as any[]) });
  return <Modal title="Link to a task" onClose={onClose}><input autoFocus placeholder="Search tasks…" value={f} onChange={(e) => setF(e.target.value)} />
    <div style={{ marginTop: 8 }}>{q.data?.map((t) => <button key={t.id} className="rail-item" style={{ marginBottom: 6 }} onClick={() => onPick(t)}><span className="t">{t.title}</span><small>{t.companyName}</small></button>)}{q.data && !q.data.length && <p className="muted">No tasks found.</p>}</div></Modal>;
}
void today;

/** For any other note window (e.g. a task's note): pick files, say what you want, the AI reads them and gives text to add to the note. Nothing is added until the person presses the button. */
export function ReadFilesPanel({ taskId, companyId, existing, onUse, onClose }: { taskId?: string | null; companyId?: string | null; existing?: string; onUse: (text: string) => void; onClose: () => void }) {
  const ai = useAiStatus(); const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]); const [instr, setInstr] = useState(''); const [kind, setKind] = useState('Summary'); const [lang, setLang] = useState<'en' | 'ml'>('en'); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(''); const [draft, setDraft] = useState<any>(null);
  const add = (l: FileList | null) => { const a = [...(l ?? [])]; if (input.current) input.current.value = ''; const big = a.find((f) => f.size > 15 * 1024 * 1024); if (big) { setMsg(`“${big.name}” is larger than 15 MB.`); return; } setFiles((x) => [...x, ...a].slice(0, 6)); };
  const run = async () => {
    if (!files.length) { setMsg('Attach at least one file first.'); return; } setBusy(true); setMsg(''); setDraft(null);
    try { const fl = await Promise.all(files.map(async (f) => ({ fileName: f.name, mimeType: f.type || 'application/octet-stream', dataBase64: await fileToBase64(f) })));
      setDraft(await api<any>('/journal/ai/writeup', { method: 'POST', body: { points: (existing ?? '').slice(0, 6000), kind, language: lang, taskId: taskId ?? null, companyId: companyId ?? null, instruction: instr || undefined, files: fl } })); }
    catch (e: any) { setMsg(e?.code === 'AI_NOT_SET_UP' ? 'AI is not set up on this computer yet (Settings → AI).' : msgOf(e)); } finally { setBusy(false); }
  };
  return (
    <div className="ai-panel" style={{ margin: '0.5rem 0' }}>
      <header><Ic n="sparkles" s={16} /><b>Add from a file</b><span className="grow" />
        <label htmlFor="rf-k">Write as</label><select id="rf-k" value={kind} onChange={(e) => setKind(e.target.value)}>{['Summary', 'Meeting note', 'Letter', 'Email', 'Report'].map((k) => <option key={k}>{k}</option>)}</select>
        <label htmlFor="rf-l">Language</label><select id="rf-l" value={lang} onChange={(e) => setLang(e.target.value as any)}><option value="en">English</option><option value="ml">Malayalam</option></select></header>
      <div className="ai-body">
        <div className="filechips" style={{ padding: 0 }}>{files.map((f, i) => <span className="fchip" key={i}><Ic n="clip" s={13} />{f.name}<small>{sizeLabel(f.size)}</small><button aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}><Ic n="x" s={12} /></button></span>)}
          <button type="button" className="small" onClick={() => input.current?.click()}><Ic n="clip" s={14} />Attach file</button><input ref={input} type="file" multiple accept={FILE_ACCEPT} hidden onChange={(e) => add(e.target.files)} /></div>
        <input placeholder="What should Dood take from the files? e.g. “List every deadline and amount”" aria-label="What should Dood do" value={instr} onChange={(e) => setInstr(e.target.value)} />
        {working(busy)}
        {draft && <div style={{ marginTop: 10 }}><p><b>{draft.title}</b></p><div style={{ whiteSpace: 'pre-wrap' }}>{draft.body}</div><small className="muted">Read: {draft.filesRead.join(', ')}. Please check names, amounts and dates.</small></div>}
        {msg && <p className="ai-note"><Ic n="info" s={14} />{msg}</p>}
      </div>
      <footer><button type="button" className="primary" disabled={busy || !ai.data?.enabled || !files.length} onClick={run}><Ic n="sparkles" s={14} />{draft ? 'Read again' : 'Read the files'}</button>
        {draft && <button type="button" onClick={() => { onUse(draft.title + '\n' + draft.body); onClose(); toast('Added to your note.'); }}>Add to my note</button>}
        <span className="grow" /><button type="button" className="ghost" onClick={onClose}>Close</button></footer>
    </div>
  );
}
const working = (b: boolean) => (b ? <p className="muted">Reading the files…</p> : null);
