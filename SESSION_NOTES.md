# Session Notes

Running log of debugging/perf work, separate from `SCOPE_NOTES.md` (which covers scope mapping).

---

## 2026-08-13 — Supabase migration (Phases 0–3 of 7) — branch `supabase-changes`

**Status:** Phases 0, 1, 2, 3 built + verified (build green, 29 tests green, storage round-trip
verified, auth wiring verified, **full browser walkthrough passed**). Work committed + pushed to
branch `supabase-changes`. Email/Realtime/AI (Phases 4–6) + cutover (7) still to do. Full plan
lives in the approved milestone plan.

**Resume checklist (next session):**
- Branch is `supabase-changes` (NOT main). `.env` holds live Supabase creds (git-ignored).
- Seeds must run over the direct connection (already handled by `prisma/seedClient.ts`); a full
  reseed takes several minutes (network round-trips to ap-south-1).
- Phase 4 (Email) **code done**; ops pending (RESEND_API_KEY + verified sender + Supabase
  Auth SMTP + live send test). Phase 5 (Realtime) **code + live infra done** (see below);
  pending a two-session browser verify. Next up: **Phase 6 (AI review)**.
- Deferred cleanup (Phase 7): uninstall unused `iron-session`; drop legacy `passwordHash`
  column + bcrypt from seed; update `README.md` / `SCOPE_NOTES.md`.

**Decisions (from the user):** keep Prisma (repoint to Supabase Postgres, not a supabase-js
rewrite); adopt Supabase Auth; upgrade Storage + Email + Realtime + AI; drop & reseed.
Doc clause-highlighting: **hybrid** — keep the generated rich view for MSA/NDA/SLA/COC, render
real files for everything else. Seed real placeholder files for **3 showcase vendors** only.

### Phase 5 — Realtime — code + infra done, live browser verify pending
- **Pattern: Realtime as an invalidation signal, not a data channel.** New client cmp
  `app/components/RealtimeRefresh.tsx` subscribes to `postgres_changes` and calls
  `router.refresh()` (300ms-debounced) → server components re-render with fresh data, so
  all RBAC/queries stay server-side. Client never reads row payloads.
- New browser client `lib/supabase/client.ts` (`createBrowserClient`, anon key + cookie
  session). Mounted: **badge** in `Shell.tsx` (own `Notification`, `userId=eq.<id>`);
  **dept queue** in `app/dept/page.tsx` (`DeptReview` dept-filtered + `Vendor` + `Document`);
  **admin dashboard** in `app/admin/page.tsx` (`Vendor` + `DeptReview` + `Document`).
- **Infra applied to live DB** via `supabase/phase5_realtime.sql` (over `DIRECT_URL`):
  RLS enabled on the 4 tables + SELECT policies (`rt_own_notifications` self-scoped;
  `rt_staff_*` gated by `is_staff()` = Admin/Dept) + tables added to `supabase_realtime`
  publication. **Verified**: all 4 in publication, RLS on, policies present.
- **Safe for Prisma**: connection role is `postgres` with `rolbypassrls=true` (checked) —
  server-side reads bypass RLS. Confirmed post-apply (vendor/review/notif counts read fine).
  ⚠️ Watch: `authUserId` is **text**, `auth.uid()` is **uuid** — policies cast
  `auth.uid()::text`. Realtime is anon-key + cookie session; a vendor cannot subscribe to
  `Vendor`/`DeptReview`/`Document` (policy denies non-staff).
- ✅ **Browser-verified live** (localhost:3000): (1) **badge** — as vendor Karan/Anugrah,
  inserting a `Notification` for his user bumped the unread badge 3→4 with no reload
  (change event logged, `router.refresh()` fired, list re-rendered). (2) **dept queue** — as
  Finance mgr Neha, flipping a `DeptReview` PENDING→APPROVED live-updated the queue tiles
  (Awaiting 9→8, SLA breached 4→3, Actioned 29→30) and dropped that vendor from the list.
  All test-data mutations reverted afterward (review back to PENDING, test notifications
  deleted). Reversible infra: `drop policy` + `disable row level security` + `alter
  publication ... drop table`.
- ⚠️ **Two SQL fixes surfaced during the live test — folded into
  `supabase/phase5_realtime.sql`:** (a) the earlier `db push --force-reset` had dropped &
  recreated the `public` schema, wiping Supabase's default grants → `authenticated` had NO
  table privileges, so Realtime delivered zero events. Fixed with
  `grant usage on schema public` + `grant select` on the 4 tables. (b) `authUserId` is
  **text** but `auth.uid()` is **uuid** — policies cast `auth.uid()::text`; and the
  Notification policy now uses a `security definer` helper `current_app_user_id()` so it can
  read `User` without granting `authenticated` SELECT on `User` (which would expose emails).
  Verified via role-simulation: vendor sees only own notifications & 0 Vendor/DeptReview
  rows; admin/dept see the full pipeline.

### Phase 4 — Email (Resend) — code done, ops pending
- New **`lib/email.ts`**: Resend client, `sendEmail()` (best-effort — swallows all
  errors so email can never break a workflow write), `notificationEmail()` HTML wrapper,
  `emailEnabled()` / `appUrl()` helpers. **No-op when `RESEND_API_KEY` is unset** — safe by
  default, nothing sends until the key is configured.
- **`notify()` in `lib/workflow.ts`** now mirrors every in-app notification to email:
  after the `Notification` row it looks up the user (`email`, `active`), skips inactive
  users, and sends per-`kind` subject/CTA (STATUS→/vendor, TASK→/dept, AUDIT→/admin).
  The `Config.notify*` gating already happens at call sites, so no re-gating here.
- `resend@^6` installed. `.env.example` adds `EMAIL_FROM` + `APP_URL`.
- ✅ tsc clean, 29 tests green.
- ⚠️ **Ops still required (not code):** (1) set `RESEND_API_KEY` + verified `EMAIL_FROM`
  domain in `.env` and Vercel; (2) Supabase Dashboard → Auth → SMTP → point at Resend for
  **auth mail** (invite / reset / confirm) — this half is dashboard config, no code.
  (3) End-to-end send not yet verified (needs a live key).

### Phase 0 — test safety net (NEW)
- Added **Vitest** + `tests/` covering the pure logic the DB swap must not change:
  `lib/sla.ts`, `lib/period.ts`, `lib/analytics.ts` selectors. **29 tests**, asserting exact
  values — the parity gate re-run after Phase 1. `npm test` / `npm run test:watch`.

### Phase 1 — DB engine Prisma → Supabase Postgres
- `schema.prisma`: provider `sqlite`→`postgresql`, added `directUrl`, dropped the
  `driverAdapters`/`engineType=client` preview flags. Status fields kept as **String**
  (source of truth stays `lib/constants.ts`) — native enums deliberately deferred.
- `lib/prisma.ts` → plain `PrismaClient` (libSQL adapter removed). `prisma.config.ts` +
  `next.config.ts` stripped of libSQL plumbing. Removed `@libsql/client` +
  `@prisma/adapter-libsql` deps.
- ⚠️ **The provisioned Supabase DB was NOT empty** — it already held a more-advanced instance
  of this app (Supabase Auth linked via `User.authUserId`, `DocumentType.mandatory`, 49
  vendors / 429 docs, `_prisma_migrations`). Surfaced to the user; **user explicitly consented
  to wipe & reset**. `db push --force-reset` + reseed done (51 vendors). Orphaned `auth.users`
  in Supabase's `auth` schema were left (harmless; to be addressed in Phase 3 auth linkage).
- Prisma 6 blocks `--force-reset` under an AI agent without
  `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION=<exact user consent text>`.

### Phase 2 — Supabase Storage (real files)
- New `lib/storage.ts` (service-role client; `uploadObject` / `signedUrl` / `removeObject`;
  `isStoredObject` treats legacy `/…` paths as "no real file"). Private bucket **`vendor-docs`**.
- `uploadDocument` (`app/actions/vendor.ts`) + `replaceBuyerDocTemplateFile`
  (`app/actions/admin.ts`) now store **real bytes**; `storedPath` holds the object key.
- New `app/components/DocumentFileView.tsx` (PDF `<object>` / image / empty state). The 4 doc
  viewers render the real file for standard docs and keep the rich mock view + clause
  highlighting for MSA/NDA/SLA/COC. Downloads use signed URLs (rich types keep the text blob).
- Seed uploads **33 placeholder PDFs** for Anugrah/Northline/Vertex (`makePlaceholderPdf` +
  `seedPlaceholderFiles` in `prisma/seed.ts`). Other vendors' standard docs show a legacy
  "no file" state by design.

### ⚠️ Seeding hardening (required for Supabase)
- The pgBouncer **transaction pooler** (`DATABASE_URL`, :6543) drops connections mid-seed
  (`P1017`); a bulk-delete also hit `statement_timeout` (57014). Fix: new
  **`prisma/seedClient.ts`** runs the seed over the **direct connection** (`DIRECT_URL`, :5432)
  with `connection_limit=1`, and `main()` issues `SET statement_timeout = 0`. Seeds reliable now.

### Env / ops
- `.env` (git-ignored) now holds Supabase creds; `.env.example` rewritten as the Supabase
  template. Bucket `vendor-docs` created (private). Region `ap-south-1` (matches Vercel `bom1`).
- To run locally: restart any stale pre-migration `next dev`, then `npm run dev`.

### Phase 3 — Supabase Auth
- **Identity now comes from Supabase Auth.** `lib/session.ts` `getSessionUser()` reads
  `supabase.auth.getUser()` → app `User` by new **`User.authUserId`** (email fallback that
  self-heals the link). All RBAC guard **signatures unchanged** (`requireAdmin/Vendor/Dept`).
- New SSR plumbing: `lib/supabase/server.ts` (cookie-bound client), `lib/supabase/admin.ts`
  (service-role, for createUser), `lib/supabase/proxy.ts` + root **`proxy.ts`** — ⚠️ Next 16
  renamed `middleware` → **`proxy`** (same contract; `proxy`/`middleware`/`default` exports all
  accepted). proxy refreshes the session cookie each request.
- `app/actions/auth.ts`: login → `signInWithPassword`, logout → `signOut`. Invite
  (`app/actions/invite.ts`) → `acceptInviteAction` creates a Supabase auth user + password and
  signs in; **custom OTP removed** (`OtpCode` model dropped, `verify` route + `VerifyForm`
  deleted, bcrypt off the auth path).
- **Demo persona switcher** re-done as a `DEMO_MODE`-only cookie (`vms_demo`) honored by
  `getCurrentUser` only when the real session is admin (`lib/session.ts` `isImpersonating`,
  `switchPersonaAction`/`returnToAdminAction`). `Shell.tsx` updated (no more iron-session).
- **Seed** creates a Supabase auth user per app User (all `demo1234`) and links `authUserId`
  (`seedAuthUsers()` in `prisma/seed.ts`); it first clears existing auth.users for a clean reset.
- Schema pushed (`authUserId` unique, `OtpCode` dropped). `@supabase/ssr` + `@supabase/supabase-js`
  installed.

### Browser verification (Phases 1–3, localhost:3000)
Admin login → `/admin` dashboard (Supabase SSR cookie) ✓ · real PAN PDF renders via signed URL
✓ · SLA shows rich clause view (hybrid) ✓ · logout clears session → `/login` ✓ · protected route
after logout bounces to `/login` ✓ · vendor login → `/vendor` ✓ · **RBAC** vendor→`/admin` blocked
→ `/unauthorized` ✓. (DEMO_MODE persona switcher not exercised — off in `.env`; tested real logins
for all personas instead.)

## 2026-08-13 — Procurement Review rebuild, SLA bar fixes, flag-to-admin removal, merge with analytics PR

**Status:** Built, merged, committed, pushed (`origin` + `public`). Prod Turso schema pushed and reseeded — live.

- **Procurement Review** (`/dept` for Admin) changed from a pending-review queue into
  a browsable list of **onboarded** vendors (30d/90d/6mo/1yr range filter, reuses
  `lib/period.ts`'s dashboard-range pattern), each vendor showing its full submitted
  document set (all departments) read-only.
- **Read-only document viewer + Download**: new shared components
  `app/components/MockDocumentContent.tsx` / `DownloadDocumentButton.tsx` (generates a
  real file client-side from the existing mock content — no real file storage anywhere
  in this app). Reused from both the Procurement Review flow and a new per-department
  "▤" icon on the Admin vendor detail page (`DeptDocumentsModal.tsx`), the latter
  working for vendors at *any* status, not just onboarded.
- **SLA bar accuracy — several real bugs found and fixed** (`lib/sla.ts`,
  `prisma/seed.ts`):
  1. Seed script hardcoded `5` SLA days for every department instead of each dept's
     real `slaDays` (Finance=7, Legal=10) — due dates looked identical across depts.
  2. Admin vendor detail page used the raw `slaVisual()` instead of the sticky-
     `everBreached`-aware `reviewSlaVisual()`, so a review that breached and *then*
     got approved could wrongly render green "Met".
  3. Two demo vendors (Northline's Legal review, Kestrel's HR review) had hand-crafted
     seed overrides giving them an independent `slaStartedAt`, breaking the "every
     department shares one start date" invariant — both removed.
  4. Added a shared per-vendor timeline scale so every department's "today" arrow
     marker aligns at the same x position, bar-track width now proportional to each
     dept's own due date on that shared scale.
  5. The "Xd left" countdown was **calendar** days sitting next to a **working**-days
     SLA figure (could show more days left than the SLA itself) — replaced
     `daysLeft` with a new `workingDaysLeft` everywhere it's used (Status Dashboard,
     dept queues, SLA reminders, vendor detail, and analytics' at-risk threshold).
- **Flag-to-admin removed end-to-end** — the dept escalation action, the admin
  clear-flag action, every `FLAGGED` status/tone/label constant, and the workflow
  rollup branch. Kestrel (previously the flagged-demo vendor) repurposed to a plain
  in-review scenario.
- **Access & Invites**: dropped "Internal users"; Finance/Legal/HR managers get an
  inline-editable email (Procurement excluded — no standalone login); removed the
  cosmetic "Fetch from Workday" widget; combined the MSA + NDA invite checkboxes into
  one.
- **Merged the analytics-dashboard PR** (`origin/main` had diverged — 3 real
  conflicts in `app/actions/dept.ts`, `app/admin/page.tsx`, `prisma/seed.ts`, plus a
  post-merge fixup in the new `lib/analytics.ts`, which referenced the just-removed
  `VSTATUS.FLAGGED` and old `daysLeft`). Resolution rule: core-functionality changes
  (SLA fixes, flag removal) took precedence over anything conflicting; the analytics
  work itself was untouched.
- **Deploy checklist items from the previous entry are now done**: prod Turso schema
  pushed (the 5 new analytics fields + all `@@index` additions + this session's
  changes) and prod reseeded (55 vendors). `CRON_SECRET` in Vercel env is still
  unconfirmed — not something this session could check/set.

---

## 2026-08-12 — Analytics dashboard redesign (enterprise)

**Status:** Built, build green, verified in-browser. **Uncommitted — under local testing.**

Replaced `app/admin/analytics/page.tsx` with a 5-section enterprise dashboard
(Executive Summary / Vendor Pipeline / Department Bottlenecks / Vendor Behavior &
Quality / Trends), with Leading vs Lagging and Business vs User framing.

- **Schema (additive/nullable):** `Vendor.registeredAt`, `Vendor.onboardingStartedAt`,
  `DeptReview.decidedAt`, `Document.rejectionReason`, `Document.revisionCount`.
  Wired into real write-paths (invite verify, vendor save/upload, dept reject/clarify —
  new reason dropdown in `DocumentActions.tsx`) and set `RESUBMIT` comment kind so the
  previously-dead resubmit logic works.
- **Seed rewritten** (`prisma/seed.ts`): ~49 vendors across ~12 months, with rejected
  vendors, comments, audit logs, revisions, categorized rejection reasons, SLA breaches.
- **Compute layer:** `lib/analytics.ts` (pure selectors, swap-to-SQL-ready) +
  `previousPeriod()` in `lib/period.ts`. Dept speed scoped by *decision* date.
- **Charts:** Recharts `^3` for the funnel, dual-axis trend line, and completion
  histogram (client components in `app/admin/analytics/charts/`, mount-gated via
  `ChartFrame`). Horizontal bars (dept speed, stage-time, rejection reasons) are
  hand-rolled CSS (`components/HBars.tsx`) — Recharts' `layout="vertical"` bars rendered
  empty under React 19 / Next 16.
- **Honesty choices:** forecast tiles replaced with a transparent run-rate; stage-time
  shown as parallel lanes + critical-path (NOT a summed stack, since dept reviews are
  parallel). Dashboard defaults to the **Year** view (current quarter is only weeks old).

### ⚠️ Added to the deploy checklist
- The **5 new schema fields** also require the prod `prisma db push` (fold in with the
  indexes from the earlier session — all additive/safe, no data loss).
- New dependency **`recharts@^3`** — ensure `npm install` runs on deploy.

---

## 2026-08-12 — Build fix + latency/error debug

**Status:** Applied, building clean, re-seeded locally. **Uncommitted — under local testing.**

### Build fix
- Build failed at page-data collection: no `.env` existed, so `DATABASE_URL` was
  `undefined` and `lib/prisma.ts` crashed at import (`Cannot read properties of
  undefined (reading 'startsWith')`).
- Created `.env` from `.env.example`, and added a guard in `resolveDatabaseUrl()`
  (`lib/prisma.ts`) that throws a clear message when `DATABASE_URL` is unset.

### Latency / error fixes
The app runs Prisma over Turso/libSQL on Vercel (`bom1`), where **every query is a
network round-trip** — so both query count and DB region drive latency.

1. **FK indexes** (`prisma/schema.prisma`) — added `@@index` on the 7 filtered FK
   columns: `Document.vendorId`, `DeptReview.departmentId`, `Notification.userId`,
   `Comment.vendorId` + `documentId`, `AuditLog.targetId`, `User.departmentId`,
   `OtpCode.email`. The unread-notification count runs on **every** page load.
2. **`getConfig()` race → upsert** (`lib/workflow.ts`) — find-then-create on fixed
   `id:1` could 500 on concurrent cold starts; now a single `upsert`.
3. **SLA reminders off the render path** — `sendSlaReminders()` was writing to the DB
   during the admin dashboard GET (and only ran when an admin opened the page). Moved to
   a secured route handler `app/api/cron/sla-reminders/route.ts` (gated by `CRON_SECRET`)
   driven by a **Vercel Cron** (`vercel.json`, daily 03:00 UTC / 08:30 IST).
4. **Parallelized awaits + SQL date filter**
   - Admin dashboard (`app/admin/page.tsx`): date-range filter pushed into the Prisma
     `where` (was: load every vendor, filter in JS); auth + searchParams parallelized.
   - Vendor detail (`app/admin/vendors/[id]/page.tsx`): 3 independent reads → one
     `Promise.all` (auth gate still runs first).

**Deliberate non-change:** analytics date-filter left in JS — that page computes all-time
metrics from the same dataset, which a SQL date filter would silently break.

### ⚠️ Required before this helps in production
1. **Push indexes to prod Turso:** `DATABASE_URL=<prod> DATABASE_AUTH_TOKEN=<token>
   npx prisma db push`. The Vercel build only runs `prisma generate`, **not** `db push`,
   so the indexes won't exist in prod until pushed. Until then, fix #1 has no prod effect.
2. **Set `CRON_SECRET`** in Vercel env (any long random string), else the cron endpoint's
   auth guard no-ops. Confirm the Vercel plan allows cron (Hobby = daily only).

### Open item
- **Verify Turso DB region.** If the primary isn't near `bom1`, cross-region round-trips
  dominate all the above. Check with `turso db show <db-name>` or the `DATABASE_URL` host.
