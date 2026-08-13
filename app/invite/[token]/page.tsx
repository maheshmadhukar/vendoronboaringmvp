import Link from "next/link";
import { prisma } from "@/lib/prisma";
import InviteForm from "./InviteForm";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = await prisma.invite.findUnique({ where: { token } });
  const valid =
    invite && !invite.consumedAt && invite.expiresAt.getTime() > Date.now();

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="brand-mark">V</div>
          <div className="brand-text">
            <strong>Vendor Onboarding Portal</strong>
            <span>Invite sign-up</span>
          </div>
        </div>
        {!valid ? (
          <>
            <h1>Invite not valid</h1>
            <p className="sub">
              This invite link is invalid, already used, or expired. Please ask
              the buyer&apos;s procurement/admin team to re-send your invite.
            </p>
            <Link href="/login" className="btn" style={{ width: "100%" }}>Back to sign in</Link>
          </>
        ) : (
          <>
            <h1>Set up your account</h1>
            <p className="sub">
              Invited as <b>{invite!.email}</b>. Create a password to activate
              your account.
            </p>
            <InviteForm token={token} />
          </>
        )}
      </div>
    </div>
  );
}
