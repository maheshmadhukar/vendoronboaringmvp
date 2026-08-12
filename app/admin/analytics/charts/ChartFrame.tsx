"use client";

import { useEffect, useState } from "react";

/**
 * Gives a chart a fixed-height box and only mounts its Recharts children on the
 * client after hydration — sidesteps ResponsiveContainer's zero-width SSR pass
 * and any hydration mismatch. Renders a same-size placeholder until mounted.
 */
export default function ChartFrame({ height, children }: { height: number; children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <div style={{ width: "100%", height }}>
      {mounted ? children : null}
    </div>
  );
}
