"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { DASHBOARD_RANGE_LABEL, type DashboardRangeMode } from "@/lib/period";

const MODES: DashboardRangeMode[] = ["30d", "90d", "6m", "1y"];

export default function RangeSelect({ mode }: { mode: DashboardRangeMode }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  return (
    <select
      className="btn sm"
      value={mode}
      onChange={(e) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("range", e.target.value);
        router.push(`?${params.toString()}`);
      }}
    >
      {MODES.map((m) => (
        <option key={m} value={m}>{DASHBOARD_RANGE_LABEL[m]}</option>
      ))}
    </select>
  );
}
