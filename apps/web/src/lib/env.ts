const DEFAULT_API_URL = "http://localhost:4000/api/v1";

/** Base URL of the REST API, without trailing slash. */
export const API_URL: string = (process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_API_URL).replace(/\/+$/, "");
