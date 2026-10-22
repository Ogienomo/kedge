import {
  createEntityRequestSchema,
  createInvitationRequestSchema,
  createOrganisationRequestSchema,
  invitationTokenRequestSchema,
  updateEntityPreferencesRequestSchema,
  updateProfileRequestSchema,
} from "@kedge/api";
import { createEntity, updateEntityPreferences } from "../services/entities";
import { acceptInvitation, createInvitation, invitationOptions, listInvitations, previewInvitation, revokeInvitation } from "../services/invitations";
import { getMe, setMfaEnabled, updateProfile } from "../services/me";
import { createOrganisation, getOrganisationContext, listMembers } from "../services/organisations";
import { endpoint } from "./endpoint";

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
};
