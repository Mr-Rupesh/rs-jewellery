import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function init() {
  const existing = getApps()[0];
  if (existing) return existing;
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_USE_EMULATORS === "true" && process.env.ALLOW_EMULATORS_IN_PRODUCTION !== "true")
    throw new Error("NEXT_PUBLIC_USE_EMULATORS is true in a production build. Refusing to start so the live site never points at emulators. (Only for a local production test: set ALLOW_EMULATORS_IN_PRODUCTION=true.)");
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "demo-rs-jewellers";
  if (process.env.NEXT_PUBLIC_USE_EMULATORS === "true") {
    process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
    process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
  }
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  return json ? initializeApp({ credential: cert(JSON.parse(json)), projectId }) : initializeApp({ projectId });
}

export const adminDb = () => getFirestore(init());
export const adminAuth = () => getAuth(init());
