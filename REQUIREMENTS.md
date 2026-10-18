# WorkNovas Recruitment Platform – Requirements

## 1. Current State (as built)

| Area | Status |
|---|---|
| Auth | Email/password login, JWT (12h), `isActive` check |
| Roles | `OWNER_ADMIN`, `ACCOUNT_MANAGER`, `RECRUITER`, `HR_ADMIN` – hardcoded per route via `allow()` |
| Requirements | List, create, update, assign recruiters |
| Pipeline | Submissions, stage moves, pipeline events |
| Interviews | List, create, update |
| Activity | Call + email logging/summary, desktop agent events (API key) |
| HR | Employees list, attendance summary/upsert, recruiter leaderboard |
| Frontend | 11 pages, all visible to every logged-in user (no role-based menu or route guard) |

### Known gaps in current build
- No way to create, edit, deactivate users from the UI/API (only via seed).
- No password reset / change password.
- Frontend shows every menu item regardless of role; backend returns 403 instead.
- List endpoints (`/requirements`, `/pipeline`, `/interviews`) are not scoped – a recruiter sees everyone's data.
- `userId` / `recruiterId` in request body is trusted – any user can log activity on behalf of another.
- JWT is not revoked on deactivation; a disabled user keeps access until token expiry.
- No audit trail of who changed what.
- `HR Records & Documents` page has no backend/model.
- `ClientActionPending` model has no API.

---

## 2. Access Management System (new)

### 2.1 Goal
No one can log in or change data unless an admin has explicitly granted access. Access is granted per module and per action (view / create / edit / delete), not just by role.

### 2.2 User lifecycle

```
INVITED ──(accepts invite, sets password)──> PENDING_APPROVAL ──(admin approves)──> ACTIVE
ACTIVE ──(admin suspends)──> SUSPENDED ──(admin restores)──> ACTIVE
any ──(admin revokes)──> REVOKED  (cannot log in, data kept)
```

- Only `ACTIVE` users can log in.
- Self sign-up (optional, toggle): creates user in `PENDING_APPROVAL`.
- Access may have an expiry date (`accessExpiresAt`) – e.g. contractors; expired → treated as `SUSPENDED`.

### 2.3 Permission model

- **Module**: `COMMAND_CENTER`, `REQUIREMENTS`, `PIPELINE`, `INTERVIEWS`, `EMPLOYEES`, `HR_RECORDS`, `RECRUITERS`, `ACCOUNT_MANAGERS`, `ATTENDANCE`, `CALL_ACTIVITY`, `OUTLOOK_ACTIVITY`, `USER_MANAGEMENT`, `AUDIT_LOG`.
- **Action**: `VIEW`, `CREATE`, `EDIT`, `DELETE`, `EXPORT`, `APPROVE`.
- **Scope**: `OWN` (records I created/am assigned), `TEAM` (my subordinates via `managerId`), `ALL`.
- **Role** = named template of permissions (existing 4 roles become default templates; admin can create custom roles).
- **User override**: grant or deny a specific permission to one user on top of their role.
- Effective permission = role permissions + user grants − user denies.

### 2.4 Default role templates

| Module | Owner Admin | Account Manager | Recruiter | HR Admin |
|---|---|---|---|---|
| Command Center | ALL view | TEAM view | – | ALL view |
| Requirements | ALL full | OWN full | OWN view (assigned) | – |
| Pipeline | ALL full | TEAM full | OWN create/edit | – |
| Interviews | ALL full | TEAM full | OWN create/edit | – |
| Employees / Attendance / HR Records | ALL full | TEAM view | OWN view | ALL full |
| Call / Outlook Activity | ALL view | TEAM view | OWN view | ALL view |
| User Management | full + approve | – | – | create/edit (no admin roles) |
| Audit Log | view | – | – | view |

### 2.5 Functional requirements

**Admin – User Management page**
1. Invite user: email, name, role, manager, team, optional expiry → sends invite link (token, 48h).
2. Approve / reject pending users.
3. Edit role, manager, team, per-user permission overrides.
4. Suspend / restore / revoke user; force logout (invalidate all sessions).
5. Reset password (sends reset link).
6. Filter users by status, role, team; see last login.

**Role Management page**
7. Create / edit / clone / delete custom roles with a module × action matrix and scope.
8. Cannot delete a role in use; cannot remove the last `OWNER_ADMIN`.

**User**
9. Accept invite and set password (min 8 chars, 1 number, 1 letter).
10. Forgot password / change password.
11. See own profile and granted permissions.

**Enforcement**
12. Backend: `can(module, action)` middleware replaces `allow(role)`; queries filtered by scope.
13. Backend ignores `userId`/`recruiterId` in body unless user has scope `TEAM`/`ALL`.
14. Frontend: `/auth/me` returns effective permissions; menu items, buttons and routes hidden when not permitted.
15. Token check on each request: user status must be `ACTIVE` and `tokenVersion` must match (bumped on suspend/revoke/role change/password reset).

**Audit**
16. Log every login (success/fail), permission change, status change and create/edit/delete on business data: who, what, before/after, IP, time.
17. Lock account for 15 min after 5 failed logins.

### 2.6 Data model additions

```prisma
enum UserStatus { INVITED PENDING_APPROVAL ACTIVE SUSPENDED REVOKED }
enum PermAction { VIEW CREATE EDIT DELETE EXPORT APPROVE }
enum PermScope  { OWN TEAM ALL }

model User {            // additions
  status          UserStatus @default(INVITED)
  roleId          String?
  accessExpiresAt DateTime?
  tokenVersion    Int        @default(0)
  lastLoginAt     DateTime?
  failedLogins    Int        @default(0)
  lockedUntil     DateTime?
  approvedById    String?
  approvedAt      DateTime?
}

model AppRole {
  id          String           @id @default(uuid())
  name        String           @unique
  isSystem    Boolean          @default(false)
  permissions RolePermission[]
}

model RolePermission {
  id     String     @id @default(uuid())
  roleId String
  module String
  action PermAction
  scope  PermScope
  @@unique([roleId, module, action])
}

model UserPermission {   // per-user override
  id     String     @id @default(uuid())
  userId String
  module String
  action PermAction
  scope  PermScope
  allow  Boolean    // true = grant, false = deny
  @@unique([userId, module, action])
}

model AuthToken {        // invite + password reset
  id        String   @id @default(uuid())
  userId    String
  type      String   // INVITE | RESET
  tokenHash String   @unique
  expiresAt DateTime
  usedAt    DateTime?
}

model AuditLog {
  id        String   @id @default(uuid())
  actorId   String?
  action    String
  entity    String
  entityId  String?
  before    Json?
  after     Json?
  ip        String?
  createdAt DateTime @default(now())
  @@index([entity, entityId])
  @@index([actorId, createdAt])
}
```

### 2.7 API

| Method | Path | Permission |
|---|---|---|
| POST | `/users/invite` | USER_MANAGEMENT:CREATE |
| GET | `/users` | USER_MANAGEMENT:VIEW |
| PATCH | `/users/:id` | USER_MANAGEMENT:EDIT |
| POST | `/users/:id/approve` \| `/reject` | USER_MANAGEMENT:APPROVE |
| POST | `/users/:id/suspend` \| `/restore` \| `/revoke` | USER_MANAGEMENT:EDIT |
| POST | `/users/:id/force-logout` | USER_MANAGEMENT:EDIT |
| PUT | `/users/:id/permissions` | USER_MANAGEMENT:EDIT |
| GET/POST/PATCH/DELETE | `/roles[/:id]` | USER_MANAGEMENT:* |
| POST | `/auth/accept-invite` | public (token) |
| POST | `/auth/forgot-password`, `/auth/reset-password` | public (token) |
| POST | `/auth/change-password` | logged in |
| GET | `/auth/me` | logged in – returns user + effective permissions |
| GET | `/audit-logs` | AUDIT_LOG:VIEW |

### 2.8 Acceptance criteria
- Invited user cannot log in until invite accepted **and** approved.
- Suspending a user logs them out on their next request (no wait for token expiry).
- Recruiter calling `GET /pipeline` only receives their own submissions.
- Recruiter does not see Employees / Attendance menus.
- Removing `REQUIREMENTS:EDIT` from a user hides the edit button and returns 403 from the API.
- Every permission change appears in the audit log with before/after values.

### 2.9 Implementation status (2026-09-29)

Implemented: all of 2.2–2.8.

Deviations / notes:
- **No email service yet** – invite and reset links are shown to the admin (copy button) and printed in the backend log. Forgot-password links go to the backend log only.
- Invites sent by a user with `USER_MANAGEMENT:APPROVE` are pre-approved (user is ACTIVE after setting a password). Invites from HR need admin approval.
- `User.role` (job role) is kept for reports (leaderboards); permissions come from `User.appRoleId` (access role).
- Command Center and Account Managers dashboards are gated by VIEW permission but still show company-wide figures (not scope-filtered).
- `OWNER_ADMIN` role is locked; users cannot change their own access; at least one active admin must remain.
- Env: `APP_URL` (base for links, default `http://localhost:5173`), `ALLOW_SIGNUP=true` to enable "Request access".

---

## 3. Other Features to Build

### High priority (core gaps)
1. **Candidate database** – separate `Candidate` model (resume, skills, experience, location, rate, visa) reused across submissions; duplicate detection by email/phone.
2. **Resume upload & parsing** – store files (S3/local), extract name/email/skills.
3. **HR Records & Documents backend** – employee documents (offer letter, ID, contracts) with expiry reminders.
4. **Client management** – `Client` model with contacts, rate cards, MSP/VMS info (currently a free-text `clientName`).
5. **Notifications** – in-app + email for new assignment, interview in 1h, feedback pending, stage change.
6. **Global search** – candidates, requirements, clients.
7. **Requirement age auto-calc** – `ageInDays` is stored; should be computed from `receivedAt`.

### Medium priority
8. **Reports & export** – submissions per recruiter, submission-to-interview-to-offer ratios, time-to-fill; CSV/Excel export.
9. **Targets / KPIs** – daily/weekly targets per recruiter (calls, submissions) with progress.
10. **Leave management** – leave requests, approvals, balance (Attendance has `ON_LEAVE` but no workflow).
11. **Interview calendar** – calendar view, Outlook/Google calendar sync, interview feedback form.
12. **Offer & onboarding** – offer details, start date, placement record, margin/billing.
13. **Real integrations** – Ceipal, Outlook (Graph API), LinkedIn, dialer; current logs are manual.
14. **Notes & comments** on requirements and candidates with @mentions.

### Security / platform
15. Rate limiting, Helmet, input validation (zod/joi).
16. Refresh tokens + httpOnly cookie instead of localStorage.
17. 2FA for admins.
18. Soft delete + data retention policy.
19. Pagination on all list endpoints.
20. Automated tests (API + UI) and CI.
21. Docker compose (Postgres + backend + frontend) for one-command setup.

### Nice to have
22. Dark mode / mobile layout.
23. Candidate portal (self-apply, status tracking).
24. AI helpers – job description → matching candidates, resume summary, email drafts.
