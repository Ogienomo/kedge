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
  type UpdateOrganisationRequest,
  type UpdateEntityPreferencesRequest,
  type UpdateProfileRequest,
} from "./schemas";
import {
  accountSchema,
  accountsResponseSchema,
  bankAccountsResponseSchema,
  contactSchema,
  contactsResponseSchema,
  dashboardSchema,
  entityDetailSchema,
  journalDetailSchema,
  journalsResponseSchema,
  periodsResponseSchema,
  practiceResponseSchema,
  reportResponseSchema,
  taxCodeSchema,
  taxCodesResponseSchema,
  transactionSchema,
  transactionsResponseSchema,
  auditResponseSchema,
  type BankAccountInput,
  type ContactInput,
  type CreateAccountRequest,
  type CreateTaxCodeRequest,
  type EntitySetupRequest,
  type JournalDraftRequest,
  type OpeningBalancesRequest,
  type ReportKey,
  type ReverseRequest,
  type TransactionInput,
  type UpdateAccountRequest,
} from "./ledger";
import { z as zod } from "zod";

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

  async function request<S extends z.ZodType>(method: string, path: string, schema: S, body?: unknown, idempotencyKey?: string): Promise<z.infer<S>> {
    const headers: Record<string, string> = { accept: "application/json" };
    if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;
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
  const qs = (q: Record<string, string | undefined | null | boolean>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  return {
    me: () => request("GET", "/me", meResponseSchema),
    updateProfile: (body: UpdateProfileRequest) => request("PATCH", "/me", meResponseSchema, body),
    createOrganisation: (body: CreateOrganisationRequest) => request("POST", "/organisations", organisationContextSchema, body),
    getOrganisation: (orgId: string) => request("GET", `/organisations/${enc(orgId)}`, organisationContextSchema),
    updateOrganisation: (orgId: string, body: UpdateOrganisationRequest) => request("PATCH", `/organisations/${enc(orgId)}`, organisationContextSchema, body),
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

    // Phase 1: ledger. Posting calls take an idempotency key: generate one per user action and reuse it on retry.
    createEntityWithBooks: (orgId: string, body: EntitySetupRequest) => request("POST", `/organisations/${enc(orgId)}/entities/setup`, entityDetailSchema, body),
    setUpEntityBooks: (entityId: string, body: EntitySetupRequest) => request("POST", `/entities/${enc(entityId)}/setup`, entityDetailSchema, body),
    getEntity: (entityId: string) => request("GET", `/entities/${enc(entityId)}`, entityDetailSchema),
    dashboard: (entityId: string) => request("GET", `/entities/${enc(entityId)}/dashboard`, dashboardSchema),
    practice: (orgId: string) => request("GET", `/organisations/${enc(orgId)}/practice`, practiceResponseSchema),
    listAccounts: (entityId: string) => request("GET", `/entities/${enc(entityId)}/accounts`, accountsResponseSchema),
    createAccount: (entityId: string, body: CreateAccountRequest) => request("POST", `/entities/${enc(entityId)}/accounts`, accountSchema, body),
    updateAccount: (accountId: string, body: UpdateAccountRequest) => request("PATCH", `/accounts/${enc(accountId)}`, accountSchema, body),
    listJournals: (entityId: string, q: { from?: string; to?: string; sourceType?: string; status?: string; cursor?: string } = {}) =>
      request("GET", `/entities/${enc(entityId)}/journals${qs(q)}`, journalsResponseSchema),
    createJournal: (entityId: string, body: JournalDraftRequest, idempotencyKey?: string) => request("POST", `/entities/${enc(entityId)}/journals`, journalDetailSchema, body, idempotencyKey),
    getJournal: (entryId: string) => request("GET", `/journals/${enc(entryId)}`, journalDetailSchema),
    updateJournalDraft: (entryId: string, body: JournalDraftRequest) => request("PUT", `/journals/${enc(entryId)}`, journalDetailSchema, body),
    deleteJournalDraft: (entryId: string) => request("DELETE", `/journals/${enc(entryId)}`, zod.object({ deleted: zod.literal(true) })),
    postJournal: (entryId: string, idempotencyKey: string) => request("POST", `/journals/${enc(entryId)}/post`, journalDetailSchema, undefined, idempotencyKey),
    reverseJournal: (entryId: string, body: ReverseRequest, idempotencyKey: string) => request("POST", `/journals/${enc(entryId)}/reverse`, journalDetailSchema, body, idempotencyKey),
    listPeriods: (entityId: string) => request("GET", `/entities/${enc(entityId)}/periods`, periodsResponseSchema),
    addFiscalYear: (entityId: string) => request("POST", `/entities/${enc(entityId)}/fiscal-years`, periodsResponseSchema),
    lockPeriod: (periodId: string, reason: string | null) => request("POST", `/periods/${enc(periodId)}/lock`, periodsResponseSchema, { reason }),
    unlockPeriod: (periodId: string, reason: string) => request("POST", `/periods/${enc(periodId)}/unlock`, periodsResponseSchema, { reason }),
    listTransactions: (entityId: string, q: Record<string, string | undefined> = {}) => request("GET", `/entities/${enc(entityId)}/transactions${qs(q)}`, transactionsResponseSchema),
    createTransaction: (entityId: string, body: TransactionInput, idempotencyKey?: string) => request("POST", `/entities/${enc(entityId)}/transactions`, transactionSchema, body, idempotencyKey),
    getTransaction: (id: string) => request("GET", `/transactions/${enc(id)}`, transactionSchema),
    postTransaction: (id: string, idempotencyKey: string) => request("POST", `/transactions/${enc(id)}/post`, transactionSchema, undefined, idempotencyKey),
    reverseTransaction: (id: string, body: ReverseRequest, idempotencyKey: string) => request("POST", `/transactions/${enc(id)}/reverse`, transactionSchema, body, idempotencyKey),
    listContacts: (entityId: string, search?: string) => request("GET", `/entities/${enc(entityId)}/contacts${qs({ search })}`, contactsResponseSchema),
    createContact: (entityId: string, body: ContactInput) => request("POST", `/entities/${enc(entityId)}/contacts`, contactSchema, body),
    updateContact: (contactId: string, body: ContactInput & { isActive?: boolean }) => request("PATCH", `/contacts/${enc(contactId)}`, contactSchema, body),
    listTaxCodes: (entityId: string) => request("GET", `/entities/${enc(entityId)}/tax-codes`, taxCodesResponseSchema),
    createTaxCode: (entityId: string, body: CreateTaxCodeRequest) => request("POST", `/entities/${enc(entityId)}/tax-codes`, taxCodeSchema, body),
    listBankAccounts: (entityId: string) => request("GET", `/entities/${enc(entityId)}/bank-accounts`, bankAccountsResponseSchema),
    createBankAccount: (entityId: string, body: BankAccountInput) => request("POST", `/entities/${enc(entityId)}/bank-accounts`, bankAccountsResponseSchema, body),
    postOpeningBalances: (entityId: string, body: OpeningBalancesRequest, idempotencyKey: string) =>
      request("POST", `/entities/${enc(entityId)}/opening-balances`, zod.object({ entryId: zod.uuid(), number: zod.string() }), body, idempotencyKey),
    report: (entityId: string, report: ReportKey, q: Record<string, string | boolean | undefined> = {}) =>
      request("GET", `/entities/${enc(entityId)}/reports${qs({ report, ...q })}`, reportResponseSchema),
    audit: (entityId: string, q: { action?: string; from?: string; to?: string; cursor?: string } = {}) => request("GET", `/entities/${enc(entityId)}/audit${qs(q)}`, auditResponseSchema),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
