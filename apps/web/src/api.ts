export class ApiError extends Error {
  status: number; code: string; body: any;
  constructor(status: number, code: string, message: string, body: any) { super(message); this.status = status; this.code = code; this.body = body; }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch('/api/v1' + path, {
    method: opts.method ?? 'GET', credentials: 'same-origin',
    headers: { 'X-Requested-With': 'command-centre', ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, json?.error?.code ?? 'ERROR', json?.error?.message ?? res.statusText, json?.error);
  // Finishing a task anywhere in the app (Tasks, Home, Kanban, Board …) triggers the congratulation + self-review pop-up.
  if (opts.method === 'POST' || opts.method === 'PATCH') {
    const m = /^\/tasks\/([^/?]+?)(\/complete)?(\?.*)?$/.exec(path);
    if (m && json?.status === 'DONE' && json?.id === m[1] && (m[2] || (opts.body as any)?.status === 'DONE')) dispatchEvent(new CustomEvent('cc-task-done', { detail: { id: m[1] } }));
  }
  return json as T;
}

export const qs = (o: Record<string, unknown>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '' && v !== false) p.set(k, String(v));
  const s = p.toString(); return s ? '?' + s : '';
};

export const PRIORITY = { 1: 'Critical', 2: 'High', 3: 'Medium', 4: 'Low' } as Record<number, string>;
export const PRIORITY_DOT = { 1: 'P1', 2: 'P2', 3: '', 4: '' } as Record<number, string>;
export const STATUS_LABEL = { BACKLOG: 'Backlog', TODO: 'To do', DOING: 'In progress', WAITING: 'Waiting', DELEGATED: 'Delegated', DONE: 'Done' } as Record<string, string>;
export const PROJECT_STATUS = { NOT_STARTED: 'Not started', ACTIVE: 'Active', ON_HOLD: 'On hold', COMPLETED: 'Completed', CANCELLED: 'Cancelled' } as Record<string, string>;
const pad = (n: number) => String(n).padStart(2, '0');
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** Today in the user's own time zone (not UTC), so evenings/early mornings in India are not off by a day. */
export const today = () => ymd(new Date());
export const addDays = (s: string, n: number) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return ymd(d); };
export const diffDays = (a: string, b: string) => Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 864e5);
export const goto = (page: string, arg?: string) => { location.hash = arg ? `${page}/${arg}` : page; };
export const fmtMinutes = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);
export const fmtDate = (d?: string | null) => (d ? new Date(d.length === 10 ? d + 'T00:00:00' : d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const fmtTime = (d: string) => new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export const CHANNEL = { CALL: { icon: '', label: 'Call', verb: 'Call' }, EMAIL: { icon: '✉️', label: 'Email', verb: 'Email' }, WHATSAPP: { icon: '', label: 'WhatsApp', verb: 'Message' } } as Record<string, { icon: string; label: string; verb: string }>;
export const fileToBase64 = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] ?? ''); r.onerror = () => rej(new Error('Could not read the file')); r.readAsDataURL(f); });
export const fmtSize = (n: number) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n > 1024 ? Math.round(n / 1024) + ' KB' : n + ' B');
/** Downloads a file the server generates (exports, backups) with the session cookie. */
export async function downloadFile(path: string, fallbackName: string) {
  const res = await fetch('/api/v1' + path, { credentials: 'same-origin' });
  if (!res.ok) { const j = await res.json().catch(() => null); throw new Error(j?.error?.message ?? 'Download failed'); }
  const name = /filename="?([^";]+)"?/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob()); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Pasted text → separate items: one per non-empty line, original order, bullet symbols removed but numbering (1. 2) …) kept. */
export function parseLines(text: string): string[] {
  return text.split(/\r?\n/).map((l) => l.replace(/^[\s\u00a0]*[•▪●◦○■□▶►‣⁃·*–—-]+[\s\u00a0]+/, '').replace(/[\s\u00a0]+$/, '').trim()).filter(Boolean);
}
/** Hand a filter to the Tasks page (e.g. from a Home card): { view, maxPriority, priority, dueOn }. */
export const setTasksFilter = (f: Record<string, unknown>) => sessionStorage.setItem('cc.tasksFilter', JSON.stringify(f));
export const takeTasksFilter = (): Record<string, any> | null => { const v = sessionStorage.getItem('cc.tasksFilter'); sessionStorage.removeItem('cc.tasksFilter'); try { return v ? JSON.parse(v) : null; } catch { return null; } };
export const openTasks = (f: Record<string, unknown>) => { setTasksFilter(f); if (location.hash.slice(1).split('/')[0] === 'tasks') dispatchEvent(new Event('cc-tasks-filter')); goto('tasks'); };

/** Copy text to the clipboard (with a fallback for browsers that block the modern way). */
export async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); }
  catch { const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
}

/** Sends text to the server and downloads it as a Word file (used by "Export to Word" next to AI-written text). */
export async function exportTextToWord(title: string, body: string, opts: { subtitle?: string | null; companyId?: string | null; label?: string } = {}) {
  const res = await fetch('/api/v1/export-word/text', { method: 'POST', credentials: 'same-origin', headers: { 'X-Requested-With': 'command-centre', 'Content-Type': 'application/json' }, body: JSON.stringify({ title: title || 'Note', body, ...opts }) });
  if (!res.ok) { const j = await res.json().catch(() => null); throw new Error(j?.error?.message ?? 'Could not make the Word file'); }
  const name = /filename="?([^";]+)"?/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'note.docx';
  const url = URL.createObjectURL(await res.blob()); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
}
