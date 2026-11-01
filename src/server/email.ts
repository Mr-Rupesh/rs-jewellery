export type EmailResult = "SENT" | "DEV_LOGGED" | "FAILED" | "NOT_CONFIGURED";

/**
 * Sends one email through Resend. Never throws.
 * In development with no RESEND_API_KEY the message is printed in the terminal instead.
 * In production a missing key is an error, so codes are never printed in a live server's logs.
 */
export async function sendEmail(m: { to: string; subject: string; text: string }): Promise<EmailResult> {
  const key = process.env.RESEND_API_KEY, from = process.env.EMAIL_FROM;
  if (!key || !from) {
    if (process.env.NODE_ENV !== "production") { console.log(`[email dev mode] to: ${m.to}\nsubject: ${m.subject}\n${m.text}`); return "DEV_LOGGED"; }
    console.error("[email] RESEND_API_KEY / EMAIL_FROM are not set");
    return "NOT_CONFIGURED";
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [m.to], subject: m.subject, text: m.text }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) { console.error("[email] send failed", res.status, await res.text().catch(() => "")); return "FAILED"; }
    return "SENT";
  } catch (e) {
    console.error("[email] send error", e);
    return "FAILED";
  }
}
