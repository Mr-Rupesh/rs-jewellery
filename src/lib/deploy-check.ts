// Pre-deploy safety check for apphosting.yaml (used by `npm run check:deploy`). Pure text logic, unit-tested.
export const SECRET_NAMES = ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET", "OTP_SECRET", "RESEND_API_KEY", "ADMIN_EMAILS"];
export const REQUIRED_PLAIN = [
  "NEXT_PUBLIC_USE_EMULATORS", "NEXT_PUBLIC_FIREBASE_API_KEY", "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET", "EMAIL_FROM", "NEXT_PUBLIC_SHOP_NAME", "NEXT_PUBLIC_SHOP_ADDRESS", "NEXT_PUBLIC_SHOP_PHONE", "NEXT_PUBLIC_SHOP_EMAIL", "NEXT_PUBLIC_WHATSAPP_NUMBER",
];

export interface EnvEntry { name: string; value?: string; secret?: string }

/** Reads the `- variable:` blocks of our own apphosting.yaml (not a general YAML parser). */
export function parseEnvEntries(yaml: string): EnvEntry[] {
  const entries: EnvEntry[] = [];
  let cur: EnvEntry | null = null;
  for (const raw of yaml.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, ""); // drop trailing comments
    const v = line.match(/^\s*-\s*variable:\s*(\S+)\s*$/);
    if (v) { cur = { name: v[1]! }; entries.push(cur); continue; }
    if (!cur) continue;
    const val = line.match(/^\s+value:\s*(.*)$/);
    if (val) cur.value = val[1]!.trim().replace(/^["']|["']$/g, "");
    const sec = line.match(/^\s+secret:\s*(\S+)\s*$/);
    if (sec) cur.secret = sec[1]!;
    if (/^\S/.test(line) && line.trim() !== "") cur = null; // a new top-level key ends the list
  }
  return entries;
}

export function findDeployProblems(yaml: string): string[] {
  const problems: string[] = [];
  const entries = parseEnvEntries(yaml);
  const byName = new Map(entries.map((e) => [e.name, e]));
  for (const name of SECRET_NAMES) {
    const e = byName.get(name);
    if (!e) problems.push(`Secret ${name} is not listed`);
    else if (e.value !== undefined) problems.push(`${name} must be a secret reference (secret: ...), never a plain value`);
    else if (!e.secret) problems.push(`${name} has no secret name`);
  }
  for (const name of REQUIRED_PLAIN) {
    const e = byName.get(name);
    if (!e) problems.push(`${name} is not listed`);
    else if (!e.value || /REPLACE/i.test(e.value)) problems.push(`${name} still needs a real value`);
  }
  const emu = byName.get("NEXT_PUBLIC_USE_EMULATORS");
  if (emu && emu.value !== "false") problems.push('NEXT_PUBLIC_USE_EMULATORS must be "false" in production');
  const phone = byName.get("NEXT_PUBLIC_ENABLE_PHONE_LOGIN");
  if (phone && phone.value !== "false") problems.push('NEXT_PUBLIC_ENABLE_PHONE_LOGIN should be "false" (phone login sends paid SMS)');
  if (!/^\s*runConfig:/m.test(yaml)) problems.push("runConfig is missing");
  return problems;
}
