import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, downloadFile, fmtMinutes } from './api';
import { Badge, Modal, toast, useApp } from './ui';
import { ago } from './pages-team';

const ST: Record<string, [string, string]> = { ACTIVE: ['green', 'Using it'], SLOW: ['amber', 'Slowing'], INACTIVE: ['red', 'Not using'], NEVER: ['red', 'Never logged in'], DISABLED: ['grey', 'Disabled'] };

/** Owner-only: who is using DOOD and who is not (counts only, never private chat content). */
export function Adoption() {
  const { me } = useApp(); const [days, setDays] = useState(30);
  const q = useQuery({ queryKey: ['adoption', days], enabled: me.user.isAdmin, refetchInterval: 60_000, queryFn: () => api<any>(`/admin/adoption?days=${days}`) });
  const [logins, setLogins] = useState<any>(null);
  if (!me.user.isAdmin) return <p className="muted">Only the owner can see usage.</p>;
  const s = q.data?.summary;
  const nudge = async (u: any) => { const m = prompt(`Message to ${u.name} (optional)`, 'Please open DOOD and update your pending jobs.'); if (m === null) return; try { await api('/admin/adoption/nudge', { method: 'POST', body: { userId: u.userId, message: m } }); toast('Reminder sent.'); } catch (e: any) { toast(e.message); } };
  const history = async (u: any) => setLogins({ u, ...(await api(`/users/${u.userId}/logins`)) });
  const card = (n: any, l: string, tone = '') => <div className={'stat-card ' + tone}><b>{n ?? '—'}</b><small>{l}</small></div>;
  return (
    <section>
      <div className="page-head"><div><h2>Usage</h2><p className="muted">Is the team really using DOOD? Counts only — private chat messages are never shown.</p></div>
        <div className="actions wrap"><select value={days} onChange={(e) => setDays(Number(e.target.value))}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select>
          <button onClick={() => downloadFile(`/admin/adoption/export.xlsx?days=${days}`, 'dood-usage.xlsx')}>Export to Excel</button></div></div>
      {s && <div className="stat-row">{card(s.people, 'People')}{card(s.activeToday, 'Logged in today', 'green')}{card(s.active, 'Using it (last 2 days)', 'green')}{card(s.notUsing, 'Not using', s.notUsing ? 'red' : '')}{card(s.overdue, 'Overdue jobs', s.overdue ? 'red' : '')}{card(s.unopened, 'Assignments not opened', s.unopened ? 'amber' : '')}{card(s.completed, `Jobs completed (${days}d)`)}</div>}
      <div className="card table-wrap"><table>
        <thead><tr><th>Person</th><th>Status</th><th>Last login</th><th>Active days</th><th>Created</th><th>Completed</th><th>On time</th><th>Open</th><th>Overdue</th><th>Messages</th><th>Focus</th><th /></tr></thead>
        <tbody>{q.data?.items.map((u: any) => { const [tone, label] = ST[u.status] ?? ['grey', u.status]; return (
          <tr key={u.userId} className={u.active ? '' : 'archived'}>
            <td><b>{u.name}</b><br /><small className="muted">{u.loginId}{u.designation ? ' · ' + u.designation : ''}</small></td>
            <td><Badge tone={tone}>{label}</Badge>{u.unopenedAssignments > 0 && <small className="red-text"><br />{u.unopenedAssignments} unopened</small>}</td>
            <td>{u.lastLoginAt ? ago(u.lastLoginAt) : 'Never'}</td><td>{u.activeDays}/{days}</td><td>{u.tasksCreated}</td><td>{u.tasksCompleted}</td><td>{u.onTimePct === null ? '—' : u.onTimePct + '%'}</td>
            <td>{u.openNow}</td><td className={u.overdueNow ? 'red-text' : ''}>{u.overdueNow}</td><td>{u.messagesSent}</td><td>{fmtMinutes(u.focusMinutes)}</td>
            <td className="row-actions"><button className="ghost small" onClick={() => history(u)}>Logins</button>{u.active && !u.isAdmin && <button className="ghost small" onClick={() => nudge(u)}>Nudge</button>}</td>
          </tr>); })}</tbody></table></div>
      {logins && <Modal title={`Sign-in history: ${logins.u.name}`} onClose={() => setLogins(null)} wide>
        <div className="table-wrap"><table><thead><tr><th>When</th><th>What</th><th>Result</th></tr></thead><tbody>{logins.items.map((h: any) => <tr key={h.id}><td>{new Date(h.at).toLocaleString('en-IN')}</td><td>{h.kind.replace(/_/g, ' ').toLowerCase()}{h.actorName ? ` (by ${h.actorName})` : ''}</td><td>{h.ok ? 'OK' : 'Failed'}</td></tr>)}</tbody></table></div>
      </Modal>}
    </section>
  );
}
