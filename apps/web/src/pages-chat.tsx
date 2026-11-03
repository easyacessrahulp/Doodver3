import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, copyText, fmtTime, goto, today } from './api';
import { Badge, Empty, FormModal, Modal, toast, useApp } from './ui';
import { Avatar, PeopleChecks, ago, useTeam } from './pages-team';

const KIND_LABEL: Record<string, string> = { DECISION: 'Decision', ACTION: 'Action' };

/** A conversation: messages + a box to write. Used for chats, task threads and meeting rooms. */
export function ChatThread({ roomId, meeting }: { roomId: string; meeting?: boolean }) {
  const { me } = useApp(); const qc = useQueryClient();
  const msgs = useQuery({ queryKey: ['chat-msgs', roomId], refetchInterval: 20_000, queryFn: () => api<any>(`/chat/rooms/${roomId}/messages`) });
  const team = useTeam();
  const [text, setText] = useState(''); const [kind, setKind] = useState('TEXT'); const [busy, setBusy] = useState(false);
  const [task, setTask] = useState({ make: true, companyId: me.memberships[0]?.companyId ?? '', personId: '', dueDate: '' });
  const end = useRef<HTMLDivElement>(null); const box = useRef<HTMLTextAreaElement>(null);
  const items: any[] = msgs.data?.items ?? [];
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [items.length, roomId]);
  useEffect(() => { if (!items.length || me.viewAs) return; api(`/chat/rooms/${roomId}/read`, { method: 'POST' }).then(() => { qc.invalidateQueries({ queryKey: ['chat-rooms'] }); qc.invalidateQueries({ queryKey: ['ncount'] }); }).catch(() => undefined); }, [items.length, roomId]);
  const send = async () => {
    const body = text.trim(); if (!body || busy) return; setBusy(true);
    try {
      await api(`/chat/rooms/${roomId}/messages`, { method: 'POST', body: { body, kind, ...(kind === 'ACTION' && task.make && task.companyId ? { task: { companyId: task.companyId, personId: task.personId || null, dueDate: task.dueDate || null } } : {}) } });
      setText(''); setKind('TEXT'); await msgs.refetch(); qc.invalidateQueries({ queryKey: ['chat-rooms'] }); box.current?.focus();
    } catch (e: any) { toast(e.message); } finally { setBusy(false); }
  };
  if (msgs.isError) return <Empty>This conversation is not available.</Empty>;
  const personOf = (uid: string) => team.data?.find((t) => t.id === uid);
  return (
    <div className="thread">
      <div className="thread-msgs">
        {!items.length && <p className="muted center pad">{meeting ? 'No messages yet. Say hello — everyone invited can write here.' : 'No messages yet. Say hello '}</p>}
        {items.map((m, i) => {
          if (m.kind === 'SYSTEM') return <div className="sys-msg" key={m.id}>{m.body}</div>;
          const mine = m.authorId === me.user.id; const prev = items[i - 1]; const same = prev && prev.authorId === m.authorId && prev.kind !== 'SYSTEM' && new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 300_000;
          return (
            <div key={m.id} className={'msg' + (mine ? ' mine' : '') + (same ? ' same' : '')}>
              {!mine && !same ? <Avatar name={m.authorName} online={personOf(m.authorId)?.online} size={30} /> : <span className="avatar-gap" />}
              <div className={'bubble' + (m.kind !== 'TEXT' ? ' ' + m.kind.toLowerCase() : '')}>
                {!same && <div className="msg-head"><b>{mine ? 'You' : m.authorName}</b><small>{ago(m.createdAt)}</small></div>}
                {m.kind !== 'TEXT' && <div className="kind-tag">{KIND_LABEL[m.kind]}</div>}
                <div className="msg-body">{m.body}</div>
                {m.refTaskId && <button className="linklike" onClick={() => goto('tasks', m.refTaskId)}>➜ Task created: {m.refTaskTitle}</button>}
              </div>
            </div>);
        })}
        <div ref={end} />
      </div>
      {me.viewAs?.readOnly ? <p className="muted center pad">Read-only view.</p> : (
        <div className="composer">
          {kind === 'ACTION' && (
            <div className="action-opts">
              <label className="check-line"><input type="checkbox" checked={task.make} onChange={(e) => setTask({ ...task, make: e.target.checked })} /> Also create a task</label>
              {task.make && <>
                <select value={task.companyId} onChange={(e) => setTask({ ...task, companyId: e.target.value })}>{me.memberships.map((m) => <option key={m.companyId} value={m.companyId}>{m.companyName}</option>)}</select>
                <select value={task.personId} onChange={(e) => setTask({ ...task, personId: e.target.value })}><option value="">Keep it for me</option>{team.data?.filter((t) => t.personId && !t.me).map((t) => <option key={t.id} value={t.personId}>Give to {t.name}</option>)}</select>
                <input type="date" min={today()} value={task.dueDate} onChange={(e) => setTask({ ...task, dueDate: e.target.value })} aria-label="Due date" />
              </>}
            </div>)}
          <div className="composer-row">
            <select className="kind-pick" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Type of message"><option value="TEXT">Message</option><option value="DECISION">Decision</option><option value="ACTION">Action</option></select>
            <textarea ref={box} rows={1} value={text} placeholder={kind === 'DECISION' ? 'Write what was decided…' : kind === 'ACTION' ? 'Who must do what…' : 'Write a message… (Enter to send, Shift+Enter for a new line)'}
              onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
            <button className="primary" disabled={busy || !text.trim()} onClick={send}>Send</button>
          </div>
        </div>)}
    </div>
  );
}

export function Chat() {
  const { me, arg } = useApp(); const qc = useQueryClient();
  const rooms = useQuery({ queryKey: ['chat-rooms'], refetchInterval: 30_000, queryFn: () => api<any>('/chat/rooms') });
  const team = useTeam();
  const [sel, setSel] = useState<string | null>(null); const [group, setGroup] = useState(false);
  const [groupMembers, setGroupMembers] = useState<string[]>([]);
  useEffect(() => {
    if (!arg) return;
    if (arg.startsWith('task:')) api(`/chat/task/${arg.slice(5)}`, { method: 'POST' }).then((r) => { setSel(r.id); qc.invalidateQueries({ queryKey: ['chat-rooms'] }); }).catch((e) => toast(e.message));
    else setSel(arg);
  }, [arg]);
  const direct = async (userId: string) => { try { const r = await api('/chat/direct', { method: 'POST', body: { userId } }); setSel(r.id); qc.invalidateQueries({ queryKey: ['chat-rooms'] }); } catch (e: any) { toast(e.message); } };
  const room = rooms.data?.items.find((r: any) => r.id === sel);
  return (
    <section className="chat-page">
      <div className="page-head"><div><h2>Messages</h2><p className="muted">Talk to your team privately or in groups. Every task also has its own chat — open a task and press .</p></div><button className="primary" onClick={() => setGroup(true)}>＋ New group</button></div>
      <div className={'chat-layout' + (sel ? ' has-sel' : '')}>
        <aside className="chat-list card">
          <h4>Conversations</h4>
          {!rooms.data?.items.length && <p className="muted pad">No conversations yet. Pick someone below to start.</p>}
          {rooms.data?.items.map((r: any) => (
            <button key={r.id} className={'room' + (sel === r.id ? ' on' : '')} onClick={() => setSel(r.id)}>
              <Avatar name={r.kind === 'DIRECT' ? r.title : r.kind === 'TASK' ? 'T' : r.title} size={34} />
              <span className="room-main"><b>{r.title}</b><small className="muted">{r.lastBody ?? 'No messages yet'}</small></span>
              <span className="room-side">{r.lastAt && <small className="muted">{ago(r.lastAt)}</small>}{r.unread > 0 && <em className="red">{r.unread}</em>}</span>
            </button>))}
          <h4>Team</h4>
          {team.data?.filter((t) => !t.me).map((t) => <button key={t.id} className="room slim" onClick={() => direct(t.id)}><Avatar name={t.name} online={t.online} size={28} /><span className="room-main"><b>{t.name}</b>{t.designation && <small className="muted">{t.designation}</small>}</span></button>)}
          {team.data && team.data.length <= 1 && <p className="muted pad">You are the only person so far. The owner adds team members under <b>Users</b>.</p>}
        </aside>
        <div className="chat-main card">
          {!sel || !room ? <Empty>{sel ? 'Loading…' : 'Choose a conversation on the left, or start a new one.'}</Empty> : <>
            <header className="chat-head"><button className="icon back-btn" onClick={() => setSel(null)} aria-label="Back">←</button><div><b>{room.title}</b><small className="muted">{room.members.map((m: any) => m.id === me.user.id ? 'You' : m.name).join(', ')}</small></div></header>
            <ChatThread roomId={room.id} />
          </>}
        </div>
      </div>
      {group && <Modal title="New group chat" onClose={() => setGroup(false)} wide>
        <FormModalLike onSubmit={async (name) => { const r = await api('/chat/groups', { method: 'POST', body: { name, memberIds: groupMembers } }); setSel(r.id); setGroup(false); setGroupMembers([]); qc.invalidateQueries({ queryKey: ['chat-rooms'] }); }} disabled={!groupMembers.length} label="Create group">
          <PeopleChecks value={groupMembers} onChange={setGroupMembers} />
        </FormModalLike>
      </Modal>}
    </section>
  );
}
function FormModalLike({ onSubmit, children, disabled, label }: { onSubmit: (name: string) => Promise<void>; children: React.ReactNode; disabled?: boolean; label: string }) {
  const [name, setName] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  return <form className="form" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(''); try { await onSubmit(name.trim()); } catch (x: any) { setErr(x.message); } finally { setBusy(false); } }}>
    <label className="field"><span>Group name *</span><input required value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label>
    <div className="field"><span>Members</span>{children}</div>{err && <p className="error">{err}</p>}
    <div className="actions"><button className="primary" disabled={busy || disabled || !name.trim()}>{label}</button></div></form>;
}

// ───────────────────────── Chat Meetings ─────────────────────────
const RSVP: Record<string, string> = { YES: 'Coming', NO: 'Can’t come', MAYBE: '❔ Maybe', PENDING: '⏳ No reply yet' };
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const STATUS_TONE: Record<string, string> = { SCHEDULED: 'blue', LIVE: 'green', ENDED: 'grey', CANCELLED: 'red' };

export function Meetings() {
  const { arg } = useApp();
  return arg ? <MeetingRoom id={arg} /> : <MeetingList />;
}

function MeetingList() {
  const { me } = useApp(); const qc = useQueryClient();
  const q = useQuery({ queryKey: ['meetings'], refetchInterval: 30_000, queryFn: () => api<{ items: any[] }>('/meetings').then((r) => r.items) });
  const [tab, setTab] = useState<'up' | 'past'>('up'); const [creating, setCreating] = useState(false); const [people, setPeople] = useState<string[]>([]);
  const items = q.data ?? [];
  const upcoming = items.filter((m) => m.status === 'LIVE' || m.status === 'SCHEDULED').sort((a, b) => a.startAt.localeCompare(b.startAt));
  const past = items.filter((m) => m.status === 'ENDED' || m.status === 'CANCELLED');
  const list = tab === 'up' ? upcoming : past;
  const d = new Date(Date.now() + 3600e3); d.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    <section>
      <div className="page-head"><div><h2>Chat Meetings</h2><p className="muted">Need to discuss something with a few people without meeting? Invite them, set a time (it appears in everyone’s Calendar), and talk in a shared chat. Minutes are written when you finish.</p></div>
        <button className="primary" onClick={() => { setPeople([]); setCreating(true); }}>＋ New meeting</button></div>
      <div className="tabs"><button className={tab === 'up' ? 'on' : ''} onClick={() => setTab('up')}>Upcoming & live ({upcoming.length})</button><button className={tab === 'past' ? 'on' : ''} onClick={() => setTab('past')}>Past ({past.length})</button></div>
      {!list.length ? <Empty>{tab === 'up' ? 'No meetings planned. Press “New meeting” to invite people.' : 'No past meetings yet.'}</Empty> :
        <div className="cards-grid" style={{ marginTop: '.8rem' }}>{list.map((m) => (
          <button key={m.id} className={'drill-card meeting-card ' + m.status.toLowerCase()} onClick={() => goto('meetings', m.id)}>
            <span><Badge tone={STATUS_TONE[m.status]}>{m.status === 'LIVE' ? '● LIVE now' : m.status === 'SCHEDULED' ? 'Scheduled' : m.status === 'ENDED' ? 'Finished' : 'Cancelled'}</Badge></span>
            <b>{m.title}</b><small className="muted">{when(m.startAt)}</small><small className="muted">By {m.organizerId === me.user.id ? 'you' : m.organizerName} · {m.people} people</small>
            {m.organizerId !== me.user.id && m.status !== 'ENDED' && m.status !== 'CANCELLED' && <small>{RSVP[m.myRsvp ?? 'PENDING']}</small>}
          </button>))}</div>}
      {creating && <FormModal title="New chat meeting" wide initial={{ title: '', agenda: '', date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:00`, minutes: '30' }} onClose={() => setCreating(false)}
        fields={[{ key: 'title', label: 'What is it about?', type: 'text', required: true }, { key: 'agenda', label: 'Agenda / points to discuss (optional)', type: 'textarea' },
          { key: 'date', label: 'Date', type: 'date', required: true, half: true }, { key: 'time', label: 'Time', type: 'text', required: true, half: true, hint: 'Like 16:30' },
          { key: 'minutes', label: 'Expected length (minutes)', type: 'number', half: true }]}
        onSubmit={async (v) => {
          if (!people.length) throw new Error('Choose at least one person to invite (tick them below).');
          if (!/^\d{1,2}:\d{2}$/.test(v.time ?? '')) throw new Error('Write the time like 16:30');
          const start = new Date(`${v.date}T${v.time.padStart(5, '0')}:00`);
          const r = await api('/meetings', { method: 'POST', body: { title: v.title, agenda: v.agenda, startAt: start.toISOString(), endAt: new Date(start.getTime() + (v.minutes || 30) * 60000).toISOString(), participantIds: people } });
          qc.invalidateQueries({ queryKey: ['meetings'] }); qc.invalidateQueries({ queryKey: ['messages'] }); setCreating(false); toast('Invitations sent.'); goto('meetings', r.id);
        }} />}
      {creating && <div className="invite-float card"><b>Invite people</b><PeopleChecks value={people} onChange={setPeople} /></div>}
    </section>
  );
}

function MeetingRoom({ id }: { id: string }) {
  const { me } = useApp(); const qc = useQueryClient();
  const m = useQuery({ queryKey: ['meeting', id], refetchInterval: 15_000, retry: false, queryFn: () => api<any>(`/meetings/${id}`) });
  const [busy, setBusy] = useState(false); const [adding, setAdding] = useState(false); const [more, setMore] = useState<string[]>([]);
  const joined = useRef(false);
  const d = m.data; const mine = d?.participants?.find((p: any) => p.userId === me.user.id); const organiser = d?.organizerId === me.user.id;
  useEffect(() => { if (d && !joined.current && !me.viewAs && (d.status === 'LIVE' || (d.status === 'SCHEDULED' && Math.abs(new Date(d.startAt).getTime() - Date.now()) < 3600e3)) && !mine?.joinedAt && !organiser) { joined.current = true; api(`/meetings/${id}/join`, { method: 'POST' }).then(() => m.refetch()).catch(() => undefined); } }, [d?.status, mine?.joinedAt]);
  if (m.isError) return <Empty>This meeting is not available. <button className="linklike" onClick={() => goto('meetings')}>Back to meetings</button></Empty>;
  if (!d) return <p className="muted">Loading…</p>;
  const act = async (path: string, body?: any, ok?: string) => { setBusy(true); try { await api(`/meetings/${id}/${path}`, { method: 'POST', body }); await m.refetch(); qc.invalidateQueries({ queryKey: ['meetings'] }); qc.invalidateQueries({ queryKey: ['chat-msgs'] }); if (ok) toast(ok); } catch (e: any) { toast(e.message); } finally { setBusy(false); } };
  const live = d.status === 'LIVE'; const over = d.status === 'ENDED' || d.status === 'CANCELLED'; const mi = d.minutes;
  return (
    <section className="meeting-room">
      <div className="crumbs"><button className="linklike" onClick={() => goto('meetings')}>Chat Meetings</button><i>›</i><b>{d.title}</b></div>
      <div className="meeting-grid">
        <aside className="card pad meeting-side">
          <Badge tone={STATUS_TONE[d.status]}>{live ? '● LIVE now' : d.status === 'SCHEDULED' ? 'Scheduled' : d.status === 'ENDED' ? 'Finished' : 'Cancelled'}</Badge>
          <h3>{d.title}</h3>
          <p>{when(d.startAt)}</p><p className="muted">Organised by {organiser ? 'you' : d.organizerName}</p>
          {d.taskTitle && <p className="muted">About task: <button className="linklike" onClick={() => goto('tasks', d.taskId)}>{d.taskTitle}</button></p>}
          {d.agenda && <div className="agenda"><b>Agenda</b><p>{d.agenda}</p></div>}
          <h4>People ({d.participants.length})</h4>
          <ul className="plist">{d.participants.map((p: any) => <li key={p.userId}><Avatar name={p.name} size={26} /><span>{p.userId === me.user.id ? 'You' : p.name}<small className="muted">{p.joinedAt ? '● joined' : RSVP[p.rsvp]}</small></span></li>)}</ul>
          {!over && !me.viewAs?.readOnly && <div className="actions wrap left">
            {organiser && d.status === 'SCHEDULED' && <button className="primary" disabled={busy} onClick={() => act('start', undefined, 'Conference opened — everyone invited has been told.')}>▶ Open the conference now</button>}
            {organiser && live && <button className="primary danger" disabled={busy} onClick={() => confirm('End the meeting and write the minutes?') && act('end', undefined, 'Minutes saved.')}>■ End & write minutes</button>}
            {!organiser && live && <span className="ok-text">You are in the conference.</span>}
            {!organiser && !live && <><button disabled={busy} className={mine?.rsvp === 'YES' ? 'primary' : ''} onClick={() => act('rsvp', { rsvp: 'YES' })}>I’ll come</button><button disabled={busy} className={mine?.rsvp === 'MAYBE' ? 'primary' : ''} onClick={() => act('rsvp', { rsvp: 'MAYBE' })}>❔ Maybe</button><button disabled={busy} className={mine?.rsvp === 'NO' ? 'primary' : ''} onClick={() => act('rsvp', { rsvp: 'NO' })}>Can’t</button></>}
            {organiser && <button className="ghost" onClick={() => { setMore([]); setAdding(true); }}>＋ Invite more</button>}
            {organiser && d.status === 'SCHEDULED' && <button className="ghost" onClick={async () => { if (!confirm('Cancel this meeting? Everyone will be told.')) return; await api(`/meetings/${id}`, { method: 'PATCH', body: { expectedUpdatedAt: d.updatedAt, cancel: true } }); m.refetch(); qc.invalidateQueries({ queryKey: ['meetings'] }); }}>Cancel meeting</button>}
          </div>}
          {mi && <div className="minutes">
            <h4>Minutes <small className="muted">{mi.writtenBy === 'ai' ? '(written by AI from the chat)' : '(from the marked decisions & actions)'}</small></h4>
            <p>{mi.summary}</p>
            {!!mi.decisions.length && <><b>Decisions</b><ul>{mi.decisions.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></>}
            {!!mi.actions.length && <><b>Actions</b><ul>{mi.actions.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></>}
            {!!mi.attendees.length && <p className="muted">Present: {mi.attendees.join(', ')}</p>}
            <button className="ghost small" onClick={() => { copyText(`${d.title} — ${when(d.startAt)}\n\n${mi.summary}\n\nDecisions:\n${mi.decisions.map((x: string) => '• ' + x).join('\n')}\n\nActions:\n${mi.actions.map((x: string) => '• ' + x).join('\n')}`); toast('Minutes copied.'); }}>Copy minutes</button>
          </div>}
        </aside>
        <div className="card chat-main">
          <header className="chat-head"><div><b>Conference chat</b><small className="muted">{live ? 'Everyone invited can write here now.' : over ? 'This meeting is over — kept as a record.' : 'Opens when the organiser starts it. You can also write here before.'}</small></div></header>
          {d.roomId && <ChatThread roomId={d.roomId} meeting />}
        </div>
      </div>
      {adding && <Modal title="Invite more people" onClose={() => setAdding(false)} wide>
        <PeopleChecks value={more} onChange={setMore} />
        <div className="actions"><button className="primary" disabled={!more.length} onClick={async () => { try { await api(`/meetings/${id}`, { method: 'PATCH', body: { expectedUpdatedAt: d.updatedAt, addParticipantIds: more } }); setAdding(false); m.refetch(); toast('Invited.'); } catch (e: any) { toast(e.message); } }}>Invite</button></div>
      </Modal>}
    </section>
  );
}
void fmtTime;
