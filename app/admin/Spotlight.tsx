"use client";

import { useEffect } from "react";

export default function Spotlight({ targetId }: { targetId: string | null }) {
  useEffect(() => {
    if (!targetId) return;
    const el = document.getElementById(targetId);
    if (!el) return;
    el.classList.add("spotlight-target", "spotlight-active");
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    const t = setTimeout(() => el.classList.remove("spotlight-active"), 1000);
    return () => {
      clearTimeout(t);
      el.classList.remove("spotlight-active");
    };
  }, [targetId]);
  return null;
}
