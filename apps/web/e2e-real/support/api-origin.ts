/** Where the Java backend listens during the real end-to-end tests (the web app forwards /api/v1 there). */
export const API_ORIGIN = (process.env.API_ORIGIN ?? "http://localhost:8080").replace(/\/+$/, "");
