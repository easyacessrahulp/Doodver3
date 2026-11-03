import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, goto } from './api';
import { Ctx, roleIn, ToastHost, type Draft, type Me, type Role } from './ui';
import { FocusProvider, desktopNotify, useFocus } from './timer';
import { useMessages } from './hooks';
import { Calls } from './pages-calls';
import { Calendar, Messages, Performance } from './pages-insights';
import { Drafts, useDrafts } from './pages-drafts';
import { AttentionPage } from './pages-home';
import { Today } from './pages-today';
import { registerCompanies, Ic, CoDot, companyColor, type IconName } from './icons';
import { AskDood } from './pages-ask';
import { AiHosts } from './pages-aiflow';
import { openFocusPicker, openPalette, openQuickAdd } from './bus';
import { Followups } from './pages-followups';
import { Kanban } from './pages-kanban';
import { FocusPage } from './pages-focus';
import { Reports } from './pages-reports';
import { EmailsPage } from './pages-ai';
import { Discussions } from './pages-discussions';
import { Search } from './pages-search';
import { Review } from './pages-review';
import { Companies, People, Projects } from './pages-masters';
import { Tasks } from './pages-tasks';
import { Settings, Users } from './pages-admin';
import { Explorer, NotesPage, Reminders } from './pages-v5';
import { Notebook } from './pages-notebook';
import { Bell, Celebrate, ForceChange, ViewAsBanner, useLive } from './pages-team';
import { Chat, Meetings } from './pages-chat';
import { Announcements, Feed } from './pages-community';
import { Board } from './pages-board';
import { Adoption } from './pages-adoption';
import { Workload } from './pages-workload';
import { ActivityPage, ApprovalsPage, ChasePage, DigestPage, TemplatesPage, VaultPage, WeeklyPage } from './pages-v8';
import { Fab } from './pages-fab';
import { MobileCompany, MobileNav } from './pages-mobile';

function AuthScreen({ needsSetup, onDone }: { needsSetup: boolean; onDone: () => void }) {
  const [f, setF] = useState({ name: '', email: '', password: '' }); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { await api(needsSetup ? '/auth/register' : '/auth/login', { method: 'POST', body: needsSetup ? f : { loginId: f.email.trim(), password: f.password } }); onDone(); }
    catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <div className="auth"><form className="card auth-card" onSubmit={submit}>
      <div className="logo">DOOD</div><h1>Welcome to DOOD</h1>
      <p className="muted">{needsSetup ? 'Create the first account — it becomes the Admin.' : 'Sign in to continue.'}</p>
      {needsSetup && <label className="field"><span>Your name</span><input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></label>}
      <label className="field"><span>{needsSetup ? 'Email' : 'User ID (or email)'}</span><input type={needsSetup ? 'email' : 'text'} required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoFocus={!needsSetup} autoComplete="username" /></label>
      <label className="field"><span>Password</span><input type="password" required minLength={needsSetup ? 10 : 1} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete={needsSetup ? 'new-password' : 'current-password'} />
        {needsSetup && <small>At least 10 characters.</small>}</label>
      {err && <p className="error">{err}</p>}
      <button className="primary wide-btn" disabled={busy}>{busy ? 'Please wait…' : needsSetup ? 'Create Admin account' : 'Sign in'}</button>
    </form></div>
  );
}

const PAGES: Record<string, () => React.ReactElement> = { emails: EmailsPage, home: Today, calls: Calls, followups: Followups, discussions: Discussions, tasks: Tasks, companies: Companies, projects: Projects, people: People, explore: Explorer, notes: Notebook, tasknotes: NotesPage, kanban: Kanban,
  calendar: Calendar, attention: AttentionPage, focus: FocusPage, reports: Reports, settings: Settings, users: Users, chat: Chat, meetings: Meetings, announcements: Announcements, feed: Feed, board: Board, workload: Workload, adoption: Adoption, drafts: Drafts, search: Search,
  ask: AskDood, messages: Messages, performance: Performance, review: Review,
  activity: ActivityPage, chase: ChasePage, templates: TemplatesPage, vault: VaultPage, approvals: ApprovalsPage, weekly: WeeklyPage, digest: DigestPage };   // the last three are kept so old links still open
const parseHash = () => { const [p, a] = location.hash.slice(1).split('/'); return { page: p || 'home', arg: a || undefined }; };

// Everything that used to be in the left sidebar lives in the "More" menu now — nothing was removed.
const MORE: { title: string; items: [string, string, IconName][] }[] = [
  { title: 'Work', items: [['attention', 'My Attention', 'flag'], ['tasks', 'All tasks', 'list'], ['followups', 'Follow-ups', 'message'], ['discussions', 'Discussions', 'users'], ['emails', 'Emails', 'mail'], ['drafts', 'Drafts', 'pencil'], ['tasknotes', 'Task notes', 'file'], ['focus', 'Focus sessions', 'clock'], ['chase', 'People to chase', 'message'], ['approvals', 'Approvals', 'shield'], ['templates', 'Templates', 'copy'], ['weekly', 'Weekly review', 'chart'], ['digest', 'Digest & phone', 'bell']] },
  { title: 'Workspace', items: [['companies', 'Companies', 'building'], ['projects', 'Projects', 'folder'], ['vault', 'Document vault', 'lock'], ['people', 'Contacts', 'user'], ['explore', 'Drill-down', 'grid'], ['workload', 'People workload', 'users']] },
  { title: 'Team', items: [['announcements', 'Announcements', 'megaphone'], ['feed', 'Team feed', 'message'], ['board', 'Team board', 'columns'], ['adoption', 'Usage', 'chart'], ['users', 'Users', 'key']] },
];
const NAVTOP: [string, string][] = [['home', 'Today'], ['kanban', 'Kanban'], ['calendar', 'Calendar'], ['calls', 'Calls'], ['chat', 'Messages'], ['meetings', 'Meetings'], ['notes', 'Notes'], ['activity', 'Activity'], ['reports', 'Reports'], ['ask', 'Ask Dood']];

function MoreMenu({ me, go, badges }: { me: Me; go: (p: string) => void; badges: Record<string, number> }) {
  const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!open) return; const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }; addEventListener('mousedown', h); return () => removeEventListener('mousedown', h); }, [open]);
  const total = (badges.followups ?? 0) + (badges.discussions ?? 0) + (badges.drafts ?? 0) + (badges.announcements ?? 0) + (badges.approvals ?? 0);
  return <div className="tb-more tb-more-wrap" ref={ref}><button aria-expanded={open} onClick={() => setOpen(!open)}>More <Ic n="down" s={14} />{total > 0 && <em className="nb">{total}</em>}</button>
    {open && <div className="more-menu card" onClick={() => setOpen(false)}>{MORE.map((g) => <div key={g.title}><h5>{g.title}</h5>{g.items.filter(([id]) => id !== 'users' && id !== 'adoption' || me.user.isAdmin).map(([id, label, ic]) => <button key={id} onClick={() => go(id)}><Ic n={ic} s={15} />{label}{!!badges[id] && <em className="nb red">{badges[id]}</em>}</button>)}</div>)}</div>}</div>;
}

function FocusButton() {
  const focus = useFocus();
  const label = focus.info ? `${Math.floor(Math.max(0, focus.info.remaining) / 60000)}:${String(Math.floor((Math.max(0, focus.info.remaining) % 60000) / 1000)).padStart(2, '0')}` : '25:00';
  return <button className="tb-btn" id="focus-top-btn" onClick={() => (focus.info ? document.querySelector('.focus-widget')?.scrollIntoView() : openFocusPicker())} title="Focus timer (P)"><Ic n="clock" />Focus {label}</button>;
}

function Shell({ me, onSignOut }: { me: Me; onSignOut: () => void }) {
  registerCompanies(me.memberships.map((m) => m.companyId));
  const [route, setRoute] = useState(parseHash());
  const [companyId, setCompanyId] = useState<string>(localStorage.getItem('cc.company') ?? '');
  const [resume, setResume] = useState<Draft | null>(null); const [meMenu, setMeMenu] = useState(false);
  useEffect(() => { const h = () => setRoute(parseHash()); addEventListener('hashchange', h); return () => removeEventListener('hashchange', h); }, []);
  useEffect(() => { try { localStorage.setItem('cc.company', companyId); } catch { /* private mode */ } }, [companyId]);
  const valid = companyId && me.memberships.some((m) => m.companyId === companyId) ? companyId : '';
  const msgs = useMessages(valid); const drafts = useDrafts();
  useLive(me);
  const nc = useQuery({ queryKey: ['ncount'], refetchInterval: 60_000, queryFn: () => api<any>('/notifications/count').catch(() => ({})) });
  const ann = useQuery({ queryKey: ['ann-count'], refetchInterval: 60_000, queryFn: () => api<any>('/announcements').then((r) => ({ needsAck: r.needsAck, unseen: r.unseen })).catch(() => ({ needsAck: 0, unseen: 0 })) });
  const apc = useQuery({ queryKey: ['approvals-count'], refetchInterval: 60_000, queryFn: () => api<any>('/approvals/count').then((r) => (r.inbox as number) ?? 0).catch(() => 0) });
  const m = msgs.data;
  const due = (kind: string) => m ? [...m.overdue, ...(m.days?.[0]?.items ?? [])].filter((i: any) => i.kind === kind).length : 0;
  const badges: Record<string, number> = { calls: due('call'), followups: due('followup'), discussions: due('discussion'), drafts: drafts.data?.length ?? 0, chat: nc.data?.chat ?? nc.data?.messages ?? 0, announcements: (ann.data?.needsAck ?? 0) + (ann.data?.unseen ?? 0), approvals: apc.data ?? 0 };
  useEffect(() => {
    if (!m || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const key = 'cc.notified'; if (localStorage.getItem(key) === m.today || (m.badge === 0 && m.critical.length === 0)) return;
    localStorage.setItem(key, m.today);
    desktopNotify(m.critical.length ? `${m.critical.length} critical task${m.critical.length > 1 ? 's' : ''} to finish today` : 'Due today', `${m.counts.overdue} overdue · ${m.counts.today} today · ${m.counts.tomorrow} tomorrow`);
  }, [m]);
  // Keyboard: Ctrl+K search, N new (Quick add), P focus, and single-letter jumps (ignored while typing or when a pop-up is open).
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable) || document.querySelector('.overlay')) return;
      const k = e.key.toLowerCase();
      const to: Record<string, string> = { t: 'home', h: 'home', l: 'calls', f: 'followups', d: 'discussions', k: 'kanban', c: 'calendar', a: 'attention', '/': 'search' };
      if (to[k]) { e.preventDefault(); goto(to[k]); }
      else if (k === 'n') { e.preventDefault(); openQuickAdd(); }
      else if (k === 'p') { e.preventDefault(); openFocusPicker(); }
    };
    addEventListener('keydown', h); return () => removeEventListener('keydown', h);
  }, []);
  const can = (min: Role, id?: string) => { const order = ['VIEWER', 'USER', 'MANAGER', 'ADMIN']; const r0 = id ? roleIn(me, id) : me.user.isAdmin ? 'ADMIN' : null; const r = r0 === 'MEMBER' ? 'USER' : r0; return !!r && order.indexOf(r) >= order.indexOf(min); };
  const go = (p: string) => { goto(p); };
  const Page = PAGES[route.page] ?? Today;
  const alert = (m?.counts.overdue ?? 0) + (m?.counts.today ?? 0);
  const canAdd = me.user.isAdmin ? me.memberships.length > 0 : me.memberships.some((mm) => roleIn(me, mm.companyId) !== 'VIEWER');
  return (
    <Ctx.Provider value={{ me, companyId: valid, setCompanyId, can, arg: route.arg, resume, setResume }}>
      <FocusProvider>
        <ViewAsBanner me={me} />
        <div className="shell">
          <header className="tb">
            <div className="tb-row1">
              <button className="tb-brand" onClick={() => go('home')} aria-label="DOOD home">dood</button>
              <MobileCompany me={me} valid={valid} page={route.page} />
              <nav className="tb-nav" aria-label="Main">
                {NAVTOP.map(([id, label]) => <button key={id} className={route.page === id || (id === 'chat' && route.page === 'messages') ? 'on' : ''} onClick={() => go(id)}>{label}{id === 'chat' && !!badges.chat && <> <em className="nb">{badges.chat}</em></>}</button>)}
                <MoreMenu me={me} go={go} badges={badges} />
              </nav>
              <div className="tb-tools">
                <label className="tb-search" onClick={() => openPalette()}><Ic n="search" /><input readOnly placeholder="Search tasks, people…" aria-label="Search" onFocus={(e) => { e.currentTarget.blur(); openPalette(); }} /><kbd>Ctrl K</kbd></label>
                {canAdd && <button className="tb-btn new" onClick={() => openQuickAdd()} title="Quick add (N)"><Ic n="plus" />New</button>}
                <FocusButton />
                <Bell />
                <button className="tb-icon" onClick={() => go('settings')} title="Settings" aria-label="Settings"><Ic n="settings" /></button>
                <div className="menu-wrap"><button className="tb-me" onClick={() => setMeMenu(!meMenu)} aria-label={me.user.name} title={me.user.name}>{me.user.name.trim()[0]?.toUpperCase()}</button>
                  {meMenu && <div className="menu-pop card right" onClick={() => setMeMenu(false)}><div style={{ padding: '0.4rem 0.65rem' }}><b>{me.user.name}</b><br /><small className="muted">{me.user.loginId ?? me.user.email}</small></div><hr />
                    <button onClick={() => go('attention')}><Ic n="flag" />My Attention{alert > 0 && <em className="nb red">{alert}</em>}</button><button onClick={() => go('drafts')}><Ic n="pencil" />Drafts{!!badges.drafts && <em className="nb">{badges.drafts}</em>}</button><hr /><button onClick={onSignOut}><Ic n="undo" />Sign out</button></div>}</div>
              </div>
            </div>
            <div className="tb-row2" aria-label="Companies">
              <button className={'pill' + (!valid && route.page !== 'workload' ? ' on' : '')} onClick={() => { setCompanyId(''); if (route.page === 'workload') go('home'); }}>All companies</button>
              {me.memberships.map((mm) => <button key={mm.companyId} className={'pill' + (valid === mm.companyId && route.page !== 'workload' ? ' on' : '')} onClick={() => { setCompanyId(mm.companyId); if (route.page === 'workload') go('home'); }}><CoDot color={companyColor(mm)} />{mm.companyName}</button>)}
              <span className="tb-sep" aria-hidden="true" />
              <button className={'pill' + (route.page === 'workload' ? ' on' : '')} onClick={() => go('workload')}><Ic n="users" s={14} />People</button>
            </div>
          </header>
          <main key={route.page}><Page /></main>
        </div>
        <Reminders />
        <AiHosts />
        <Fab />
        <MobileNav me={me} page={route.page} valid={valid} setCompanyId={setCompanyId} go={go} badges={badges} more={MORE as any} canAdd={canAdd} onSignOut={onSignOut} />
        {!me.viewAs && <Celebrate />}
        <ToastHost />
      </FocusProvider>
    </Ctx.Provider>
  );
}

export default function App() {
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ['status'], queryFn: () => api<{ needsSetup: boolean }>('/auth/status') });
  const me = useQuery({ queryKey: ['me'], retry: false, queryFn: () => api<Me>('/auth/me'), staleTime: 0 });
  const signOut = async () => { await api('/auth/logout', { method: 'POST' }); qc.clear(); await me.refetch(); status.refetch(); };
  if (me.isLoading || status.isLoading) return <div className="auth"><p className="muted">Loading…</p></div>;
  if (me.error && !(me.error instanceof ApiError && me.error.status === 401)) return <div className="auth"><p className="error">Cannot reach the server. {String(me.error.message)}</p></div>;
  if (!me.data) return <AuthScreen needsSetup={!!status.data?.needsSetup} onDone={() => { qc.clear(); me.refetch(); status.refetch(); }} />;
  if (me.data.user.mustChangePassword && !me.data.viewAs) return <ForceChange me={me.data} onDone={() => me.refetch()} onSignOut={signOut} />;
  return <Shell me={me.data} onSignOut={signOut} />;
}
