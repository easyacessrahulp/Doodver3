import { useState } from 'react';
import { Review } from './pages-review';
import { Performance } from './pages-insights';
import { ExportCard } from './pages-admin';
import { PendingJobsCard } from './pages-v5';

export function Reports() {
  const [tab, setTab] = useState<'reviews' | 'performance' | 'export'>('reviews');
  return (
    <section>
      <div className="page-head"><div><h2>Reports</h2><p className="muted">Reviews, delegate performance and downloads.</p></div></div>
      <div className="tabs"><button className={tab === 'reviews' ? 'on' : ''} onClick={() => setTab('reviews')}>Reviews</button><button className={tab === 'performance' ? 'on' : ''} onClick={() => setTab('performance')}>Performance</button><button className={tab === 'export' ? 'on' : ''} onClick={() => setTab('export')}>Export</button></div>
      <div style={{ marginTop: '0.75rem' }}>{tab === 'reviews' ? <Review embedded /> : tab === 'performance' ? <Performance embedded /> : <><PendingJobsCard /><ExportCard /></>}</div>
    </section>
  );
}
