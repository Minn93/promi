import { getPromiCanonicalAppUrl } from "@/src/lib/billing/app-url";
import { sendMail } from "@/src/lib/mail/send-mail";

const FORGOT_PASSWORD_SUBJECT = "Reset your Promi password";

function passwordResetBaseUrl(requestOrigin: string): string {
  const canon = getPromiCanonicalAppUrl()?.replace(/\/+$/, "");
  if (canon) return canon;
  try {
    return new URL(requestOrigin).origin;
  } catch {
    return requestOrigin.replace(/\/+$/, "");
  }
}

/**
 * Builds reset URL and sends mail. Caller must not log `rawToken`.
 */
export async function sendPasswordResetEmail(params: {
  to: string;
  rawToken: string;
  requestOrigin: string;
}): Promise<void> {
  const base = passwordResetBaseUrl(params.requestOrigin);
  const tokenParam = encodeURIComponent(params.rawToken);
  const resetUrl = `${base}/reset-password?token=${tokenParam}`;

  const text = [
    "We received a request to reset your Promi password.",
    "",
    `Open this link to choose a new password (it expires soon):`,
    resetUrl,
    "",
    "If you did not request this, you can ignore this email.",
  ].join("\n");

  const href = resetUrl.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const html = `<p>We received a request to reset your Promi password.</p><p><a href="${href}">Reset your password</a></p><p>If you did not request this, you can ignore this email.</p>`;

  await sendMail({
    to: params.to,
    subject: FORGOT_PASSWORD_SUBJECT,
    text,
    html,
  });
}
