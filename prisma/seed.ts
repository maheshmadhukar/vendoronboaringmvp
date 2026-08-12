import bcrypt from "bcryptjs";
import { computeDueAt } from "../lib/sla";
import { prisma } from "../lib/prisma";

const PW = "demo1234";
const CUTOFF = 14;

function daysAgo(n: number) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

async function main() {
  // wipe (order matters for FKs)
  await prisma.notification.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.document.deleteMany();
  await prisma.deptReview.deleteMany();
  await prisma.otpCode.deleteMany();
  await prisma.invite.deleteMany();
  await prisma.vendorBuyerDoc.deleteMany();
  await prisma.user.deleteMany();
  await prisma.vendor.deleteMany();
  await prisma.documentType.deleteMany();
  await prisma.buyerDocTemplate.deleteMany();
  await prisma.department.deleteMany();
  await prisma.config.deleteMany();

  const hash = await bcrypt.hash(PW, 10);

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
  await prisma.user.create({
    data: { email: "admin@buyer.com", name: "Aarti Nair", role: "ADMIN", passwordHash: hash },
  });

  // Dept managers — one per department (Procurement has no standalone login;
  // Admin acts as the Procurement reviewer — see lib/session.ts requireDept).
  const mgr = [
    { dept: "FINANCE", email: "adminfinance@buyer.com", name: "Neha Iyer" },
    { dept: "LEGAL", email: "adminlegal@buyer.com", name: "Priya Sharma" },
    { dept: "HR", email: "adminhr@buyer.com", name: "Divya Menon" },
  ];
  for (const m of mgr) {
    const u = await prisma.user.create({
      data: { email: m.email, name: m.name, role: "DEPT", passwordHash: hash, departmentId: depts[m.dept] },
    });
    await prisma.department.update({ where: { id: depts[m.dept] }, data: { managerId: u.id } });
  }

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
        mandatory: true, order: order++, helperText: d.helper,
      },
    });
    docTypes[d.key] = { id: rec.id, dept: d.dept, name: d.name };
  }
  const allDocKeys = Object.keys(docTypes);

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

  // ---- Vendor factory ----
  async function makeVendor(opts: {
    name: string;
    email?: string;
    withAccount?: boolean;
    accountName?: string;
    status: string;
    submittedDaysAgo?: number;
    onboardedDaysAgo?: number;
    value?: number;
    reviews?: Record<string, { status: string; comment?: string; pausedMs?: number }>;
    docOverrides?: Record<string, string>;
    createdByProc?: boolean;
  }) {
    const proc = await prisma.user.findUnique({ where: { email: "admin@buyer.com" } });
    const submittedAt = opts.submittedDaysAgo != null ? daysAgo(opts.submittedDaysAgo) : null;
    const vendor = await prisma.vendor.create({
      data: {
        name: opts.name,
        legalName: opts.name + " Pvt Ltd",
        address: "MIDC Industrial Area, Pune, Maharashtra 411019",
        phone: "+91 98200 " + Math.floor(10000 + Math.random() * 89999),
        bankAccount: "HDFC •••• " + Math.floor(1000 + Math.random() * 8999),
        contactPerson: opts.accountName ?? "Authorised Signatory",
        gstin: "27" + Math.random().toString(36).slice(2, 12).toUpperCase(),
        turnover: opts.value ?? 5000000,
        companyEmail: opts.email ?? null,
        category: "Facilities & operations",
        valueAmount: opts.value ?? null,
        status: opts.status,
        submittedAt,
        onboardedAt: opts.onboardedDaysAgo != null ? daysAgo(opts.onboardedDaysAgo) : null,
        createdById: opts.createdByProc ? proc?.id : null,
      },
    });

    if (opts.withAccount && opts.email) {
      await prisma.user.create({
        data: {
          email: opts.email.toLowerCase(), name: opts.accountName ?? opts.name,
          role: "VENDOR", passwordHash: hash, vendorId: vendor.id, active: true,
        },
      });
    }

    // Documents (only once submitted)
    if (submittedAt) {
      for (const key of allDocKeys) {
        const st = opts.docOverrides?.[key] ?? "SUBMITTED";
        await prisma.document.create({
          data: {
            vendorId: vendor.id, documentTypeId: docTypes[key].id,
            filename: `${key.toLowerCase()}.pdf`, storedPath: `/uploads/demo/${key.toLowerCase()}.pdf`,
            sizeKb: 240 + Math.floor(Math.random() * 800),
            status: st, uploadedAt: submittedAt,
            reviewNote: st === "CHANGES_REQUESTED" ? "Name mismatch — please re-upload." : null,
          },
        });
      }
      // Dept reviews
      for (const [key, id] of Object.entries(depts)) {
        const r = opts.reviews?.[key] ?? { status: "PENDING" };
        const { start, due } = computeDueAt(submittedAt, deptSlaDays[key], CUTOFF);
        let slaState = "RUNNING";
        if (r.status === "APPROVED" || r.status === "REJECTED") slaState = "MET";
        else if (r.status === "CHANGES_REQUESTED") slaState = "PAUSED";
        await prisma.deptReview.create({
          data: {
            vendorId: vendor.id, departmentId: id, status: r.status,
            comment: r.comment ?? null, slaStartedAt: start, slaDueAt: due,
            slaState, pausedMs: r.pausedMs ?? 0,
            slaPausedAt: r.status === "CHANGES_REQUESTED" ? daysAgo(1) : null,
            decidedById: r.status !== "PENDING" ? proc?.id : null,
          },
        });
      }
    }
    return vendor;
  }

  // Anugrah — active vendor account, one dept requested changes (resubmission demo)
  const anugrah = await makeVendor({
    name: "Anugrah Freight Solutions",
    email: "karan@anugrahfreight.in",
    accountName: "Karan Desai",
    withAccount: true,
    status: "CHANGES_REQUESTED",
    submittedDaysAgo: 4,
    value: 1800000,
    reviews: {
      PROCUREMENT: { status: "APPROVED", comment: "Vendor details verified." },
      FINANCE: { status: "CHANGES_REQUESTED", comment: "Bank proof name doesn't match legal entity — please re-upload." },
      LEGAL: { status: "PENDING" },
      HR: { status: "PENDING" },
    },
    docOverrides: { BANK_STMT: "CHANGES_REQUESTED" },
  });

  // Northline — fresh submission, all depts pending
  const northline = await makeVendor({
    name: "Northline Steel Components",
    email: "ops@northlinesteel.in",
    accountName: "Meera Joshi",
    withAccount: true,
    status: "IN_REVIEW",
    submittedDaysAgo: 1,
    value: 2400000,
    reviews: { PROCUREMENT: { status: "PENDING" }, FINANCE: { status: "PENDING" }, LEGAL: { status: "PENDING" }, HR: { status: "PENDING" } },
  });

  // Attach the buyer's MSA + NDA templates to a couple of vendors, as if sent at invite time.
  // Northline has signed both (demo "Done" state); Anugrah hasn't signed either yet (demo "In progress" state).
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
    reviews: {
      PROCUREMENT: { status: "APPROVED" }, FINANCE: { status: "APPROVED" },
      LEGAL: { status: "APPROVED" }, HR: { status: "APPROVED" },
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
    createdByProc: true, status: "INVITED",
  });
  const inviteToken = "demo-invite-meridian";
  const proc = await prisma.user.findUnique({ where: { email: "admin@buyer.com" } });
  await prisma.invite.create({
    data: {
      email: "contact@meridianpack.in", token: inviteToken, vendorId: meridian.id,
      createdById: proc?.id, role: "VENDOR", expiresAt: new Date(Date.now() + 7 * 864e5),
    },
  });

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

  console.log("\n✅ Seed complete.");
  console.log("Login (password: demo1234):");
  console.log("  Admin           admin@buyer.com");
  console.log("  Finance mgr     adminfinance@buyer.com");
  console.log("  Legal mgr       adminlegal@buyer.com");
  console.log("  HR mgr          adminhr@buyer.com");
  console.log("  Vendor          karan@anugrahfreight.in");
  console.log("  (Procurement has no login — sign in as Admin and use the Procurement Review nav link)");
  console.log(`\nInvite/OTP signup demo: /invite/${inviteToken}\n`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
