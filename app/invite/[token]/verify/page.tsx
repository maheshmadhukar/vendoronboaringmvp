import Link from "next/link";
import { prisma } from "@/lib/prisma";
import VerifyForm from "./VerifyForm";

export default async function VerifyPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = await prisma.invite.findUnique({ where: { token } });
  const valid = invite && !invite.consumedAt && invite.expiresAt.getTime() > Date.now();

  // Simulated email: surface the latest OTP for the prototype (no real mail sent).
  let code: string | null = null;
  if (valid) {
    const otp = await prisma.otpCode.findFirst({
      where: { email: invite!.email.toLowerCase(), purpose: "SIGNUP", consumedAt: null },
      orderBy: { createdAt: "desc" },
    });
    code = otp?.code ?? null;
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="brand-mark">V</div>
          <div className="brand-text">
            <strong>Vendor Onboarding Portal</strong>
            <span>Verify email</span>
          </div>
        </div>
        {!valid ? (
          <>
            <h1>Invite not valid</h1>
            <p className="sub">This link is invalid or expired.</p>
            <Link href="/login" className="btn" style={{ width: "100%" }}>Back to sign in</Link>
          </>
        ) : (
          <>
            <h1>Enter your code</h1>
            <p className="sub">
              We sent a one-time code to <b>{invite!.email}</b>.
            </p>
            {code ? (
              <div className="alert info" style={{ marginBottom: 16 }}>
                <span>📧 <b>Simulated email</b> — for this prototype your code is <b>{code}</b>.</span>
              </div>
            ) : null}
            <VerifyForm token={token} />
          </>
        )}
      </div>
    </div>
  );
}
