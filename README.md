# Vendor Onboarding Portal — MVP

A functional, click-through MVP of a self-service **Vendor Onboarding Portal** with
role-based access control (RBAC) enforced at both the **route** and **data** level.
Built from the VMS wireframes and the `Prototype` scope document.

**Stack:** Next.js 16 (App Router, TypeScript) · Prisma + Supabase Postgres · Supabase Auth · Supabase Storage · server-enforced RBAC. Responsive (desktop + mobile web).

## Run it

> Requires Node and a Supabase project (Postgres + Auth + a private `vendor-docs`
> Storage bucket). Fill `.env` from `.env.example` with the project's connection
> strings and API keys before seeding.

```bash
cd vendor-onboarding-mvp
cp .env.example .env          # first time only — then fill in Supabase creds
npm install
npm run db:setup              # push schema to Supabase Postgres + generate client + seed demo data
npm run dev                   # http://localhost:3000
```

To reset demo data at any time: `npm run db:setup`. Seeds run over the direct
connection (`DIRECT_URL`); a full reseed takes a few minutes over the network.

## Demo accounts (password: `demo1234`)

| Role | Email |
|---|---|
| Admin | `admin@buyer.com` |
| Finance Dept Manager | `adminfinance@buyer.com` |
| Legal Dept Manager | `adminlegal@buyer.com` |
| HR Dept Manager | `adminhr@buyer.com` |
| Vendor (Anugrah Freight) | `karan@anugrahfreight.in` |

Each department has exactly one manager account. Procurement has no
standalone login — sign in as **Admin**, whose sidebar has a **Procurement
Review** link that reviews Procurement's routed documents.

**Invite signup demo:** open `/invite/demo-invite-meridian` — accepting the
invite creates a Supabase Auth user (password `demo1234`) and signs in.

## What to try

- **Vendor** (Anugrah): see dept-wise + doc-wise status; Finance requested a change
  → re-upload in **Documents**. Also try the **reply box** under Clarification
  history on the Overview page after a department asks for clarification.
- **Finance manager**: review queue → open a vendor → per document, **Approve /
  Reject / Ask for clarification** (comment required for reject/clarify). You only
  see **Finance** documents and cannot open another department's flow.
- **Admin**: Status Dashboard (SLA + final-approval queue), **Access & Invites**
  (invite a vendor, grant/revoke access, assign managers), **Configuration**
  (SLA/cutoff, approval gate, notifications, document rules), **Analytics**, and per
  vendor: **halt**, **final approval**.

## Personas & RBAC

- **Admin** (buyer): configuration, access management, SLA/triggers, halt onboarding,
  final approval, analytics.
- **Buyer Dept User** (HR / Legal / Finance): reviews only their own
  department's routed documents; read-only on vendor data; per document,
  Approve / Reject / Ask for clarification. Procurement has no dept login —
  Admin acts as its reviewer from the **Procurement Review** sidebar link.
- **Vendor**: invite-only signup, onboarding form, document upload (all in one go),
  real-time status, and a reply box on any clarification a department asks for.

RBAC is enforced server-side in every page and Server Action via
`requireRole` / `requireDept` (route) and per-caller query scoping (data). Any
out-of-role route access returns the dedicated `/unauthorized` screen.

## Notes
- Documents: standard uploads store **real bytes** in Supabase Storage (private
  `vendor-docs` bucket, served via signed URLs); MSA/NDA/SLA/COC render a generated
  rich view with clause highlighting. Notifications email via **Resend** when
  `RESEND_API_KEY` is set (otherwise in-app only); AI auto-review is still a mocked toggle.
- See **`SCOPE_NOTES.md`** for scope mapping, resolved open questions, and known gaps.
