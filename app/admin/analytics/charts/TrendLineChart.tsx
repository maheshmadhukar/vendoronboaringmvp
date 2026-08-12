"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import ChartFrame from "./ChartFrame";
import { tooltipStyle, tooltipLabelStyle, tooltipItemStyle, axisTick, GRID, ACCENT, WARN } from "./theme";

type Point = { label: string; onboarded: number; avgDays: number | null };

export default function TrendLineChart({ data }: { data: Point[] }) {
  return (
    <ChartFrame height={300}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={axisTick} stroke={GRID} />
          <YAxis yAxisId="left" tick={axisTick} stroke={GRID} allowDecimals={false} />
          <YAxis yAxisId="right" orientation="right" tick={axisTick} stroke={GRID} unit="d" />
          <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line yAxisId="left" type="monotone" dataKey="onboarded" name="Vendors onboarded" stroke={ACCENT} strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
          <Line yAxisId="right" type="monotone" dataKey="avgDays" name="Avg onboarding time (days)" stroke={WARN} strokeWidth={2.5} strokeDasharray="5 3" dot={{ r: 3 }} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
