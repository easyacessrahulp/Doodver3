import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, goto, PRIORITY_DOT, STATUS_LABEL, today } from './api';
import { Modal, toast, useApp } from './ui';
import { Avatar } from './pages-team';

const STATUSES = ['BACKLOG', 'TODO', 'DOING', 'WAITING', 'DELEGATED', 'DONE'];

/** Trello-style board: drag a card to another column to change its stage. */
export function Board() {
  const { me } = useApp(); const qc = useQueryClient();
  const comps = me.memberships;
  const [companyId, setCompanyId] = useState(() => localStorage.getItem('cc.boardCompany') || comps[0]?.companyId || '');
  const [projectId, setProjectId] = useState('none'); const [mine, setMine] = useState(me.memberships.length > 0 && !me.user.isAdmin && me.memberships.every((m) => m.role === 'MEMBER') ? false : false);
  const [drag, setDrag] = useState<{ id: string; from: string } | null>(null); const [over, setOver] = useState<string | null>(null); const [adding, setAdding] = useState(false); const [name, setName] = useState('');
  const projects = useQuery({ enabled: !!companyId, queryKey: ['board-projects', companyId], queryFn: () => api<{ items: any[] }>(`/projects?companyId=${companyId}&limit=200`).then((r) => r.items.filter((p) => !['COMPLETED', 'CANCELLED'].includes(p.status))) });
  const key = ['board', companyId, projectId, mine];
  const q = useQuery({ enabled: !!companyId, queryKey: key, refetchInterval: 20_000, retry: false, queryFn: () => api<any>(`/boards?companyId=${companyId}${projectId !== 'none' ? `&projectId=${projectId}` : ''}${mine ? '&mine=true' : ''}`) });
  const readOnly = !!me.viewAs?.readOnly || comps.find((m) => m.companyId === companyId)?.role === 'VIEWER';
  const refresh = () => { qc.invalidateQueries({ queryKey: ['board'] }); qc.invalidateQueries({ queryKey: ['tasks'] }); };

  const move = async (listId: string, beforeId: string | null) => {
    if (!drag || readOnly) return; const id = drag.id; setDrag(null); setOver(null);
    const list = q.data.lists.find((l: any) => l.id === listId);
    try {
      await api('/boards/move', { method: 'POST', body: { taskId: id, listId, beforeTaskId: beforeId } });
      if (list?.mapsToStatus) {
        const card = q.data.lists.flatMap((l: any) => l.cards).find((c: any) => c.id === id);
        if (card && card.status !== list.mapsToStatus) {
          const t = await api<any>(`/tasks/${id}`);
          await api(`/tasks/${id}`, { method: 'PATCH', body: { expectedUpdatedAt: t.updatedAt, status: list.mapsToStatus } });
        }
      }
    } catch (e: any) { toast(e.message); }
    refresh();
  };
  const addList = async () => { if (!name.trim()) return; try { await api('/boards/lists', { method: 'POST', body: { companyId, projectId: projectId === 'none' ? null : projectId, name: name.trim() } }); setName(''); setAdding(false); refresh(); } catch (e: any) { toast(e.message); } };
  const rename = async (l: any) => { const n = prompt('New name for this list', l.name); if (!n?.trim()) return; try { await api(`/boards/lists/${l.id}`, { method: 'PATCH', body: { expectedUpdatedAt: l.updatedAt, name: n.trim() } }); refresh(); } catch (e: any) { toast(e.message); } };
  const remove = async (l: any) => { if (!confirm(`Remove the list “${l.name}”? Its cards move to the list matching their stage.`)) return; try { await api(`/boards/lists/${l.id}/archive`, { method: 'POST' }); refresh(); } catch (e: any) { toast(e.message); } };

  if (!comps.length && !me.user.isAdmin) return <p className="muted">You are not in a company yet.</p>;
  const cos = comps;
  return (
    <section className="board-page">
      <div className="page-head"><div><h2>Board</h2><p className="muted">Drag a card to another column to move the job forward. Open a card to see its details.</p></div></div>
      <div className="filters">
        <select value={companyId} onChange={(e) => { setCompanyId(e.target.value); localStorage.setItem('cc.boardCompany', e.target.value); setProjectId('none'); }}>{cos.map((m) => <option key={m.companyId} value={m.companyId}>{m.companyName}</option>)}</select>
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)}><option value="none">Jobs without a project</option>{projects.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <label className="check-line"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Only mine</label>
      </div>
      {q.isError && <p className="error">This board is not available to you.</p>}
      <div className="board">{q.data?.lists.map((l: any) => (
        <div key={l.id} className={'bcol' + (over === l.id ? ' over' : '')} onDragOver={(e) => { if (drag) { e.preventDefault(); setOver(l.id); } }} onDragLeave={() => setOver((o) => (o === l.id ? null : o))} onDrop={(e) => { e.preventDefault(); move(l.id, null); }}>
          <header><b>{l.name}</b><small className="muted">{l.cards.length}</small>
            {!readOnly && <span className="col-tools"><button className="icon" title="Rename" onClick={() => rename(l)}>✎</button><button className="icon" title="Remove list" onClick={() => remove(l)}>✕</button></span>}</header>
          <div className="bcards">{l.cards.map((c: any) => {
            const overdue = c.dueDate && c.status !== 'DONE' && c.dueDate < today();
            return (
              <div key={c.id} className={'bcard' + (drag?.id === c.id ? ' dragging' : '')} draggable={!readOnly} onDragStart={() => setDrag({ id: c.id, from: l.id })} onDragEnd={() => { setDrag(null); setOver(null); }}
                onDragOver={(e) => { if (drag && drag.id !== c.id) { e.preventDefault(); e.stopPropagation(); } }} onDrop={(e) => { e.preventDefault(); e.stopPropagation(); move(l.id, c.id); }} onClick={() => goto('tasks', c.id)}>
                <div className="bt"><span>{PRIORITY_DOT[c.priority]}</span> {c.title}</div>
                <div className="bmeta">
                  {c.dueDate && <span className={'due' + (overdue ? ' late' : '')}>{new Date(c.dueDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>}
                  {c.subtaskCount > 0 && <span title="Checklist">☑ {c.subtaskDone}/{c.subtaskCount}</span>}
                  {c.pendingCalls > 0 && <span title="Calls pending">{c.pendingCalls}</span>}
                  {c.commentCount > 0 && <span>{c.commentCount}</span>}
                  {c.fileCount > 0 && <span>{c.fileCount}</span>}
                  <span className="bwho">{c.delegatedToName ? <><small>→</small><Avatar name={c.delegatedToName} size={22} /></> : <Avatar name={c.ownerName} size={22} />}</span>
                </div>
                {c.status !== l.mapsToStatus && l.mapsToStatus === null && <small className="muted">{STATUS_LABEL[c.status]}</small>}
              </div>);
          })}</div>
        </div>))}
        {q.data && !readOnly && <div className="bcol add">{adding ? <div className="pad"><input autoFocus placeholder="List name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addList()} /><div className="actions"><button className="primary small" onClick={addList}>Add</button><button className="ghost small" onClick={() => setAdding(false)}>Cancel</button></div></div> : <button className="ghost" onClick={() => setAdding(true)}>＋ Add another list</button>}</div>}
      </div>
    </section>
  );
}
void Modal; void STATUSES;
