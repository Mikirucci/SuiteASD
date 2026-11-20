import { API_ORIGIN } from "./api-origin";

/** Fails fast, with the way out, when the Java backend is not running: the tests would otherwise all time out. */
export default async function requireApi(): Promise<void> {
  const url = `${API_ORIGIN}/actuator/health`;
  try {
    const response = await fetch(url);
    if (response.ok) return;
  } catch {
    // Reported below
  }
  throw new Error(
    `The backend is not reachable at ${url}. Start it from the SuiteASD-backend repository: ` +
      "`DB_PORT=5433 docker compose --profile app up -d` (see docs/SVILUPPO.md there).",
  );
}
