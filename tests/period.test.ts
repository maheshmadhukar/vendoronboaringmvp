import { afterEach, describe, expect, it, vi } from "vitest";
import {
  inRange,
  previousPeriod,
  quarterOf,
  quarterRange,
  resolveDashboardRange,
  resolvePeriod,
  yearRange,
} from "@/lib/period";

afterEach(() => {
  vi.useRealTimers();
});

describe("quarterOf / quarterRange / yearRange", () => {
  it("maps months to quarters", () => {
    expect(quarterOf(new Date(2026, 0, 15))).toBe(1); // Jan
    expect(quarterOf(new Date(2026, 3, 15))).toBe(2); // Apr
    expect(quarterOf(new Date(2026, 11, 15))).toBe(4); // Dec
  });

  it("bounds a quarter to its first and last calendar day", () => {
    const { from, to } = quarterRange(2026, 1);
    expect(from).toEqual(new Date(2026, 0, 1, 0, 0, 0, 0));
    expect(to).toEqual(new Date(2026, 2, 31, 23, 59, 59, 999));
  });

  it("bounds a year to Jan 1 – Dec 31", () => {
    const { from, to } = yearRange(2026);
    expect(from).toEqual(new Date(2026, 0, 1, 0, 0, 0, 0));
    expect(to).toEqual(new Date(2026, 11, 31, 23, 59, 59, 999));
  });
});

describe("inRange", () => {
  const from = new Date(2026, 0, 1);
  const to = new Date(2026, 0, 31, 23, 59, 59, 999);
  it("is inclusive of both bounds and false for null", () => {
    expect(inRange(new Date(2026, 0, 15), from, to)).toBe(true);
    expect(inRange(from, from, to)).toBe(true);
    expect(inRange(new Date(2026, 1, 1), from, to)).toBe(false);
    expect(inRange(null, from, to)).toBe(false);
  });
});

describe("previousPeriod", () => {
  it("returns an equal-length window ending just before `from`", () => {
    const period = { from: new Date(2026, 3, 1), to: new Date(2026, 5, 30, 23, 59, 59, 999) };
    const prev = previousPeriod(period);
    expect(prev.to.getTime()).toBe(period.from.getTime() - 1);
    const len = period.to.getTime() - period.from.getTime();
    expect(prev.to.getTime() - prev.from.getTime()).toBe(len);
  });
});

describe("resolvePeriod", () => {
  it("defaults to the current quarter", () => {
    vi.setSystemTime(new Date(2026, 4, 15)); // May → Q2
    const p = resolvePeriod({});
    expect(p.mode).toBe("quarter");
    expect(p.label).toBe("Q2 2026");
  });

  it("wraps quarter navigation across year boundaries", () => {
    const p = resolvePeriod({ mode: "quarter", y: "2026", q: "1" });
    expect(p.prevHref).toContain("y=2025&q=4");
    expect(p.nextHref).toContain("y=2026&q=2");
  });

  it("resolves an explicit year", () => {
    const p = resolvePeriod({ mode: "year", y: "2025" });
    expect(p.label).toBe("2025");
    expect(p.from).toEqual(new Date(2025, 0, 1, 0, 0, 0, 0));
  });
});

describe("resolveDashboardRange", () => {
  it("defaults to 90 days and honors explicit modes", () => {
    vi.setSystemTime(new Date(2026, 0, 31, 12));
    expect(resolveDashboardRange().mode).toBe("90d");
    expect(resolveDashboardRange("30d").mode).toBe("30d");
    const { from } = resolveDashboardRange("30d");
    expect(Math.round((Date.now() - from.getTime()) / 864e5)).toBe(30);
  });
});
