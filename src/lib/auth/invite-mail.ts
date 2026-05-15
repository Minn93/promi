import { getPromiCanonicalAppUrl } from "@/src/lib/billing/app-url";
import { sendMail } from "@/src/lib/mail/send-mail";

const INVITE_SUBJECT = "You're invited to Promi";

function inviteBaseUrl(requestOrigin: string): string {
  const canon = getPromiCanonicalAppUrl()?.replace(/\/+$/, "");
  if (canon) return canon;
  try {
    return new URL(requestOrigin).origin;
  } catch {
    return requestOrigin.replace(/\/+$/, "");
  }
}

/**
 * Sends invite link. Caller must not log `rawToken`.
 */
export async function sendInviteEmail(params: {
  to: string;
  rawToken: string;
  requestOrigin: string;
}): Promise<void> {
  const base = inviteBaseUrl(params.requestOrigin);
  const tokenParam = encodeURIComponent(params.rawToken);
  const inviteUrl = `${base}/accept-invite?token=${tokenParam}`;

  const text = [
    "You have been invited to create your Promi account.",
    "",
    "Open this link to set your password (it expires in a few days):",
    inviteUrl,
    "",
    "If you did not expect this, you can ignore this email.",
  ].join("\n");

  const href = inviteUrl.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const html = `<p>You have been invited to create your Promi account.</p><p><a href="${href}">Accept invite and set password</a></p><p>If you did not expect this, you can ignore this email.</p>`;

  await sendMail({
    to: params.to,
    subject: INVITE_SUBJECT,
    text,
    html,
  });
}
