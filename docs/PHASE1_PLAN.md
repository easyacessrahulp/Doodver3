# Command Centre — Phase 1 (Foundation) Plan

Status: **for approval — no application code written yet.**
The Prisma schema is in `schema.prisma` (18 models; checked with Prisma's offline validator for both PostgreSQL and SQLite).

## 1. Scope

In: repo + Docker Compose, Prisma schema + migrations, auth + roles, per-company authorization on every route, soft-delete CRUD for companies / projects / people / tasks / subtasks / comments, `updatedAt` conflict detection (409), deletable seed, automated tests, basic login + CRUD UI.

Out (later phases): attention scoring, dashboards, follow-up/reminder logic, scheduler, Pomodoro, calendar/kanban, search, exports, backup/restore, importer. Tables for these exist in the schema so later phases need no redesign, but no behaviour is built.

## 2. Folder structure

```
command-centre/
├─ package.json  pnpm-workspace.yaml  tsconfig.base.json  .env.example
├─ docker-compose.yml          # postgres:16 + api + web (nginx); volumes: pgdata, uploads
├─ BUILD_PLAN.md  SPEC.md  command-centre.html      # references, untouched
├─ scripts/
│  └─ set-db-provider.mjs      # writes provider (postgresql|sqlite) into schema.prisma
├─ packages/
│  └─ shared/                  # Zod schemas + TS types used by api and web
│     └─ src/{enums.ts, auth.ts, company.ts, project.ts, person.ts, task.ts, comment.ts}
├─ apps/
│  ├─ api/
│  │  ├─ prisma/{schema.prisma, migrations/, seed.ts}
│  │  ├─ src/
│  │  │  ├─ server.ts  app.ts  config.ts  db.ts
│  │  │  ├─ plugins/{session.ts, csrf.ts, errors.ts, rateLimit.ts}
│  │  │  ├─ auth/{password.ts, sessions.ts, permissions.ts}
│  │  │  ├─ storage/{StorageProvider.ts, LocalDiskStorage.ts}   # interface only used from Phase 3
│  │  │  ├─ lib/{audit.ts, conflict.ts, softDelete.ts, pagination.ts}
│  │  │  └─ routes/{auth, users, companies, projects, people, tasks, subtasks, comments, admin}.ts
│  │  └─ test/{permissions, softDelete, conflict, auth, tasks}.test.ts
│  └─ web/
│     └─ src/{main.tsx, api/client.ts, auth/, layout/Shell.tsx, pages/…, components/…}
```

## 3. Decisions I made (tell me to change any)

1. **One schema, two providers.** Prisma allows one provider per schema, so the schema avoids enums/Json/arrays and `set-db-provider.mjs` switches `postgresql` ↔ `sqlite`. Compose and the default `.env.example` use PostgreSQL; local dev can use SQLite. Migrations are generated per provider (`migrations/pg`, `migrations/sqlite`) so neither drifts.
2. **Enum-like columns are strings**, validated by Zod in `packages/shared`.
3. **Date-only fields** (due dates etc.) are stored at 00:00 UTC and treated as calendar dates, so an India-based user never sees a day shift.
4. **User ≠ Person.** Users log in; People are delegation targets/contacts (as in the prototype, where a person is just a name).
5. **Roles:** `User.isAdmin` (global) plus `CompanyMembership.role` (Manager / User / Viewer) per company.
6. **Append-only tables** (ActivityLog, Session, Notification) don't carry `archivedAt`; everything else does.
7. **Seed "delete" = archive** (rows flagged `isDemo`), consistent with "nothing is hard-deleted".
8. **Seeded projects each belong to one company** (the prototype's projects are bare names). Seed pairing: GST Compliance → SMS Biosystems, Banking → SMS Biosystems, Software Development → SMS Vetcare, HR → Sagenome, Statutory Compliance → GRMS, Company Formation → GRMS. The Phase 6 importer must create one project per (company, name) pair found in tasks.
9. **Users can edit any task in their companies** (not only their own); they can archive only tasks they created or own.

## 3b. Auth model

- Register: `POST /auth/register` works **only while zero users exist**; that user becomes Admin. After that, Admins create users.
- Passwords: argon2id, min 10 chars. Login is rate-limited (per IP + email).
- Sessions: 32-byte random token in an `httpOnly`, `SameSite=Lax`, `Secure` (in production) cookie; only the SHA-256 hash is stored in `Session`. 30-day sliding expiry; logout and password change revoke sessions.
- CSRF: SameSite=Lax plus an `Origin` check and a required `X-Requested-With` header on every mutating request.
- Effective role per request = `ADMIN` if `isAdmin`, else the user's `CompanyMembership.role` for the resource's company. No membership = 404 (not 403), so company existence isn't leaked.

| Action | Viewer | User | Manager | Admin |
|---|---|---|---|---|
| Read company data | ✔ | ✔ | ✔ | ✔ |
| Create/edit tasks, subtasks, comments | – | ✔ | ✔ | ✔ |
| Archive task | – | own/created | ✔ | ✔ |
| Create/edit projects, people | – | – | ✔ | ✔ |
| Restore archived records | – | – | ✔ | ✔ |
| Create/edit/archive companies | – | – | – | ✔ |
| Manage users and memberships, clear demo data | – | – | – | ✔ |

Comments are append-only: no edit, no delete.

## 4. API (`/api/v1`, JSON, cursor pagination `?limit&cursor`)

```
POST   /auth/register | /auth/login | /auth/logout | /auth/change-password
GET    /auth/me                                  # user, memberships, effective roles

GET/POST        /users            PATCH /users/:id          (Admin)
PUT/DELETE      /users/:id/memberships/:companyId           (Admin)

GET/POST        /companies        GET/PATCH /companies/:id  POST /companies/:id/archive|restore
GET/POST        /projects         GET/PATCH /projects/:id   POST …/archive|restore     ?companyId&status
GET/POST        /people           GET/PATCH /people/:id     POST …/archive|restore     ?companyId&q
GET/POST        /tasks            GET/PATCH /tasks/:id      POST …/archive|restore
                                  ?companyId&projectId&personId&priority&status&dueFrom&dueTo&overdue&archived&q
POST   /tasks/:id/complete | /tasks/:id/reopen  # blocked if dependsOn task is not DONE
GET/POST        /tasks/:id/subtasks     PATCH /subtasks/:id  POST …/archive|restore
GET/POST        /comments?entityType&entityId                # append-only
GET    /tasks/:id/history                       # ActivityLog for the task

POST   /admin/demo-data/clear                   # archives rows where isDemo = true (Admin)
GET    /health
```

Rules on every route: authenticate → resolve company → check role (table above) → validate with Zod → write → append `ActivityLog`.
Updates must send `expectedUpdatedAt`; if it differs from the stored value the API returns **409** with the current record, and the UI shows a "someone changed this — keep mine / take theirs" prompt.
"Delete" never removes rows: `archive` sets `archivedAt`; list endpoints hide archived unless `archived=true`.
Completing a task sets `completedAt/By`, status `DONE`, and logs it; the dependency check is enforced here and unit-tested.

## 5. Seed (`pnpm seed`, idempotent, `isDemo = true`)

4 companies (SMS Biosystems Pvt Ltd, SMS Vetcare Technologies Pvt Ltd, Sagenome Pvt Ltd, GRMS), 6 projects (pairing in §3.8), ~10 people, ~20 tasks with subtasks and comments covering: overdue, due today, delegated, waiting, blocked-by-dependency, completed. No user is seeded; you create the Admin by registering.

## 6. Docker Compose

`postgres:16` (healthcheck, `pgdata` volume), `api` (runs `prisma migrate deploy`, then starts), `web` (nginx serving the Vite build and proxying `/api`), `uploads` volume mounted on the API. All config from `.env`.

## 7. Web UI (basic)

Login/first-run registration; app shell with navigation and company switcher; list + create + edit + archive/restore screens for Companies, Projects, People, Tasks (with subtasks and comment thread in a side panel); filters for company/project/status; conflict prompt on 409; role-aware (hides actions the user can't perform). Tailwind, responsive. The Command Centre home is Phase 2.

## 8. Automated tests (Vitest + Fastify `inject`, throwaway SQLite DB)

- **Permissions:** every route × role matrix; non-members get 404; Viewer can't write; User can't touch projects/people/companies; only Admin manages users and memberships.
- **Soft delete:** archive hides from lists, keeps the row, appears under `archived=true`, restore works, nothing is hard-deleted.
- **Conflict:** stale `expectedUpdatedAt` → 409 with current record; fresh → 200.
- **Auth:** register only when empty; wrong password; rate limit; revoked session; CSRF header required.
- **Tasks:** dependency blocks completion; comments can't be edited; activity log entry on each write.

## 9. Done when

Compose boots with one command; first user registers as Admin; seed loads and can be cleared; all tests pass on SQLite and the permission/soft-delete tests also pass against Postgres; a short README states what works and what doesn't.
