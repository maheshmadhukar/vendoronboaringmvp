import Link from "next/link";
import { getCurrentUser, homeFor } from "@/lib/session";

export default async function Unauthorized() {
  const user = await getCurrentUser();
  const home = user ? homeFor(user) : "/login";
  return (
    <div className="auth-wrap">
      <div className="auth-card" style={{ textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>🔒</div>
        <h1>Access denied</h1>
        <p className="sub">
          You don&apos;t have permission to view this page. This area is
          restricted to a different role or department.
        </p>
        <Link href={home} className="btn primary" style={{ width: "100%" }}>
          Go to my dashboard
        </Link>
      </div>
    </div>
  );
}
