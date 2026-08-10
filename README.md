# Vendor Onboarding Portal — MVP

A functional, click-through MVP of a self-service **Vendor Onboarding Portal** with
role-based access control (RBAC) enforced at both the **route** and **data** level.
Built from the VMS wireframes and the `Prototype` scope document.

**Stack:** Next.js 16 (App Router, TypeScript) · Prisma + SQLite · iron-session (auth) · bcryptjs · server-enforced RBAC. Responsive (desktop + mobile web).

## Run it

> Requires Node. This machine had Node installed to `~/.local/node` — if `node`
> isn't on your PATH, run: `export PATH="$HOME/.local/node/bin:$PATH"`

```bash
cd vendor-onboarding-mvp
cp .env.example .env          # first time only
npm install
npm run db:setup              # create SQLite db + generate client + seed demo data
npm run dev                   # http://localhost:3000
```

To reset demo data at any time: `npm run db:setup`.

## Demo accounts (password: `demo1234`)

| Role | Email |
|---|---|
| Admin | `admin@buyer.com` |
| Finance Dept Manager | `finance.mgr@buyer.com` |
| Legal Dept Manager | `legal.mgr@buyer.com` |
| HR Dept Manager | `hr.mgr@buyer.com` |
| Procurement Dept Manager | `proc.mgr@buyer.com` |
| Vendor (Anugrah Freight) | `karan@anugrahfreight.in` |

Each department also has a secondary manager (`*.mgr2@buyer.com`).

**Invite / OTP signup demo:** open `/invite/demo-invite-meridian` (the OTP is
shown on the verify screen, since email is simulated).

## What to try

- **Vendor** (Anugrah): see dept-wise + doc-wise status; Finance requested a change
  → re-upload in **Documents** and **resubmit with a comment** on the Overview.
- **Finance manager**: review queue → open a vendor → Approve / Request changes /
  Reject (comment required) / Flag to admin. You only see **Finance** documents and
  cannot open another department's flow.
- **Admin**: Status Dashboard (flagged + final-approval queue), **Access & Invites**
  (invite a vendor, grant/revoke access, assign managers), **Configuration**
  (SLA/cutoff, approval gate, notifications, document rules), **Analytics**, and per
  vendor: **halt**, **final approval**, **clear flag**.

## Personas & RBAC

- **Admin** (buyer): configuration, access management, SLA/triggers, halt onboarding,
  final approval, analytics.
- **Buyer Dept User** (HR / Legal / Finance / Procurement): reviews only their own
  department's routed documents; read-only on vendor data; Approve / Reject /
  Request changes / Flag-to-admin.
- **Vendor**: invite-only signup, onboarding form, document upload (all in one go),
  real-time status, resubmit with clarification.

RBAC is enforced server-side in every page and Server Action via
`requireRole` / `requireDept` (route) and per-caller query scoping (data). Any
out-of-role route access returns the dedicated `/unauthorized` screen.

## Notes
- This is a prototype: file uploads are mocked (filename recorded, no bytes stored),
  emails are simulated (shown in-app), and AI auto-review is a mocked toggle.
- See **`SCOPE_NOTES.md`** for scope mapping, resolved open questions, and known gaps.
