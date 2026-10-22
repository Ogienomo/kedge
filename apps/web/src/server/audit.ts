import { schema, type Tx } from "@kedge/db";
import type { ServiceContext } from "./context";

export interface AuditEvent {
  readonly orgId: string;
  readonly entityId?: string | null;
  readonly action: string;
  readonly targetType: string;
  readonly targetId?: string | null;
  readonly before?: unknown;
  readonly after?: unknown;
  readonly reason?: string | null;
}

/** Writes one audit_log row inside the caller's transaction (CLAUDE.md: audit everything). */
export async function writeAudit(tx: Tx, ctx: ServiceContext, actorUserId: string, event: AuditEvent): Promise<void> {
  await tx.insert(schema.auditLog).values({
    orgId: event.orgId,
    entityId: event.entityId ?? null,
    actorUserId,
    action: event.action,
    targetType: event.targetType,
    targetId: event.targetId ?? null,
    before: event.before ?? null,
    after: event.after ?? null,
    reason: event.reason ?? null,
    ip: ctx.meta.ip,
    userAgent: ctx.meta.userAgent,
    at: ctx.now,
  });
}
