// Run with the app emulators STOPPED:  npm run test:rules
import { readFileSync } from "node:fs";
import test, { before, after, beforeEach } from "node:test";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";

let env;
before(async () => {
  env = await initializeTestEnvironment({ projectId: "demo-rs-rules", firestore: { rules: readFileSync("firestore.rules", "utf8") } });
});
after(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "products/p1"), { active: true, name: "Shown", stock: 3 });
    await setDoc(doc(db, "products/p2"), { active: false, name: "Hidden", stock: 3 });
    await setDoc(doc(db, "settings/pricing"), { rate22kPaisePerGram: 1_190_000 });
    await setDoc(doc(db, "orders/o1"), { uid: "alice", status: "PAID", totalPaise: 100 });
    await setDoc(doc(db, "custom_inquiries/i1"), { uid: "alice", status: "NEW", description: "a long enough description" });
    await setDoc(doc(db, "users/alice"), { name: "Alice" });
    await setDoc(doc(db, "orders/delivered1"), { uid: "alice", status: "DELIVERED", totalPaise: 100 });
  });
});

const anon = () => env.unauthenticatedContext().firestore();
const user = (uid) => env.authenticatedContext(uid).firestore();
const admin = () => env.authenticatedContext("boss", { admin: true }).firestore();

test("products: public sees active only; admin sees all; nobody but admin writes", async () => {
  await assertSucceeds(getDoc(doc(anon(), "products/p1")));
  await assertFails(getDoc(doc(anon(), "products/p2")));
  await assertSucceeds(getDoc(doc(admin(), "products/p2")));
  await assertFails(updateDoc(doc(user("alice"), "products/p1"), { stock: 999 }));
  await assertSucceeds(updateDoc(doc(admin(), "products/p1"), { stock: 5 }));
});

test("settings: public read, only admin write", async () => {
  await assertSucceeds(getDoc(doc(anon(), "settings/pricing")));
  await assertFails(updateDoc(doc(user("alice"), "settings/pricing"), { rate22kPaisePerGram: 1 }));
  await assertSucceeds(updateDoc(doc(admin(), "settings/pricing"), { gstBps: 300 }));
});

test("orders: owner and admin read; others and anonymous cannot", async () => {
  await assertSucceeds(getDoc(doc(user("alice"), "orders/o1")));
  await assertFails(getDoc(doc(user("bob"), "orders/o1")));
  await assertFails(getDoc(doc(anon(), "orders/o1")));
  await assertSucceeds(getDoc(doc(admin(), "orders/o1")));
});

test("orders: clients can never create or delete; customers cannot edit; admin may only change status fields", async () => {
  await assertFails(setDoc(doc(user("alice"), "orders/o2"), { uid: "alice", status: "PAID", totalPaise: 1 }));
  await assertFails(updateDoc(doc(user("alice"), "orders/o1"), { status: "DELIVERED" }));
  await assertFails(updateDoc(doc(admin(), "orders/o1"), { totalPaise: 1 }));
  await assertSucceeds(updateDoc(doc(admin(), "orders/o1"), { status: "SHIPPED", updatedAt: 1 }));
  await assertFails(deleteDoc(doc(admin(), "orders/o1")));
});

test("custom_inquiries: create only as yourself, status NEW, bounded description", async () => {
  const ok = { uid: "bob", status: "NEW", description: "a nice leaf pendant please" };
  await assertSucceeds(setDoc(doc(user("bob"), "custom_inquiries/i2"), ok));
  await assertFails(setDoc(doc(user("bob"), "custom_inquiries/i3"), { ...ok, uid: "alice" }));
  await assertFails(setDoc(doc(user("bob"), "custom_inquiries/i4"), { ...ok, status: "QUOTED" }));
  await assertFails(setDoc(doc(user("bob"), "custom_inquiries/i5"), { ...ok, description: "x".repeat(2001) }));
  await assertFails(setDoc(doc(anon(), "custom_inquiries/i6"), ok));
});

test("custom_inquiries: owner and admin read; others cannot; only admin updates; nobody deletes", async () => {
  await assertSucceeds(getDoc(doc(user("alice"), "custom_inquiries/i1")));
  await assertFails(getDoc(doc(user("bob"), "custom_inquiries/i1")));
  await assertFails(updateDoc(doc(user("alice"), "custom_inquiries/i1"), { status: "QUOTED" }));
  await assertSucceeds(updateDoc(doc(admin(), "custom_inquiries/i1"), { status: "QUOTED", quotedPaise: 500000 }));
  await assertFails(deleteDoc(doc(admin(), "custom_inquiries/i1")));
});

test("users: own profile only; invoice counters are unreachable from clients", async () => {
  await assertSucceeds(getDoc(doc(user("alice"), "users/alice")));
  await assertFails(getDoc(doc(user("bob"), "users/alice")));
  await assertFails(getDoc(doc(admin(), "counters/invoice-2627")));
  await assertFails(setDoc(doc(admin(), "counters/invoice-2627"), { last: 0 }));
});

test("returns: only for your own DELIVERED order, one per order, admin reviews", async () => {
  const req = { uid: "alice", orderId: "delivered1", type: "RETURN", status: "REQUESTED", reason: "The ring is too small for me" };
  await assertSucceeds(setDoc(doc(user("alice"), "returns/delivered1"), req));
  await assertFails(setDoc(doc(user("bob"), "returns/delivered1"), { ...req, uid: "bob" }));          // not bob's order
  await assertFails(setDoc(doc(user("alice"), "returns/o1"), { ...req, orderId: "o1" }));            // order is PAID, not delivered
  await assertFails(setDoc(doc(user("alice"), "returns/wrongid"), req));                              // id must equal orderId
  await assertFails(setDoc(doc(user("alice"), "returns/delivered1"), { ...req, reason: "short" }));
  await assertFails(getDoc(doc(user("bob"), "returns/delivered1")));
  await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), "returns/delivered1"), req); });
  await assertFails(updateDoc(doc(user("alice"), "returns/delivered1"), { status: "APPROVED" }));
  await assertSucceeds(updateDoc(doc(admin(), "returns/delivered1"), { status: "APPROVED", adminNote: "ok", updatedAt: 1 }));
});

test("support chat: customers use only their own thread; admin can reply", async () => {
  const thread = { uid: "alice", status: "OPEN", name: "Alice" };
  await assertSucceeds(setDoc(doc(user("alice"), "support_threads/alice"), thread));
  await assertFails(setDoc(doc(user("bob"), "support_threads/alice"), thread));
  await assertSucceeds(setDoc(doc(user("alice"), "support_threads/alice/messages/m1"), { from: "customer", text: "Hello", at: 1 }));
  await assertFails(setDoc(doc(user("alice"), "support_threads/alice/messages/m2"), { from: "admin", text: "I am staff", at: 2 }));
  await assertFails(setDoc(doc(user("alice"), "support_threads/alice/messages/m3"), { from: "customer", text: "", at: 3 }));
  await assertFails(getDoc(doc(user("bob"), "support_threads/alice/messages/m1")));
  await assertSucceeds(setDoc(doc(admin(), "support_threads/alice/messages/m4"), { from: "admin", text: "Hi Alice", at: 4 }));
  await assertFails(updateDoc(doc(admin(), "support_threads/alice/messages/m4"), { text: "edited" }));
});

test("login codes are unreachable from any client, even an admin", async () => {
  await assertFails(getDoc(doc(admin(), "email_otps/abc")));
  await assertFails(setDoc(doc(user("alice"), "email_otps/abc"), { codeHash: "x" }));
  await assertFails(setDoc(doc(anon(), "email_otps/abc"), { codeHash: "x" }));
});
