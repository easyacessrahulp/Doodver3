import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, copyText, downloadFile, fmtTime, today } from './api';
import { Badge, FormModal, Modal, toast, useApp, useConflict } from './ui';
import { AiSettings } from './pages-ai';
import { getAppearance, setAppearance } from './appearance';
import { companyColor } from './icons';

const genPassword = () => { const w = 'abcdefghjkmnpqrstuvwxyz', W = w.toUpperCase(), d = '23456789'; const r = (s: string) => s[Math.floor(Math.random() * s.length)]; const all = w + W + d; let p = r(w) + r(W) + r(d); while (p.length < 10) p += r(all); return p.split('').sort(() => Math.random() - 0.5).join(''); };
const ROLE_OPTS: [string, string][] = [['MEMBER', 'Team member (own work only)'], ['USER', 'User (whole company)'], ['MANAGER', 'Manager'], ['VIEWER', 'Viewer (read only)']];
const ROLE_NAME: Record<string, string> = { MEMBER: 'Team member', USER: 'User', MANAGER: 'Manager', VIEWER: 'Viewer' };

function NewUser({ companies, onClose, onDone }: { companies: any[]; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState<any>({ name: '', loginId: '', designation: '', password: genPassword(), must: true, isAdmin: false });
  const [rows, setRows] = useState<{ companyId: string; role: string }[]>([{ companyId: companies[0]?.id ?? '', role: 'MEMBER' }]);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [made, setMade] = useState<any>(null);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { await api('/users', { method: 'POST', body: { name: f.name, loginId: f.loginId.trim().toLowerCase(), designation: f.designation || undefined, password: f.password, mustChangePassword: f.must, isAdmin: f.isAdmin, companies: f.isAdmin ? [] : rows.filter((r) => r.companyId) } }); setMade({ ...f }); onDone(); }
    catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  };
  if (made) return <Modal title="Login created" onClose={onClose}>
    <p>Give these to <b>{made.name}</b> (write them down now — the password is not shown again):</p>
    <div className="cred-box"><div>User ID: <b>{made.loginId.trim().toLowerCase()}</b></div><div>Password: <b>{made.password}</b></div><div>Address: <b>{location.origin}</b></div></div>
    {made.must && <p className="muted">They will be asked to choose their own password the first time they sign in.</p>}
    <div className="actions"><button onClick={() => copyText(`DOOD login\nAddress: ${location.origin}\nUser ID: ${made.loginId.trim().toLowerCase()}\nPassword: ${made.password}`).then(() => toast('Copied.'))}>Copy</button><button className="primary" onClick={onClose}>Done</button></div>
  </Modal>;
  return <Modal title="New user" onClose={onClose} wide>
    <form className="form" onSubmit={submit}>
      <div className="row2"><label className="field"><span>Full name *</span><input required value={f.name} onChange={(e) => set('name', e.target.value)} autoFocus /></label>
        <label className="field"><span>User ID * <small className="muted">(they type this to sign in)</small></span><input required value={f.loginId} placeholder="e.g. priya" onChange={(e) => set('loginId', e.target.value.replace(/\s/g, ''))} /></label></div>
      <label className="field"><span>Designation (optional)</span><input value={f.designation} placeholder="e.g. Sales executive" onChange={(e) => set('designation', e.target.value)} /></label>
      <div className="field"><span>Temporary password *</span><div className="inline"><input required minLength={10} value={f.password} onChange={(e) => set('password', e.target.value)} /><button type="button" className="ghost" onClick={() => set('password', genPassword())}>Make another</button></div></div>
      <label className="check-line"><input type="checkbox" checked={f.must} onChange={(e) => set('must', e.target.checked)} /> Ask them to choose their own password at first sign-in</label>
      <label className="check-line"><input type="checkbox" checked={f.isAdmin} onChange={(e) => set('isAdmin', e.target.checked)} /> Owner-level (Admin) — sees everything in every company</label>
      {!f.isAdmin && <div className="field"><span>Companies and what they may do</span>
        {rows.map((r, i) => <div className="inline" key={i}>
          <select value={r.companyId} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, companyId: e.target.value } : x)))}>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <select value={r.role} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))}>{ROLE_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          {rows.length > 1 && <button type="button" className="icon" onClick={() => setRows(rows.filter((_, j) => j !== i))}>✕</button>}</div>)}
        <button type="button" className="ghost small" onClick={() => setRows([...rows, { companyId: companies[0]?.id ?? '', role: 'MEMBER' }])}>＋ Another company</button>
        <small className="muted">“Team member” sees only jobs they created or that are given to them. “User” sees the whole company.</small></div>}
      {err && <p className="error">{err}</p>}
      <div className="actions"><button className="primary" disabled={busy}>Create login</button></div>
    </form></Modal>;
}

export function Users() {
  const { me } = useApp(); const qc = useQueryClient();
  const users = useQuery({ queryKey: ['users'], queryFn: () => api<{ items: any[] }>('/users').then((r) => r.items) });
  const companies = useQuery({ queryKey: ['companies-all'], queryFn: () => api<{ items: any[] }>('/companies?limit=200').then((r) => r.items) });
  const [creating, setCreating] = useState(false); const [editing, setEditing] = useState<any>(null); const [err, setErr] = useState(''); const [history, setHistory] = useState<any>(null); const [pw, setPw] = useState<any>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['users'] });
  const { guarded, node } = useConflict(refresh);
  if (!me.user.isAdmin) return <p className="muted">Only Admins can manage users.</p>;
  const setRole = async (u: any, companyId: string, role: string) => { setErr(''); try { role ? await api(`/users/${u.id}/memberships/${companyId}`, { method: 'PUT', body: { role } }) : await api(`/users/${u.id}/memberships/${companyId}`, { method: 'DELETE' }); refresh(); } catch (e: any) { setErr(e.message); } };
  const viewAs = async (u: any, actAs: boolean) => { try { await api('/auth/view-as', { method: 'POST', body: { userId: u.id, actAs } }); location.hash = 'home'; location.reload(); } catch (e: any) { toast(e.message); } };
  const signOut = async (u: any) => { if (!confirm(`Sign ${u.name} out of every device now?`)) return; try { await api(`/users/${u.id}/sign-out`, { method: 'POST' }); toast('Signed out.'); } catch (e: any) { toast(e.message); } };
  return (
    <section>
      <div className="page-head"><div><h2>Users</h2><p className="muted">Create a login (user ID + password) for each person and choose what they can see. No email is needed.</p></div><button className="primary" onClick={() => setCreating(true)}>+ New user</button></div>
      {err && <p className="error">{err}</p>}
      <div className="card table-wrap"><table>
        <thead><tr><th>Name</th><th>User ID</th><th>Access</th><th>Last sign-in</th><th /></tr></thead>
        <tbody>{users.data?.map((u) => (
          <tr key={u.id} className={u.active ? '' : 'archived'}>
            <td><b>{u.name}</b> {u.isAdmin && <Badge tone="blue">Admin</Badge>} {!u.active && <Badge tone="grey">Disabled</Badge>} {u.mustChangePassword && <Badge tone="amber">New password pending</Badge>}</td><td>{u.loginId ?? u.email}</td>
            <td>{u.isAdmin ? <span className="muted">All companies</span> : (
              <div className="memberships">{companies.data?.map((c) => {
                const m = u.memberships.find((x: any) => x.companyId === c.id);
                return <label key={c.id}><span>{c.shortName ?? c.name}</span>
                  <select value={m?.role ?? ''} onChange={(e) => setRole(u, c.id, e.target.value)}><option value="">No access</option>{ROLE_OPTS.map(([v]) => <option key={v} value={v}>{ROLE_NAME[v]}</option>)}</select></label>;
              })}</div>)}</td>
            <td>{u.lastLoginAt ? fmtTime(u.lastLoginAt) : 'Never'}</td>
            <td className="row-actions">
              <button className="ghost small" onClick={() => setEditing(u)}>Edit</button>
              {u.id !== me.user.id && u.active && <><button className="ghost small" title="See DOOD exactly as this person sees it (read-only)" onClick={() => viewAs(u, false)}>View as</button>
                <button className="ghost small" title="Work as this person (everything is recorded)" onClick={() => confirm(`Work as ${u.name}? Whatever you change is saved in their name and recorded.`) && viewAs(u, true)}>Act as</button>
                <button className="ghost small" onClick={() => signOut(u)}>Sign out</button></>}
              <button className="ghost small" onClick={async () => setHistory({ u, ...(await api(`/users/${u.id}/logins`)) })}>Logins</button>
              <button className="ghost small" onClick={() => setPw({ u, password: genPassword() })}>New password</button>
            </td>
          </tr>))}</tbody></table></div>
      {creating && <NewUser companies={companies.data ?? []} onClose={() => setCreating(false)} onDone={refresh} />}
      {pw && <Modal title={`New password for ${pw.u.name}`} onClose={() => setPw(null)}>
        <p>They will be signed out and asked to choose their own password at the next sign-in.</p>
        <div className="inline"><input value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} /><button className="ghost" onClick={() => setPw({ ...pw, password: genPassword() })}>Make another</button></div>
        <div className="actions"><button className="primary" disabled={pw.password.length < 10} onClick={async () => {
          try { await guarded((x) => api(`/users/${pw.u.id}`, { method: 'PATCH', body: { expectedUpdatedAt: x ?? pw.u.updatedAt, password: pw.password, mustChangePassword: true } }).then(() => undefined)); copyText(`DOOD login\nAddress: ${location.origin}\nUser ID: ${pw.u.loginId ?? pw.u.email}\nPassword: ${pw.password}`); toast('Password set and copied — give it to them.'); setPw(null); } catch (e: any) { toast(e.message); } }}>Set & copy</button></div>
      </Modal>}
      {history && <Modal title={`Sign-in history: ${history.u.name}`} onClose={() => setHistory(null)} wide>
        <div className="table-wrap"><table><thead><tr><th>When</th><th>What</th><th>Result</th></tr></thead><tbody>{history.items.map((h: any) => <tr key={h.id}><td>{new Date(h.at).toLocaleString('en-IN')}</td><td>{h.kind.replace(/_/g, ' ').toLowerCase()}</td><td>{h.ok ? 'OK' : 'Failed'}</td></tr>)}{!history.items.length && <tr><td colSpan={3} className="muted">No sign-ins recorded yet.</td></tr>}</tbody></table></div>
      </Modal>}
      {editing && <FormModal title={`Edit ${editing.name}`} initial={{ name: editing.name, loginId: editing.loginId ?? '', isAdmin: editing.isAdmin, active: editing.active }} onClose={() => setEditing(null)}
        fields={[{ key: 'name', label: 'Name', type: 'text', required: true }, { key: 'loginId', label: 'User ID', type: 'text', required: true }, { key: 'isAdmin', label: 'Admin', type: 'checkbox' }, { key: 'active', label: 'Active (can sign in)', type: 'checkbox' }]}
        onSubmit={async (v) => { await guarded((u) => api(`/users/${editing.id}`, { method: 'PATCH', body: { expectedUpdatedAt: u ?? editing.updatedAt, name: v.name, loginId: v.loginId, isAdmin: v.isAdmin, active: v.active } }).then(() => undefined)); setEditing(null); }} />}
      {node}
    </section>
  );
}

const EXPORTS: [string, string, string][] = [
  ['tasks', 'active', 'Active tasks'], ['tasks', 'completed', 'Completed tasks'], ['tasks', 'overdue', 'Overdue tasks'], ['tasks', 'delegated', 'Delegated tasks'], ['tasks', 'followups', 'Tasks with follow-ups'],
  ['tasks', 'all', 'All tasks'], ['subtasks', 'all', 'Subtasks'], ['communications', 'all', 'Calls & mails'], ['discussions', 'all', 'Discussions & meetings'], ['focus', 'all', 'Focus history'], ['people', 'all', 'People'],
];

import { PendingJobsCard, ReminderCard } from './pages-v5';
export function ExportCard() {
  const { companyId } = useApp(); const [pick, setPick] = useState('0'); const [fmt, setFmt] = useState('xlsx'); const [busy, setBusy] = useState(false);
  const go = async () => { const [dataset, scope] = EXPORTS[Number(pick)]; setBusy(true);
    try { await downloadFile(`/export/${fmt}?dataset=${dataset}&scope=${scope}&today=${today()}${companyId ? `&companyId=${companyId}` : ''}`, `export.${fmt}`); } catch (e: any) { toast(e.message); } finally { setBusy(false); } };
  return (
    <div className="card pad"><h3>Export</h3><p className="muted">Download your data as Excel, CSV or PDF{companyId ? ' (for the company chosen in the sidebar)' : ' (all companies you can see)'}.</p>
      <div className="inline"><select value={pick} onChange={(e) => setPick(e.target.value)}>{EXPORTS.map(([, , l], i) => <option key={l} value={i}>{l}</option>)}</select>
        <select value={fmt} onChange={(e) => setFmt(e.target.value)}><option value="xlsx">Excel (.xlsx)</option><option value="csv">CSV</option><option value="pdf">PDF</option></select><button className="primary" disabled={busy} onClick={go}>{busy ? 'Preparing…' : '⬇ Download'}</button></div></div>
  );
}

const readB64 = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] ?? ''); r.onerror = () => rej(new Error('Could not read the file')); r.readAsDataURL(f); });

function BackupCard() {
  const [busy, setBusy] = useState(false); const [report, setReport] = useState<any>(null); const [mode, setMode] = useState<'REPLACE' | 'MERGE'>('MERGE'); const [typed, setTyped] = useState(''); const [done, setDone] = useState<any>(null); const [err, setErr] = useState('');
  const check = async (f: File | undefined) => {
    if (!f) return; setErr(''); setReport(null); setDone(null); setBusy(true);
    try { setReport(await api('/restore/validate', { method: 'POST', body: { dataBase64: await readB64(f) } })); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const apply = async () => {
    setBusy(true); setErr('');
    try { const r = await api<any>('/restore/apply', { method: 'POST', body: { token: report.token, mode, confirm: 'RESTORE' } }); setDone(r); setReport(null); setTyped(''); if (r.signedOut) setTimeout(() => location.reload(), 4000); }
    catch (e: any) { setErr(e.message + (e.body?.problems?.length ? '\n' + e.body.problems.slice(0, 5).join('\n') : '')); } finally { setBusy(false); }
  };
  const blocking = report && (mode === 'REPLACE' ? report.replaceErrors : report.mergeErrors);
  return (
    <div className="card pad"><h3>Backup &amp; restore</h3>
      <p className="muted">A backup is one ZIP with all your companies, projects, people, tasks, notes, calls &amp; mails, discussions, focus history, settings and attached files. It contains sign-in hashes — keep it private.</p>
      <div className="actions left"><button className="primary" disabled={busy} onClick={() => downloadFile('/backup', 'backup.zip').catch((e) => toast(e.message))}>⬇ Download full backup</button></div>
      <h4 style={{ marginTop: '0.875rem' }}>Restore from a backup</h4>
      <p className="muted">The current database is copied to a safety file first, the backup is checked, and you confirm before anything changes.</p>
      <input type="file" accept=".zip,application/zip" disabled={busy} onChange={(e) => check(e.target.files?.[0])} />
      {err && <pre className="error pre">{err}</pre>}
      {report && !report.ok && <div className="notice"><b>This backup can’t be restored:</b><ul>{report.errors.map((x: string) => <li key={x}>{x}</li>)}</ul></div>}
      {report?.ok && <div className="restore-box">
        <p><b>Backup is valid.</b> It holds {['companies', 'projects', 'people', 'tasks', 'subtasks', 'comments', 'calls', 'discussions', 'attachments'].map((k) => `${report.counts[k] ?? 0} ${k}`).join(', ')}; {report.files} file(s).</p>
        {report.warnings.map((w: string) => <small className="muted block" key={w}>{w}</small>)}
        <label className="radio"><input type="radio" checked={mode === 'MERGE'} onChange={() => setMode('MERGE')} /> <span><b>Merge</b> — add what’s missing ({Object.values(report.mergeNew as Record<string, number>).reduce((a, b) => a + b, 0)} new records). Nothing existing is changed or removed.</span></label>
        <label className="radio"><input type="radio" checked={mode === 'REPLACE'} onChange={() => setMode('REPLACE')} /> <span><b>Replace</b> — make this app exactly match the backup. Current data is kept in a safety copy, and everyone must sign in again.</span></label>
        {blocking?.length > 0 && <div className="notice"><b>{mode === 'REPLACE' ? 'Replace' : 'Merge'} is blocked:</b><ul>{blocking.slice(0, 6).map((x: string) => <li key={x}>{x}</li>)}</ul></div>}
        <label className="field"><span>Type RESTORE to confirm</span><input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="RESTORE" /></label>
        <button className="primary" disabled={busy || typed !== 'RESTORE' || !!blocking?.length} onClick={apply}>{busy ? 'Restoring…' : `${mode === 'REPLACE' ? 'Replace' : 'Merge'} now`}</button>
      </div>}
      {done && <div className="notice ok"><b>Restore complete.</b> {done.safetyCopy ? <>A safety copy of the previous data was saved to <code>{done.safetyCopy}</code>.</> : null} {done.signedOut ? 'Reloading — please sign in again…' : ''}</div>}
    </div>
  );
}

function ImportCard() {
  const [busy, setBusy] = useState(false); const [rep, setRep] = useState<any>(null); const [err, setErr] = useState(''); const [owner, setOwner] = useState('Rahul');
  const run = async (f: File | undefined) => {
    if (!f) return; setBusy(true); setErr(''); setRep(null);
    try { setRep(await api('/import/prototype', { method: 'POST', body: { data: JSON.parse(await f.text()), ownerName: owner } })); } catch (e: any) { setErr(e instanceof SyntaxError ? 'That file is not valid JSON.' : e.message); } finally { setBusy(false); }
  };
  return (
    <div className="card pad"><h3>Import from the old single-file version (before DOOD)</h3><p className="muted">If you used the earlier HTML prototype, use its backup (JSON) here. Existing records are never overwritten, and importing the same file twice does nothing new.</p>
      <label className="field" style={{ maxWidth: '20rem' }}><span>Your name in the old file</span><input value={owner} onChange={(e) => setOwner(e.target.value)} /></label>
      <input type="file" accept=".json,application/json" disabled={busy} onChange={(e) => run(e.target.files?.[0])} />
      {err && <p className="error">{err}</p>}
      {rep && <div className="notice ok"><b>Imported:</b> {Object.entries(rep.created).map(([k, v]) => `${v} ${k}`).join(', ')}.{rep.skippedTasks ? ` ${rep.skippedTasks} task(s) were already imported.` : ''}{rep.warnings.map((w: string) => <small className="block" key={w}>{w}</small>)}</div>}
    </div>
  );
}

function ThresholdCard() {
  const qc = useQueryClient(); const q = useQuery({ queryKey: ['settings'], queryFn: () => api<any>('/settings') }); const [msg, setMsg] = useState('');
  if (!q.data) return null;
  const s = q.data;
  return (
    <div className="card pad"><h3>Attention &amp; focus settings</h3><p className="muted">These control how “My Attention”, “At Risk” and escalations are worked out, and your Pomodoro defaults.</p>
      <FormInline initial={{ staleDays: s.staleDays, dueSoonDays: s.dueSoonDays, escalateDays: s.escalateDays, focusMinutes: s.focusMinutes, shortBreakMinutes: s.shortBreakMinutes, longBreakMinutes: s.longBreakMinutes, sessionsBeforeLong: s.sessionsBeforeLong }}
        fields={[['staleDays', 'Flag “no update” after (days)'], ['dueSoonDays', '“Due soon” window (days)'], ['escalateDays', 'Escalate overdue after (days)'], ['focusMinutes', 'Focus session (min)'], ['shortBreakMinutes', 'Short break (min)'], ['longBreakMinutes', 'Long break (min)'], ['sessionsBeforeLong', 'Sessions before long break']]}
        onSave={async (v) => { await api('/settings', { method: 'PATCH', body: v }); qc.invalidateQueries(); setMsg('Saved.'); }} />{msg && <p className="muted">{msg}</p>}</div>
  );
}
function FormInline({ initial, fields, onSave }: { initial: Record<string, number>; fields: [string, string][]; onSave: (v: any) => Promise<void> }) {
  const [v, setV] = useState(initial); const [err, setErr] = useState('');
  return (<form className="form" onSubmit={async (e) => { e.preventDefault(); setErr(''); try { await onSave(Object.fromEntries(Object.entries(v).map(([k, x]) => [k, Number(x)]))); } catch (x: any) { setErr(x.message); } }}>
    {fields.map(([k, label]) => <label className="field half" key={k}><span>{label}</span><input type="number" min={1} value={v[k]} onChange={(e) => setV({ ...v, [k]: Number(e.target.value) })} /></label>)}
    {err && <p className="error">{err}</p>}<div className="actions"><button className="primary">Save</button></div></form>);
}

function AppearanceCard() {
  const [a, setA] = useState(getAppearance());
  const set = (p: Partial<typeof a>) => { setAppearance(p); setA({ ...a, ...p }); };
  const Row = ({ label, k, opts }: { label: string; k: 'theme' | 'density' | 'text'; opts: [string, string][] }) => (
    <div className="field"><span>{label}</span><div className="seg" role="radiogroup" aria-label={label}>{opts.map(([v, l]) => <button key={v} role="radio" aria-checked={a[k] === v} className={a[k] === v ? 'on' : ''} onClick={() => set({ [k]: v } as any)}>{l}</button>)}</div></div>);
  return <div className="card pad"><h3>Appearance</h3><p className="muted">Auto follows your computer and switches by itself. Your choices are remembered on this computer.</p>
    <Row label="Theme" k="theme" opts={[['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']]} />
    <Row label="Density" k="density" opts={[['comfortable', 'Comfortable'], ['compact', 'Compact']]} />
    <Row label="Text size" k="text" opts={[['normal', 'Normal'], ['large', 'Large']]} /></div>;
}

function ColoursCard() {
  const { me } = useApp(); const qc = useQueryClient();
  const q = useQuery({ queryKey: ['companies-colours'], enabled: me.user.isAdmin, queryFn: () => api<any>('/companies').then((r) => (r.items ?? r) as any[]) });
  if (!me.user.isAdmin) return null;
  const set = async (c: any, color: string) => { try { await api(`/companies/${c.id}`, { method: 'PATCH', body: { expectedUpdatedAt: c.updatedAt, color } }); await q.refetch(); qc.invalidateQueries({ queryKey: ['me'] }); toast('Colour saved.'); } catch (e: any) { toast(e.message); } };
  return <div className="card pad"><h3>Company colours</h3><p className="muted">Each company's colour shows on its tab, task rows and notes. Reload the page after changing.</p>
    {q.data?.map((c: any) => <label key={c.id} className="field half" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 10 }}><input type="color" aria-label={`Colour for ${c.name}`} value={companyColor(c)} onChange={(e) => set(c, e.target.value)} style={{ width: 44, height: 32, padding: 0 }} /><span>{c.name}</span></label>)}</div>;
}

export function Settings() {
  const { me, arg } = useApp(); const qc = useQueryClient(); const [tab, setTab] = useState<'general' | 'ai'>(arg === 'ai' ? 'ai' : 'general');
  useEffect(() => { if (arg === 'ai') setTab('ai'); }, [arg]);
  const demo = useQuery({ queryKey: ['demo'], enabled: me.user.isAdmin, queryFn: () => api<{ exists: boolean; active: boolean }>('/admin/demo-data') });
  const [pw, setPw] = useState(false); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const act = async (what: 'load' | 'clear') => {
    if (what === 'clear' && !confirm('Archive all demo data? Nothing is deleted — you can load it again later.')) return;
    setBusy(true); try { await api(`/admin/demo-data/${what}`, { method: 'POST' }); await qc.invalidateQueries(); await qc.refetchQueries({ queryKey: ['demo'] }); setMsg(what === 'load' ? 'Demo data is ready — open Tasks.' : 'Demo data archived.'); } catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  };
  return (
    <section>
      <div className="page-head"><div><h2>Settings</h2></div></div>
      <div className="tabs" style={{ marginBottom: 12 }}><button className={tab === 'general' ? 'on' : ''} onClick={() => setTab('general')}>General</button><button className={tab === 'ai' ? 'on' : ''} onClick={() => setTab('ai')}>AI</button></div>
      {tab === 'ai' ? <AiSettings /> : <>
      <div className="card pad"><h3>Account</h3><p className="muted">{me.user.name} · {me.user.email}</p><button className="ghost" onClick={() => setPw(true)}>Change password</button></div>
      <AppearanceCard />
      <ColoursCard />
      <ThresholdCard />
      <ReminderCard />
      <PendingJobsCard />
      <ExportCard />
      {me.user.isAdmin && <BackupCard />}
      {me.user.isAdmin && <ImportCard />}
      {me.user.isAdmin && <div className="card pad"><h3>Demo data</h3>
        <p className="muted">Four companies, six projects, sample people and tasks so you can try every screen. Clearing archives it — nothing is permanently deleted.</p>
        <div className="actions left">
          {demo.data?.active ? <button className="ghost" disabled={busy} onClick={() => act('clear')}>Clear demo data</button> : <button className="primary" disabled={busy} onClick={() => act('load')}>{demo.data?.exists ? 'Restore demo data' : 'Load demo data'}</button>}
        </div>{msg && <p className="muted">{msg}</p>}</div>}
      <div className="card pad"><h3>Keyboard shortcuts</h3><div className="shortcuts">{[['N', 'New task'], ['/', 'Search'], ['T / H', 'Home'], ['L', 'Calls'], ['F', 'Follow-ups'], ['D', 'Discussions'], ['K', 'Kanban'], ['C', 'Calendar'], ['A', 'My Attention'], ['P', 'Focus on your top attention task']].map(([k, l]) => <div key={k}><kbd>{k}</kbd> {l}</div>)}</div></div>
      </>}
      {pw && <FormModal title="Change password" initial={{}} submitLabel="Change password" onClose={() => setPw(false)}
        fields={[{ key: 'currentPassword', label: 'Current password', type: 'password', required: true }, { key: 'newPassword', label: 'New password', type: 'password', required: true, hint: 'At least 10 characters. Other devices will be signed out.' }]}
        onSubmit={async (v) => { await api('/auth/change-password', { method: 'POST', body: v }); setPw(false); setMsg('Password changed.'); }} />}
    </section>
  );
}
void Modal;
