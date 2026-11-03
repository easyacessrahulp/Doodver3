// Phone layout: slim header, bottom tab bar, "all features" sheet, company switcher sheet.
import { useEffect, useState } from 'react';
import { Ic, CoDot, companyColor } from './icons';
import { openPalette, openFocusPicker } from './bus';
import type { Me } from './ui';

export const openSheet = (s: 'more' | 'company') => dispatchEvent(new CustomEvent('cc-sheet', { detail: s }));
export const toggleFab = () => dispatchEvent(new Event('cc-fab-toggle'));

type Group = { title: string; items: [string, string, string][] };
const MAIN: Group = { title: 'Daily', items: [['home', 'Today', 'home'], ['tasks', 'All tasks', 'list'], ['kanban', 'Kanban', 'columns'], ['calendar', 'Calendar', 'calendar'], ['calls', 'Calls', 'phone'], ['chat', 'Messages', 'message'], ['meetings', 'Meetings', 'video'], ['notes', 'Notes', 'book'], ['activity', 'Activity', 'users'], ['reports', 'Reports', 'chart'], ['ask', 'Ask Dood', 'sparkles']] };

export function MobileCompany({ me, valid, page }: { me: Me; valid: string; page: string }) {
  const name = page === 'workload' ? 'People' : valid ? me.memberships.find((m) => m.companyId === valid)?.companyName ?? 'Company' : 'All companies';
  const m = me.memberships.find((x) => x.companyId === valid);
  return <button className="m-co" onClick={() => openSheet('company')} aria-label="Choose company">{valid && page !== 'workload' ? <CoDot color={companyColor(m!)} /> : <Ic n={page === 'workload' ? 'users' : 'building'} s={15} />}<span>{name}</span><Ic n="down" s={14} /></button>;
}

export function MobileNav({ me, page, valid, setCompanyId, go, badges, more, canAdd, onSignOut }: {
  me: Me; page: string; valid: string; setCompanyId: (id: string) => void; go: (p: string) => void; badges: Record<string, number>; more: Group[]; canAdd: boolean; onSignOut: () => void;
}) {
  const [sheet, setSheet] = useState<null | 'more' | 'company'>(null);
  useEffect(() => { const h = (e: Event) => setSheet((e as CustomEvent).detail); const c = () => setSheet(null); addEventListener('cc-sheet', h); addEventListener('hashchange', c); return () => { removeEventListener('cc-sheet', h); removeEventListener('hashchange', c); }; }, []);
  useEffect(() => { if (!sheet) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setSheet(null); }; addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [sheet]);
  const nav = (id: string) => { setSheet(null); go(id); };
  const on = (...ids: string[]) => ids.includes(page);
  const moreTotal = (badges.followups ?? 0) + (badges.discussions ?? 0) + (badges.drafts ?? 0) + (badges.announcements ?? 0) + (badges.approvals ?? 0) + (badges.chat ?? 0);
  const groups: Group[] = [MAIN, ...more.map((g) => ({ title: g.title, items: g.items.filter(([id]) => (id !== 'users' && id !== 'adoption') || me.user.isAdmin) }))];
  const seen = new Set<string>(); const uniq = groups.map((g) => ({ ...g, items: g.items.filter(([id]) => !seen.has(id) && !!seen.add(id)) }));
  return (
    <>
      <nav className="m-bar" aria-label="Main">
        <button className={on('home') ? 'on' : ''} onClick={() => nav('home')}><Ic n="home" s={22} /><span>Today</span></button>
        <button className={on('tasks', 'kanban', 'attention') ? 'on' : ''} onClick={() => nav('tasks')}><Ic n="list" s={22} /><span>Tasks</span></button>
        {canAdd ? <button className="m-plus" onClick={toggleFab} aria-label="Add task, subtask or project"><span className="m-plus-b"><Ic n="plus" s={26} /></span><span>Add</span></button> : <button onClick={() => nav('calendar')}><Ic n="calendar" s={22} /><span>Calendar</span></button>}
        <button className={on('activity') ? 'on' : ''} onClick={() => nav('activity')}><Ic n="users" s={22} /><span>Activity</span></button>
        <button className={sheet === 'more' ? 'on' : ''} onClick={() => setSheet(sheet === 'more' ? null : 'more')}><Ic n="grid" s={22} /><span>More</span>{moreTotal > 0 && <em className="nb red">{moreTotal}</em>}</button>
      </nav>
      {sheet && <div className="m-scrim" onClick={() => setSheet(null)} />}
      {sheet === 'more' && <section className="m-sheet full" role="dialog" aria-label="All features">
        <header><b>All features</b><button className="icon" aria-label="Close" onClick={() => setSheet(null)}>✕</button></header>
        <button className="m-find" onClick={() => { setSheet(null); openPalette(); }}><Ic n="search" s={16} />Search tasks, people or any page…</button>
        <div className="m-quick"><button onClick={() => { setSheet(null); openFocusPicker(); }}><Ic n="clock" s={18} />Focus timer</button><button onClick={() => nav('settings')}><Ic n="settings" s={18} />Settings</button><button onClick={() => nav('attention')}><Ic n="flag" s={18} />My Attention</button></div>
        {uniq.filter((g) => g.items.length).map((g) => <div key={g.title}><h5>{g.title}</h5><div className="m-grid">{g.items.map(([id, label, ic]) => <button key={id} className={on(id) || (id === 'chat' && on('messages')) ? 'on' : ''} onClick={() => nav(id)}><Ic n={ic} s={22} /><span>{label}</span>{!!badges[id] && <em className="nb red">{badges[id]}</em>}</button>)}</div></div>)}
        <button className="m-out" onClick={onSignOut}><Ic n="undo" s={16} />Sign out ({me.user.name.split(' ')[0]})</button>
      </section>}
      {sheet === 'company' && <section className="m-sheet" role="dialog" aria-label="Choose company">
        <header><b>Choose company</b><button className="icon" aria-label="Close" onClick={() => setSheet(null)}>✕</button></header>
        <button className={'m-co-row' + (!valid && page !== 'workload' ? ' on' : '')} onClick={() => { setCompanyId(''); if (page === 'workload') go('home'); setSheet(null); }}><Ic n="building" s={18} />All companies</button>
        {me.memberships.map((mm) => <button key={mm.companyId} className={'m-co-row' + (valid === mm.companyId && page !== 'workload' ? ' on' : '')} onClick={() => { setCompanyId(mm.companyId); if (page === 'workload') go('home'); setSheet(null); }}><CoDot color={companyColor(mm)} />{mm.companyName}</button>)}
        <button className={'m-co-row' + (page === 'workload' ? ' on' : '')} onClick={() => nav('workload')}><Ic n="users" s={18} />People (everyone’s work)</button>
      </section>}
    </>
  );
}
