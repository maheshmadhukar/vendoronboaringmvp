// SLA clock: working-day math + cutoff rules + pause/resume.

const DAY = 24 * 60 * 60 * 1000;

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

/** Is this review breached right now? (only meaningful while RUNNING) */
export function isBreached(due: Date | null, slaState: string): boolean {
  if (!due) return false;
  if (slaState === "BREACHED") return true;
  if (slaState !== "RUNNING") return false; // PAUSED/MET/PENDING don't breach
  return Date.now() > due.getTime();
}

/** Extend a due date by the paused duration when resuming. */
export function resumeDue(due: Date, pausedAt: Date): Date {
  const pausedMs = Date.now() - pausedAt.getTime();
  return new Date(due.getTime() + pausedMs);
}

export function daysLeft(due: Date | null): number | null {
  if (!due) return null;
  return Math.ceil((due.getTime() - Date.now()) / DAY);
}
