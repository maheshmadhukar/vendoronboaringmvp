// Dummy document content for the department review screen.
// No real files are stored (see app/actions/vendor.ts's mock upload) — this
// renders structured stand-in content per document type, matching the
// wireframe's own approach (rendered text / extracted fields, no embedded file).

type Vendor = {
  legalName?: string | null;
  name: string;
  gstin?: string | null;
  address?: string | null;
};

export type RiskTone = "good" | "warn" | "bad";

export type RichDocContent = {
  kind: "rich";
  sections: { heading: string; body: string; highlight?: string }[];
  aiRisks: { tone: RiskTone; text: string }[];
};

export type SimpleDocContent = {
  kind: "simple";
  previewLabel: string;
  fields: { label: string; value: string; tone?: RiskTone }[];
  verification: { tone: RiskTone; text: string };
};

export type DocContent = RichDocContent | SimpleDocContent;

const RICH_KEYS = new Set(["MSA", "NDA", "SLA", "COC"]);

export function isRichDocType(key: string) {
  return RICH_KEYS.has(key);
}

export function getDocumentContent(key: string, vendor: Vendor): DocContent {
  const legalName = vendor.legalName ?? vendor.name;

  switch (key) {
    case "MSA":
      return {
        kind: "rich",
        aiRisks: [
          { tone: "bad", text: "Payment terms breach MSME 45-day rule" },
          { tone: "warn", text: "Indemnity cap missing" },
        ],
        sections: [
          { heading: "1. Services & Deliverables", body: `Vendor shall provide inbound and outbound freight transportation, warehousing, and last-mile delivery services for the Buyer's Pune manufacturing facility, as described in each applicable Purchase Order issued under this Agreement.` },
          { heading: "2. Fees & Payment Terms", body: `Buyer shall pay all undisputed invoices within 60 days of receipt, subject to standard three-way matching against the Purchase Order and Goods Receipt Note.`, highlight: "Buyer shall pay all undisputed invoices within 60 days of receipt" },
          { heading: "3. Term & Termination", body: `This Agreement shall remain in effect for 12 months from the Effective Date, and may be renewed by mutual written agreement of both parties.` },
          { heading: "4. Indemnification & Liability", body: `Each party shall indemnify the other against direct losses arising from its own breach of this Agreement, negligence, or willful misconduct in the performance of its obligations.` },
          { heading: "5. Confidentiality", body: `Each party shall keep confidential all non-public information disclosed by the other party in connection with this Agreement.` },
          { heading: "6. Governing Law", body: `This Agreement shall be governed by the laws of India, and the courts at Pune shall have exclusive jurisdiction over any disputes arising hereunder.` },
        ],
      };
    case "NDA":
      return {
        kind: "rich",
        aiRisks: [
          { tone: "good", text: "Standard mutual NDA terms — matches template" },
          { tone: "warn", text: "Survival period (2 years) shorter than the standard 3-year minimum for vendors handling customer data" },
        ],
        sections: [
          { heading: "1. Definition of Confidential Information", body: `"Confidential Information" means any non-public information disclosed by either party, including but not limited to shipment volumes, customer names, pricing, and operational data.` },
          { heading: "2. Obligations of Receiving Party", body: `The Receiving Party shall use Confidential Information solely for the purpose of performing its obligations under the Agreement, and shall not disclose it to any third party without prior written consent.` },
          { heading: "3. Term of Confidentiality", body: `The obligations of confidentiality set out herein shall survive termination of this Agreement for a period of 2 years from the date of such termination.`, highlight: "The obligations of confidentiality set out herein shall survive termination of this Agreement for a period of 2 years" },
          { heading: "4. Exclusions", body: `Confidential Information does not include information that is or becomes publicly available through no fault of the Receiving Party, or is independently developed without reference to the Confidential Information.` },
          { heading: "5. Remedies", body: `Each party acknowledges that a breach of this Agreement may cause irreparable harm for which monetary damages would be an inadequate remedy, entitling the non-breaching party to seek injunctive relief.` },
        ],
      };
    case "SLA":
      return {
        kind: "rich",
        aiRisks: [
          { tone: "bad", text: "Termination notice period (30 days) is shorter than the standard 60-day minimum" },
          { tone: "warn", text: "Penalty cap (10% of monthly invoice) is below the typical 15–20% range for missed delivery SLAs" },
        ],
        sections: [
          { heading: "1. Scope of Services", body: `${legalName} ("Vendor") shall provide inbound and outbound freight transportation, warehousing, and last-mile delivery services for the Buyer's Pune manufacturing facility, as described in the applicable Purchase Order.` },
          { heading: "2. Service Levels & Penalties", body: `Vendor shall maintain a minimum on-time delivery rate of 95% measured monthly. For each percentage point below this threshold, Vendor shall credit the Buyer 2% of that month's invoice value, subject to a cap of 10% of the monthly invoice.` },
          { heading: "3. Term & Termination", body: `This Agreement shall remain in effect for 12 months from the Effective Date. Either party may terminate this Agreement for convenience with 30 days' written notice to the other party.`, highlight: "Either party may terminate this Agreement for convenience with 30 days' written notice" },
          { heading: "4. Confidentiality", body: `Each party shall keep confidential all non-public information disclosed by the other party in connection with this Agreement, and shall not disclose such information to any third party without prior written consent.` },
          { heading: "5. Governing Law", body: `This Agreement shall be governed by the laws of India, and the courts at Pune shall have exclusive jurisdiction over any disputes arising hereunder.` },
        ],
      };
    case "COC":
      return {
        kind: "rich",
        aiRisks: [
          { tone: "good", text: "Matches standard code-of-conduct template — no deviations detected" },
          { tone: "warn", text: "Subcontractor clause referenced but no subcontractor list attached yet" },
        ],
        sections: [
          { heading: "1. Ethical Business Practices", body: `Vendor shall conduct business with honesty and integrity, and shall not engage in bribery, corruption, or fraudulent practices in dealings with the Buyer or any third party.` },
          { heading: "2. Labor & Human Rights", body: `Vendor shall comply with all applicable labor laws, including prohibitions on child labor and forced labor, and shall provide fair wages and working hours to its employees.` },
          { heading: "3. Health & Safety", body: `Vendor shall maintain a safe working environment for all personnel involved in the performance of services, including drivers and warehouse staff at Buyer facilities.` },
          { heading: "4. Subcontracting & Supply Chain", body: `Vendor may engage subcontractors provided they adhere to the same code of conduct standards set out in this document, and Vendor remains fully responsible for subcontractor compliance.`, highlight: "Vendor may engage subcontractors provided they adhere to the same code of conduct standards set out in this document" },
          { heading: "5. Acknowledgement", body: `By signing below, Vendor acknowledges that it has read, understood, and agrees to comply with this Code of Conduct for the duration of its engagement with the Buyer.` },
        ],
      };
    case "PAN":
      return {
        kind: "simple",
        previewLabel: "PAN_Card.pdf",
        verification: { tone: "good", text: "Verified — matches Income Tax e-filing record" },
        fields: [
          { label: "Document type", value: "PAN (Permanent Account Number)" },
          { label: "PAN number", value: "AGFPD1234M" },
          { label: "Name on document", value: `${legalName}` },
        ],
      };
    case "GST_CERT":
      return {
        kind: "simple",
        previewLabel: "GST_Cert.pdf",
        verification: { tone: "good", text: "Verified — matches GSTIN lookup" },
        fields: [
          { label: "Document type", value: "GST registration certificate" },
          { label: "GSTIN", value: vendor.gstin ?? "27AGFPD1234M1Z8" },
          { label: "Legal name on certificate", value: `${legalName}` },
          { label: "State jurisdiction", value: "Maharashtra" },
        ],
      };
    case "BANK_STMT":
      return {
        kind: "simple",
        previewLabel: "Bank_Proof.pdf",
        verification: { tone: "warn", text: "Flagged — account holder name doesn't exactly match legal entity name" },
        fields: [
          { label: "Document type", value: "Cancelled cheque" },
          { label: "Account holder name", value: vendor.name, tone: "warn" },
          { label: "Legal entity on file", value: `${legalName}` },
          { label: "Account number", value: "•••• •••• 4471" },
          { label: "IFSC", value: "HDFC0001234" },
        ],
      };
    case "TURNOVER":
      return {
        kind: "simple",
        previewLabel: "Turnover_Proof.pdf",
        verification: { tone: "good", text: "Verified — matches audited financial statement" },
        fields: [
          { label: "Document type", value: "Audited financial statement" },
          { label: "Financial year", value: "2024-25" },
          { label: "Reported turnover", value: "₹5,00,00,000" },
          { label: "Auditor", value: "Ramesh & Associates, Chartered Accountants" },
        ],
      };
    case "COI":
      return {
        kind: "simple",
        previewLabel: "COI_2019.pdf",
        verification: { tone: "good", text: "Verified — matches MCA record" },
        fields: [
          { label: "Document type", value: "Certificate of Incorporation" },
          { label: "CIN", value: "U60232PN2015PTC123456" },
          { label: "Date of incorporation", value: "14 Mar 2015" },
          { label: "Registered office", value: vendor.address ?? "Pune, Maharashtra" },
        ],
      };
    case "AADHAAR":
      return {
        kind: "simple",
        previewLabel: "Aadhaar.pdf",
        verification: { tone: "good", text: "Verified — matches authorised signatory record" },
        fields: [
          { label: "Document type", value: "Aadhaar (Authorised Signatory)" },
          { label: "Name on document", value: "Authorised Signatory" },
          { label: "Aadhaar number", value: "XXXX XXXX 4821" },
        ],
      };
    case "VENDOR_FORM":
    default:
      return {
        kind: "simple",
        previewLabel: "Vendor_Registration_Form.pdf",
        verification: { tone: "good", text: "Verified — matches submitted business details" },
        fields: [
          { label: "Document type", value: "Vendor Registration Form" },
          { label: "Legal name", value: `${legalName}` },
          { label: "Category", value: "Facilities & operations" },
        ],
      };
  }
}

/**
 * Which content section a department's comment is actually about, if any —
 * the most recent QUESTION/CLARIFICATION/REJECT comment that named a
 * section, so the highlighted clause tracks the live conversation rather
 * than a fixed per-document-type default.
 */
export function linkedSectionIndex(
  comments: { kind: string; sectionIndex: number | null }[],
  sectionCount: number,
): number | null {
  for (let i = comments.length - 1; i >= 0; i--) {
    const c = comments[i];
    if (
      (c.kind === "QUESTION" || c.kind === "CLARIFICATION" || c.kind === "REJECT") &&
      c.sectionIndex != null && c.sectionIndex >= 0 && c.sectionIndex < sectionCount
    ) {
      return c.sectionIndex;
    }
  }
  return null;
}

/** Plain-text rendering of a document's mock content, for the client-side "Download" button. */
export function buildDocumentText(
  doc: { documentTypeName: string; vendorName: string; filename: string | null },
  content: DocContent,
): string {
  const lines = [
    doc.documentTypeName,
    `Vendor: ${doc.vendorName}`,
    `File: ${doc.filename ?? "—"}`,
    "",
  ];
  if (content.kind === "rich") {
    for (const s of content.sections) {
      lines.push(s.heading, s.body, "");
    }
  } else {
    for (const f of content.fields) {
      lines.push(`${f.label}: ${f.value}`);
    }
    lines.push("", `Verification: ${content.verification.text}`);
  }
  return lines.join("\n");
}
