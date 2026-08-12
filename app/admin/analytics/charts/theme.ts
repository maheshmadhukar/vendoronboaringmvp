// Shared Recharts styling. All colors are CSS-var strings so charts follow the
// app's light/dark theme automatically (SVG fill/stroke resolve var() at render).
export const AXIS = "var(--ink-faint)";
export const GRID = "var(--border)";
export const ACCENT = "var(--accent)";
export const ACCENT_STRONG = "var(--accent-strong)";
export const BAD = "var(--bad)";
export const GOOD = "var(--good)";
export const WARN = "var(--warn)";
export const INFO = "var(--info)";
export const DUE = "var(--due)";
export const NEUTRAL = "var(--ink-faint)";

export const DEPT_COLORS: Record<string, string> = {
  PROCUREMENT: "var(--accent)",
  FINANCE: "var(--info)",
  LEGAL: "var(--accent-strong)",
  HR: "var(--due)",
};

export const tooltipStyle = {
  background: "var(--panel)",
  border: "1px solid var(--border-strong)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--ink)",
  boxShadow: "var(--shadow-md)",
  padding: "8px 10px",
} as const;

export const tooltipLabelStyle = { color: "var(--ink-soft)", fontWeight: 600, marginBottom: 2 } as const;
export const tooltipItemStyle = { color: "var(--ink)" } as const;

export const axisTick = { fill: AXIS, fontSize: 11 } as const;
