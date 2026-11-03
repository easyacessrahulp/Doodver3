// Pure scheduling rules for DOOD's pop-up reminders (no browser code here, so it can be tested).
//  • Walk: every 45 minutes counted from the first time DOOD was opened today.
//  • Water + 5-minute break: every 60 minutes counted from the same moment.
//  • "Today" briefing (AI message): when DOOD is first opened, then every 3 hours.
// The state stores how many intervals have already been announced, so a reminder is shown once, never repeated, and a long absence
// (laptop asleep) produces ONE reminder rather than a pile.
export type ReminderKind = 'briefing' | 'walk' | 'water';
export interface ReminderState { dayStart: number; lastWalk: number; lastWater: number; lastBriefing: number }   // lastBriefing: index of the 3-hour slot last shown; -1 = none yet today
export interface ReminderSettings { water: boolean; walk: boolean; briefing: boolean; snoozeUntil: number }
export const WALK_MIN = 45, WATER_MIN = 60, BRIEFING_MIN = 180;

export function dueReminders(now: number, st: ReminderState, set: ReminderSettings): { due: ReminderKind[]; state: ReminderState } {
  const mins = Math.max(0, (now - st.dayStart) / 60_000);
  const idx = { walk: Math.floor(mins / WALK_MIN), water: Math.floor(mins / WATER_MIN), briefing: Math.floor(mins / BRIEFING_MIN) };
  const state = { ...st }; const due: ReminderKind[] = [];
  // Counters always advance (so nothing piles up while snoozed or switched off); the pop-up is shown only when allowed.
  const snoozed = now < set.snoozeUntil;
  if (idx.briefing > st.lastBriefing) { state.lastBriefing = idx.briefing; if (set.briefing && !snoozed) due.push('briefing'); }
  if (idx.walk > st.lastWalk) { state.lastWalk = idx.walk; if (set.walk && !snoozed) due.push('walk'); }
  if (idx.water > st.lastWater) { state.lastWater = idx.water; if (set.water && !snoozed) due.push('water'); }
  return { due, state };
}
