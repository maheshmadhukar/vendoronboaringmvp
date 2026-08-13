"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import ChartFrame from "./ChartFrame";
import { tooltipStyle, tooltipLabelStyle, tooltipItemStyle, axisTick, GRID, ACCENT, WARN } from "./theme";

type Point = { label: string; onboarded: number; avgDays: number | null };

const METRIC = {
  onboarded: { dataKey: "onboarded" as const, color: ACCENT, name: "Vendors onboarded", unit: "", dash: undefined, allowDecimals: false },
  avgDays: { dataKey: "avgDays" as const, color: WARN, name: "Avg onboarding time", unit: "d", dash: "5 3", allowDecimals: true },
};

export default function TrendLineChart({ data, metric }: { data: Point[]; metric: keyof typeof METRIC }) {
  const m = METRIC[metric];
  return (
    <ChartFrame height={260}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={axisTick} stroke={GRID} />
          <YAxis tick={axisTick} stroke={GRID} unit={m.unit} allowDecimals={m.allowDecimals} />
          <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
          <Line
            type="monotone"
            dataKey={m.dataKey}
            name={m.name}
            stroke={m.color}
            strokeWidth={2.5}
            strokeDasharray={m.dash}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
