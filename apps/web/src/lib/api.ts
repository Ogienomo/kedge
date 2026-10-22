import { createApiClient } from "@kedge/api";

/** Same-origin API client for the browser; the session cookie authenticates it. */
export const api = createApiClient();
