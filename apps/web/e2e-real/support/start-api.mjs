// Starts the real API on a throwaway SQLite database seeded with the demo society (SPEC section 6).
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../../api");
const databaseFile = "e2e-real.db";
for (const suffix of ["", "-journal"]) rmSync(join(apiDir, "prisma", databaseFile + suffix), { force: true });

const env = {
  ...process.env,
  NODE_ENV: "test",
  PORT: "4000",
  LOG_LEVEL: "warn",
  DATABASE_URL: `file:./${databaseFile}`,
  JWT_SECRET: "e2e-only-secret-e2e-only-secret-e2e-only-secret",
  CORS_ORIGINS: "http://localhost:3000",
  RATE_LIMIT_MAX: "100000",
  AUTH_RATE_LIMIT_MAX: "100000",
  SCHEDULER_ENABLED: "false",
  STORAGE_DIR: mkdtempSync(join(tmpdir(), "suiteasd-e2e-")),
};
delete env.RESEND_API_KEY;

const run = (args) => execFileSync("npx", args, { cwd: apiDir, env, stdio: "inherit", shell: true });
run(["prisma", "migrate", "deploy"]);
run(["tsx", "prisma/seed/index.ts"]);

const server = spawn("npx", ["tsx", "src/server.ts"], { cwd: apiDir, env, stdio: "inherit", shell: true });
const stop = () => server.kill();
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
server.on("exit", (code) => process.exit(code ?? 0));
