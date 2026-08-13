"use client";

import { useEffect } from "react";

export default function ScrollToActioned({ active }: { active: boolean }) {
  useEffect(() => {
    if (!active) return;
    document.getElementById("already-actioned")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [active]);
  return null;
}
