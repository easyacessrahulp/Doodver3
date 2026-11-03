import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import Doodu, { DOODU_LINES } from './components/Doodu';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, fmtMinutes, ymd } from './api';
import { FormModal, Modal, toast } from './ui';

const PRESETS = [{ f: 25, b: 5 }, { f: 50, b: 10 }, { f: 90, b: 15 }];
const LS = 'cc.focus';
interface Target { taskId: string; subtaskId?: string | null; title: string }
interface Active { id: string; taskId: string; subtaskId: string | null; title: string; sub?: string | null; startedAt: number; planned: number; breakMin: number }
interface Saved { id: string; pausedMs: number; pausedAt: number | null; breakMin: number }

const Ctx = createContext<{ start: (t: Target) => void; running: boolean; info: { remaining: number; paused: boolean; title: string } | null }>({ start: () => undefined, running: false, info: null });
export const useFocus = () => useContext(Ctx);

function beep() {
  try {
    const ac = new (window.AudioContext || (window as any).webkitAudioContext)();
    [0, 0.35].forEach((t) => { const o = ac.createOscillator(), g = ac.createGain(); o.connect(g); g.connect(ac.destination); o.frequency.value = 880; g.gain.value = 0.15; o.start(ac.currentTime + t); o.stop(ac.currentTime + t + 0.25); });
  } catch { /* no audio */ }
}
export const desktopNotify = (title: string, body: string) => { try { if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body }); } catch { /* ignore */ } };
const mmss = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

export function FocusProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [target, setTarget] = useState<Target | null>(null);        // choosing length
  const [a, setA] = useState<Active | null>(null);                   // running session
  const [saved, setSaved] = useState<Saved | null>(null);
  const [now, setNow] = useState(Date.now());
  const [finishing, setFinishing] = useState<{ minutes: number; completed: boolean } | null>(null);
  const [after, setAfter] = useState<Active | null>(null);          // just finished → offer break / another
  const [breakEnd, setBreakEnd] = useState<number | null>(null);
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api<any>('/settings') });
  const [custom, setCustom] = useState(30); const [err, setErr] = useState('');
  useEffect(() => { if (settings.data?.focusMinutes) setCustom(settings.data.focusMinutes); }, [settings.data?.focusMinutes]);
  const alerted = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { session } = await api<any>('/focus/active');
      if (!session) { setA(null); setSaved(null); return; }
      const raw = JSON.parse(localStorage.getItem(LS) ?? 'null') as Saved | null;
      const s = raw && raw.id === session.id ? raw : { id: session.id, pausedMs: 0, pausedAt: null, breakMin: 5 };
      setSaved(s);
      setA({ id: session.id, taskId: session.taskId, subtaskId: session.subtaskId, title: session.taskTitle, sub: session.subtaskTitle, startedAt: new Date(session.startedAt).getTime(), planned: session.plannedMinutes, breakMin: s.breakMin });
    } catch { /* signed out */ }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const persistSaved = (s: Saved | null) => { setSaved(s); if (s) localStorage.setItem(LS, JSON.stringify(s)); else localStorage.removeItem(LS); };

  const activeMs = a && saved ? Math.max(0, now - a.startedAt - saved.pausedMs - (saved.pausedAt ? now - saved.pausedAt : 0)) : 0;
  const remaining = a ? a.planned * 60000 - activeMs : 0;
  const paused = !!saved?.pausedAt;

  useEffect(() => {
    if (!a || paused || finishing || remaining > 0 || alerted.current === a.id) return;
    alerted.current = a.id; beep(); desktopNotify('Focus session complete', `${a.title}${a.sub ? ' › ' + a.sub : ''}`);
    setFinishing({ minutes: a.planned, completed: true });
  }, [remaining, a, paused, finishing]);

  useEffect(() => {
    if (breakEnd && now >= breakEnd) { setBreakEnd(null); beep(); desktopNotify('Break over', 'Ready for another session?'); toast('Break is over.'); }
  }, [now, breakEnd]);

  useEffect(() => {
    const prev = 'DOOD';
    document.title = a && !finishing ? `${paused ? 'Paused' : 'Focus'} ${mmss(remaining)} · ${a.title}` : breakEnd ? `Break ${mmss(breakEnd - now)}` : prev;
    return () => { document.title = prev; };
  }, [a, remaining, paused, finishing, breakEnd, now]);

  const begin = async (planned: number, breakMin: number) => {
    if (!target) return; setErr('');
    try {
      const s = await api<any>('/focus/sessions', { method: 'POST', body: { taskId: target.taskId, subtaskId: target.subtaskId ?? null, plannedMinutes: planned } });
      persistSaved({ id: s.id, pausedMs: 0, pausedAt: null, breakMin }); setBreakEnd(null); setAfter(null); alerted.current = null;
      setA({ id: s.id, taskId: s.taskId, subtaskId: s.subtaskId, title: s.taskTitle, sub: s.subtaskTitle, startedAt: new Date(s.startedAt).getTime(), planned, breakMin });
      setTarget(null);
      if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => undefined);
    } catch (e: any) {
      if (e instanceof ApiError && e.code === 'ACTIVE_SESSION') { setErr('A focus session is already running. Finish or cancel it first.'); load(); } else setErr(e.message);
    }
  };

  const refresh = () => { qc.invalidateQueries(); };
  const finish = async (note: string) => {
    if (!a || !finishing) return;
    await api(`/focus/sessions/${a.id}/finish`, { method: 'POST', body: { actualMinutes: finishing.minutes, completed: finishing.completed, note: note || null } });
    setAfter(a); setA(null); persistSaved(null); setFinishing(null); refresh();
  };
  const cancel = async () => {
    if (!a || !confirm('Cancel this session? Its time will not be recorded.')) return;
    await api(`/focus/sessions/${a.id}/cancel`, { method: 'POST' }); setA(null); persistSaved(null); refresh();
  };
  const togglePause = () => { if (!saved) return; persistSaved(saved.pausedAt ? { ...saved, pausedMs: saved.pausedMs + (Date.now() - saved.pausedAt), pausedAt: null } : { ...saved, pausedAt: Date.now() }); };
  const stopEarly = () => { if (a) setFinishing({ minutes: Math.max(0, Math.round(activeMs / 60000)), completed: false }); };

  return (
    <Ctx.Provider value={{ start: (t) => { setErr(''); setTarget(t); }, running: !!a, info: a ? { remaining, paused, title: a.title } : null }}>
      {children}

      {a && !finishing && (
        <div className="focus-widget" role="timer" aria-live="off">
          <div className="doodu-corner"><Doodu pose="focus" size={64} /></div>
          <small>{paused ? 'Paused' : 'Focusing'} · {a.planned} min</small>
          <div className="focus-time">{mmss(remaining)}</div>
          <div className="focus-title">{a.title}{a.sub ? ` › ${a.sub}` : ''}</div>
          <div className="focus-bar"><i style={{ width: `${Math.min(100, (activeMs / (a.planned * 60000)) * 100)}%` }} /></div>
          <div className="focus-actions"><button className="small" onClick={togglePause}>{paused ? 'Resume' : 'Pause'}</button><button className="small" onClick={stopEarly}>Finish</button><button className="small ghost" onClick={cancel}>Cancel</button></div>
        </div>
      )}
      {!a && breakEnd && (
        <div className="focus-widget break"><small>Break</small><div className="focus-time">{mmss(breakEnd - now)}</div><div className="focus-actions"><button className="small" onClick={() => setBreakEnd(null)}>Skip break</button></div></div>
      )}

      {target && (
        <Modal title="Start a focus session" onClose={() => setTarget(null)}>
          <div className="doodu-hello"><Doodu pose="focus" size={84} /><div className="doodu-bubble">{DOODU_LINES.focus}</div></div>
          <p className="muted" style={{ marginBottom: '0.75rem' }}>{target.title}</p>
          <div className="presets">{PRESETS.map((p) => <button key={p.f} className="primary" onClick={() => begin(p.f, p.b)}>{p.f} min<small>{p.b} min break</small></button>)}</div>
          <div className="inline" style={{ marginTop: '0.875rem' }}>
            <input type="number" min={1} max={180} value={custom} onChange={(e) => setCustom(Number(e.target.value))} aria-label="Custom minutes" />
            <button onClick={() => begin(Math.min(180, Math.max(1, custom || 25)), settings.data?.shortBreakMinutes ?? 5)}>Start {custom || 25} min</button>
          </div>
          {err && <p className="error">{err}</p>}
        </Modal>
      )}

      {finishing && a && (
        <FormModal title={finishing.completed ? 'Session complete' : 'Finish session early'} submitLabel="Save session" onClose={() => { if (!finishing.completed || confirm('Close without saving this session? Use "Save session" to keep the time.')) { setFinishing(null); if (finishing.completed) { alerted.current = a.id; } } }}
          initial={{ note: '' }} fields={[{ key: 'note', label: `What did you accomplish? (${fmtMinutes(finishing.minutes)} on “${a.title}${a.sub ? ' › ' + a.sub : ''}”)`, type: 'textarea' }]}
          onSubmit={async (v) => finish(v.note ?? '')} />
      )}

      {after && !a && !finishing && (
        <Modal title="Saved" onClose={() => setAfter(null)}>
          <p>Session recorded on “{after.title}{after.sub ? ` › ${after.sub}` : ''}”. Take a break?</p>
          <div className="actions left">
            <button className="primary" onClick={() => { setBreakEnd(Date.now() + after.breakMin * 60000); setAfter(null); }}>{after.breakMin}-minute break</button>
            <button onClick={() => { setTarget({ taskId: after.taskId, subtaskId: after.subtaskId, title: after.title + (after.sub ? ` › ${after.sub}` : '') }); setAfter(null); }}>Another session</button>
            <button className="ghost" onClick={() => setAfter(null)}>Done</button>
          </div>
        </Modal>
      )}
    </Ctx.Provider>
  );
}
void ymd;
