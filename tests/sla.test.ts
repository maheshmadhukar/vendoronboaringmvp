import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addWorkingDays,
  computeDueAt,
  isBreached,
  nextWorkingStart,
  resumeDue,
  reviewSlaVisual,
  slaVisual,
  workingDaysLeft,
} from "@/lib/sla";

// All dates use LOCAL-time constructors (new Date(y, mIndex, d, h)) so the
// suite is timezone-stable — getHours()/getDay() read the same components back.
// Reference week: 2026-01-01 is a Thursday, so 2026-01-05 is a Monday.
const CUTOFF = 14;

afterEach(() => {
  vi.useRealTimers();
});

describe("nextWorkingStart", () => {
  it("keeps a weekday before cutoff unchanged", () => {
    const from = new Date(2026, 0, 5, 10); // Mon 10:00
    expect(nextWorkingStart(from, CUTOFF)).toEqual(new Date(2026, 0, 5, 10));
  });

  it("rolls to next day 09:00 when at/after cutoff", () => {
    const from = new Date(2026, 0, 5, 14); // Mon 14:00 (== cutoff)
    expect(nextWorkingStart(from, CUTOFF)).toEqual(new Date(2026, 0, 6, 9)); // Tue 09:00
  });

  it("rolls Friday-after-cutoff to Monday 09:00", () => {
    const from = new Date(2026, 0, 9, 15); // Fri 15:00
    expect(nextWorkingStart(from, CUTOFF)).toEqual(new Date(2026, 0, 12, 9)); // Mon 09:00
  });

  it("rolls a weekend (before cutoff) to Monday 09:00", () => {
    const from = new Date(2026, 0, 10, 10); // Sat 10:00
    expect(nextWorkingStart(from, CUTOFF)).toEqual(new Date(2026, 0, 12, 9)); // Mon 09:00
  });
});

describe("addWorkingDays", () => {
  it("skips the weekend across a 5-day span", () => {
    const start = new Date(2026, 0, 5, 10); // Mon
    expect(addWorkingDays(start, 5)).toEqual(new Date(2026, 0, 12, 10)); // next Mon
  });

  it("adds a single working day", () => {
    expect(addWorkingDays(new Date(2026, 0, 5, 10), 1)).toEqual(new Date(2026, 0, 6, 10));
  });
});

describe("computeDueAt", () => {
  it("uses distinct due dates per department SLA (Finance=7 vs default=5)", () => {
    const submitted = new Date(2026, 0, 5, 10); // Mon 10:00, before cutoff
    expect(computeDueAt(submitted, 5, CUTOFF).due).toEqual(new Date(2026, 0, 12, 10));
    expect(computeDueAt(submitted, 7, CUTOFF).due).toEqual(new Date(2026, 0, 14, 10));
  });
});

describe("isBreached", () => {
  it("breaches only while RUNNING and past the due calendar day", () => {
    vi.setSystemTime(new Date(2026, 0, 15, 12)); // Thu
    expect(isBreached(new Date(2026, 0, 12), "RUNNING")).toBe(true); // due Mon, now Thu
    expect(isBreached(new Date(2026, 0, 20), "RUNNING")).toBe(false); // due next Tue
  });

  it("treats 'due today' as not yet breached", () => {
    vi.setSystemTime(new Date(2026, 0, 15, 23)); // late on the due day
    expect(isBreached(new Date(2026, 0, 15, 9), "RUNNING")).toBe(false);
  });

  it("never breaches while PAUSED/MET/PENDING, always breaches when sticky BREACHED", () => {
    vi.setSystemTime(new Date(2026, 0, 15, 12));
    expect(isBreached(new Date(2026, 0, 12), "PAUSED")).toBe(false);
    expect(isBreached(new Date(2026, 0, 12), "MET")).toBe(false);
    expect(isBreached(new Date(2026, 0, 20), "BREACHED")).toBe(true);
    expect(isBreached(null, "RUNNING")).toBe(false);
  });
});

describe("workingDaysLeft", () => {
  it("counts forward skipping weekends", () => {
    vi.setSystemTime(new Date(2026, 0, 15, 12)); // Thu
    expect(workingDaysLeft(new Date(2026, 0, 15))).toBe(0); // due today
    expect(workingDaysLeft(new Date(2026, 0, 16))).toBe(1); // Fri
    expect(workingDaysLeft(new Date(2026, 0, 19))).toBe(2); // Mon (skips Sat/Sun)
  });

  it("returns negative working days when overdue", () => {
    vi.setSystemTime(new Date(2026, 0, 15, 12)); // Thu
    expect(workingDaysLeft(new Date(2026, 0, 13))).toBe(-2); // Tue
  });

  it("returns null with no due date", () => {
    expect(workingDaysLeft(null)).toBeNull();
  });
});

describe("resumeDue", () => {
  it("extends the due date by the paused duration", () => {
    vi.setSystemTime(new Date(2026, 0, 15, 12));
    const due = new Date(2026, 0, 12, 12);
    const pausedAt = new Date(2026, 0, 13, 12); // 2 days before 'now'
    expect(resumeDue(due, pausedAt).getTime()).toBe(due.getTime() + 2 * 864e5);
  });
});

describe("slaVisual / reviewSlaVisual", () => {
  it("reports Met and Paused states directly", () => {
    expect(slaVisual(null, null, "MET")).toEqual({ tone: "good", label: "Met", pct: 100 });
    const paused = slaVisual(new Date(2026, 0, 5), new Date(2026, 0, 12), "PAUSED");
    expect(paused.tone).toBe("neutral");
    expect(paused.label).toBe("Paused");
  });

  it("tones by working days left while RUNNING", () => {
    vi.setSystemTime(new Date(2026, 0, 15, 12)); // Thu
    expect(slaVisual(new Date(2026, 0, 5), new Date(2026, 0, 26), "RUNNING").tone).toBe("good");
    expect(slaVisual(new Date(2026, 0, 5), new Date(2026, 0, 16), "RUNNING").tone).toBe("warn"); // 1d left
    expect(slaVisual(new Date(2026, 0, 5), new Date(2026, 0, 12), "RUNNING").tone).toBe("bad"); // breached
  });

  it("keeps a sticky breach after resolution via everBreached", () => {
    vi.setSystemTime(new Date(2026, 0, 15, 12));
    const v = reviewSlaVisual({
      slaStartedAt: new Date(2026, 0, 5),
      slaDueAt: new Date(2026, 0, 12),
      slaState: "MET", // resolved...
      everBreached: true, // ...but had breached earlier
    });
    expect(v.tone).toBe("bad");
    expect(v.label).toContain("Breached");
  });
});
