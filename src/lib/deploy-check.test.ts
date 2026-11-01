import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findDeployProblems, parseEnvEntries, SECRET_NAMES, REQUIRED_PLAIN } from "./deploy-check.ts";

const plain = (n: string, v: string) => `  - variable: ${n}\n    value: ${v}\n    availability:\n      - RUNTIME\n`;
const secret = (n: string) => `  - variable: ${n}\n    secret: ${n.toLowerCase().replace(/_/g, "-")}\n    availability:\n      - RUNTIME\n`;
const good = (): string => "runConfig:\n  cpu: 1\n\nenv:\n"
  + REQUIRED_PLAIN.map((n) => plain(n, n === "NEXT_PUBLIC_USE_EMULATORS" ? '"false"' : "real-value")).join("")
  + plain("NEXT_PUBLIC_ENABLE_PHONE_LOGIN", '"false"') + SECRET_NAMES.map(secret).join("");

test("a complete config has no problems", () => assert.deepEqual(findDeployProblems(good()), []));
test("parser reads values, quotes, secrets and ignores comments", () => {
  const e = parseEnvEntries('env:\n  - variable: A\n    value: "x y"   # note\n  - variable: B\n    secret: b-secret\n');
  assert.deepEqual(e, [{ name: "A", value: "x y" }, { name: "B", secret: "b-secret" }]);
});
test("emulators on, placeholders, missing and plain-text secrets are all caught", () => {
  assert.ok(findDeployProblems(good().replace('"false"', '"true"')).some((p) => /EMULATORS/.test(p)));
  assert.ok(findDeployProblems(good().replace("real-value", "REPLACE_WITH_API_KEY")).some((p) => /still needs a real value/.test(p)));
  assert.ok(findDeployProblems(good().replace(secret("OTP_SECRET"), "")).some((p) => /OTP_SECRET is not listed/.test(p)));
  assert.ok(findDeployProblems(good().replace(secret("RAZORPAY_KEY_SECRET"), plain("RAZORPAY_KEY_SECRET", "rzp_live_abc"))).some((p) => /secret reference/.test(p)));
  assert.ok(findDeployProblems(good().replace('NEXT_PUBLIC_ENABLE_PHONE_LOGIN\n    value: "false"', 'NEXT_PUBLIC_ENABLE_PHONE_LOGIN\n    value: "true"')).some((p) => /PHONE_LOGIN/.test(p)));
  assert.ok(findDeployProblems(good().replace("runConfig:", "other:")).some((p) => /runConfig/.test(p)));
});
test("the shipped apphosting.yaml is structurally valid: the only problems are the placeholders still to fill in", () => {
  const problems = findDeployProblems(readFileSync("apphosting.yaml", "utf8"));
  assert.ok(problems.length > 0, "placeholders must be flagged");
  assert.ok(problems.every((p) => /still needs a real value/.test(p)), problems.join("; "));
  assert.equal(problems.length, 5); // API key, auth domain, project id, storage bucket, EMAIL_FROM
});
