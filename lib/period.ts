// Date-range resolution for the analytics period filter (quarter / year).

export type PeriodMode = "quarter" | "year";

export function quarterOf(date: Date): number {
  return Math.floor(date.getMonth() / 3) + 1;
}

export function quarterRange(year: number, quarter: number): { from: Date; to: Date } {
  const startMonth = (quarter - 1) * 3;
  const from = new Date(year, startMonth, 1, 0, 0, 0, 0);
  const to = new Date(year, startMonth + 3, 0, 23, 59, 59, 999); // last day of the quarter
  return { from, to };
}

export function yearRange(year: number): { from: Date; to: Date } {
  return { from: new Date(year, 0, 1, 0, 0, 0, 0), to: new Date(year, 11, 31, 23, 59, 59, 999) };
}

export type ResolvedPeriod = {
  mode: PeriodMode;
  from: Date;
  to: Date;
  label: string;
  rangeLabel: string;
  /** True when this is the current quarter/year — there is no later period to navigate to. */
  atLatest: boolean;
  prevHref: string;
  nextHref: string;
};

function fmtShort(d: Date) {
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function resolvePeriod(sp: { mode?: string; y?: string; q?: string }): ResolvedPeriod {
  const now = new Date();
  const mode: PeriodMode = sp.mode === "year" ? "year" : "quarter";

  if (mode === "year") {
    const requestedYear = sp.y ? parseInt(sp.y, 10) : now.getFullYear();
    const year = Math.min(requestedYear, now.getFullYear());
    const { from, to } = yearRange(year);
    const atLatest = year >= now.getFullYear();
    return {
      mode, from, to,
      label: `${year}`,
      rangeLabel: `${fmtShort(from)} – ${fmtShort(to)}`,
      atLatest,
      prevHref: `?mode=year&y=${year - 1}`,
      nextHref: atLatest ? "" : `?mode=year&y=${year + 1}`,
    };
  }

  // quarter (default)
  const nowYear = now.getFullYear();
  const nowQuarter = quarterOf(now);
  const requestedYear = sp.y ? parseInt(sp.y, 10) : nowYear;
  const requestedQuarter = sp.q ? parseInt(sp.q, 10) : nowQuarter;
  const beyondNow = requestedYear > nowYear || (requestedYear === nowYear && requestedQuarter > nowQuarter);
  const year = beyondNow ? nowYear : requestedYear;
  const quarter = beyondNow ? nowQuarter : requestedQuarter;
  const { from, to } = quarterRange(year, quarter);
  const prevQ = quarter === 1 ? 4 : quarter - 1;
  const prevY = quarter === 1 ? year - 1 : year;
  const nextQ = quarter === 4 ? 1 : quarter + 1;
  const nextY = quarter === 4 ? year + 1 : year;
  const atLatest = year === nowYear && quarter === nowQuarter;
  return {
    mode, from, to,
    label: `Q${quarter} ${year}`,
    rangeLabel: `${fmtShort(from)} – ${fmtShort(to)}`,
    atLatest,
    prevHref: `?mode=quarter&y=${prevY}&q=${prevQ}`,
    nextHref: atLatest ? "" : `?mode=quarter&y=${nextY}&q=${nextQ}`,
  };
}

export function inRange(date: Date | null | undefined, from: Date, to: Date): boolean {
  if (!date) return false;
  const t = date.getTime();
  return t >= from.getTime() && t <= to.getTime();
}

/**
 * The immediately-preceding window of equal length, for period-over-period
 * KPI deltas (e.g. "vs last quarter"). Works for any mode: the previous window
 * ends just before `from` and spans the same duration.
 */
export function previousPeriod(period: { from: Date; to: Date }): { from: Date; to: Date } {
  const len = period.to.getTime() - period.from.getTime();
  const to = new Date(period.from.getTime() - 1);
  const from = new Date(to.getTime() - len);
  return { from, to };
}

// Rolling trailing-window filter for the Status Dashboard (distinct from the
// calendar-aligned quarter/year period above, used by Analytics).
export type DashboardRangeMode = "30d" | "90d" | "6m" | "1y";

const DASHBOARD_RANGE_DAYS: Record<DashboardRangeMode, number> = {
  "30d": 30, "90d": 90, "6m": 182, "1y": 365,
};

export const DASHBOARD_RANGE_LABEL: Record<DashboardRangeMode, string> = {
  "30d": "Last 30 days", "90d": "Last 90 days", "6m": "Last 6 months", "1y": "Last 1 year",
};

export function resolveDashboardRange(mode?: string): { mode: DashboardRangeMode; from: Date } {
  const m: DashboardRangeMode = mode === "30d" || mode === "6m" || mode === "1y" ? mode : "90d";
  return { mode: m, from: new Date(Date.now() - DASHBOARD_RANGE_DAYS[m] * 86400000) };
}
