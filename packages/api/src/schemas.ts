import { DISPLAY_MODES, INVITABLE_ROLES, ORG_KINDS, ORG_ROLES, ENTITY_ROLES, BILLING_STATUSES, PERMISSIONS } from "@kedge/core";
import { z } from "zod";

/**
 * Request and response contracts for /api/v1. Shared by the web app, the
 * future mobile app and tests. Timestamps travel as ISO 8601 strings; amounts
 * (from Phase 1) travel as strings of integer minor units.
 */

const id = z.uuid();
const isoDateTime = z.iso.datetime({ offset: true });
const name = z.string().trim().min(1).max(200);

// ---------------------------------------------------------------- errors

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

// ---------------------------------------------------------------- shared

export const orgKindSchema = z.enum(ORG_KINDS);
export const orgRoleSchema = z.enum(ORG_ROLES);
export const entityRoleSchema = z.enum(ENTITY_ROLES);
export const invitableRoleSchema = z.enum(INVITABLE_ROLES);
export const displayModeSchema = z.enum(DISPLAY_MODES);
export const permissionSchema = z.enum(PERMISSIONS);

export const organisationSchema = z.object({
  id,
  name: z.string(),
  kind: orgKindSchema,
  billingStatus: z.enum(BILLING_STATUSES),
  trialEndsAt: isoDateTime.nullable(),
  brandColour: z.string().nullable(),
});
export type Organisation = z.infer<typeof organisationSchema>;

export const entitySummarySchema = z.object({
  id,
  orgId: id,
  legalName: z.string(),
  tradingName: z.string().nullable(),
  status: z.enum(["active", "archived"]),
  /** The caller's effective role on this entity. */
  role: z.enum(["org_owner", "org_admin", "accountant", "bookkeeper", "client_owner", "client_staff", "viewer"]),
  displayMode: displayModeSchema,
  permissions: z.array(permissionSchema),
});
export type EntitySummary = z.infer<typeof entitySummarySchema>;

// ---------------------------------------------------------------- me

export const meResponseSchema = z.object({
  user: z.object({
    id,
    email: z.email(),
    fullName: z.string().nullable(),
    mfaEnabled: z.boolean(),
  }),
  organisations: z.array(
    z.object({
      id,
      name: z.string(),
      kind: orgKindSchema,
      role: orgRoleSchema.nullable(),
    }),
  ),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

export const updateProfileRequestSchema = z.object({
  fullName: z.string().trim().max(200).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
});
export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;

// ---------------------------------------------------------------- organisations

export const createOrganisationRequestSchema = z.object({
  name,
  kind: orgKindSchema,
});
export type CreateOrganisationRequest = z.infer<typeof createOrganisationRequestSchema>;

export const organisationContextSchema = z.object({
  organisation: organisationSchema,
  role: orgRoleSchema.nullable(),
  orgPermissions: z.array(permissionSchema),
  entities: z.array(entitySummarySchema),
});
export type OrganisationContext = z.infer<typeof organisationContextSchema>;

export const memberSchema = z.object({
  userId: id,
  email: z.string(),
  fullName: z.string().nullable(),
  role: orgRoleSchema,
  status: z.enum(["active", "suspended"]),
});
export type Member = z.infer<typeof memberSchema>;

export const membersResponseSchema = z.object({ members: z.array(memberSchema) });

// ---------------------------------------------------------------- entities

export const createEntityRequestSchema = z.object({
  legalName: name,
  tradingName: z.string().trim().max(200).nullable().optional(),
});
export type CreateEntityRequest = z.infer<typeof createEntityRequestSchema>;

export const updateEntityPreferencesRequestSchema = z.object({ displayMode: displayModeSchema });
export type UpdateEntityPreferencesRequest = z.infer<typeof updateEntityPreferencesRequestSchema>;

// ---------------------------------------------------------------- invitations

export const createInvitationRequestSchema = z.object({
  email: z.email().transform((e) => e.trim().toLowerCase()),
  role: invitableRoleSchema,
  entityId: id.nullable().default(null),
});
export type CreateInvitationRequest = z.input<typeof createInvitationRequestSchema>;

export const invitationSchema = z.object({
  id,
  orgId: id,
  entityId: id.nullable(),
  entityName: z.string().nullable(),
  email: z.string(),
  role: invitableRoleSchema,
  status: z.enum(["pending", "accepted", "revoked", "expired"]),
  expiresAt: isoDateTime,
  createdAt: isoDateTime,
});
export type Invitation = z.infer<typeof invitationSchema>;

export const invitationsResponseSchema = z.object({ invitations: z.array(invitationSchema) });

/** Public view of an invitation, shown before sign-in on /invite/[token]. */
export const invitationPreviewSchema = z.object({
  organisationName: z.string(),
  entityName: z.string().nullable(),
  role: invitableRoleSchema,
  email: z.string(),
  status: z.enum(["pending", "accepted", "revoked", "expired"]),
  expiresAt: isoDateTime,
});
export type InvitationPreview = z.infer<typeof invitationPreviewSchema>;

export const invitationTokenRequestSchema = z.object({ token: z.string().min(20).max(200) });

export const acceptInvitationResponseSchema = z.object({
  orgId: id,
  entityId: id.nullable(),
});
export type AcceptInvitationResponse = z.infer<typeof acceptInvitationResponseSchema>;

/** Where the caller may invite people, and with which roles (drives the invite form). */
export const invitationOptionsSchema = z.object({
  organisation: z.array(invitableRoleSchema),
  entities: z.array(z.object({ id, name: z.string(), roles: z.array(invitableRoleSchema) })),
});
export type InvitationOptions = z.infer<typeof invitationOptionsSchema>;
