import { API_URL } from "@/lib/env";
import { createAuthApi } from "./auth";
import { createApiClient } from "./client";
import { createTokenStore } from "./token-store";

/** App-wide singletons: one token store, one HTTP client, one auth API. */
export const tokens = createTokenStore();
export const api = createApiClient({ baseUrl: API_URL, tokens });
export const authApi = createAuthApi(api, tokens);
