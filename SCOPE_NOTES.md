# Scope Mapping & Build Notes

This document accompanies the MVP build, as required by the deliverable. It covers
(a) wireframe/scope conflicts found, (b) how each **[OPEN / NEEDS DECISION]** item was
resolved, and (c) what was intentionally skipped or simplified.

## (a) Wireframe ↔ scope-doc conflicts found (flagged & resolved with you)

1. **Department model mismatch.** The wireframes' review screens were
   *Financial / Compliance / HR / Legal* (documents grouped Financial/Compliance/
   Business/Legal), but the scope's four buyer departments are **HR, Legal, Finance,
   Procurement** — "Compliance" had no matching department and "Procurement" had no
   review screen. **Resolved (your call):** use the scope's four departments and route
   documents as:
   - **Finance:** PAN, GST Certificate, Bank Statement, Turnover Proof
   - **Legal:** Certificate of Incorporation, MSA, NDA, SLA
   - **HR:** Aadhaar, Vendor Code of Conduct
   - **Procurement:** Vendor Registration Form (Procurement also initiates)

2. **No Admin wireframes existed.** The wireframes covered buyer-review and vendor
   screens but not the Admin persona (configuration, access management, analytics,
   final-approval, halt) or login/unauthorized screens. Built per the scope doc with
   a matching visual design (directional, not from a wireframe).

3. **AI auto-review.** Wireframes showed AI risk flags prominently; the scope marks
   this low-confidence. **Built as a mocked toggle** (Admin → Configuration → "Enable
   AI auto-review column"); when on, the dept queue shows a mock suggestion chip. No
   real AI.

4. **Flag-to-Admin CTA** was not in the wireframes but is in scope — **added** to the
   department review screen.

## (b) [OPEN / NEEDS DECISION] resolutions

1. **Admin final approval as a distinct step** — Implemented as a separate, explicit
   gate after all departments approve. It is **toggle-able** in Admin → Configuration
   (`Require Admin final approval…`). When off, vendors auto-onboard once all four
   departments approve; when on, they enter **Final approval pending** for the Admin.

2. **End-to-end status bar visibility** — **Visible to all logged-in dept users**
   assigned to a request (shown on the dept review screen), not just dept heads.

3. **SLA breach around resubmission** — The SLA clock **pauses** when a department
   requests changes (`slaState = PAUSED`, breach excluded while paused) and **resumes**
   on the vendor's resubmission, extending the due date by the paused duration. SLA
   breach counts in analytics exclude paused clocks.

## (c) Intentionally skipped / simplified

**Simplified (prototype-level):**
- **File uploads are mocked** — filename, size and format are captured and
  format/size are validated against the configured rules (with the configured error
  message), but file bytes are not stored. "Download" links are placeholders.
- **Email is simulated** — all notifications are delivered **in-app**; the invite OTP
  is shown on the verify screen instead of being emailed.
- **Analytics are directional** — computed from seeded/live data; some metrics show
  "—" when there isn't enough data.
- **Save-as-draft** (stretch) — the application naturally persists as a DRAFT (details
  and uploads are saved as you go before Submit); there is no separate labelled draft
  workflow beyond that.
- **Notifications / SLA-nearing alerts** — in-app notifications are created on the key
  triggers (status change, resubmission, submission-to-dept). Automatic "SLA nearing"
  time-based alerts are represented by the SLA-due/breach indicators rather than a
  scheduler.

**Explicitly out of scope — NOT built (no UI or backend):**
Vendor self-registration (invite-only enforced), full vendor lifecycle / RFP, payroll,
vendor-abandons-onboarding flow, performance review / HR case management, native mobile
app, multi-language, IT/support tickets, new-department setup, "both managers on leave"
notification, admin adding departments, auto-reminders/auto-escalation, OCR/format
conversion (only the configured error message), and per-document sub-user assignment
(one vendor login handles the whole submission).

## Edge cases implemented
- **RBAC** — vertical (role) and horizontal (department) enforced at route + data
  level; verified that e.g. a Finance user cannot open the Admin area or another
  department's review (→ `/unauthorized`).
- **Read-only vendor data for buyers** — departments/admin have no write path to
  vendor-entered fields (enforced server-side, not just UI).
- **Duplicate vendor** — blocked on invite (email/name) and on GSTIN entry, with a
  clear error.
- **Unauthorized access** — dedicated `/unauthorized` screen for any out-of-role route.
- **Vendor data isolation** — a vendor only ever sees their own record; there is no
  vendor-facing route that accepts another vendor's id.
- **Empty states** — every list/detail screen has a no-data message.
- **Halt** — Admin can halt at any stage; halted onboarding blocks department actions.

## Assumptions
- Access provisioning within 3 working days is treated as a **process** SLA, not
  system-enforced (nothing in the wireframes suggested enforcing it in-app).
