import {
  bankAccountInputSchema,
  contactInputSchema,
  createAccountRequestSchema,
  createTaxCodeRequestSchema,
  entitySetupRequestSchema,
  journalDraftRequestSchema,
  lockPeriodRequestSchema,
  openingBalancesRequestSchema,
  REPORT_KEYS,
  reportQuerySchema,
  reverseRequestSchema,
  transactionInputSchema,
  unlockPeriodRequestSchema,
  updateAccountRequestSchema,
  createEntityRequestSchema,
  createInvitationRequestSchema,
  createOrganisationRequestSchema,
  updateOrganisationRequestSchema,
  invitationTokenRequestSchema,
  updateEntityPreferencesRequestSchema,
  updateProfileRequestSchema,
} from "@kedge/api";
import { createEntity, updateEntityPreferences } from "../services/entities";
import { acceptInvitation, createInvitation, invitationOptions, listInvitations, previewInvitation, revokeInvitation } from "../services/invitations";
import { getMe, setMfaEnabled, updateProfile } from "../services/me";
import { createOrganisation, getOrganisationContext, listMembers, updateOrganisation } from "../services/organisations";
import { createAccount, listAccounts, updateAccount } from "../services/ledger/accounts";
import { createBankAccount, createContact, createTaxCodeVersion, listBankAccounts, listContacts, listTaxCodes, postOpeningBalances, updateContact } from "../services/ledger/directory";
import { getDashboard, listAudit, listPracticeClients } from "../services/ledger/insights";
import { createJournal, deleteJournalDraft, getJournal, listJournals, postJournalDraft, reverseJournal, updateJournalDraft } from "../services/ledger/journals";
import { addNextFiscalYear, listPeriods, lockPeriod, unlockPeriod } from "../services/ledger/periods";
import { exportReport, runReport } from "../services/ledger/reports";
import { createEntityWithBooks, getEntityDetail, setUpEntityBooks } from "../services/ledger/setup";
import { createTransaction, getTransaction, listTransactions, postTransaction, reverseTransaction } from "../services/ledger/transactions";
import { z } from "zod";
import { endpoint } from "./endpoint";

const dateQ = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional();
const cursorQ = z.string().regex(/^\d{1,7}$/).optional();
const uuidQ = z.uuid().optional();
const journalListQuery = z.object({ from: dateQ, to: dateQ, sourceType: z.string().max(40).optional(), status: z.enum(["draft", "posted"]).optional(), cursor: cursorQ });
const txnListQuery = z.object({
  from: dateQ,
  to: dateQ,
  kind: z.string().max(40).optional(),
  status: z.enum(["draft", "posted", "reversed"]).optional(),
  contactId: uuidQ,
  bankAccountId: uuidQ,
  counterAccountId: uuidQ,
  cursor: cursorQ,
});
const reportParams = z.object({ report: z.enum(REPORT_KEYS) });

/** Every /api/v1 endpoint. Route files under src/app/api/v1 only adapt these. */
export const endpoints = {
  getMe: endpoint({ auth: "required", run: (ctx) => getMe(ctx) }),
  updateMe: endpoint({ auth: "required", body: updateProfileRequestSchema, run: (ctx, { body }) => updateProfile(ctx, body) }),
  syncMfa: endpoint({
    auth: "required",
    allowBeforeMfa: true,
    run: async (ctx) => setMfaEnabled(ctx, await ctx.mfa.hasVerifiedFactor()),
  }),

  createOrganisation: endpoint({
    auth: "required",
    status: 201,
    body: createOrganisationRequestSchema,
    run: (ctx, { body }) => createOrganisation(ctx, body),
  }),
  getOrganisation: endpoint({ auth: "required", params: ["orgId"], run: (ctx, { params }) => getOrganisationContext(ctx, params.orgId) }),
  updateOrganisation: endpoint({ auth: "required", params: ["orgId"], body: updateOrganisationRequestSchema, run: (ctx, { params, body }) => updateOrganisation(ctx, params.orgId, body) }),
  listMembers: endpoint({ auth: "required", params: ["orgId"], run: (ctx, { params }) => listMembers(ctx, params.orgId) }),

  createEntity: endpoint({
    auth: "required",
    status: 201,
    params: ["orgId"],
    body: createEntityRequestSchema,
    run: (ctx, { params, body }) => createEntity(ctx, params.orgId, body),
  }),
  updateEntityPreferences: endpoint({
    auth: "required",
    params: ["entityId"],
    body: updateEntityPreferencesRequestSchema,
    run: (ctx, { params, body }) => updateEntityPreferences(ctx, params.entityId, body),
  }),

  invitationOptions: endpoint({ auth: "required", params: ["orgId"], run: (ctx, { params }) => invitationOptions(ctx, params.orgId) }),
  listInvitations: endpoint({ auth: "required", params: ["orgId"], run: (ctx, { params }) => listInvitations(ctx, params.orgId) }),
  createInvitation: endpoint({
    auth: "required",
    status: 201,
    params: ["orgId"],
    body: createInvitationRequestSchema,
    run: (ctx, { params, body }) => createInvitation(ctx, params.orgId, body),
  }),
  revokeInvitation: endpoint({ auth: "required", params: ["invitationId"], run: (ctx, { params }) => revokeInvitation(ctx, params.invitationId) }),
  previewInvitation: endpoint({ auth: "public", body: invitationTokenRequestSchema, run: (ctx, { body }) => previewInvitation(ctx, body.token) }),
  acceptInvitation: endpoint({ auth: "required", body: invitationTokenRequestSchema, run: (ctx, { body }) => acceptInvitation(ctx, body.token) }),

  // ---------------------------------------------------------------- Phase 1: ledger
  createEntityWithBooks: endpoint({
    auth: "required",
    status: 201,
    params: ["orgId"],
    body: entitySetupRequestSchema,
    run: (ctx, { params, body }) => createEntityWithBooks(ctx, params.orgId, body),
  }),
  getEntity: endpoint({ auth: "required", params: ["entityId"], run: (ctx, { params }) => getEntityDetail(ctx, params.entityId) }),
  setUpEntityBooks: endpoint({ auth: "required", params: ["entityId"], body: entitySetupRequestSchema, run: (ctx, { params, body }) => setUpEntityBooks(ctx, params.entityId, body) }),
  getDashboard: endpoint({ auth: "required", params: ["entityId"], run: (ctx, { params }) => getDashboard(ctx, params.entityId) }),
  listPracticeClients: endpoint({ auth: "required", params: ["orgId"], run: (ctx, { params }) => listPracticeClients(ctx, params.orgId) }),

  listAccounts: endpoint({ auth: "required", params: ["entityId"], run: (ctx, { params }) => listAccounts(ctx, params.entityId) }),
  createAccount: endpoint({ auth: "required", status: 201, params: ["entityId"], body: createAccountRequestSchema, run: (ctx, { params, body }) => createAccount(ctx, params.entityId, body) }),
  updateAccount: endpoint({ auth: "required", params: ["accountId"], body: updateAccountRequestSchema, run: (ctx, { params, body }) => updateAccount(ctx, params.accountId, body) }),

  listJournals: endpoint({ auth: "required", params: ["entityId"], query: journalListQuery, run: (ctx, { params, query }) => listJournals(ctx, params.entityId, query) }),
  createJournal: endpoint({
    auth: "required",
    status: 201,
    params: ["entityId"],
    body: journalDraftRequestSchema,
    run: (ctx, { params, body, idempotencyKey }) => createJournal(ctx, params.entityId, body, idempotencyKey || null),
  }),
  getJournal: endpoint({ auth: "required", params: ["entryId"], run: (ctx, { params }) => getJournal(ctx, params.entryId) }),
  updateJournalDraft: endpoint({ auth: "required", params: ["entryId"], body: journalDraftRequestSchema, run: (ctx, { params, body }) => updateJournalDraft(ctx, params.entryId, body) }),
  deleteJournalDraft: endpoint({ auth: "required", params: ["entryId"], run: (ctx, { params }) => deleteJournalDraft(ctx, params.entryId) }),
  postJournal: endpoint({ auth: "required", idempotency: "required", params: ["entryId"], run: (ctx, { params, idempotencyKey }) => postJournalDraft(ctx, params.entryId, idempotencyKey) }),
  reverseJournal: endpoint({
    auth: "required",
    idempotency: "required",
    status: 201,
    params: ["entryId"],
    body: reverseRequestSchema,
    run: (ctx, { params, body, idempotencyKey }) => reverseJournal(ctx, params.entryId, body, idempotencyKey),
  }),

  listPeriods: endpoint({ auth: "required", params: ["entityId"], run: (ctx, { params }) => listPeriods(ctx, params.entityId) }),
  addFiscalYear: endpoint({ auth: "required", status: 201, params: ["entityId"], run: (ctx, { params }) => addNextFiscalYear(ctx, params.entityId) }),
  lockPeriod: endpoint({ auth: "required", params: ["periodId"], body: lockPeriodRequestSchema, run: (ctx, { params, body }) => lockPeriod(ctx, params.periodId, body) }),
  unlockPeriod: endpoint({ auth: "required", params: ["periodId"], body: unlockPeriodRequestSchema, run: (ctx, { params, body }) => unlockPeriod(ctx, params.periodId, body) }),

  listTransactions: endpoint({ auth: "required", params: ["entityId"], query: txnListQuery, run: (ctx, { params, query }) => listTransactions(ctx, params.entityId, query) }),
  createTransaction: endpoint({
    auth: "required",
    status: 201,
    params: ["entityId"],
    body: transactionInputSchema,
    run: (ctx, { params, body, idempotencyKey }) => createTransaction(ctx, params.entityId, body, idempotencyKey || null),
  }),
  getTransaction: endpoint({ auth: "required", params: ["transactionId"], run: (ctx, { params }) => getTransaction(ctx, params.transactionId) }),
  postTransaction: endpoint({ auth: "required", idempotency: "required", params: ["transactionId"], run: (ctx, { params, idempotencyKey }) => postTransaction(ctx, params.transactionId, idempotencyKey) }),
  reverseTransaction: endpoint({
    auth: "required",
    idempotency: "required",
    params: ["transactionId"],
    body: reverseRequestSchema,
    run: (ctx, { params, body, idempotencyKey }) => reverseTransaction(ctx, params.transactionId, body, idempotencyKey),
  }),

  listContacts: endpoint({ auth: "required", params: ["entityId"], query: z.object({ search: z.string().max(100).optional() }), run: (ctx, { params, query }) => listContacts(ctx, params.entityId, query) }),
  createContact: endpoint({ auth: "required", status: 201, params: ["entityId"], body: contactInputSchema, run: (ctx, { params, body }) => createContact(ctx, params.entityId, body) }),
  updateContact: endpoint({ auth: "required", params: ["contactId"], body: contactInputSchema.extend({ isActive: z.boolean().optional() }), run: (ctx, { params, body }) => updateContact(ctx, params.contactId, body) }),

  listTaxCodes: endpoint({ auth: "required", params: ["entityId"], run: (ctx, { params }) => listTaxCodes(ctx, params.entityId) }),
  createTaxCode: endpoint({ auth: "required", status: 201, params: ["entityId"], body: createTaxCodeRequestSchema, run: (ctx, { params, body }) => createTaxCodeVersion(ctx, params.entityId, body) }),
  listBankAccounts: endpoint({ auth: "required", params: ["entityId"], run: (ctx, { params }) => listBankAccounts(ctx, params.entityId) }),
  createBankAccount: endpoint({ auth: "required", status: 201, params: ["entityId"], body: bankAccountInputSchema, run: (ctx, { params, body }) => createBankAccount(ctx, params.entityId, body) }),
  postOpeningBalances: endpoint({
    auth: "required",
    idempotency: "required",
    status: 201,
    params: ["entityId"],
    body: openingBalancesRequestSchema,
    run: (ctx, { params, body, idempotencyKey }) => postOpeningBalances(ctx, params.entityId, body, idempotencyKey),
  }),

  runReport: endpoint({
    auth: "required",
    params: ["entityId"],
    query: reportQuerySchema.extend({ report: reportParams.shape.report }),
    run: (ctx, { params, query }) => runReport(ctx, params.entityId, query.report, query),
  }),
  exportReport: endpoint({
    auth: "required",
    params: ["entityId"],
    query: reportQuerySchema.extend({ report: reportParams.shape.report, format: z.enum(["csv", "xlsx"]) }),
    run: (ctx, { params, query }) => exportReport(ctx, params.entityId, query.report, query, query.format),
  }),
  listAudit: endpoint({
    auth: "required",
    params: ["entityId"],
    query: z.object({ action: z.string().max(60).optional(), from: dateQ, to: dateQ, cursor: cursorQ }),
    run: (ctx, { params, query }) => listAudit(ctx, params.entityId, query),
  }),
};
