import { useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, goto, PRIORITY, PRIORITY_DOT, PROJECT_STATUS, fmtDate } from './api';
import { useList } from './hooks';
import { Badge, Empty, FormModal, useApp, useConflict, type Draft, type DraftSpec, type Field, type Role } from './ui';
import { ProjectDrawer } from './pages-ai';

interface Col { label: string; render: (r: any) => ReactNode }
function MasterPage(p: {
  title: string; qkey: string; path: string; columns: Col[]; fields: (row: any | null) => Field[]; initialNew: any;
  draftKind: DraftSpec['kind']; draftTitle: (v: any) => string; canCreate: boolean; needsCompany?: string; canEdit: (r: any) => boolean; extraParams?: Record<string, unknown>; singular: string; blurb?: string;
}) {
  const qc = useQueryClient(); const { resume, setResume } = useApp();
  const [draftRes, setDraftRes] = useState<Draft | null>(resume?.kind === p.draftKind ? resume : null);
  const [q, setQ] = useState(''); const [archived, setArchived] = useState(false);
  const [editing, setEditing] = useState<any | 'new' | null>(resume?.kind === p.draftKind ? 'new' : null);
  useEffect(() => { if (resume?.kind === p.draftKind) setResume(null); }, []);
  const list = useList(p.qkey, p.path, { q, archived: archived ? 'true' : undefined, ...p.extraParams });
  const refresh = () => { qc.invalidateQueries(); qc.invalidateQueries({ predicate: (x) => String(x.queryKey[0]).endsWith('-of') || x.queryKey[0] === 'companies-all' }); };
  const { guarded, node } = useConflict(refresh);

  const save = async (values: any) => {
    if (editing === 'new') { await api(p.path, { method: 'POST', body: values }); refresh(); setEditing(null); return; }
    const row = editing; const { companyId, ...rest } = values; // company of an existing record is fixed
    const body = (u?: string) => ({ expectedUpdatedAt: u ?? row.updatedAt, ...rest });
    await guarded((u) => api(`${p.path}/${row.id}`, { method: 'PATCH', body: body(u) }).then(() => undefined));
    setEditing(null);
  };
  const toggleArchive = async (r: any) => {
    if (!r.archivedAt && !confirm(`Archive this ${p.singular}? It stays in the database and can be restored.`)) return;
    await api(`${p.path}/${r.id}/${r.archivedAt ? 'restore' : 'archive'}`, { method: 'POST' }).catch((e) => alert(e.message)); refresh();
  };

  return (
    <section>
      <div className="page-head"><div><h2>{p.title}</h2>{p.blurb && <p className="muted">{p.blurb}</p>}</div>
        {p.canCreate && !archived && <button className="primary" onClick={() => setEditing('new')}>+ New {p.singular}</button>}</div>
      {!p.canCreate && p.needsCompany && <p className="notice">{p.needsCompany}</p>}
      <div className="toolbar">
        <input className="search" placeholder={`Search ${p.title.toLowerCase()}…`} value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="toggle"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Show archived</label>
      </div>
      <div className="card table-wrap">
        <table>
          <thead><tr>{p.columns.map((c) => <th key={c.label}>{c.label}</th>)}<th /></tr></thead>
          <tbody>
            {list.items.map((r) => (
              <tr key={r.id} className={r.archivedAt ? 'archived' : ''}>
                {p.columns.map((c) => <td key={c.label}>{c.render(r)}</td>)}
                <td className="row-actions">
                  {p.canEdit(r) && !r.archivedAt && <button className="ghost small" onClick={() => setEditing(r)}>Edit</button>}
                  {p.canEdit(r) && <button className="ghost small" onClick={() => toggleArchive(r)}>{r.archivedAt ? 'Restore' : 'Archive'}</button>}
                </td>
              </tr>))}
          </tbody>
        </table>
        {!list.isLoading && !list.items.length && <Empty>{archived ? 'Nothing archived.' : `No ${p.title.toLowerCase()} yet.`}</Empty>}
        {list.hasNextPage && <button className="ghost more" onClick={() => list.fetchNextPage()}>Load more</button>}
      </div>
      {editing && <FormModal title={editing === 'new' ? `New ${p.singular}` : `Edit ${p.singular}`} fields={p.fields(editing === 'new' ? null : editing)}
        initial={editing === 'new' ? (draftRes?.data ?? p.initialNew) : editing} onSubmit={save} onClose={() => { setEditing(null); setDraftRes(null); }}
        draft={editing === 'new' ? { kind: p.draftKind, title: p.draftTitle } : undefined} draftId={editing === 'new' ? draftRes?.id : undefined} />}
      {node}
    </section>
  );
}

const roleOk = (r0: Role | null, min: Role) => { const o = ['VIEWER', 'USER', 'MANAGER', 'ADMIN']; const r = r0 === 'MEMBER' ? 'USER' : r0; return !!r && o.indexOf(r) >= o.indexOf(min); };

export function Companies() {
  const { me } = useApp(); const admin = me.user.isAdmin;
  return <MasterPage title="Companies" singular="company" draftKind="company" draftTitle={(v) => v.name} qkey="companies" path="/companies" blurb="Everything in the app belongs to a company."
    canCreate={admin} canEdit={() => admin} initialNew={{ active: true }}
    columns={[{ label: 'Name', render: (r) => <b>{r.name}</b> }, { label: 'Code', render: (r) => <code>{r.code}</code> }, { label: 'Short name', render: (r) => r.shortName ?? '—' },
      { label: 'Status', render: (r) => (r.archivedAt ? <Badge tone="grey">Archived</Badge> : r.active ? <Badge tone="green">Active</Badge> : <Badge tone="grey">Inactive</Badge>) }, { label: 'Demo', render: (r) => (r.isDemo ? <Badge tone="blue">Demo</Badge> : '') }]}
    fields={() => [
      { key: 'name', label: 'Company name', type: 'text', required: true }, { key: 'code', label: 'Code', type: 'text', required: true, half: true, hint: '2–12 letters or digits, unique' },
      { key: 'shortName', label: 'Short name', type: 'text', half: true }, { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'contact', label: 'Contact', type: 'text' }, { key: 'notes', label: 'Notes', type: 'textarea' }, { key: 'active', label: 'Active', type: 'checkbox' }]} />;
}

export function Projects() {
  const { arg } = useApp();
  return <><ProjectsList />{arg && <ProjectDrawer key={arg} id={arg} onClose={() => goto('projects')} />}</>;
}

function ProjectsList() {
  const { me, companyId } = useApp();
  const writable = me.user.isAdmin ? me.memberships : me.memberships.filter((m) => roleOk(m.role, 'MANAGER'));
  const opts = (me.user.isAdmin ? me.memberships : writable).map((m) => ({ value: m.companyId, label: m.companyName }));
  return <MasterPage title="Projects" singular="project" draftKind="project" draftTitle={(v) => v.name} qkey="projects" path="/projects" blurb="Company → Project → Task → Subtask."
    extraParams={{ companyId }} canCreate={writable.length > 0}
    needsCompany={me.memberships.length === 0 ? 'Create a company first (Companies → + New company), then you can add projects here.' : undefined}
    canEdit={(r) => me.user.isAdmin || roleOk(me.memberships.find((m) => m.companyId === r.companyId)?.role ?? null, 'MANAGER')}
    initialNew={{ companyId: companyId || writable[0]?.companyId, priority: 3, status: 'ACTIVE' }}
    columns={[{ label: 'Project', render: (r) => <button className="linklike" onClick={() => goto('projects', r.id)}><b>{r.name}</b></button> }, { label: 'Company', render: (r) => r.companyName },
      { label: 'Priority', render: (r) => `${PRIORITY_DOT[r.priority]} ${PRIORITY[r.priority]}` }, { label: 'Status', render: (r) => <Badge tone={r.status === 'ACTIVE' ? 'green' : r.status === 'ON_HOLD' ? 'amber' : 'grey'}>{PROJECT_STATUS[r.status]}</Badge> },
      { label: 'Target', render: (r) => fmtDate(r.targetDate) }]}
    fields={(row) => [
      ...(row ? [] : [{ key: 'companyId', label: 'Company', type: 'select' as const, required: true, options: opts }]),
      { key: 'name', label: 'Project name', type: 'text', required: true }, { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'priority', label: 'Priority', type: 'select', required: true, half: true, options: [1, 2, 3, 4].map((n) => ({ value: n, label: `${PRIORITY_DOT[n]} ${PRIORITY[n]}` })) },
      { key: 'status', label: 'Status', type: 'select', required: true, half: true, options: Object.entries(PROJECT_STATUS).map(([value, label]) => ({ value, label })) },
      { key: 'startDate', label: 'Start date', type: 'date', half: true }, { key: 'targetDate', label: 'Target date', type: 'date', half: true }]} />;
}

export function People() {
  const { me, companyId } = useApp(); const admin = me.user.isAdmin;
  const writable = admin ? me.memberships : me.memberships.filter((m) => roleOk(m.role, 'MANAGER'));
  const opts = [...(admin ? [{ value: '', label: 'Shared (all companies)' }] : []), ...writable.map((m) => ({ value: m.companyId, label: m.companyName }))];
  return <MasterPage title="People" singular="person" draftKind="person" draftTitle={(v) => v.name} qkey="people" path="/people" blurb="People you delegate to or wait on. They don't need a login."
    extraParams={{ companyId }} canCreate={opts.length > 0}
    canEdit={(r) => (r.companyId ? admin || roleOk(me.memberships.find((m) => m.companyId === r.companyId)?.role ?? null, 'MANAGER') : admin)}
    initialNew={{ companyId: companyId || writable[0]?.companyId || '', active: true }}
    columns={[{ label: 'Name', render: (r) => <b>{r.name}</b> }, { label: 'Designation', render: (r) => r.designation ?? '—' }, { label: 'Company', render: (r) => r.companyName ?? 'Shared' },
      { label: 'Department', render: (r) => r.department ?? '—' }, { label: 'Contact', render: (r) => [r.email, r.phone].filter(Boolean).join(' · ') || '—' }]}
    fields={(row) => [
      ...(row ? [] : [{ key: 'companyId', label: 'Company', type: 'select' as const, options: opts, required: !admin }]),
      { key: 'name', label: 'Name', type: 'text', required: true }, { key: 'designation', label: 'Designation', type: 'text', half: true }, { key: 'department', label: 'Department', type: 'text', half: true },
      { key: 'email', label: 'Email', type: 'email', half: true }, { key: 'phone', label: 'Phone', type: 'text', half: true },
      { key: 'notes', label: 'Notes', type: 'textarea' }, { key: 'active', label: 'Active', type: 'checkbox' }]} />;
}
