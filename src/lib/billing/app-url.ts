/** Canonical HTTPS origin used for Stripe redirect URLs (no trailing slash). */
export function getPromiCanonicalAppUrl(): string | null {
  const raw =
    process.env.PROMI_APP_URL?.trim()
    ?? process.env.NEXT_PUBLIC_APP_URL?.trim()
    ?? process.env.NEXTAUTH_URL?.trim();

  if (!raw) return null;

  try {
    const normalized = raw.replace(/\/+$/, "");
    const u = new URL(normalized.includes("://") ? normalized : `https://${normalized}`);
    if (!u.hostname) return null;
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}
