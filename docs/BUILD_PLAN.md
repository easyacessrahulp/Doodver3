# Command Centre — Full Build Plan (for Claude Code)

## Goal
Turn the working single-page prototype (`command-centre.html`) into a real multi-user web app with a relational database and cross-device sync, following the full specification in `SPEC.md` (the original 71-section brief).

## Inputs in this folder
- `SPEC.md` — original specification (save the uploaded brief under this name)
- `command-centre.html` — working prototype. Treat it as the behaviour reference: scoring rules in `an()`, My Attention, Focus workflow, Kanban, Calendar, Review, search, backup shape.
- `BUILD_PLAN.md` — this file

## Stack
- Frontend: React + TypeScript + Vite, TanStack Query, Tailwind (or a component library), responsive and mobile-first for Command Centre, Quick Add and Focus
- Backend: Node.js + Fastify (or Express), TypeScript, Zod validation
- Database: PostgreSQL (SQLite for local dev), Prisma migrations
- Auth: email + password (argon2), secure session cookies, roles Admin / Manager / User / Viewer
- Files: attachments on disk or S3-compatible storage, metadata in DB
- Jobs: a scheduler (node-cron or pg-boss) for reminders, overdue flags, daily summary email
- Deploy: Docker Compose (app + Postgres), env-based config so it moves Local → Server → Cloud unchanged

## Data model (Prisma)
Every table has `id` (uuid), `createdAt`, `updatedAt`, `createdById`, `updatedById`, and `archivedAt` for soft delete.
Users, Companies, Projects, People, Tasks, Subtasks, Comments (polymorphic: company/project/task/subtask), Followups, Reminders, Attachments, TaskRelationships (parent/related/blocks), ActivityLog, RecurringRules, FocusSessions, Notifications, UserSettings.

Task extras from the prototype: `priority 1–4`, `waitingFor`, `nextAction`, `delegatedTo`, `reviewer`, `postponeCount`, `lastActivityAt`, `remindDaysBefore`, `dependsOnId`.
Indexes: `(status, dueDate)`, `(delegatedToId)`, `(projectId)`, `(lastActivityAt)`, plus a full-text index (Postgres `tsvector`) over tasks, comments and activity log.

## Behaviour to preserve exactly
1. **My Attention** — top 5 by score. Score weights come from `an()` in the prototype (overdue days, due proximity, priority, follow-up due, delegated-no-update, waiting, postponements, blocked/blocking). Every item shows the reasons. Thresholds (no-update days, due-soon window, escalation days) are per-user settings.
2. **Focus loop** — Attention → Focus → Pomodoro → "What did you accomplish?" → Complete / Continue / Delegate / Follow up / Waiting / Reschedule / Another session → dashboard recalculates. Sessions stored with task id, planned and actual minutes, completed/interrupted, note. Notes land in the task history.
3. **Automation is explainable and overridable**; every automatic status change is written to ActivityLog. Nothing is hard-deleted.
4. **Completed tasks** leave active views, stay searchable, can be restored, and spawn the next occurrence if recurring.
5. **Dependencies** — a blocked task cannot be completed.

## Sync model
Server is the source of truth. Client uses optimistic updates via TanStack Query. Use `updatedAt` for conflict detection (reject stale writes with 409 and show a merge prompt). Real-time refresh via Server-Sent Events or WebSocket so changes on one device appear on another. Optional later: offline queue with service worker.

## API (REST, `/api/v1`)
`/auth`, `/companies`, `/projects`, `/people`, `/tasks` (filters: company, project, person, priority, status, due range, overdue, delegated, waiting, followup, completed, archived; cursor pagination), `/tasks/:id/{subtasks,comments,followups,reminders,attachments,relationships,history,focus}`, `/attention`, `/dashboard`, `/focus/sessions`, `/focus/stats`, `/reviews/{daily,weekly,management}`, `/search`, `/export/{csv,xlsx,pdf}`, `/backup` (ZIP of CSVs + JSON), `/restore` (validate → auto-backup current → report errors → confirm → Replace or Merge), `/notifications`, `/settings`.
Authorization: per-company membership + role checks on every route.

## Import from the prototype
Write `scripts/import-prototype.ts` that reads the prototype's JSON backup (keys: `cos`, `prs`, `people`, `pinfo`, `tasks`, `sess`, `cc`, `arch`, `set`) and creates:
- Companies/Projects/People from the name lists (archived names → `archivedAt`)
- Tasks with `subs` → Subtasks, `notes` → Comments, `log` → ActivityLog, `att` (data URLs) → stored files
- `sess` → FocusSessions, `set` → UserSettings
Report unmatched references; never overwrite existing rows.

## Build phases (test after each; do not break earlier phases)
1. Foundation: repo, Docker Compose, Prisma schema, auth + roles, CRUD for companies/projects/people/tasks/subtasks, seed data
2. Command Centre: attention scoring service, Do Now, Due Soon, At Risk, Project Health, mobile layout
3. Accountability: delegation, waiting-for, follow-ups, reminders, scheduler, grouped notifications (in-app, browser push, email)
4. Focus: Pomodoro, Focus Mode, session recording, task focus history, statistics
5. Views: Kanban, Calendar, Tasks table, Search, Review (daily/weekly/management)
6. Data: CSV/XLSX/PDF export, ZIP backup, validated restore with Replace/Merge, prototype importer
7. Refinement: shortcuts, animations, performance test with 10,000 tasks and 50,000 subtasks, security review, accessibility

## Acceptance
Use the checklist in section 68 of `SPEC.md`. Add automated tests for scoring, status rules, recurrence, dependency blocking, restore validation, and role permissions. Provide a seeded demo dataset that can be deleted.

## First instruction to give Claude Code
"Read BUILD_PLAN.md, SPEC.md and command-centre.html. Start with Phase 1. Ask me before choosing anything not covered here, and show me what you will build before each phase."
