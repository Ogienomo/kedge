import { validateForPosting, type EntryDraft } from "@kedge/core";
import { insertPostedEntry, type PostedRef, type Tx } from "@kedge/db";
import { writeAudit } from "../../audit";
import type { ServiceContext } from "../../context";
import { accountMap, periodFor, type EntityScope } from "./scope";

/**
 * The single path from a validated draft to a posted entry: domain checks
 * (rules 1, 2, 5, active leaf accounts), gapless numbering, idempotency and
 * the audit row, all inside the caller's transaction.
 */
export async function postDraft(
  tx: Tx,
  ctx: ServiceContext,
  scope: EntityScope,
  draft: EntryDraft,
  idempotencyKey: string,
  extra: { reversesEntryId?: string; reversalReason?: string } = {},
): Promise<PostedRef> {
  validateForPosting(draft, { accounts: await accountMap(tx, scope.entityId), period: await periodFor(tx, scope.entityId, draft.entryDate) });
  const posted = await insertPostedEntry(tx, {
    orgId: scope.orgId,
    entityId: scope.entityId,
    draft,
    userId: scope.actor.userId,
    idempotencyKey,
    now: ctx.now,
    reversesEntryId: extra.reversesEntryId ?? null,
    reversalReason: extra.reversalReason ?? null,
  });
  if (!posted.replayed) {
    const total = draft.lines.reduce((s, l) => s + l.debit, 0n);
    await writeAudit(tx, ctx, scope.actor.userId, {
      orgId: scope.orgId,
      entityId: scope.entityId,
      action: "journal.post",
      targetType: "journal_entry",
      targetId: posted.id,
      after: { number: posted.number, entryDate: draft.entryDate, sourceType: draft.sourceType, total: total.toString(), lines: draft.lines.length },
      reason: extra.reversalReason ?? null,
    });
  }
  return posted;
}

/** True for the unique-violation a concurrent replay of the same idempotency key produces. */
export function isIdempotencyRace(e: unknown): boolean {
  let current: unknown = e;
  for (let i = 0; i < 5 && current instanceof Error; i++) {
    const c = current as { code?: string; constraint_name?: string; constraint?: string };
    if (c.code === "23505" && (c.constraint_name ?? c.constraint) === "journal_entries_entity_idempotency_key") return true;
    current = current.cause;
  }
  return false;
}

/** Runs a posting operation; if a concurrent request with the same key won the race, runs it again to return that result. */
export async function idempotent<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (isIdempotencyRace(e)) return fn();
    throw e;
  }
}
