export {}; // marks this file as a module so its `main` does not clash with the other scripts
// Usage: npm run set-admin -- owner@example.com      (or a 10-digit mobile if phone login is on)
// You must have logged in on the site once first. Local/emulator only unless a real service account is configured.
if (process.env.NEXT_PUBLIC_USE_EMULATORS === "true") process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";

async function main() {
  const arg = (process.argv[2] ?? "").trim();
  if (!arg) throw new Error("Usage: npm run set-admin -- <email>   (log in on the site once first)");
  const { initializeApp } = await import("firebase-admin/app");
  const { getAuth } = await import("firebase-admin/auth");
  const auth = getAuth(initializeApp({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "demo-rs-jewellers" }));
  const byEmail = arg.includes("@");
  const phone = arg.replace(/\s/g, "").startsWith("+") ? arg.replace(/\s/g, "") : `+91${arg.replace(/\s/g, "")}`;
  const user = await (byEmail ? auth.getUserByEmail(arg.toLowerCase()) : auth.getUserByPhoneNumber(phone)).catch(() => null);
  if (!user) throw new Error(`No user found for ${byEmail ? arg : phone}. Log in on the site with it once, then run this again.`);
  await auth.setCustomUserClaims(user.uid, { ...(user.customClaims ?? {}), admin: true });
  console.log(`${byEmail ? arg : phone} (uid ${user.uid}) is now an admin. Log out and log in again, or just reload /admin.`);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
