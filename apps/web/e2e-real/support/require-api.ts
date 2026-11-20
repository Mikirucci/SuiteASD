import { API_ORIGIN } from "./api-origin";

/**
 * Fails fast, with the way out, when the Java backend is not reachable: the tests would otherwise all time out.
 * It asks for an endpoint that needs a login: a 401 means the API answered (the health probes are not public behind
 * the reverse proxy, so they cannot be used here).
 */
export default async function requireApi(): Promise<void> {
  const url = `${API_ORIGIN}/api/v1/me`;
  try {
    const response = await fetch(url);
    if (response.status < 500) return;
  } catch {
    // Reported below
  }
  throw new Error(
    `The backend is not reachable at ${url}. Start it from the SuiteASD-backend repository: ` +
      "`DB_PORT=5433 docker compose --profile app up -d` (see docs/SVILUPPO.md there).",
  );
}
