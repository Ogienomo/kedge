import { foreignKey, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { entities, organisations, users } from "./tenancy";

/**
 * SPEC §5.8. Append-only: no UPDATE/DELETE grants, and a trigger rejects
 * UPDATE, DELETE and TRUNCATE for every role.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organisations.id),
    entityId: uuid("entity_id"),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    reason: text("reason"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ name: "audit_log_entity_fk", columns: [t.entityId, t.orgId], foreignColumns: [entities.id, entities.orgId] }),
    index("audit_log_org_at_idx").on(t.orgId, t.at), index("audit_log_entity_at_idx").on(t.entityId, t.at),
  ],
).enableRLS();
