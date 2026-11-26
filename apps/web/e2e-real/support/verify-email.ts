import { execFileSync } from "node:child_process";

/**
 * Opens the email verification "link" of an account on the local stack. Development has no email provider, so the
 * message with the link is never delivered; the specs mark the address verified in the development database, as the
 * link would. Only for the local Docker database (E2E_DB_CONTAINER, default the development one): never production.
 */
export function markEmailVerified(email: string): void {
  const container = process.env.E2E_DB_CONTAINER ?? "suiteasd-db-1";
  const quoted = email.replaceAll("'", "''");
  execFileSync("docker", [
    "exec",
    container,
    "psql",
    "-U",
    "suiteasd",
    "-d",
    "suiteasd",
    "-c",
    `update identity.users set email_verified_at = now() where lower(email) = lower('${quoted}')`,
  ]);
}
