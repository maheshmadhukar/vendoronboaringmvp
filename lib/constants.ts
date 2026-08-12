// Shared enums-as-constants (SQLite has no native enums)

export const ROLE = { ADMIN: "ADMIN", DEPT: "DEPT", VENDOR: "VENDOR" } as const;
export type Role = (typeof ROLE)[keyof typeof ROLE];

export const DEPT = {
  HR: "HR",
  LEGAL: "LEGAL",
  FINANCE: "FINANCE",
  PROCUREMENT: "PROCUREMENT",
} as const;
export type DeptKey = (typeof DEPT)[keyof typeof DEPT];

export const DEPT_ORDER: DeptKey[] = ["PROCUREMENT", "FINANCE", "LEGAL", "HR"];

export const DEPT_LABEL: Record<string, string> = {
  HR: "HR",
  LEGAL: "Legal",
  FINANCE: "Finance",
  PROCUREMENT: "Procurement",
};

// Vendor lifecycle
export const VSTATUS = {
  INVITED: "INVITED",
  DRAFT: "DRAFT",
  SUBMITTED: "SUBMITTED",
  IN_REVIEW: "IN_REVIEW",
  CHANGES_REQUESTED: "CHANGES_REQUESTED",
  FLAGGED: "FLAGGED",
  HALTED: "HALTED",
  DEPT_APPROVED: "DEPT_APPROVED",
  FINAL_PENDING: "FINAL_PENDING",
  ONBOARDED: "ONBOARDED",
  REJECTED: "REJECTED",
} as const;

export const VSTATUS_LABEL: Record<string, string> = {
  INVITED: "Invited",
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  IN_REVIEW: "In review",
  CHANGES_REQUESTED: "Changes requested",
  FLAGGED: "Flagged to admin",
  HALTED: "Onboarding paused",
  DEPT_APPROVED: "Dept-approved",
  FINAL_PENDING: "Final approval pending",
  ONBOARDED: "Onboarded",
  REJECTED: "Rejected",
};

// tone for status chips: good | warn | bad | info | neutral
export const VSTATUS_TONE: Record<string, string> = {
  INVITED: "neutral",
  DRAFT: "neutral",
  SUBMITTED: "info",
  IN_REVIEW: "info",
  CHANGES_REQUESTED: "warn",
  FLAGGED: "warn",
  HALTED: "bad",
  DEPT_APPROVED: "info",
  FINAL_PENDING: "info",
  ONBOARDED: "good",
  REJECTED: "bad",
};

export const REVIEW_STATUS = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  CHANGES_REQUESTED: "CHANGES_REQUESTED",
  FLAGGED: "FLAGGED",
} as const;

export const REVIEW_TONE: Record<string, string> = {
  PENDING: "neutral",
  APPROVED: "good",
  REJECTED: "bad",
  CHANGES_REQUESTED: "warn",
  FLAGGED: "warn",
};

export const DOC_STATUS = {
  PENDING: "PENDING",
  SUBMITTED: "SUBMITTED",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  CHANGES_REQUESTED: "CHANGES_REQUESTED",
} as const;

// Categorized reason a document was rejected or sent back for changes.
// Stored on Document.rejectionReason; powers the rework/quality analytics.
export const REJECTION_REASON = {
  NAME_MISMATCH: "NAME_MISMATCH",
  INVALID_DOCUMENT: "INVALID_DOCUMENT",
  EXPIRED: "EXPIRED",
  ILLEGIBLE: "ILLEGIBLE",
  INCOMPLETE: "INCOMPLETE",
  WRONG_DOCUMENT: "WRONG_DOCUMENT",
  OTHER: "OTHER",
} as const;
export type RejectionReason = (typeof REJECTION_REASON)[keyof typeof REJECTION_REASON];

export const REJECTION_REASON_LABEL: Record<string, string> = {
  NAME_MISMATCH: "Name / entity mismatch",
  INVALID_DOCUMENT: "Invalid or unverifiable document",
  EXPIRED: "Expired document",
  ILLEGIBLE: "Illegible / poor scan",
  INCOMPLETE: "Incomplete information",
  WRONG_DOCUMENT: "Wrong document uploaded",
  OTHER: "Other",
};

export const REJECTION_REASON_ORDER: RejectionReason[] = [
  "NAME_MISMATCH",
  "INVALID_DOCUMENT",
  "INCOMPLETE",
  "WRONG_DOCUMENT",
  "EXPIRED",
  "ILLEGIBLE",
  "OTHER",
];

export const SLA_STATE = {
  PENDING: "PENDING",
  RUNNING: "RUNNING",
  PAUSED: "PAUSED",
  MET: "MET",
  BREACHED: "BREACHED",
} as const;

// The 6 pipeline stages shown in the end-to-end status bar
export const PIPELINE_STAGES = [
  "Request Raised",
  "Documents Submitted",
  "Department Review",
  "Final Approval",
  "Onboarded",
] as const;

// Demo login accounts (password: demo1234), shared by the login quick-fill
// and the DEMO_MODE persona switcher.
export const DEMO_PERSONAS = [
  { label: "Admin", email: "admin@buyer.com" },
  { label: "Finance Mgr", email: "adminfinance@buyer.com" },
  { label: "Legal Mgr", email: "adminlegal@buyer.com" },
  { label: "HR Mgr", email: "adminhr@buyer.com" },
  { label: "Vendor (Anugrah)", email: "karan@anugrahfreight.in" },
] as const;
