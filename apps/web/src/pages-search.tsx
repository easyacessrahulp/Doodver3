import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, fmtDate, goto } from './api';
import { Empty, useApp } from './ui';

const LABEL: Record<string, string> = { task: 'Tasks', subtask: 'Subtasks', note: 'Notes', communication: 'Calls & mails', discussion: 'Discussions', file: 'Files', project: 'Projects', person: 'People', company: 'Companies', history: 'History' };
const ICON: Record<string, string> = { task: '✓', subtask: '↳', note: '', communication: '', discussion: '', file: '', project: '▤', person: '', company: '▣', history: '' };

export function Search() {
  const { companyId } = useApp(); const [q, setQ] = useState(sessionStorage.getItem('cc.q') ?? ''); const [deb, setDeb] = useState(q); const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); const h = () => setQ(sessionStorage.getItem('cc.q') ?? ''); addEventListener('cc-search', h); return () => removeEventListener('cc-search', h); }, []);
  useEffect(() => { const t = setTimeout(() => { setDeb(q.trim()); sessionStorage.setItem('cc.q', q); }, 300); return () => clearTimeout(t); }, [q]);
  const r = useQuery({ queryKey: ['search', deb, companyId], enabled: deb.length >= 2, queryFn: () => api<any>(`/search?q=${encodeURIComponent(deb)}${companyId ? `&companyId=${companyId}` : ''}`) });
  const open = (x: any) => x.taskId ? goto('tasks', x.taskId) : x.page === 'performance' ? goto('performance') : goto(x.page ?? 'tasks');
  const groups = r.data ? Object.keys(LABEL).filter((k) => r.data.counts[k]) : [];
  return (
    <section>
      <div className="page-head"><div><h2>Search</h2><p className="muted">Across tasks, subtasks, notes, calls & mails, discussions, files, people and history. Press <kbd>/</kbd> from anywhere.</p></div></div>
      <input ref={ref} className="bigsearch" placeholder="Search everything…" value={q} onChange={(e) => setQ(e.target.value)} />
      {deb.length >= 2 && r.data && !groups.length && <div className="card"><Empty>Nothing found for “{deb}”.</Empty></div>}
      {groups.map((g) => (
        <div className="card pad" key={g} style={{ marginTop: '0.875rem' }}>
          <h3>{ICON[g]} {LABEL[g]} <span className="muted">· {r.data.counts[g]}</span></h3>
          <ul className="msgs">{r.data.results.filter((x: any) => x.type === g).map((x: any) => (
            <li className="msg" key={x.type + x.id} onClick={() => open(x)}><div className="msg-main"><b>{x.title}</b>{x.snippet && <small className="muted">{x.snippet}</small>}<small className="muted">{[x.company, x.date && fmtDate(x.date)].filter(Boolean).join(' · ')}</small></div></li>))}</ul>
        </div>))}
    </section>
  );
}
