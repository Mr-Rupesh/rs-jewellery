// Plain-language reason shown (in development only) when an order is still waiting for payment confirmation.
// No Node imports here: this file is used by a browser page.
export interface ConfirmReply { reason?: string; seen?: string[]; detail?: string; error?: string }

export function pendingHint(d: ConfirmReply | null | undefined): string {
  if (!d) return "";
  switch (d.reason) {
    case "KEYS_MISSING": return "The server has no Razorpay keys. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env.local and restart npm run dev.";
    case "NO_PAYMENT": return d.seen && d.seen.length
      ? `Razorpay has no successful payment for this order yet. It lists: ${d.seen.join(", ")}.`
      : "Razorpay has no payment for this order yet. Finish the payment in the Razorpay window (use a test method that succeeds).";
    case "ERROR": return `The payment check failed${d.detail ? `: ${d.detail}` : ""}.`;
    default: return d.error ?? "";
  }
}
