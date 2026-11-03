import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError, parseLines } from './api';

export type Role = 'VIEWER' | 'MEMBER' | 'USER' | 'MANAGER' | 'ADMIN';
export interface Me { viewAs?: { realUserId: string; readOnly: boolean; realName: string } | null; user: { id: string; name: string; email: string; isAdmin: boolean; loginId?: string | null; personId?: string | null; mustChangePassword?: boolean }; memberships: { companyId: string; companyName: string; code: string; color?: string | null; role: Role }[] }
export interface Draft { id: string; kind: string; title: string | null; data: any; updatedAt: string }
export const Ctx = createContext<{
  me: Me; companyId: string; setCompanyId: (id: string) => void; can: (min: Role, companyId?: string) => boolean;
  arg: string | undefined; resume: Draft | null; setResume: (d: Draft | null) => void;
}>(null as any);
export const useApp = () => useContext(Ctx);
export const roleIn = (me: Me, companyId: string): Role | null => (me.user.isAdmin ? 'ADMIN' : me.memberships.find((m) => m.companyId === companyId)?.role ?? null);

// ───── tiny toast ─────
const listeners = new Set<(m: string) => void>();
export const toast = (m: string) => listeners.forEach((l) => l(m));
export function ToastHost() {
  const [msgs, setMsgs] = useState<{ id: number; m: string }[]>([]);
  useEffect(() => {
    const l = (m: string) => { const id = Date.now() + Math.random(); setMsgs((x) => [...x, { id, m }]); setTimeout(() => setMsgs((x) => x.filter((y) => y.id !== id)), 5000); };
    listeners.add(l); return () => { listeners.delete(l); };
  }, []);
  return <div className="toasts" aria-live="polite">{msgs.map((t) => <div key={t.id} className="toast">{t.m}</div>)}</div>;
}

/** Pop-ups close ONLY with their ✕ / Cancel buttons — never by clicking outside or pressing Esc. */
const modalStack: symbol[] = [];
export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  // Esc closes the top-most window only (and a stacked window never closes the one beneath it).
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const id = Symbol('modal'); modalStack.push(id);
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && modalStack[modalStack.length - 1] === id) { e.stopPropagation(); closeRef.current(); } };
    addEventListener('keydown', h);
    return () => { const i = modalStack.indexOf(id); if (i >= 0) modalStack.splice(i, 1); removeEventListener('keydown', h); };
  }, []);
  return (
    <div className="overlay">
      <div className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label={title}>
        <header><h3>{title}</h3><button className="icon" aria-label="Close" onClick={onClose}>✕</button></header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export interface Field { key: string; label: string; type: 'text' | 'password' | 'textarea' | 'select' | 'checkbox' | 'date' | 'number' | 'email'; options?: { value: any; label: string }[]; required?: boolean; half?: boolean; hint?: string;
  /** A small link-button next to the label, e.g. "+ New project". Gets a setter for this field and the current form values. */
  action?: { label: string; onClick: (set: (value: any) => void, values: any) => void } }

const clean = (f: Field, v: any) => {
  if (f.type === 'checkbox') return !!v;
  if (f.type === 'number') return v === '' || v === null || v === undefined ? null : Number(v);
  if (f.type === 'select') return v === '' || v === undefined ? null : typeof f.options?.[0]?.value === 'number' ? Number(v) : v;
  if (v === '' || v === undefined) return null;
  return typeof v === 'string' ? v.trim() : v;
};
const TEXTY = new Set(['text', 'textarea', 'email', 'number', 'date']);

/** "Multiple activities detected" — asked whenever several lines are pasted into a field that can hold a list. Never acts without a click. */
export function BulkPrompt({ count, noun, onMany, onOne, onCancel }: { count: number; noun: string; onMany: () => void; onOne: () => void; onCancel: () => void }) {
  return (
    <Modal title="Multiple activities detected" onClose={onCancel}>
      <p><b>{count} separate {noun}s</b> were detected in what you pasted.</p><p className="muted" style={{ marginTop: '0.375rem' }}>Would you like to add them as {count} separate {noun}s? Order and wording are kept; empty lines are ignored.</p>
      <div className="actions left"><button className="primary" onClick={onMany}>Add as multiple {noun}s</button><button onClick={onOne}>Keep as one {noun}</button><button className="ghost" onClick={onCancel}>Cancel</button></div>
    </Modal>
  );
}

export interface DraftSpec { kind: 'task' | 'project' | 'person' | 'company' | 'call' | 'discussion' | 'followup'; title: (v: any) => string }

/**
 * Form pop-up. With `draft`, whatever you type is auto-saved to Drafts, and closing with ✕/Cancel keeps it there
 * so you can finish later. Without it (edit forms), closing with unsaved changes asks first.
 */
export function FormModal({ title, fields, initial, onSubmit, onClose, submitLabel = 'Save', wide, onValues, draft, draftId, bulk }: {
  onValues?: (v: any) => void; title: string; fields: Field[] | ((v: any) => Field[]); initial: any; onSubmit: (v: any) => Promise<void>; onClose: () => void;
  submitLabel?: string; wide?: boolean; draft?: DraftSpec; draftId?: string | null;
  /** Pasting several lines into `field` offers to create one item per line. */
  bulk?: { field: string; noun: string; create: (lines: string[], values: any) => Promise<void> };
}) {
  const qc = useQueryClient();
  const [v, setV] = useState<any>(initial);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const baseline = useRef(JSON.stringify(initial));
  const id = useRef<string | null>(draftId ?? null);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const submitted = useRef(false);
  const [pasted, setPasted] = useState<{ text: string; lines: string[]; el: HTMLInputElement | HTMLTextAreaElement } | null>(null);
  const list = typeof fields === 'function' ? fields(v) : fields;
  useEffect(() => { onValues?.(v); }, [v]);

  const changed = JSON.stringify(v) !== baseline.current;
  const meaningful = changed && list.some((f) => TEXTY.has(f.type) && String(v[f.key] ?? '').trim() !== '' && String(v[f.key]) !== String(initial?.[f.key] ?? ''));

  const persist = (vals: any) => {
    if (!draft || submitted.current) return chain.current;
    chain.current = chain.current.then(async () => {
      if (submitted.current) return;
      const data: any = {}; for (const f of list) if (f.type !== 'password') data[f.key] = vals[f.key] ?? null;
      for (const k of Object.keys(vals)) if (!(k in data) && typeof vals[k] !== 'object') data[k] = vals[k];
      const payload = { title: draft.title(vals)?.slice(0, 200) || null, data };
      if (id.current) await api(`/drafts/${id.current}`, { method: 'PATCH', body: payload });
      else id.current = (await api('/drafts', { method: 'POST', body: { kind: draft.kind, ...payload } })).id;
      qc.invalidateQueries({ queryKey: ['drafts'] });
    }).catch(() => undefined);
    return chain.current;
  };

  useEffect(() => { if (!draft || !meaningful) return; const t = setTimeout(() => persist(v), 1200); return () => clearTimeout(t); }, [v]);

  const onPaste = (key: string) => (e: React.ClipboardEvent<any>) => {
    if (!bulk || key !== bulk.field) return;
    const text = e.clipboardData.getData('text'); const lines = parseLines(text);
    if (lines.length < 2) return;
    e.preventDefault(); setPasted({ text, lines, el: e.currentTarget });
  };
  const keepAsOne = () => { if (!pasted) return; const el = pasted.el; const cur = String(v[bulk!.field] ?? ''); const a = el.selectionStart ?? cur.length, b = el.selectionEnd ?? cur.length;
    setV({ ...v, [bulk!.field]: cur.slice(0, a) + pasted.text.replace(/\r\n/g, '\n').trim() + cur.slice(b) }); setPasted(null); };
  const addMany = async () => { if (!pasted) return; const lines = pasted.lines; setPasted(null); setBusy(true); submitted.current = true;
    try { const out: any = {}; for (const f of list) out[f.key] = clean(f, v[f.key]); await bulk!.create(lines, out); await chain.current;
      if (id.current) { await api(`/drafts/${id.current}`, { method: 'DELETE' }).catch(() => undefined); qc.invalidateQueries({ queryKey: ['drafts'] }); }
      toast(`${lines.length} ${bulk!.noun}s created.`); onClose(); }
    catch (x: any) { submitted.current = false; setErr(x.message ?? 'Something went wrong'); } finally { setBusy(false); } };

  const close = async () => {
    if (draft && meaningful) { await persist(v); toast('Saved to Drafts — open the Drafts tab any time to finish it.'); }
    else if (!draft && changed && !confirm('Discard your changes?')) return;
    onClose();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setBusy(true); submitted.current = true;
    try {
      const out: any = {}; for (const f of list) out[f.key] = clean(f, v[f.key]);
      await onSubmit(out);
      await chain.current;
      if (id.current) { await api(`/drafts/${id.current}`, { method: 'DELETE' }).catch(() => undefined); qc.invalidateQueries({ queryKey: ['drafts'] }); }
    } catch (x: any) { submitted.current = false; setErr(x.message ?? 'Something went wrong'); } finally { setBusy(false); }
  };

  return (
    <Modal title={title} onClose={close} wide={wide}>
      <form onSubmit={submit} className="form">
        {draft && <p className="draft-note">✎ Changes are saved to <b>Drafts</b> automatically.</p>}
        {list.map((f) => (
          <label key={f.key} className={'field' + (f.half ? ' half' : '') + (f.type === 'checkbox' ? ' check' : '')}>
            <span>{f.label}{f.required && ' *'}{f.action && <button type="button" className="linklike field-action" onClick={(e) => { e.preventDefault(); f.action!.onClick((val) => setV((cur: any) => ({ ...cur, [f.key]: val })), v); }}>{f.action.label}</button>}</span>
            {f.type === 'textarea' ? <textarea rows={3} value={v[f.key] ?? ''} onPaste={onPaste(f.key)} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} />
              : f.type === 'select' ? (
                <select value={v[f.key] ?? ''} required={f.required} onChange={(e) => setV({ ...v, [f.key]: e.target.value })}>
                  {!f.required && <option value="">—</option>}
                  {f.options?.map((o) => <option key={String(o.value)} value={o.value}>{o.label}</option>)}
                </select>)
              : f.type === 'checkbox' ? <input type="checkbox" checked={!!v[f.key]} onChange={(e) => setV({ ...v, [f.key]: e.target.checked })} />
              : <input type={f.type} required={f.required} value={v[f.key] ?? ''} onPaste={onPaste(f.key)} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} />}
            {f.hint && <small>{f.hint}</small>}
          </label>
        ))}
        {err && <p className="error">{err}</p>}
        <div className="actions"><button type="button" className="ghost" onClick={close}>{draft ? 'Close (keep draft)' : 'Cancel'}</button><button className="primary" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button></div>
      </form>
      {pasted && <BulkPrompt count={pasted.lines.length} noun={bulk!.noun} onMany={addMany} onOne={keepAsOne} onCancel={() => setPasted(null)} />}
    </Modal>
  );
}

/** Wraps a save so that a 409 STALE shows a "keep mine / take theirs" prompt instead of silently overwriting. */
export function useConflict(onSettled: () => void) {
  const [c, setC] = useState<{ current: any; retry: (updatedAt: string) => Promise<void> } | null>(null);
  const guarded = async (run: (expectedUpdatedAt?: string) => Promise<void>) => {
    try { await run(); onSettled(); }
    catch (e) {
      if (e instanceof ApiError && e.code === 'STALE') { setC({ current: e.body.current, retry: async (u) => { await run(u); onSettled(); } }); return; }
      throw e;
    }
  };
  const node = c && (
    <Modal title="Someone else changed this" onClose={() => { setC(null); onSettled(); }}>
      <p>This record was updated after you opened it. Do you want to keep your version (overwriting theirs) or take theirs (discarding your edits)?</p>
      <div className="actions">
        <button className="ghost" onClick={() => { setC(null); onSettled(); }}>Take theirs</button>
        <button className="primary" onClick={async () => { const x = c; setC(null); await x.retry(x.current.updatedAt); }}>Keep mine</button>
      </div>
    </Modal>
  );
  return { guarded, node };
}

export const Empty = ({ children }: { children: ReactNode }) => <div className="empty">{children}</div>;
/** Animated check circle used for completing things — the row it sits in fades away after the check animation. */
export const Check = ({ onDone, title = 'Mark done' }: { onDone: () => void; title?: string }) => <button className="checkcircle" aria-label={title} title={title} onClick={(e) => { e.stopPropagation(); (e.currentTarget as HTMLElement).classList.add('on'); onDone(); }}><svg viewBox="0 0 20 20"><path d="M5 10.5l3.2 3.2L15 6.8" /></svg></button>;
export const Badge = ({ tone, children }: { tone: string; children: ReactNode }) => <span className={'badge ' + tone}>{children}</span>;
export const Progress = ({ value }: { value: number }) => <div className="progress" title={value + '%'}><i style={{ width: value + '%' }} /></div>;
