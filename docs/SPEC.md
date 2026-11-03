# Personal Work Management Command Centre — Specification (condensed)

Condensed from the original 71-section brief. If you have the original text, it overrides this file.

**Product:** a real, database-backed work app: task + project management, delegation, follow-ups, reminders, calendar, accountability, Pomodoro focus, reporting, history. For one person running several companies (SMS Biosystems Pvt Ltd, SMS Vetcare Technologies Pvt Ltd, Sagenome Pvt Ltd, GRMS) across finance, admin, compliance, people, banking, vendors.
**Philosophy:** CAPTURE → ORGANISE → PRIORITISE → FOCUS → ACT → DELEGATE → FOLLOW UP → COMPLETE → REVIEW → RETRIEVE. Calm, fast, low-friction; the database works silently. Clarity, speed, follow-up discipline, focus, retrieval, data safety over visual complexity.

## Home: Command Centre
Opens here, not "All Tasks". Greeting + date. Company and project filters update every section. Modes: Today, Management, Focus.
Clickable counters: Overdue, At Risk, Follow-ups, Due Today, Delegated, Waiting For, Focus Minutes Today.
Sections: **My Attention** (top), Do Now, Follow Up Now, Waiting For, Delegated (needing attention), Due Soon, At Risk, Project Health, Completed Today.

**My Attention:** max 5 items, never "newest". Score from: overdue, due proximity, priority, RYAG status, follow-up due, delegation status, waiting-for, dependencies, project importance, time since last update, criticality, postponement count, whether it blocks another task. Every item states WHY. Buttons: Open, Focus, Follow Up.
**Do Now:** tasks needing my action (critical, overdue, due today, red, follow-up due, high priority), sorted: critical overdue → critical today → overdue → today → follow-up due → at risk. Actions: Complete, Comment, Follow Up, Reschedule, Delegate, Focus.
**Follow Up Now:** person, task, company, last/next follow-up, expected result. Actions: Call, WhatsApp, Email, Add Update, Snooze, Reschedule.
**Waiting For:** person/entity, task, expected date, days waiting, last contact, next follow-up. Auto-flag amber/red when expected date passes.
**Delegated:** person, task, due, last update, status. Actions: Follow Up, Comment, Send Reminder, Change Due Date, Open.
**Due Soon:** default 7 days; groups Today/Tomorrow/Next 3/This week; options 7/14/30.
**At Risk:** due soon + no update, delegated no progress, waiting, unresolved dependency, repeatedly postponed; always explain why.
**Project Health:** project, open, overdue, at risk, progress %; click opens project.
**Completed Today:** last 5–10; View All; never deleted.
Also: Focus Suggestion (from real data only), Daily Briefing with Recommended First Focus, End-of-Day review, Weekly review.

## Focus workflow (signature)
My Attention → Select → ▶ Focus → 25-min Pomodoro in distraction-free Focus Mode (task, objective, due, priority, subtask, timer only; Pause, Finish, Cancel) → "What did you accomplish?" (note goes to task history) → Complete / Continue / Delegate / Follow Up / Waiting For / Reschedule / Another session / Break → dashboard recalculates → next item appears. ATTENTION → FOCUS → ACTION → UPDATE → NEXT ACTION.
Pomodoro: 25/5 default, long break after 4 sessions; presets 25/5, 50/10, 90/15, custom (focus, short, long, sessions before long).
FocusSession record: id, task id, user, start, end, planned minutes, actual minutes, completed/interrupted, session number, notes.
Statistics: today/week/month sessions and minutes, tasks worked, most-focused projects/tasks, average session, completed pomodoros. Not competitive. Task shows its focus time and session history.

## Hierarchy and masters
COMPANY → PROJECT → TASK → SUBTASK. Companies: name, short name, code, description, active, contact, notes; archive, never delete with history. Projects: name, company, description, owner, start, target date, priority, status (Not Started, Active, On Hold, Completed, Cancelled), comments kept. People: name, designation, company, department, email, phone, reporting-to, active, notes.
**Task fields:** name, company, project, description, owner, created by/date, due, priority (🔴 Critical 🟠 High 🟡 Medium 🟢 Low), status, progress, delegated to, reviewer, comments, additional details, waiting for, next action, completion date, completion note.
**Subtasks:** unlimited; name, description, assignee, due, priority, progress, status, comments, reminder, completion date, focus time; parent progress derived, manual override allowed.
**Comments:** never overwrite; date, time, user, text; on company/project/task/subtask.
**RYAG:** 🔴 Red action/overdue/blocked, 🟡 Yellow attention, 🟠 Amber at risk, 🟢 Green completed. Green = mark complete, record time and user, remove from active views, retain, searchable, log event.

## Delegation, follow-ups, reminders
Delegation: person, delegated by, date, expected completion, instructions, priority, status, last/next follow-up; full history.
Follow-ups: many per task; date, time, person, task, type (Phone, WhatsApp, Email, Meeting, Personal, Document/Payment/Approval Pending, Other), reminder, notes, result, next date. After each: "What happened? What should happen next?" A next date auto-creates a reminder.
Reminders: due-date, 1/2/3/7 days before, custom date/time, recurring; overdue → red; no-update reminder; delegation reminder; escalation (missed → red, 3 days → escalation, 7 days → high escalation); thresholds configurable.
Smart rules: overdue → red; due soon → yellow; at risk = due soon + no update → amber; delegated no update → follow-up required; waiting too long → amber/red; follow-up time → notification; no activity for N days → flag. Automation assists, explains itself, is configurable and overridable, audited, never deletes important data.
Notifications: in-app, browser, email; immediately / daily / weekly / disabled; grouped ("8 items require your attention today").

## Other features
Calendar (month/week/day/agenda: deadlines, subtasks, follow-ups, reminders, meetings, overdue, focus sessions). Quick Add (task, company, project, due, person, priority). Natural-language entry with confirmation. Recurring tasks (daily/weekly/monthly/quarterly/yearly/custom; next created on completion). Relationships: parent, related, dependent (B can't complete before A). Attachments (PDF, Excel, Word, images, scans) stay linked to completed tasks. Audit trail of every change. Global search across all entities and history. Multi-filter (company, project, person, priority, progress, status, due, created, overdue, delegated, waiting, follow-up, completed, archived). Review Mode table: company, project, task, person, due, status, progress, last update, next follow-up + totals. Task card and quick actions (Complete, Edit, Comment, Delegate, Reminder, Due date, Follow-up, Attachment, Link, Focus, More). Shortcuts: N new, / search, T today, C calendar, F follow-ups, D delegated, P focus, Esc close.
Navigation: Command Centre, My Attention, My Tasks, Focus, Companies, Projects, People, Delegated, Waiting For, Calendar, Follow-ups, Overdue, Reports, Completed, Search, Settings.

## Data, export, safety
Export CSV, Excel, PDF: active, completed, overdue, delegated, follow-ups, by company/project/person, focus history, full database. Backup ZIP of CSVs: Companies, Projects, Tasks, Subtasks, People, Comments, Followups, Reminders, Attachments, Relationships, ActivityLog, FocusSessions, Notifications, UserSettings. Restore: auto-backup current → validate → check IDs/references → report errors → confirm → Replace or Merge; never silently delete. User keeps control of data; works without depending on an external service.
Tables: Users, Companies, Projects, People, Tasks, Subtasks, Comments, Followups, Reminders, Attachments, TaskRelationships, ActivityLog, RecurringTasks, FocusSessions, Notifications, UserSettings. Every record: id, created/updated at and by; soft delete.
Auth for multi-user: authentication, authorization, secure passwords, sessions, roles Admin/Manager/User/Viewer.
Performance: 10,000+ tasks, 50,000+ subtasks, large comment/completed history; pagination, lazy loading, indexes, no full-DB load in the browser.
UI: Apple-inspired, calm, white / light blue / green / soft yellow / amber / red / grey; rounded cards, subtle shadows, smooth transitions; colour only to signal status. Responsive desktop → mobile (mobile order: My Attention, Do Now, Follow Up, Waiting For, Delegated, Due Soon, At Risk; Quick Add and Focus easy to reach).
Stack: React + TypeScript, Node API, PostgreSQL (SQLite for local dev), Prisma; must migrate local → server → cloud without redesign. Sample data (the four companies; projects GST Compliance, Banking, HR, Company Formation, Software Development, Statutory Compliance; tasks, subtasks, people, delegations, follow-ups, reminders, focus sessions), deletable.

## Phases and acceptance
Phases: 1 Foundation, 2 Command Centre, 3 Accountability, 4 Focus, 5 Review, 6 Data, 7 Refinement. Test after each; never break earlier features.
Acceptance (all must work, not just look good): company/project/task/subtask creation, comments, people, delegation, due dates, calendar, follow-ups, reminders, waiting for, RYAG, automatic overdue detection, My Attention, Command Centre, Do Now, At Risk, delegated monitoring, completed-task removal and retrieval, task history, attachments, recurring tasks, relationships, search, filters, reports, CSV/Excel/PDF export, full backup and restore, Pomodoro, Focus Mode, task-linked sessions, focus history and statistics, focus completion workflow, daily briefing, end-of-day and weekly review, notifications, responsive mobile, audit trail.
