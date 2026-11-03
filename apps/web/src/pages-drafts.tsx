import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, fmtTime, goto } from './api';
import { Empty, toast, useApp, type Draft } from './ui';

const KIND = { task: { label: 'Task', icon: '✓', page: 'tasks' }, project: { label: 'Project', icon: '▤', page: 'projects' }, person: { label: 'Person', icon: '☺', page: 'people' },
  company: { label: 'Company', icon: '▣', page: 'companies' }, call: { label: 'Call / mail', icon: '', page: 'calls' }, discussion: { label: 'Discussion', icon: '', page: 'discussions' }, followup: { label: 'Follow-up', icon: '', page: 'followups' } } as const;

export const useDrafts = () => useQuery({ queryKey: ['drafts'], queryFn: () => api<{ items: Draft[] }>('/drafts').then((r) => r.items) });

export function Drafts() {
  const { setResume } = useApp(); const qc = useQueryClient(); const q = useDrafts();
  const open = (d: Draft) => { setResume(d); goto(KIND[d.kind as keyof typeof KIND].page); };
  const discard = async (d: Draft) => { if (!confirm('Discard this draft?')) return; await api(`/drafts/${d.id}`, { method: 'DELETE' }); qc.invalidateQueries({ queryKey: ['drafts'] }); toast('Draft discarded.'); };
  return (
    <section>
      <div className="page-head"><div><h2>Drafts</h2><p className="muted">Anything you started but didn’t finish is kept here automatically. Pick it up whenever you like.</p></div></div>
      <div className="card">
        {q.data?.map((d) => { const k = KIND[d.kind as keyof typeof KIND]; return (
          <div className="draft-row" key={d.id}>
            <span className="draft-icon">{k.icon}</span>
            <div className="draft-main"><b>{d.title || `Untitled ${k.label.toLowerCase()}`}</b><small className="muted">{k.label} · last edited {fmtTime(d.updatedAt)}</small></div>
            <div className="row-actions"><button className="primary small" onClick={() => open(d)}>Continue</button><button className="ghost small" onClick={() => discard(d)}>Discard</button></div>
          </div>); })}
        {q.data && !q.data.length && <Empty>No drafts. When you close a form before saving it, it will appear here.</Empty>}
      </div>
    </section>
  );
}
