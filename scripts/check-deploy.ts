// Usage: npm run check:deploy   (reads apphosting.yaml and refuses if it is not ready for the live site)
import { readFileSync } from "node:fs";
import { findDeployProblems } from "../src/lib/deploy-check.ts";

const problems = findDeployProblems(readFileSync("apphosting.yaml", "utf8"));
if (problems.length) {
  console.error(`Not ready to deploy (${problems.length}):\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log("apphosting.yaml looks ready to deploy.");
