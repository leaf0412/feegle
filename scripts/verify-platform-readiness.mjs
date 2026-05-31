import { spawnSync } from "node:child_process";

const commands = [
  ["npm", ["run", "typecheck"]],
  ["npm", ["run", "build"]],
  ["npm", ["run", "check:imports"]],
  ["npm", ["test"]],
  ["npm", ["run", "test:e2e"]],
  ["npx", ["vitest", "run", "tests/acceptance"]]
];

let failed = false;
for (const [cmd, args] of commands) {
  const r = spawnSync(cmd, args, { stdio: "inherit" });
  if (r.status !== 0) {
    console.error(`❌ FAILED: ${cmd} ${args.join(" ")}`);
    failed = true;
  }
}
if (failed) process.exit(1);
console.log("✅ platform ready for human testing");
