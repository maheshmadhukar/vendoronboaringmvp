"use client";

import { useRouter, useSearchParams } from "next/navigation";

export default function Pagination({ paramKey, page, totalPages }: { paramKey: string; page: number; totalPages: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  if (totalPages <= 1) return null;

  const go = (p: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (p <= 1) params.delete(paramKey);
    else params.set(paramKey, String(p));
    router.push(`?${params.toString()}`);
  };

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, padding: "12px 24px" }}>
      <span className="sub">Page {page} of {totalPages}</span>
      <button className="btn sm ghost" disabled={page <= 1} onClick={() => go(page - 1)}>‹ Prev</button>
      <button className="btn sm ghost" disabled={page >= totalPages} onClick={() => go(page + 1)}>Next ›</button>
    </div>
  );
}
