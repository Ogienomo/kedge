import { fiscalYearLabel, PeriodNotFoundError, type EntryDraft } from "@kedge/core";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import type { Tx } from "../client";
import { fiscalYears, journalEntries, journalLines, numberSequences } from "../schema";

export interface PostEntryInput {
  readonly orgId: string;
  readonly entityId: string;
  readonly draft: EntryDraft;
  readonly userId: string;
  readonly idempotencyKey: string;
  readonly now: Date;
  readonly reversesEntryId?: string | null;
  readonly reversalReason?: string | null;
}

export interface PostedRef {
  readonly id: string;
  readonly number: string;
  /** True when an earlier post with the same idempotency key was returned instead. */
  readonly replayed: boolean;
}

export async function findByIdempotencyKey(tx: Tx, entityId: string, key: string): Promise<{ id: string; number: string | null } | null> {
  const [row] = await tx
    .select({ id: journalEntries.id, number: journalEntries.number })
    .from(journalEntries)
    .where(and(eq(journalEntries.entityId, entityId), eq(journalEntries.idempotencyKey, key)));
  return row ?? null;
}

/**
 * Next gapless journal number for the fiscal year containing `date`
 * (rule 8). The sequence row is locked FOR UPDATE until the transaction
 * ends, so concurrent posts queue and a rolled-back post leaves no gap.
 */
export async function nextJournalNumber(tx: Tx, orgId: string, entityId: string, date: string): Promise<string> {
  const [fy] = await tx
    .select({ id: fiscalYears.id, startDate: fiscalYears.startDate, endDate: fiscalYears.endDate })
    .from(fiscalYears)
    .where(and(eq(fiscalYears.entityId, entityId), lte(fiscalYears.startDate, date), gte(fiscalYears.endDate, date)));
  if (!fy) throw new PeriodNotFoundError(date);

  await tx.insert(numberSequences).values({ orgId, entityId, fiscalYearId: fy.id, kind: "journal" }).onConflictDoNothing();
  const locked = await tx.execute<{ id: string; next_value: number }>(
    sql`select id, next_value from number_sequences where entity_id = ${entityId} and fiscal_year_id = ${fy.id} and kind = 'journal' for update`,
  );
  const seq = locked[0];
  if (!seq) throw new Error("number sequence missing after insert");
  await tx.update(numberSequences).set({ nextValue: seq.next_value + 1 }).where(eq(numberSequences.id, seq.id));
  return `JE-${fiscalYearLabel(fy)}-${String(seq.next_value).padStart(6, "0")}`;
}

/**
 * Writes a posted entry: insert as draft, insert lines, then post (the DB
 * allows only this order). Callers must have run validateForPosting first;
 * the database re-checks balance, period and accounts as a backstop.
 */
export async function insertPostedEntry(tx: Tx, input: PostEntryInput): Promise<PostedRef> {
  const existing = await findByIdempotencyKey(tx, input.entityId, input.idempotencyKey);
  if (existing?.number) return { id: existing.id, number: existing.number, replayed: true };

  const id = crypto.randomUUID();
  const number = await nextJournalNumber(tx, input.orgId, input.entityId, input.draft.entryDate);
  await tx.insert(journalEntries).values({
    id,
    orgId: input.orgId,
    entityId: input.entityId,
    entryDate: input.draft.entryDate,
    memo: input.draft.memo,
    sourceType: input.draft.sourceType,
    sourceId: input.draft.sourceId ?? null,
    reversesEntryId: input.reversesEntryId ?? null,
    reversalReason: input.reversalReason ?? null,
    createdBy: input.userId,
    status: "draft",
  });
  await tx.insert(journalLines).values(
    input.draft.lines.map((l, i) => ({
      orgId: input.orgId,
      entityId: input.entityId,
      entryId: id,
      lineNo: i + 1,
      accountId: l.accountId,
      debit: l.debit,
      credit: l.credit,
      contactId: l.contactId ?? null,
      taxCodeId: l.taxCodeId ?? null,
      description: l.description ?? null,
    })),
  );
  await tx
    .update(journalEntries)
    .set({ status: "posted", number, postedAt: input.now, postedBy: input.userId, idempotencyKey: input.idempotencyKey })
    .where(eq(journalEntries.id, id));
  return { id, number, replayed: false };
}

/** Posts an existing draft in place (keeps its id). Lines must already be validated. */
export async function postExistingDraft(
  tx: Tx,
  input: { orgId: string; entityId: string; entryId: string; entryDate: string; userId: string; idempotencyKey: string; now: Date },
): Promise<PostedRef> {
  const existing = await findByIdempotencyKey(tx, input.entityId, input.idempotencyKey);
  if (existing?.number) return { id: existing.id, number: existing.number, replayed: true };
  const number = await nextJournalNumber(tx, input.orgId, input.entityId, input.entryDate);
  await tx
    .update(journalEntries)
    .set({ status: "posted", number, postedAt: input.now, postedBy: input.userId, idempotencyKey: input.idempotencyKey })
    .where(eq(journalEntries.id, input.entryId));
  return { id: input.entryId, number, replayed: false };
}
