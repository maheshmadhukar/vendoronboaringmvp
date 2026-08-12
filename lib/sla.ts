// SLA clock: working-day math + cutoff rules + pause/resume.

function isWeekend(d: Date) {
  const day = d.getDay();
  return day === 0 || day === 6; // Sun | Sat
}

/** Advance to the next working day at 09:00 if on a weekend or past cutoff. */
export function nextWorkingStart(from: Date, cutoffHour: number): Date {
  const d = new Date(from);
  // Docs submitted at/after cutoff count from the next working day.
  if (d.getHours() >= cutoffHour) {
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
  }
  // Friday-after-cutoff / weekend → roll to Monday.
  while (isWeekend(d)) {
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
  }
  return d;
}

/** Add N working days (skipping weekends) to a start date. */
export function addWorkingDays(start: Date, days: number): Date {
  const d = new Date(start);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    if (!isWeekend(d)) added++;
  }
  return d;
}

export function computeDueAt(
  submittedAt: Date,
  slaDays: number,
  cutoffHour: number
): { start: Date; due: Date } {
  const start = nextWorkingStart(submittedAt, cutoffHour);
  const due = addWorkingDays(start, slaDays);
  return { start, due };
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * Is this review breached right now? (only meaningful while RUNNING)
 * Compares calendar dates, not exact timestamps — a review due today isn't
 * breached until the day after, so "due today" is a real, stable, all-day
 * state instead of flipping to breached the instant the due hour passes.
 */
export function isBreached(due: Date | null, slaState: string): boolean {
  if (!due) return false;
  if (slaState === "BREACHED") return true;
  if (slaState !== "RUNNING") return false; // PAUSED/MET/PENDING don't breach
  return startOfDay(new Date()).getTime() > startOfDay(due).getTime();
}

/** Extend a due date by the paused duration when resuming. */
export function resumeDue(due: Date, pausedAt: Date): Date {
  const pausedMs = Date.now() - pausedAt.getTime();
  return new Date(due.getTime() + pausedMs);
}

/** Working days until due (0 = due today, 1 = due tomorrow working-day-wise,
 * negative = overdue by that many working days). Skips weekends both ways. */
export function workingDaysLeft(due: Date | null): number | null {
  if (!due) return null;
  const today = startOfDay(new Date());
  const target = startOfDay(due);
  if (target.getTime() === today.getTime()) return 0;
  const forward = target.getTime() > today.getTime();
  let count = 0;
  const cursor = new Date(today);
  while (cursor.getTime() !== target.getTime()) {
    cursor.setDate(cursor.getDate() + (forward ? 1 : -1));
    if (!isWeekend(cursor)) count += forward ? 1 : -1;
  }
  return count;
}

export type SlaVisual = { tone: "good" | "warn" | "bad" | "neutral"; label: string; pct: number };

/** A single glanceable SLA read-out: tone + label + elapsed-time percentage for a progress bar. */
export function slaVisual(
  startedAt: Date | null,
  due: Date | null,
  slaState: string
): SlaVisual {
  if (slaState === "MET") return { tone: "good", label: "Met", pct: 100 };
  if (slaState === "PAUSED") return { tone: "neutral", label: "Paused", pct: startedAt && due ? pctElapsed(startedAt, due) : 0 };
  if (!due) return { tone: "neutral", label: "—", pct: 0 };

  const breach = isBreached(due, slaState);
  const dl = workingDaysLeft(due);
  const pct = startedAt ? pctElapsed(startedAt, due) : 0;

  if (breach) return { tone: "bad", label: dl != null && dl < 0 ? `Breached ${Math.abs(dl)}d ago` : "Breached", pct: 100 };
  if (dl != null && dl <= 2) return { tone: "warn", label: dl <= 0 ? "Due today" : `${dl}d left`, pct };
  return { tone: "good", label: dl != null ? `${dl}d left` : "—", pct };
}

function pctElapsed(start: Date, due: Date): number {
  const total = due.getTime() - start.getTime();
  if (total <= 0) return 100;
  const elapsed = Date.now() - start.getTime();
  return Math.min(100, Math.max(0, (elapsed / total) * 100));
}

type ReviewSlaFields = { slaStartedAt: Date | null; slaDueAt: Date | null; slaState: string; everBreached: boolean };

/**
 * One glanceable SLA read-out for a single department review. A breach is
 * sticky — it shows even after the review resolves, since `everBreached` is
 * never cleared once set.
 */
export function reviewSlaVisual(r: ReviewSlaFields): SlaVisual {
  if (r.everBreached) {
    const dl = workingDaysLeft(r.slaDueAt);
    return { tone: "bad", label: dl != null && dl < 0 ? `Breached ${Math.abs(dl)}d ago` : "Breached", pct: 100 };
  }
  return slaVisual(r.slaStartedAt, r.slaDueAt, r.slaState);
}
