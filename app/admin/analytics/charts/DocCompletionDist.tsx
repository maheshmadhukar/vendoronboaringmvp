"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from "recharts";
import ChartFrame from "./ChartFrame";
import { tooltipStyle, tooltipLabelStyle, tooltipItemStyle, axisTick, GRID, ACCENT } from "./theme";

export default function DocCompletionDist({ data }: { data: { label: string; count: number }[] }) {
  return (
    <ChartFrame height={220}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 12, right: 8, bottom: 4, left: -12 }} barCategoryGap="24%">
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={axisTick} stroke={GRID} />
          <YAxis tick={axisTick} stroke={GRID} allowDecimals={false} />
          <Tooltip
            contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle}
            formatter={(v) => [`${Number(v)} vendors`, "Count"]}
            cursor={{ fill: "var(--panel-2)" }}
          />
          <Bar dataKey="count" fill={ACCENT} radius={[5, 5, 0, 0]} isAnimationActive>
            <LabelList dataKey="count" position="top" fill="var(--ink-soft)" fontSize={11} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
