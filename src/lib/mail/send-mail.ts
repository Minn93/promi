import { isAuthProductReadyServer } from "@/src/lib/internal-beta-mode";

export type SendMailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production";
}

function devEmailLogEnabled(): boolean {
  const v = process.env.PROMI_AUTH_EMAIL_DEV_LOG?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function mailFromAddress(): string {
  const from = process.env.PROMI_MAIL_FROM?.trim();
  if (from) return from;
  return "Promi <onboarding@resend.dev>";
}

/**
 * Transactional email only. No marketing broadcasts.
 *
 * - **Production** or **product-ready** (`PROMI_AUTH_PRODUCT_READY`): requires `RESEND_API_KEY`
 *   or throws (fail closed).
 * - **Development** otherwise: `RESEND_API_KEY` sends via Resend; if missing, `PROMI_AUTH_EMAIL_DEV_LOG=1`
 *   logs a sanitized preview; else throws with a clear setup message.
 */
export async function sendMail(input: SendMailInput): Promise<void> {
  const to = typeof input.to === "string" ? input.to.trim() : "";
  if (!to) {
    throw new Error("sendMail: `to` is required");
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();

  if (apiKey) {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: mailFromAddress(),
      to: [to],
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    if (error) {
      throw new Error(`sendMail: Resend error: ${error.message}`);
    }
    return;
  }

  const strict = isProductionRuntime() || isAuthProductReadyServer();
  if (strict) {
    throw new Error(
      "mail_misconfigured: RESEND_API_KEY is not set (required in production / when PROMI_AUTH_PRODUCT_READY is enabled)",
    );
  }

  if (devEmailLogEnabled()) {
    const preview =
      input.text.length > 280 ? `${input.text.slice(0, 280)}…` : input.text;
    console.info("[promi:mail:dev-log]", {
      to,
      subject: input.subject,
      textPreview: preview,
    });
    return;
  }

  throw new Error(
    "mail_misconfigured: set RESEND_API_KEY, or in development set PROMI_AUTH_EMAIL_DEV_LOG=1 for console logging",
  );
}
