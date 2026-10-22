import type { z } from "zod";
import {
  acceptInvitationResponseSchema,
  apiErrorSchema,
  entitySummarySchema,
  invitationOptionsSchema,
  invitationPreviewSchema,
  invitationSchema,
  invitationsResponseSchema,
  meResponseSchema,
  membersResponseSchema,
  organisationContextSchema,
  type CreateEntityRequest,
  type CreateInvitationRequest,
  type CreateOrganisationRequest,
  type UpdateEntityPreferencesRequest,
  type UpdateProfileRequest,
} from "./schemas";

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly issues: readonly { path: string; message: string }[] = [],
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export interface ApiClientOptions {
  /** Origin of the API, e.g. "https://app.example.com". Empty for same-origin. */
  readonly baseUrl?: string;
  /** Bearer token for non-browser clients (mobile). Browsers use the session cookie. */
  readonly getAccessToken?: () => Promise<string | null>;
  readonly fetch?: typeof fetch;
}

/** Typed client for /api/v1, shared by web and mobile. */
export function createApiClient(options: ApiClientOptions = {}) {
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  const base = `${options.baseUrl ?? ""}/api/v1`;

  async function request<S extends z.ZodType>(method: string, path: string, schema: S, body?: unknown): Promise<z.infer<S>> {
    const headers: Record<string, string> = { accept: "application/json" };
    if (body !== undefined) headers["content-type"] = "application/json";
    const token = await options.getAccessToken?.();
    if (token) headers.authorization = `Bearer ${token}`;

    const res = await doFetch(`${base}${path}`, {
      method,
      headers,
      body: body === undefined ? null : JSON.stringify(body),
      credentials: "same-origin",
    });
    const json: unknown = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) {
      const parsed = apiErrorSchema.safeParse(json);
      if (parsed.success) {
        throw new ApiRequestError(res.status, parsed.data.error.code, parsed.data.error.message, parsed.data.error.issues);
      }
      throw new ApiRequestError(res.status, "unknown_error", `Request failed with status ${res.status}`);
    }
    return schema.parse(json);
  }

  const enc = encodeURIComponent;

  return {
    me: () => request("GET", "/me", meResponseSchema),
    updateProfile: (body: UpdateProfileRequest) => request("PATCH", "/me", meResponseSchema, body),
    createOrganisation: (body: CreateOrganisationRequest) => request("POST", "/organisations", organisationContextSchema, body),
    getOrganisation: (orgId: string) => request("GET", `/organisations/${enc(orgId)}`, organisationContextSchema),
    listMembers: (orgId: string) => request("GET", `/organisations/${enc(orgId)}/members`, membersResponseSchema),
    createEntity: (orgId: string, body: CreateEntityRequest) => request("POST", `/organisations/${enc(orgId)}/entities`, entitySummarySchema, body),
    updateEntityPreferences: (entityId: string, body: UpdateEntityPreferencesRequest) =>
      request("PUT", `/entities/${enc(entityId)}/preferences`, entitySummarySchema, body),
    syncMfa: () => request("POST", "/me/mfa/sync", meResponseSchema),
    invitationOptions: (orgId: string) => request("GET", `/organisations/${enc(orgId)}/invitation-options`, invitationOptionsSchema),
    listInvitations: (orgId: string) => request("GET", `/organisations/${enc(orgId)}/invitations`, invitationsResponseSchema),
    createInvitation: (orgId: string, body: CreateInvitationRequest) => request("POST", `/organisations/${enc(orgId)}/invitations`, invitationSchema, body),
    revokeInvitation: (invitationId: string) => request("POST", `/invitations/${enc(invitationId)}/revoke`, invitationSchema),
    previewInvitation: (token: string) => request("POST", "/invitations/preview", invitationPreviewSchema, { token }),
    acceptInvitation: (token: string) => request("POST", "/invitations/accept", acceptInvitationResponseSchema, { token }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
