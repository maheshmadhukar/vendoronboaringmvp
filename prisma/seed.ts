import "dotenv/config";
import { computeDueAt } from "../lib/sla";
import { prisma } from "./seedClient";

const PW = "demo1234";
const CUTOFF = 14;

function daysAgo(n: number) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}
function randInt(min: number, max: number) {
  return Math.floor(min + Math.random() * (max - min + 1));
}
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

type ReviewSpec = {
  status: string;
  comment?: string;
  pausedMs?: number;
  /** Days ago this review was decided (approved/rejected). Defaults derived from submit. */
  decidedDaysAgo?: number;
  /** Force this review to have missed its SLA (sticky everBreached). */
  breached?: boolean;
};

async function main() {
  // The Supabase pooler role sets a short statement_timeout; the bulk wipe and
  // large inserts can exceed it. Disable it for this (session-mode) connection.
  await prisma.$executeRawUnsafe("SET statement_timeout = 0");

  // wipe (order matters for FKs)
  await prisma.notification.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.document.deleteMany();
  await prisma.deptReview.deleteMany();
  await prisma.invite.deleteMany();
  await prisma.vendorBuyerDoc.deleteMany();
  await prisma.user.deleteMany();
  await prisma.vendor.deleteMany();
  await prisma.documentType.deleteMany();
  await prisma.buyerDocTemplate.deleteMany();
  await prisma.department.deleteMany();
  await prisma.config.deleteMany();

  await prisma.config.create({ data: { id: 1 } });

  // Departments
  const deptDefs = [
    { key: "PROCUREMENT", name: "Procurement", slaDays: 5 },
    { key: "FINANCE", name: "Finance", slaDays: 7 },
    { key: "LEGAL", name: "Legal", slaDays: 10 },
    { key: "HR", name: "HR", slaDays: 5 },
  ];
  const depts: Record<string, string> = {};
  const deptSlaDays: Record<string, number> = {};
  for (const d of deptDefs) {
    const rec = await prisma.department.create({ data: { key: d.key, name: d.name, slaDays: d.slaDays } });
    depts[d.key] = rec.id;
    deptSlaDays[d.key] = d.slaDays;
  }

  // Admin
  const adminUser = await prisma.user.create({
    data: { email: "admin@buyer.com", name: "Aarti Nair", role: "ADMIN" },
  });

  // Dept managers — one per department (Procurement has no standalone login;
  // Admin acts as the Procurement reviewer — see lib/session.ts requireDept).
  const mgr = [
    { dept: "FINANCE", email: "adminfinance@buyer.com", name: "Neha Iyer" },
    { dept: "LEGAL", email: "adminlegal@buyer.com", name: "Priya Sharma" },
    { dept: "HR", email: "adminhr@buyer.com", name: "Divya Menon" },
  ];
  const mgrByDept: Record<string, string> = {};
  for (const m of mgr) {
    const u = await prisma.user.create({
      data: { email: m.email, name: m.name, role: "DEPT", departmentId: depts[m.dept] },
    });
    await prisma.department.update({ where: { id: depts[m.dept] }, data: { managerId: u.id } });
    mgrByDept[m.dept] = u.id;
  }
  mgrByDept["PROCUREMENT"] = adminUser.id; // Admin is the Procurement reviewer.

  // Document types (routing per approved mapping)
  const docDefs = [
    { key: "VENDOR_FORM", name: "Vendor Registration Form", dept: "PROCUREMENT", helper: "PDF, max 5MB", format: "pdf" },
    { key: "PAN", name: "PAN Card", dept: "FINANCE", helper: "PDF only, max 5MB", format: "pdf" },
    { key: "GST_CERT", name: "GST Registration Certificate", dept: "FINANCE", helper: "PDF only, max 5MB", format: "pdf" },
    { key: "BANK_STMT", name: "Bank Statement / Cancelled Cheque", dept: "FINANCE", helper: "PDF only, max 5MB", format: "pdf" },
    { key: "TURNOVER", name: "Turnover Proof / Audited Financials", dept: "FINANCE", helper: "PDF only, max 10MB", format: "pdf" },
    { key: "COI", name: "Certificate of Incorporation", dept: "LEGAL", helper: "PDF only, max 5MB", format: "pdf" },
    { key: "MSA", name: "Master Service Agreement (MSA)", dept: "LEGAL", helper: "PDF, max 10MB", format: "pdf" },
    { key: "NDA", name: "Non-Disclosure Agreement (NDA)", dept: "LEGAL", helper: "PDF, max 5MB", format: "pdf" },
    { key: "SLA", name: "Service Level Agreement (SLA)", dept: "LEGAL", helper: "PDF, max 5MB", format: "pdf" },
    { key: "AADHAAR", name: "Aadhaar (Authorised Signatory)", dept: "HR", helper: "JPEG only, max 5MB", format: "jpeg" },
    { key: "COC", name: "Vendor Code of Conduct (signed)", dept: "HR", helper: "PDF, max 5MB", format: "pdf" },
  ];
  const docTypes: Record<string, { id: string; dept: string; name: string }> = {};
  let order = 0;
  for (const d of docDefs) {
    const rec = await prisma.documentType.create({
      data: {
        key: d.key, name: d.name, departmentKey: d.dept,
        acceptedFormats: d.format,
        maxSizeMb: d.key === "TURNOVER" || d.key === "MSA" ? 10 : 5,
        order: order++, helperText: d.helper,
      },
    });
    docTypes[d.key] = { id: rec.id, dept: d.dept, name: d.name };
  }
  const allDocKeys = Object.keys(docTypes);
  const deptOfDocKey = (k: string) => docTypes[k].dept;

  // Buyer document templates (sent to vendors at invite time, read-only on their side)
  const buyerDocDefs = [
    { key: "MSA", name: "Master Service Agreement (MSA)", dept: "LEGAL", filename: "MSA_Template_v1.pdf", sizeKb: 184 },
    { key: "NDA", name: "Non-Disclosure Agreement (NDA)", dept: "LEGAL", filename: "NDA_Template_v1.pdf", sizeKb: 96 },
  ];
  const buyerDocTemplates: Record<string, string> = {};
  let buyerDocOrder = 0;
  for (const d of buyerDocDefs) {
    const rec = await prisma.buyerDocTemplate.create({
      data: {
        key: d.key, name: d.name, departmentKey: d.dept, active: true, order: buyerDocOrder++,
        filename: d.filename, storedPath: `/templates/${d.key}/${d.filename}`, sizeKb: d.sizeKb, uploadedAt: daysAgo(30),
      },
    });
    buyerDocTemplates[d.key] = rec.id;
  }

  const CATEGORIES = [
    "Facilities & operations", "IT & software", "Logistics & transport",
    "Professional services", "Manufacturing & supply", "Staffing & HR",
  ] as const;
  const REASONS = ["NAME_MISMATCH", "INVALID_DOCUMENT", "INCOMPLETE", "WRONG_DOCUMENT", "EXPIRED", "ILLEGIBLE"] as const;

  // ---- Vendor factory ----
  async function makeVendor(opts: {
    name: string;
    email?: string;
    withAccount?: boolean;
    accountName?: string;
    status: string;
    createdDaysAgo?: number;
    registeredDaysAgo?: number;
    startedDaysAgo?: number;
    submittedDaysAgo?: number;
    onboardedDaysAgo?: number;
    value?: number;
    category?: string;
    reviews?: Record<string, ReviewSpec>;
    docOverrides?: Record<string, string>;
    docReasons?: Record<string, string>; // per doc key → rejection reason
    docRevisions?: Record<string, number>;
    createdByProc?: boolean;
    /** Emit CLARIFICATION/RESUBMIT/REJECT comment threads + audit rows for rework analytics. */
    emitRework?: boolean;
  }) {
    const submittedAt = opts.submittedDaysAgo != null ? daysAgo(opts.submittedDaysAgo) : null;
    // Coherent timeline: created ≤ registered ≤ started ≤ submitted.
    const createdDaysAgo = opts.createdDaysAgo ?? (opts.submittedDaysAgo != null ? opts.submittedDaysAgo + randInt(3, 9) : 2);
    const registeredDaysAgo = opts.registeredDaysAgo ?? Math.max(0, createdDaysAgo - randInt(1, 3));
    const startedDaysAgo = opts.startedDaysAgo ?? Math.max(0, registeredDaysAgo - randInt(0, 2));
    const hasRegistered = opts.status !== "INVITED";
    const hasStarted = hasRegistered && opts.status !== "DRAFT_REGISTERED";
    const effStatus = opts.status === "DRAFT_REGISTERED" || opts.status === "DRAFT_STARTED" ? "DRAFT" : opts.status;

    const vendor = await prisma.vendor.create({
      data: {
        name: opts.name,
        legalName: opts.name + " Pvt Ltd",
        address: "MIDC Industrial Area, Pune, Maharashtra 411019",
        phone: "+91 98200 " + randInt(10000, 99999),
        bankAccount: "HDFC •••• " + randInt(1000, 9999),
        contactPerson: opts.accountName ?? "Authorised Signatory",
        gstin: "27" + Math.random().toString(36).slice(2, 12).toUpperCase(),
        turnover: opts.value ?? 5000000,
        companyEmail: opts.email ?? null,
        category: opts.category ?? "Facilities & operations",
        valueAmount: opts.value ?? null,
        status: effStatus,
        createdAt: daysAgo(createdDaysAgo),
        registeredAt: hasRegistered ? daysAgo(registeredDaysAgo) : null,
        onboardingStartedAt: hasStarted ? daysAgo(startedDaysAgo) : null,
        submittedAt,
        onboardedAt: opts.onboardedDaysAgo != null ? daysAgo(opts.onboardedDaysAgo) : null,
        createdById: opts.createdByProc ? adminUser.id : null,
      },
    });

    if (opts.withAccount && opts.email) {
      await prisma.user.create({
        data: {
          email: opts.email.toLowerCase(), name: opts.accountName ?? opts.name,
          role: "VENDOR", vendorId: vendor.id, active: true,
        },
      });
    }

    const docIdByKey: Record<string, string> = {};

    // Documents (only once submitted)
    if (submittedAt) {
      for (const key of allDocKeys) {
        const st = opts.docOverrides?.[key] ?? "SUBMITTED";
        // Uploaded during the preparation window: between "started" (more days ago)
        // and "submitted" (fewer days ago). daysAgo is larger the further back in time.
        const uploadedAt = daysAgo(randInt(opts.submittedDaysAgo!, Math.max(opts.submittedDaysAgo!, startedDaysAgo)));
        const rec = await prisma.document.create({
          data: {
            vendorId: vendor.id, documentTypeId: docTypes[key].id,
            filename: `${key.toLowerCase()}.pdf`, storedPath: `/uploads/demo/${key.toLowerCase()}.pdf`,
            sizeKb: randInt(240, 1040),
            status: st, uploadedAt,
            reviewNote: st === "CHANGES_REQUESTED" || st === "REJECTED" ? "Name mismatch — please re-upload." : null,
            rejectionReason: (st === "CHANGES_REQUESTED" || st === "REJECTED")
              ? (opts.docReasons?.[key] ?? pick(REASONS))
              : null,
            revisionCount: opts.docRevisions?.[key] ?? 0,
          },
        });
        docIdByKey[key] = rec.id;
      }

      // Dept reviews
      for (const [key, id] of Object.entries(depts)) {
        const r: ReviewSpec = opts.reviews?.[key] ?? { status: "PENDING" };
        const { start, due } = computeDueAt(submittedAt, deptSlaDays[key], CUTOFF);
        let slaState = "RUNNING";
        if (r.status === "APPROVED" || r.status === "REJECTED") slaState = "MET";
        else if (r.status === "CHANGES_REQUESTED") slaState = "PAUSED";
        const decided = r.status === "APPROVED" || r.status === "REJECTED";
        const decidedAt = decided
          ? (r.decidedDaysAgo != null ? daysAgo(r.decidedDaysAgo) : daysAgo(Math.max(0, opts.submittedDaysAgo! - randInt(1, 5))))
          : null;
        await prisma.deptReview.create({
          data: {
            vendorId: vendor.id, departmentId: id, status: r.status,
            comment: r.comment ?? null, slaStartedAt: start, slaDueAt: due,
            slaState, pausedMs: r.pausedMs ?? 0,
            slaPausedAt: r.status === "CHANGES_REQUESTED" ? daysAgo(1) : null,
            decidedById: r.status !== "PENDING" ? mgrByDept[key] : null,
            decidedAt,
            everBreached: !!r.breached,
          },
        });
      }
    }

    // Rework threads + audit rows (rejection/clarification/resubmit history).
    if (opts.emitRework && submittedAt) {
      for (const key of allDocKeys) {
        const st = opts.docOverrides?.[key];
        const deptKey = deptOfDocKey(key);
        const deptId = depts[deptKey];
        const authorId = mgrByDept[deptKey];
        const reason = opts.docReasons?.[key];
        const askedDaysAgo = Math.max(1, opts.submittedDaysAgo! - randInt(1, 3));
        if (st === "REJECTED") {
          await prisma.comment.create({
            data: {
              vendorId: vendor.id, departmentId: deptId, documentId: docIdByKey[key], authorId,
              body: reason ? `Rejected — ${reason.toLowerCase().replace(/_/g, " ")}.` : "Rejected.",
              kind: "REJECT", createdAt: daysAgo(askedDaysAgo),
            },
          });
          await prisma.auditLog.create({ data: { actorId: authorId, action: "REJECT_DOCUMENT", targetType: "VENDOR", targetId: vendor.id, meta: docTypes[key].name, createdAt: daysAgo(askedDaysAgo) } });
        } else if (st === "CHANGES_REQUESTED") {
          await prisma.comment.create({
            data: {
              vendorId: vendor.id, departmentId: deptId, documentId: docIdByKey[key], authorId,
              body: "Please re-upload — details don't match our records.",
              kind: "CLARIFICATION", createdAt: daysAgo(askedDaysAgo),
            },
          });
          await prisma.auditLog.create({ data: { actorId: authorId, action: "REQUEST_CHANGES_DOCUMENT", targetType: "VENDOR", targetId: vendor.id, meta: docTypes[key].name, createdAt: daysAgo(askedDaysAgo) } });
          // If the vendor already resubmitted (revisionCount > 0), close the loop.
          const revs = opts.docRevisions?.[key] ?? 0;
          if (revs > 0) {
            const resubmitDaysAgo = Math.max(0, askedDaysAgo - randInt(1, 3));
            await prisma.comment.create({
              data: {
                vendorId: vendor.id, documentId: docIdByKey[key], authorId: adminUser.id,
                body: `Resubmitted "${docTypes[key].name}".`, kind: "RESUBMIT", createdAt: daysAgo(resubmitDaysAgo),
              },
            });
          }
        }
      }
    }
    return vendor;
  }

  // ============================================================
  // Story vendors (drive the dashboard + dept queue demos)
  // ============================================================

  // Anugrah — active vendor account, one dept requested changes (resubmission demo)
  const anugrah = await makeVendor({
    name: "Anugrah Freight Solutions",
    email: "karan@anugrahfreight.in",
    accountName: "Karan Desai",
    withAccount: true,
    status: "CHANGES_REQUESTED",
    submittedDaysAgo: 4,
    value: 1800000,
    category: "Logistics & transport",
    reviews: {
      PROCUREMENT: { status: "APPROVED", comment: "Vendor details verified.", decidedDaysAgo: 3 },
      FINANCE: { status: "CHANGES_REQUESTED", comment: "Bank proof name doesn't match legal entity — please re-upload." },
      LEGAL: { status: "PENDING" },
      HR: { status: "PENDING" },
    },
    docOverrides: { BANK_STMT: "CHANGES_REQUESTED" },
    docReasons: { BANK_STMT: "NAME_MISMATCH" },
    docRevisions: { BANK_STMT: 1 },
    emitRework: true,
  });

  // Demo: Legal asks a plain clarification question on Anugrah's SLA doc —
  // no resubmission needed, just a Q&A the vendor can reply to inline.
  const anugrahSla = await prisma.document.findFirst({
    where: { vendorId: anugrah.id, documentTypeId: docTypes.SLA.id },
  });
  if (anugrahSla) {
    await prisma.comment.create({
      data: {
        vendorId: anugrah.id, departmentId: depts.LEGAL, documentId: anugrahSla.id,
        authorId: mgrByDept.LEGAL,
        body: "Could you confirm the termination notice period matches our standard 30-day terms?",
        kind: "QUESTION", sectionIndex: 2, createdAt: daysAgo(2),
      },
    });
  }

  // Northline — fresh submission, all depts pending
  const northline = await makeVendor({
    name: "Northline Steel Components",
    email: "ops@northlinesteel.in",
    accountName: "Meera Joshi",
    withAccount: false,
    status: "IN_REVIEW",
    submittedDaysAgo: 1,
    value: 2400000,
    category: "Manufacturing & supply",
    reviews: { PROCUREMENT: { status: "PENDING" }, FINANCE: { status: "PENDING" }, LEGAL: { status: "PENDING" }, HR: { status: "PENDING" } },
  });

  // Attach the buyer's MSA + NDA templates to a couple of vendors, as if sent at invite time.
  for (const templateId of Object.values(buyerDocTemplates)) {
    await prisma.vendorBuyerDoc.create({ data: { vendorId: anugrah.id, templateId } });
    await prisma.vendorBuyerDoc.create({
      data: { vendorId: northline.id, templateId, signedAt: daysAgo(1), signedByName: "Meera Joshi" },
    });
  }

  // Vertex — all depts approved, awaiting Admin final approval
  await makeVendor({
    name: "Vertex Cloud Systems",
    email: "accounts@vertexcloud.io",
    withAccount: false,
    createdByProc: true,
    status: "FINAL_PENDING",
    submittedDaysAgo: 6,
    value: 3200000,
    category: "IT & software",
    reviews: {
      PROCUREMENT: { status: "APPROVED", decidedDaysAgo: 4 }, FINANCE: { status: "APPROVED", decidedDaysAgo: 3 },
      LEGAL: { status: "APPROVED", decidedDaysAgo: 2 }, HR: { status: "APPROVED", decidedDaysAgo: 3 },
    },
    docOverrides: Object.fromEntries(allDocKeys.map((k) => [k, "APPROVED"])),
  });

  // Kestrel — mixed review, some departments done, some still pending
  await makeVendor({
    name: "Kestrel Staffing Partners",
    email: "hello@kestrelstaffing.in",
    withAccount: false,
    createdByProc: true,
    status: "IN_REVIEW",
    submittedDaysAgo: 5,
    value: 900000,
    category: "Staffing & HR",
    reviews: {
      PROCUREMENT: { status: "APPROVED" },
      FINANCE: { status: "APPROVED" },
      LEGAL: { status: "PENDING" }, HR: { status: "PENDING" },
    },
  });

  // Sterling & Orbit — onboarded (analytics)
  await makeVendor({
    name: "Sterling Logistics", email: "finance@sterlinglog.in", withAccount: false, createdByProc: true,
    status: "ONBOARDED", submittedDaysAgo: 20, onboardedDaysAgo: 11, value: 1800000,
    reviews: { PROCUREMENT: { status: "APPROVED" }, FINANCE: { status: "APPROVED" }, LEGAL: { status: "APPROVED" }, HR: { status: "APPROVED" } },
    docOverrides: Object.fromEntries(allDocKeys.map((k) => [k, "APPROVED"])),
  });
  await makeVendor({
    name: "Orbit Supplies", email: "ap@orbitsupplies.in", withAccount: false, createdByProc: true,
    status: "ONBOARDED", submittedDaysAgo: 30, onboardedDaysAgo: 22, value: 650000,
    reviews: { PROCUREMENT: { status: "APPROVED" }, FINANCE: { status: "APPROVED" }, LEGAL: { status: "APPROVED" }, HR: { status: "APPROVED" } },
    docOverrides: Object.fromEntries(allDocKeys.map((k) => [k, "APPROVED"])),
  });

  // Meridian — INVITED with an open invite link (demo the signup/OTP flow)
  const meridian = await makeVendor({
    name: "Meridian Packaging Co.", email: "contact@meridianpack.in", withAccount: false,
    createdByProc: true, status: "INVITED", createdDaysAgo: 2,
  });
  const inviteToken = "demo-invite-meridian";
  await prisma.invite.create({
    data: {
      email: "contact@meridianpack.in", token: inviteToken, vendorId: meridian.id,
      createdById: adminUser.id, role: "VENDOR", expiresAt: new Date(Date.now() + 7 * 864e5),
    },
  });
  // NDA is always sent; MSA wasn't selected for this invite — demos the NDA-only shape.
  if (buyerDocTemplates["NDA"]) {
    await prisma.vendorBuyerDoc.create({ data: { vendorId: meridian.id, templateId: buyerDocTemplates["NDA"] } });
  }

  // Frontier Textiles — active vendor account, registered & started onboarding
  // but hasn't submitted (no documents yet) — demos the document-upload flow.
  await makeVendor({
    name: "Frontier Textiles",
    email: "priya@frontiertextiles.in",
    accountName: "Priya Nair",
    withAccount: true,
    status: "DRAFT_STARTED",
    createdDaysAgo: 3,
  });

  // ============================================================
  // Generated historical vendors (~12 months) for analytics depth
  // ============================================================
  // Kept comfortably above the max possible number of generated vendors
  // (~52 across all cohorts below) so genIndex never wraps around and no
  // two generated vendors ever share a first name (was a real bug: with
  // only 34 names, look-alike pairs like "Blue Ridge Industries" (onboarded)
  // and "Blue Ridge Technologies" (invited) were guaranteed).
  const FIRST = [
    "Apex", "Blue Ridge", "Crestline", "Deccan", "Everest", "Falcon", "Ganges", "Harbour",
    "Indus", "Jupiter", "Kaveri", "Lotus", "Meghna", "Nimbus", "Orion", "Pioneer", "Quantum",
    "Rockwell", "Summit", "Tandem", "United", "Vega", "Westwind", "Yamuna", "Zenith", "Aravali",
    "Beacon", "Cobalt", "Delta", "Emerald", "Frontier", "Granite", "Horizon", "Ivory",
    "Junction", "Keystone", "Lighthouse", "Meridian West", "Northgate", "Oakridge", "Prospect",
    "Redwood", "Silverline", "Trailhead", "Umbra", "Vantage", "Wavecrest", "Anchor", "Bellwood",
    "Cascade", "Driftwood", "Elmhurst", "Fairview", "Glenmark", "Highfield", "Ironwood", "Larkspur",
    "Mosswood", "Newbridge",
  ];
  const LAST = ["Industries", "Solutions", "Technologies", "Enterprises", "Logistics", "Systems", "Traders", "Associates", "Works", "Supplies"];

  let genIndex = 0;

  const APPROVE_ALL = {
    PROCUREMENT: { status: "APPROVED" }, FINANCE: { status: "APPROVED" },
    LEGAL: { status: "APPROVED" }, HR: { status: "APPROVED" },
  } as const;
  const APPROVED_DOCS = Object.fromEntries(allDocKeys.map((k) => [k, "APPROVED"]));

  // Onboarded cohort spread across ~12 months (drives trends + onboarded value/time).
  for (const [lo, hi] of [[20, 45], [46, 80], [81, 120], [121, 165], [166, 220], [221, 280], [281, 360]] as const) {
    const n = randInt(2, 4);
    for (let i = 0; i < n; i++) {
      const submittedDaysAgo = randInt(lo, hi);
      const onboardedDaysAgo = Math.max(1, submittedDaysAgo - randInt(3, 14));
      const breached = Math.random() < 0.25;
      const name = `${FIRST[genIndex]} ${pick(LAST)}`;
      genIndex++;
      await makeVendor({
        name,
        email: `contact@${name.toLowerCase().replace(/[^a-z]/g, "")}${genIndex}.in`,
        createdByProc: true,
        status: "ONBOARDED",
        submittedDaysAgo,
        onboardedDaysAgo,
        value: randInt(4, 60) * 100000,
        category: pick(CATEGORIES),
        reviews: {
          PROCUREMENT: { status: "APPROVED", decidedDaysAgo: Math.max(onboardedDaysAgo, submittedDaysAgo - randInt(1, 4)) },
          FINANCE: { status: "APPROVED", decidedDaysAgo: Math.max(onboardedDaysAgo, submittedDaysAgo - randInt(1, 6)), breached: breached && Math.random() < 0.5 },
          LEGAL: { status: "APPROVED", decidedDaysAgo: Math.max(onboardedDaysAgo, submittedDaysAgo - randInt(1, 7)), breached: breached && Math.random() < 0.5 },
          HR: { status: "APPROVED", decidedDaysAgo: Math.max(onboardedDaysAgo, submittedDaysAgo - randInt(1, 5)) },
        },
        docOverrides: APPROVED_DOCS,
      });
    }
  }

  // Rejected cohort (acceptance rate < 100%, rejection reasons populated).
  for (let i = 0; i < 5; i++) {
    const submittedDaysAgo = randInt(15, 300);
    const badKey = pick(["BANK_STMT", "GST_CERT", "COI", "TURNOVER", "PAN"] as const);
    const badDept = deptOfDocKey(badKey);
    const reason = pick(REASONS);
    const name = `${FIRST[genIndex]} ${pick(LAST)}`;
    genIndex++;
    const reviews: Record<string, ReviewSpec> = { PROCUREMENT: { status: "APPROVED", decidedDaysAgo: submittedDaysAgo - 2 }, FINANCE: { status: "APPROVED", decidedDaysAgo: submittedDaysAgo - 3 }, LEGAL: { status: "APPROVED", decidedDaysAgo: submittedDaysAgo - 3 }, HR: { status: "APPROVED", decidedDaysAgo: submittedDaysAgo - 2 } };
    reviews[badDept] = { status: "REJECTED", comment: "Document could not be verified.", decidedDaysAgo: submittedDaysAgo - randInt(2, 6), breached: Math.random() < 0.3 };
    await makeVendor({
      name,
      email: `contact@${name.toLowerCase().replace(/[^a-z]/g, "")}${genIndex}.in`,
      createdByProc: true,
      status: "REJECTED",
      submittedDaysAgo,
      value: randInt(3, 40) * 100000,
      category: pick(CATEGORIES),
      reviews,
      docOverrides: { ...APPROVED_DOCS, [badKey]: "REJECTED" },
      docReasons: { [badKey]: reason },
      emitRework: true,
    });
  }

  // Active in-progress cohort (pending approvals, SLA risk, some breached).
  for (let i = 0; i < 6; i++) {
    const submittedDaysAgo = randInt(1, 9);
    const breach = i % 3 === 0;
    const name = `${FIRST[genIndex]} ${pick(LAST)}`;
    genIndex++;
    const reviews: Record<string, ReviewSpec> = {
      PROCUREMENT: { status: pick(["APPROVED", "PENDING"]), decidedDaysAgo: submittedDaysAgo - 1 },
      FINANCE: { status: "PENDING", breached: breach },
      LEGAL: { status: pick(["PENDING", "APPROVED"]), decidedDaysAgo: submittedDaysAgo - 1 },
      HR: { status: "PENDING", breached: breach && i % 2 === 0 },
    };
    const v = await makeVendor({
      name,
      email: `contact@${name.toLowerCase().replace(/[^a-z]/g, "")}${genIndex}.in`,
      createdByProc: true,
      status: "IN_REVIEW",
      submittedDaysAgo,
      value: randInt(3, 50) * 100000,
      category: pick(CATEGORIES),
      reviews,
    });
    // Make breached pending reviews genuinely past-due.
    if (breach) {
      await prisma.deptReview.updateMany({
        where: { vendorId: v.id, status: "PENDING" },
        data: { slaStartedAt: daysAgo(9), slaDueAt: daysAgo(2), slaState: "RUNNING", everBreached: true },
      });
    }
  }

  // Changes-requested cohort (rework rate, resubmit turnaround).
  for (let i = 0; i < 4; i++) {
    const submittedDaysAgo = randInt(3, 40);
    const cKey = pick(["BANK_STMT", "GST_CERT", "AADHAAR", "COC"] as const);
    const cDept = deptOfDocKey(cKey);
    const resolved = Math.random() < 0.5;
    const name = `${FIRST[genIndex]} ${pick(LAST)}`;
    genIndex++;
    const reviews: Record<string, ReviewSpec> = { PROCUREMENT: { status: "APPROVED", decidedDaysAgo: submittedDaysAgo - 1 }, FINANCE: { status: "PENDING" }, LEGAL: { status: "PENDING" }, HR: { status: "PENDING" } };
    reviews[cDept] = { status: "CHANGES_REQUESTED" };
    await makeVendor({
      name,
      email: `contact@${name.toLowerCase().replace(/[^a-z]/g, "")}${genIndex}.in`,
      createdByProc: true,
      status: "CHANGES_REQUESTED",
      submittedDaysAgo,
      value: randInt(3, 45) * 100000,
      category: pick(CATEGORIES),
      reviews,
      docOverrides: { [cKey]: "CHANGES_REQUESTED" },
      docReasons: { [cKey]: pick(REASONS) },
      docRevisions: resolved ? { [cKey]: 1 } : {},
      emitRework: true,
    });
  }

  // Top-of-funnel cohort: invited (no account yet), registered-but-not-started,
  // and started-but-not-submitted — none of these have documents or reviews.
  for (let i = 0; i < 3; i++) {
    await makeVendor({ name: `${FIRST[genIndex++]} ${pick(LAST)}`, createdByProc: true, status: "INVITED", createdDaysAgo: randInt(1, 20) });
  }
  for (let i = 0; i < 3; i++) {
    await makeVendor({ name: `${FIRST[genIndex++]} ${pick(LAST)}`, createdByProc: true, status: "DRAFT_REGISTERED", createdDaysAgo: randInt(3, 30) });
  }
  for (let i = 0; i < 3; i++) {
    await makeVendor({ name: `${FIRST[genIndex++]} ${pick(LAST)}`, createdByProc: true, status: "DRAFT_STARTED", createdDaysAgo: randInt(3, 30) });
  }

  // A few seed notifications
  const karan = await prisma.user.findUnique({ where: { email: "karan@anugrahfreight.in" } });
  if (karan)
    await prisma.notification.create({
      data: { userId: karan.id, message: "Finance requested changes to your Bank Statement. Please resubmit with a comment.", kind: "STATUS", vendorId: meridian.id },
    });
  const financeMgr = await prisma.user.findUnique({ where: { email: "adminfinance@buyer.com" } });
  if (financeMgr)
    await prisma.notification.create({
      data: { userId: financeMgr.id, message: "New vendor 'Northline Steel Components' is awaiting your Finance review.", kind: "TASK" },
    });

  // Create Supabase Auth identities for every login-capable account and link
  // them via User.authUserId (all demo logins share password demo1234).
  await seedAuthUsers();

  // Upload real placeholder files to Supabase Storage for a few showcase
  // vendors so the document viewers render actual files end-to-end. The rest of
  // the seeded documents remain "legacy" records (no stored bytes) by design.
  await seedPlaceholderFiles(["Anugrah Freight Solutions", "Northline Steel Components", "Vertex Cloud Systems"]);

  const vendorCount = await prisma.vendor.count();
  console.log(`\n✅ Seed complete. ${vendorCount} vendors across ~12 months.`);
  console.log("Login (password: demo1234):");
  console.log("  Admin           admin@buyer.com");
  console.log("  Finance mgr     adminfinance@buyer.com");
  console.log("  Legal mgr       adminlegal@buyer.com");
  console.log("  HR mgr          adminhr@buyer.com");
  console.log("  Vendor          karan@anugrahfreight.in (mid-review)");
  console.log("  Vendor          priya@frontiertextiles.in (docs not uploaded yet)");
  console.log("  (Procurement has no login — sign in as Admin and use the Procurement Review nav link)");
  console.log(`\nInvite/OTP signup demo: /invite/${inviteToken}\n`);
}

/**
 * Reset Supabase Auth and create one auth user per app User, linking authUserId.
 * All demo accounts share the password `demo1234`.
 */
async function seedAuthUsers() {
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.warn("⚠️  Skipping auth users — Supabase env not set.");
    return;
  }
  const auth = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }).auth.admin;

  // Clear any pre-existing auth users (from earlier runs) for a clean reset.
  const { data: existing } = await auth.listUsers({ perPage: 1000 });
  for (const u of existing?.users ?? []) await auth.deleteUser(u.id);

  const users = await prisma.user.findMany();
  let count = 0;
  for (const u of users) {
    const { data, error } = await auth.createUser({ email: u.email, password: PW, email_confirm: true });
    if (error || !data.user) { console.warn(`  auth user failed (${u.email}): ${error?.message}`); continue; }
    await prisma.user.update({ where: { id: u.id }, data: { authUserId: data.user.id } });
    count++;
  }
  console.log(`🔑 Created ${count} Supabase Auth users (password: ${PW}).`);
}

/** Build a minimal, valid single-page PDF with the given text lines. */
function makePlaceholderPdf(lines: string[]): Buffer {
  const esc = (s: string) => s.replace(/([\\()])/g, "\\$1");
  const content =
    "BT\n/F1 16 Tf\n50 780 Td\n20 TL\n" +
    lines.map((l, i) => (i === 0 ? `(${esc(l)}) Tj` : `T* (${esc(l)}) Tj`)).join("\n") +
    "\nET";
  const objs: string[] = [];
  objs[1] = "<</Type/Catalog/Pages 2 0 R>>";
  objs[2] = "<</Type/Pages/Kids[3 0 R]/Count 1>>";
  objs[3] = "<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Resources<</Font<</F1 5 0 R>>>>/Contents 4 0 R>>";
  objs[4] = `<</Length ${Buffer.byteLength(content)}>>\nstream\n${content}\nendstream`;
  objs[5] = "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>";
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let i = 1; i < objs.length; i++) {
    offsets[i] = Buffer.byteLength(pdf);
    pdf += `${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objs.length; i++) pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<</Size ${objs.length}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

async function seedPlaceholderFiles(vendorNames: string[]) {
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.warn("⚠️  Skipping placeholder files — Supabase storage env not set.");
    return;
  }
  const storage = createClient(url, key, { auth: { persistSession: false } }).storage.from("vendor-docs");
  const vendors = await prisma.vendor.findMany({
    where: { name: { in: vendorNames } },
    include: { documents: { include: { documentType: true } } },
  });
  let count = 0;
  for (const v of vendors) {
    for (const d of v.documents) {
      const fname = (d.filename ?? `${d.documentType.key.toLowerCase()}.pdf`).replace(/[^A-Za-z0-9._-]/g, "_");
      const objectKey = `documents/${v.id}/${d.id}/${fname}`;
      const pdf = makePlaceholderPdf([
        d.documentType.name,
        `Vendor: ${v.name}`,
        `File: ${d.filename ?? "—"}`,
        "",
        "Placeholder document generated for the demo dataset.",
      ]);
      const { error } = await storage.upload(objectKey, pdf, { contentType: "application/pdf", upsert: true });
      if (error) { console.warn(`  placeholder upload failed (${v.name}/${d.documentType.key}): ${error.message}`); continue; }
      await prisma.document.update({ where: { id: d.id }, data: { storedPath: objectKey } });
      count++;
    }
  }
  console.log(`📄 Uploaded ${count} placeholder files for ${vendors.length} showcase vendors.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
