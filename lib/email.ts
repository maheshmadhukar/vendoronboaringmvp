import { Resend } from "resend";

/**
 * Transactional email (Phase 4).
 *
 * Deliberately best-effort: if RESEND_API_KEY is unset this module is a no-op,
 * and every send is wrapped so an email failure can NEVER break the workflow
 * write that triggered it (a status change must not 500 because Resend hiccuped).
 * The gating on *whether* to notify already happens upstream via Config.notify*;
 * this layer only decides how to deliver.
 */

const apiKey = process.env.RESEND_API_KEY;
const from = process.env.EMAIL_FROM ?? "VMS <onboarding@resend.dev>";

// Single lazy client — undefined when email is disabled.
const resend = apiKey ? new Resend(apiKey) : null;

export function emailEnabled(): boolean {
  return resend !== null;
}

export function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

type SendArgs = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

/**
 * Send one email. Returns true if handed off to Resend, false if disabled or
 * failed. Never throws.
 */
export async function sendEmail({ to, subject, html, text }: SendArgs): Promise<boolean> {
  if (!resend) return false; // email disabled — no key configured
  try {
    const { error } = await resend.emails.send({
      from,
      to,
      subject,
      html,
      text: text ?? htmlToText(html),
    });
    if (error) {
      console.error("[email] send failed:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    // Swallow — the caller's workflow must not fail because of email.
    console.error("[email] send threw:", err instanceof Error ? err.message : err);
    return false;
  }
}

/** Minimal branded wrapper so notification mails read consistently. */
export function notificationEmail(opts: {
  heading: string;
  body: string;
  ctaLabel?: string;
  ctaHref?: string;
}): string {
  const { heading, body, ctaLabel, ctaHref } = opts;
  const cta =
    ctaLabel && ctaHref
      ? `<p style="margin:24px 0"><a href="${ctaHref}" style="background:#111;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:14px;display:inline-block">${ctaLabel}</a></p>`
      : "";
  return `<div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;color:#111">
  <h2 style="font-size:18px;margin:0 0 12px">${escapeHtml(heading)}</h2>
  <p style="font-size:14px;line-height:1.6;margin:0;color:#333">${escapeHtml(body)}</p>
  ${cta}
  <hr style="border:none;border-top:1px solid #eee;margin:28px 0 12px" />
  <p style="font-size:12px;color:#888;margin:0">Vendor Management System — automated notification. Manage preferences in your dashboard.</p>
</div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function htmlToText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
