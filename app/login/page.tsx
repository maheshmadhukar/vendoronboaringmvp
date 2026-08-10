import { redirect } from "next/navigation";
import { getCurrentUser, homeFor } from "@/lib/session";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(homeFor(user));

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="brand-mark">V</div>
          <div className="brand-text">
            <strong>Vendor Onboarding Portal</strong>
            <span>Buyer &amp; Vendor sign in</span>
          </div>
        </div>
        <h1>Sign in</h1>
        <p className="sub">Access is invite-based. Use a demo account below to explore each role.</p>
        <LoginForm />
      </div>
    </div>
  );
}
