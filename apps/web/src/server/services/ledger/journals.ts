import type { JournalDetail, JournalDraftRequest, JournalSummary, ReverseRequest } from "@kedge/api";
import { journalDraftRequestSchema, reverseRequestSchema } from "@kedge/api";
import {
  assertCan,
  buildReversal,
  ConflictError,
  EntryImmutableError,
  NotFoundError,
  parseMinor,
  reversalDate,
  validateForPosting,
  ValidationError,
  type EntryDraft,
  type EntryLine,
  type PostedEntry,
} from "@kedge/core";
import { postExistingDraft, schema, withUser, type Tx } from "@kedge/db";
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { writeAudit } from "../../audit";
import { requireClaims, type ServiceContext } from "../../context";
import { idempotent, postDraft } from "./posting";
import { accountMap, entityScope, loadPeriods, periodFor, type EntityScope } from "./scope";

type EntryRow = typeof schema.journalEntries.$inferSelect;

function toLines(input: ReturnType<typeof journalDraftRequestSchema.parse>["lines"]): EntryLine[] {
  return input.map((l) => ({
    accountId: l.accountId,
    debit: parseMinor(l.debit),
    credit: parseMinor(l.credit),
    contactId: l.contactId ?? null,
    taxCodeId: l.taxCodeId ?? null,
    description: l.description ?? null,
  }));
}

/** Manual journals need journal.manual.post even as drafts (SPEC §3.3: Bookkeepers cannot post manual journals). */
function assertManualJournals(scope: EntityScope, now: Date): void {
  assertCan(scope.actor, "journal.manual.post", scope.entityId, now);
}

function toSummary(row: EntryRow, total: string): JournalSummary {
  return {
    id: row.id,
    number: row.number,
    entryDate: row.entryDate,
    memo: row.memo,
    status: row.status,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    total,
    reversedByEntryId: row.reversedByEntryId,
    reversesEntryId: row.reversesEntryId,
    postedAt: row.postedAt?.toISOString() ?? null,
  };
}

async function detail(tx: Tx, entryId: string): Promise<JournalDetail> {
  const [row] = await tx.select().from(schema.journalEntries).where(eq(schema.journalEntries.id, entryId));
  if (!row) throw new NotFoundError("Journal entry");
  const lines = await tx
    .select({
      lineNo: schema.journalLines.lineNo,
      accountId: schema.journalLines.accountId,
      accountCode: schema.accounts.code,
      accountName: schema.accounts.name,
      debit: schema.journalLines.debit,
      credit: schema.journalLines.credit,
      contactId: schema.journalLines.contactId,
      contactName: schema.contacts.name,
      taxCodeId: schema.journalLines.taxCodeId,
      description: schema.journalLines.description,
    })
    .from(schema.journalLines)
    .innerJoin(schema.accounts, eq(schema.accounts.id, schema.journalLines.accountId))
    .leftJoin(schema.contacts, eq(schema.contacts.id, schema.journalLines.contactId))
    .where(eq(schema.journalLines.entryId, entryId))
    .orderBy(asc(schema.journalLines.lineNo));
  const names = await tx.execute<{ id: string; name: string }>(
    sql`select id::text, coalesce(full_name, email) as name from users where id in (${row.createdBy}, ${row.postedBy ?? row.createdBy})`,
  );
  const nameOf = (id: string | null) => (id ? (names.find((n) => n.id === id)?.name ?? null) : null);
  const total = lines.reduce((s, l) => s + l.debit, 0n);
  return {
    ...toSummary(row, total.toString()),
    reversalReason: row.reversalReason,
    createdBy: nameOf(row.createdBy),
    postedBy: nameOf(row.postedBy),
    lines: lines.map((l) => ({ ...l, debit: l.debit.toString(), credit: l.credit.toString() })),
  };
}

export async function listJournals(
  ctx: ServiceContext,
  entityId: string,
  q: { from?: string; to?: string; sourceType?: string; status?: string; cursor?: string },
): Promise<{ journals: JournalSummary[]; nextCursor: string | null }> {
  const claims = requireClaims(ctx);
  const PAGE = 100;
  const offset = Number(q.cursor ?? "0") || 0;
  return withUser(ctx.db, claims, async (tx) => {
    await entityScope(tx, claims, entityId, ctx.now);
    const rows = await tx.execute<EntryRow & { total: string }>(sql`
      select e.id, e.number, e.entry_date as "entryDate", e.memo, e.status, e.source_type as "sourceType", e.source_id as "sourceId",
             e.reversed_by_entry_id as "reversedByEntryId", e.reverses_entry_id as "reversesEntryId", e.posted_at as "postedAt",
             coalesce((select sum(l.debit) from journal_lines l where l.entry_id = e.id), 0)::text as total
        from journal_entries e
       where e.entity_id = ${entityId}
         ${q.from ? sql`and e.entry_date >= ${q.from}` : sql``}
         ${q.to ? sql`and e.entry_date <= ${q.to}` : sql``}
         ${q.sourceType ? sql`and e.source_type = ${q.sourceType}` : sql``}
         ${q.status ? sql`and e.status = ${q.status}` : sql``}
       order by e.entry_date desc, e.number desc nulls first, e.created_at desc
       limit ${PAGE + 1} offset ${offset}
    `);
    const page = rows.slice(0, PAGE).map((r) => toSummary({ ...r, postedAt: r.postedAt ? new Date(r.postedAt) : null } as EntryRow, r.total));
    return { journals: page, nextCursor: rows.length > PAGE ? String(offset + PAGE) : null };
  });
}

export async function getJournal(ctx: ServiceContext, entryId: string): Promise<JournalDetail> {
  const claims = requireClaims(ctx);
  return withUser(ctx.db, claims, async (tx) => {
    const [row] = await tx.select({ entityId: schema.journalEntries.entityId }).from(schema.journalEntries).where(eq(schema.journalEntries.id, entryId));
    if (!row) throw new NotFoundError("Journal entry");
    await entityScope(tx, claims, row.entityId, ctx.now);
    return detail(tx, entryId);
  });
}

async function writeDraftLines(tx: Tx, scope: EntityScope, entryId: string, lines: EntryLine[]): Promise<void> {
  await tx.delete(schema.journalLines).where(eq(schema.journalLines.entryId, entryId));
  const nonEmpty = lines.filter((l) => l.debit > 0n || l.credit > 0n);
  if (nonEmpty.length > 0) {
    await tx.insert(schema.journalLines).values(
      nonEmpty.map((l, i) => ({
        orgId: scope.orgId,
        entityId: scope.entityId,
        entryId,
        lineNo: i + 1,
        accountId: l.accountId,
        debit: l.debit,
        credit: l.credit,
        contactId: l.contactId ?? null,
        taxCodeId: l.taxCodeId ?? null,
        description: l.description ?? null,
      })),
    );
  }
}

/**
 * Creates a manual journal. Drafts may be unbalanced (SPEC §4.3); with
 * `post: true` the entry is validated and posted in the same transaction.
 */
export async function createJournal(ctx: ServiceContext, entityId: string, raw: JournalDraftRequest, idempotencyKey: string | null): Promise<JournalDetail> {
  const claims = requireClaims(ctx);
  const input = journalDraftRequestSchema.parse(raw);
  if (input.post && !idempotencyKey) throw new ValidationError("Posting requires an Idempotency-Key header");
  const lines = toLines(input.lines);

  return idempotent(() =>
    withUser(ctx.db, claims, async (tx) => {
      const scope = await entityScope(tx, claims, entityId, ctx.now);
      assertManualJournals(scope, ctx.now);
      const draft: EntryDraft = { entryDate: input.entryDate, memo: input.memo, sourceType: "manual", lines };
      if (input.post && idempotencyKey) {
        const posted = await postDraft(tx, ctx, scope, draft, idempotencyKey);
        return detail(tx, posted.id);
      }
      const id = crypto.randomUUID();
      await tx.insert(schema.journalEntries).values({ id, orgId: scope.orgId, entityId, entryDate: input.entryDate, memo: input.memo, sourceType: "manual", createdBy: claims.sub });
      await writeDraftLines(tx, scope, id, lines);
      await writeAudit(tx, ctx, claims.sub, { orgId: scope.orgId, entityId, action: "journal.draft.create", targetType: "journal_entry", targetId: id, after: { entryDate: input.entryDate, lines: lines.length } });
      return detail(tx, id);
    }),
  );
}

async function loadDraft(tx: Tx, ctx: ServiceContext, entryId: string) {
  const claims = requireClaims(ctx);
  const [row] = await tx.select().from(schema.journalEntries).where(eq(schema.journalEntries.id, entryId));
  if (!row) throw new NotFoundError("Journal entry");
  const scope = await entityScope(tx, claims, row.entityId, ctx.now);
  return { row, scope };
}

export async function updateJournalDraft(ctx: ServiceContext, entryId: string, raw: JournalDraftRequest): Promise<JournalDetail> {
  const claims = requireClaims(ctx);
  const input = journalDraftRequestSchema.parse(raw);
  return withUser(ctx.db, claims, async (tx) => {
    const { row, scope } = await loadDraft(tx, ctx, entryId);
    if (row.status !== "draft") throw new EntryImmutableError();
    if (row.sourceType !== "manual") throw new ValidationError("Only manual journal drafts can be edited here");
    assertManualJournals(scope, ctx.now);
    await tx.update(schema.journalEntries).set({ entryDate: input.entryDate, memo: input.memo }).where(eq(schema.journalEntries.id, entryId));
    await writeDraftLines(tx, scope, entryId, toLines(input.lines));
    await writeAudit(tx, ctx, claims.sub, { orgId: scope.orgId, entityId: scope.entityId, action: "journal.draft.update", targetType: "journal_entry", targetId: entryId, after: { entryDate: input.entryDate, lines: input.lines.length } });
    return detail(tx, entryId);
  });
}

export async function deleteJournalDraft(ctx: ServiceContext, entryId: string): Promise<{ deleted: true }> {
  const claims = requireClaims(ctx);
  return withUser(ctx.db, claims, async (tx) => {
    const { row, scope } = await loadDraft(tx, ctx, entryId);
    if (row.status !== "draft") throw new EntryImmutableError("Posted entries cannot be deleted. Reverse the entry instead.");
    assertManualJournals(scope, ctx.now);
    await tx.delete(schema.journalEntries).where(eq(schema.journalEntries.id, entryId));
    await writeAudit(tx, ctx, claims.sub, { orgId: scope.orgId, entityId: scope.entityId, action: "journal.draft.delete", targetType: "journal_entry", targetId: entryId, before: { entryDate: row.entryDate, memo: row.memo } });
    return { deleted: true };
  });
}

export async function postJournalDraft(ctx: ServiceContext, entryId: string, idempotencyKey: string): Promise<JournalDetail> {
  const claims = requireClaims(ctx);
  return idempotent(() =>
    withUser(ctx.db, claims, async (tx) => {
      const { row, scope } = await loadDraft(tx, ctx, entryId);
      if (row.status === "posted") {
        // A replay of the same post returns the posted entry; anything else is a conflict.
        if (row.idempotencyKey === idempotencyKey) return detail(tx, entryId);
        throw new ConflictError("This entry is already posted");
      }
      assertManualJournals(scope, ctx.now);
      const lines = await tx.select().from(schema.journalLines).where(eq(schema.journalLines.entryId, entryId)).orderBy(asc(schema.journalLines.lineNo));
      const draft: EntryDraft = { entryDate: row.entryDate, memo: row.memo, sourceType: row.sourceType, lines };
      validateForPosting(draft, { accounts: await accountMap(tx, scope.entityId), period: await periodFor(tx, scope.entityId, row.entryDate) });
      const posted = await postExistingDraft(tx, { orgId: scope.orgId, entityId: scope.entityId, entryId, entryDate: row.entryDate, userId: claims.sub, idempotencyKey, now: ctx.now });
      if (!posted.replayed) {
        await writeAudit(tx, ctx, claims.sub, {
          orgId: scope.orgId,
          entityId: scope.entityId,
          action: "journal.post",
          targetType: "journal_entry",
          targetId: entryId,
          after: { number: posted.number, entryDate: row.entryDate, total: lines.reduce((s, l) => s + l.debit, 0n).toString() },
        });
      }
      return detail(tx, posted.id);
    }),
  );
}

/**
 * Reverses a posted entry (AC-1.3): a mirrored posted entry linked both
 * ways, dated on the original date or the first open date after it.
 */
export async function reverseEntryInTx(tx: Tx, ctx: ServiceContext, scope: EntityScope, entryId: string, reason: string, requestedDate: string | null, idempotencyKey: string): Promise<string> {
  assertCan(scope.actor, "journal.reverse", scope.entityId, ctx.now);
  const [row] = await tx.select().from(schema.journalEntries).where(eq(schema.journalEntries.id, entryId));
  if (!row || row.entityId !== scope.entityId) throw new NotFoundError("Journal entry");
  if (row.status !== "posted" || !row.number) throw new ValidationError("Only posted entries can be reversed. Delete the draft instead.");
  if (row.reversedByEntryId) {
    // A replay of the same reversal returns it; any other request is refused below by buildReversal.
    const [rev] = await tx.select({ key: schema.journalEntries.idempotencyKey }).from(schema.journalEntries).where(eq(schema.journalEntries.id, row.reversedByEntryId));
    if (rev?.key === idempotencyKey) return row.reversedByEntryId;
  }
  const lines = await tx.select().from(schema.journalLines).where(eq(schema.journalLines.entryId, entryId)).orderBy(asc(schema.journalLines.lineNo));
  const original: PostedEntry = { id: row.id, entryDate: row.entryDate, memo: row.memo, number: row.number, reversedByEntryId: row.reversedByEntryId, sourceType: row.sourceType, lines };
  const date = requestedDate ?? reversalDate(row.entryDate, await loadPeriods(tx, scope.entityId));
  const draft = buildReversal(original, reason, date);
  const posted = await postDraft(tx, ctx, scope, draft, idempotencyKey, { reversesEntryId: row.id, reversalReason: reason.trim() });
  if (!posted.replayed) {
    await tx.update(schema.journalEntries).set({ reversedByEntryId: posted.id }).where(eq(schema.journalEntries.id, row.id));
    await writeAudit(tx, ctx, scope.actor.userId, {
      orgId: scope.orgId,
      entityId: scope.entityId,
      action: "journal.reverse",
      targetType: "journal_entry",
      targetId: row.id,
      before: { reversedByEntryId: null },
      after: { reversedByEntryId: posted.id, reversalNumber: posted.number, date },
      reason: reason.trim(),
    });
  }
  return posted.id;
}

export async function reverseJournal(ctx: ServiceContext, entryId: string, raw: ReverseRequest, idempotencyKey: string): Promise<JournalDetail> {
  const claims = requireClaims(ctx);
  const input = reverseRequestSchema.parse(raw);
  return idempotent(() =>
    withUser(ctx.db, claims, async (tx) => {
      const [row] = await tx.select({ entityId: schema.journalEntries.entityId }).from(schema.journalEntries).where(eq(schema.journalEntries.id, entryId));
      if (!row) throw new NotFoundError("Journal entry");
      const scope = await entityScope(tx, claims, row.entityId, ctx.now);
      const reversalId = await reverseEntryInTx(tx, ctx, scope, entryId, input.reason, input.date ?? null, idempotencyKey);
      return detail(tx, reversalId);
    }),
  );
}

/** Count of draft entries for dashboards and the close checklist. */
export async function draftCount(tx: Tx, entityId: string, from?: string, to?: string): Promise<number> {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.journalEntries)
    .where(
      and(
        eq(schema.journalEntries.entityId, entityId),
        eq(schema.journalEntries.status, "draft"),
        from ? gte(schema.journalEntries.entryDate, from) : undefined,
        to ? lte(schema.journalEntries.entryDate, to) : undefined,
      ),
    );
  return row?.n ?? 0;
}
