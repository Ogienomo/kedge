/**
 * The database enforces the ledger rules even when the domain layer is
 * bypassed: AC-1.1 (balance, at commit), AC-1.2 (immutability), AC-1.4
 * (period locks), rule 2 (one side per line) and account checks.
 */
import { randomUUID } from "node:crypto";
import { creditLine, debitLine } from "@kedge/core";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, withUser, type DbHandle, type Tx } from "../client";
import { insertPostedEntry } from "../repositories/posting";
import { accounts, entityAccess, journalEntries, journalLines, memberships, periods, taxCodes, transactions } from "../schema";
import { createAuthUser, dbErrorMessage, seedTenant, testDatabaseUrl, type SeededTenant } from "../testing";

let handle: DbHandle;
let t: SeededTenant;

beforeAll(async () => {
  handle = createDb(testDatabaseUrl());
  t = await seedTenant(handle.db, "rules");
});

afterAll(async () => {
  await handle.close();
});

async function asOwner<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withUser(handle.db, t.owner.claims, fn);
}

async function rejects(fn: (tx: Tx) => Promise<unknown>): Promise<string> {
  const err = await asOwner(fn).then(
    () => null,
    (e: unknown) => e,
  );
  expect(err, "expected the database to refuse").not.toBeNull();
  return dbErrorMessage(err);
}

async function entryCount(): Promise<number> {
  const [row] = await handle.db.execute<{ n: number }>(sql`select count(*)::int as n from journal_entries where entity_id = ${t.entityId}`);
  return row?.n ?? 0;
}

/** Writes an entry straight to the tables, skipping every domain check. */
async function rawPost(tx: Tx, lines: { accountId: string; debit: bigint; credit: bigint }[], date = "2026-03-20"): Promise<string> {
  const id = randomUUID();
  await tx.insert(journalEntries).values({ id, orgId: t.orgId, entityId: t.entityId, entryDate: date, sourceType: "manual", createdBy: t.owner.id });
  if (lines.length > 0) {
    await tx.insert(journalLines).values(lines.map((l, i) => ({ orgId: t.orgId, entityId: t.entityId, entryId: id, lineNo: i + 1, ...l })));
  }
  await tx
    .update(journalEntries)
    .set({ status: "posted", number: `RAW-${id.slice(0, 8)}`, postedAt: new Date(), postedBy: t.owner.id, idempotencyKey: id })
    .where(eq(journalEntries.id, id));
  return id;
}

describe("AC-1.1: unbalanced entries are rejected by the database at commit", () => {
  it("rejects debits ≠ credits and writes nothing", async () => {
    const before = await entryCount();
    const msg = await rejects((tx) =>
      rawPost(tx, [
        { accountId: t.ledger.accounts.rent, debit: 100n, credit: 0n },
        { accountId: t.ledger.accounts.bank, debit: 0n, credit: 99n },
      ]),
    );
    expect(msg).toMatch(/does not balance/);
    expect(await entryCount()).toBe(before);
  });

  it("rejects a posted entry with fewer than two lines", async () => {
    expect(await rejects((tx) => rawPost(tx, []))).toMatch(/does not balance/);
  });

  it("catches imbalance introduced after posting-time checks, at commit", async () => {
    // A line added to a draft after the others is still counted when the posted entry commits.
    const msg = await rejects(async (tx) => {
      const id = await rawPost(tx, [
        { accountId: t.ledger.accounts.rent, debit: 50n, credit: 0n },
        { accountId: t.ledger.accounts.bank, debit: 0n, credit: 50n },
      ]);
      // Try to sneak an unbalanced line in by flipping the entry back to draft.
      await tx.update(journalEntries).set({ status: "draft" }).where(eq(journalEntries.id, id));
    });
    expect(msg).toMatch(/immutable/);
  });

  it("enforces one positive side per line (rule 2) with a CHECK constraint", async () => {
    for (const [debit, credit] of [
      [0n, 0n],
      [5n, 5n],
      [-5n, 0n],
    ] as const) {
      const msg = await rejects((tx) =>
        rawPost(tx, [
          { accountId: t.ledger.accounts.rent, debit, credit },
          { accountId: t.ledger.accounts.bank, debit: 0n, credit: 5n },
        ]),
      );
      expect(msg).toMatch(/journal_lines_one_side/);
    }
  });

  it("accepts a balanced entry", async () => {
    await asOwner((tx) =>
      rawPost(tx, [
        { accountId: t.ledger.accounts.rent, debit: 2_500n, credit: 0n },
        { accountId: t.ledger.accounts.bank, debit: 0n, credit: 2_500n },
      ]),
    );
  });

  it("refuses to create an entry directly as posted", async () => {
    const msg = await rejects((tx) =>
      tx.insert(journalEntries).values({
        orgId: t.orgId,
        entityId: t.entityId,
        entryDate: "2026-03-20",
        sourceType: "manual",
        createdBy: t.owner.id,
        status: "posted",
        number: "X",
        postedAt: new Date(),
        idempotencyKey: randomUUID(),
        periodId: t.ledger.periodIds[2],
      }),
    );
    expect(msg).toMatch(/created as drafts/);
  });
});

describe("AC-1.2: posted entries and their lines cannot be changed or deleted", () => {
  for (const [name, run] of [
    ["update an entry's memo", (tx: Tx) => tx.update(journalEntries).set({ memo: "edited" }).where(eq(journalEntries.id, t.ledger.entryId))],
    ["change an entry's date", (tx: Tx) => tx.update(journalEntries).set({ entryDate: "2026-03-01" }).where(eq(journalEntries.id, t.ledger.entryId))],
    ["change a line amount", (tx: Tx) => tx.update(journalLines).set({ debit: 1n }).where(eq(journalLines.entryId, t.ledger.entryId))],
    ["delete a line", (tx: Tx) => tx.delete(journalLines).where(eq(journalLines.entryId, t.ledger.entryId))],
    [
      "add a line",
      (tx: Tx) => tx.insert(journalLines).values({ orgId: t.orgId, entityId: t.entityId, entryId: t.ledger.entryId, lineNo: 9, accountId: t.ledger.accounts.rent, debit: 1n, credit: 0n }),
    ],
  ] as const) {
    it(`cannot ${name}`, async () => {
      expect(await rejects(run)).toMatch(/immutable|cannot|Reverse/);
    });
  }

  it("cannot delete a posted entry: RLS hides it from DELETE, and the trigger refuses even the table owner", async () => {
    const deleted = await asOwner((tx) => tx.delete(journalEntries).where(eq(journalEntries.id, t.ledger.entryId)).returning({ id: journalEntries.id }));
    expect(deleted).toEqual([]);
    const err = await handle.db.delete(journalEntries).where(eq(journalEntries.id, t.ledger.entryId)).catch((e: unknown) => e);
    expect(dbErrorMessage(err)).toMatch(/cannot be deleted/);
  });

  it("is enforced even for the table owner (triggers, not just RLS)", async () => {
    const err = await handle.db.update(journalLines).set({ debit: 1n }).where(eq(journalLines.entryId, t.ledger.entryId)).catch((e: unknown) => e);
    expect(dbErrorMessage(err)).toMatch(/cannot change/);
  });

  it("allows only setting reversed_by_entry_id once, to a real reversal", async () => {
    // Pointing at an unrelated entry is refused.
    const other = await asOwner((tx) =>
      rawPost(tx, [
        { accountId: t.ledger.accounts.rent, debit: 10n, credit: 0n },
        { accountId: t.ledger.accounts.bank, debit: 0n, credit: 10n },
      ]),
    );
    expect(await rejects((tx) => tx.update(journalEntries).set({ reversedByEntryId: other }).where(eq(journalEntries.id, t.ledger.entryId)))).toMatch(
      /must point at the posted reversal/,
    );

    // A genuine reversal links both ways, once.
    const reversal = await asOwner(async (tx) => {
      const r = await insertPostedEntry(tx, {
        orgId: t.orgId,
        entityId: t.entityId,
        userId: t.owner.id,
        idempotencyKey: randomUUID(),
        now: new Date(),
        reversesEntryId: t.ledger.entryId,
        reversalReason: "Test reversal",
        draft: {
          entryDate: "2026-03-15",
          memo: "Reversal",
          sourceType: "reversal",
          sourceId: t.ledger.entryId,
          lines: [creditLine(t.ledger.accounts.bank, 107_500n), debitLine(t.ledger.accounts.sales, 100_000n), debitLine(t.ledger.accounts.vatOutput, 7_500n)],
        },
      });
      await tx.update(journalEntries).set({ reversedByEntryId: r.id }).where(eq(journalEntries.id, t.ledger.entryId));
      return r.id;
    });
    expect(await rejects((tx) => tx.update(journalEntries).set({ reversedByEntryId: reversal }).where(eq(journalEntries.id, other)))).toMatch(/must point at/);
    expect(await rejects((tx) => tx.update(journalEntries).set({ reversedByEntryId: other }).where(eq(journalEntries.id, t.ledger.entryId)))).toMatch(/only once/);
  });

  it("drafts can still be edited and deleted", async () => {
    await asOwner(async (tx) => {
      const id = randomUUID();
      await tx.insert(journalEntries).values({ id, orgId: t.orgId, entityId: t.entityId, entryDate: "2026-03-20", sourceType: "manual", createdBy: t.owner.id });
      await tx.insert(journalLines).values({ orgId: t.orgId, entityId: t.entityId, entryId: id, lineNo: 1, accountId: t.ledger.accounts.rent, debit: 5n, credit: 0n });
      await tx.update(journalLines).set({ debit: 6n }).where(eq(journalLines.entryId, id));
      await tx.delete(journalEntries).where(eq(journalEntries.id, id));
    });
  });
});

describe("AC-1.4: nothing posts into a locked period (database layer)", () => {
  it("rejects posting into a locked period and accepts it again after unlocking with a reason", async () => {
    const feb = t.ledger.periodIds[1] as string;
    await asOwner((tx) => tx.update(periods).set({ status: "locked", lockedAt: new Date(), lockedBy: t.owner.id }).where(eq(periods.id, feb)));
    const lines = [
      { accountId: t.ledger.accounts.rent, debit: 10n, credit: 0n },
      { accountId: t.ledger.accounts.bank, debit: 0n, credit: 10n },
    ];
    expect(await rejects((tx) => rawPost(tx, lines, "2026-02-10"))).toMatch(/is locked/);

    expect(await rejects((tx) => tx.update(periods).set({ status: "open" }).where(eq(periods.id, feb)))).toMatch(/requires a reason/);
    await asOwner((tx) => tx.update(periods).set({ status: "open", unlockReason: "Late supplier invoice" }).where(eq(periods.id, feb)));
    await asOwner((tx) => rawPost(tx, lines, "2026-02-10"));
  });

  it("rejects dates outside every period", async () => {
    expect(
      await rejects((tx) =>
        rawPost(
          tx,
          [
            { accountId: t.ledger.accounts.rent, debit: 10n, credit: 0n },
            { accountId: t.ledger.accounts.bank, debit: 0n, credit: 10n },
          ],
          "2031-01-01",
        ),
      ),
    ).toMatch(/No accounting period/);
  });

  it("period dates cannot be edited to dodge a lock", async () => {
    expect(await rejects((tx) => tx.update(periods).set({ endDate: "2026-12-30" }).where(eq(periods.id, t.ledger.periodIds[11] as string)))).toMatch(/cannot change/);
  });
});

describe("accounts", () => {
  it("parent (header) accounts take no postings", async () => {
    const msg = await rejects((tx) =>
      rawPost(tx, [
        { accountId: t.ledger.accounts.header, debit: 10n, credit: 0n },
        { accountId: t.ledger.accounts.bank, debit: 0n, credit: 10n },
      ]),
    );
    expect(msg).toMatch(/sub-account/);
  });

  it("deactivated accounts take no new postings", async () => {
    const id = randomUUID();
    await asOwner((tx) =>
      tx.insert(accounts).values({ id, orgId: t.orgId, entityId: t.entityId, code: "6999", name: "Old", type: "expense", subtype: "operating_expense", normalBalance: "debit", isActive: false }),
    );
    expect(
      await rejects((tx) =>
        rawPost(tx, [
          { accountId: id, debit: 10n, credit: 0n },
          { accountId: t.ledger.accounts.bank, debit: 0n, credit: 10n },
        ]),
      ),
    ).toMatch(/deactivated/);
  });

  it("enforces same-type parents, 3 levels, and no children under posted accounts", async () => {
    const base = { orgId: t.orgId, entityId: t.entityId, type: "expense" as const, subtype: "operating_expense" as const, normalBalance: "debit" as const };
    expect(await rejects((tx) => tx.insert(accounts).values({ ...base, code: "6101", name: "x", parentId: t.ledger.accounts.header }))).toMatch(/same type/);
    expect(await rejects((tx) => tx.insert(accounts).values({ ...base, type: "asset", subtype: "bank", normalBalance: "debit", cashFlowCategory: "cash", code: "1021", name: "x", parentId: t.ledger.accounts.bank }))).toMatch(
      /already has postings/,
    );
    const l1 = randomUUID();
    const l2 = randomUUID();
    const l3 = randomUUID();
    await asOwner(async (tx) => {
      await tx.insert(accounts).values({ ...base, id: l1, code: "7600", name: "L1" });
      await tx.insert(accounts).values({ ...base, id: l2, code: "7610", name: "L2", parentId: l1 });
      await tx.insert(accounts).values({ ...base, id: l3, code: "7611", name: "L3", parentId: l2 });
    });
    expect(await rejects((tx) => tx.insert(accounts).values({ ...base, code: "7612", name: "L4", parentId: l3 }))).toMatch(/3 levels/);
    const [l1Row] = await handle.db.select({ isLeaf: accounts.isLeaf }).from(accounts).where(eq(accounts.id, l1));
    expect(l1Row?.isLeaf).toBe(false);
  });

  it("system accounts cannot be deleted or retyped; posted accounts cannot change type", async () => {
    expect(await rejects((tx) => tx.delete(accounts).where(eq(accounts.id, t.ledger.accounts.vatOutput)))).toMatch(/System accounts/);
    expect(
      await rejects((tx) => tx.update(accounts).set({ type: "expense", subtype: "operating_expense", normalBalance: "debit", cashFlowCategory: null }).where(eq(accounts.id, t.ledger.accounts.sales))),
    ).toMatch(/postings cannot change/);
  });

  it("normal balance must match the type", async () => {
    expect(
      await rejects((tx) => tx.insert(accounts).values({ orgId: t.orgId, entityId: t.entityId, code: "4500", name: "x", type: "income", subtype: "revenue", normalBalance: "debit" })),
    ).toMatch(/accounts_normal_balance_matches_type/);
  });
});

describe("tax codes and transactions", () => {
  it("tax rates are versioned, never edited (rule 10)", async () => {
    expect(await rejects((tx) => tx.update(taxCodes).set({ rateBps: 800 }).where(eq(taxCodes.id, t.ledger.taxCodeId)))).toMatch(/versioned/);
    await asOwner((tx) => tx.update(taxCodes).set({ effectiveTo: "2030-12-31" }).where(eq(taxCodes.id, t.ledger.taxCodeId)));
  });

  it("posted transactions are immutable except being marked reversed", async () => {
    expect(await rejects((tx) => tx.update(transactions).set({ amount: 1n }).where(eq(transactions.id, t.ledger.transactionId)))).toMatch(/immutable/);
    const deleted = await asOwner((tx) => tx.delete(transactions).where(eq(transactions.id, t.ledger.transactionId)).returning({ id: transactions.id }));
    expect(deleted).toEqual([]);
    const err = await handle.db.delete(transactions).where(eq(transactions.id, t.ledger.transactionId)).catch((e: unknown) => e);
    expect(dbErrorMessage(err)).toMatch(/cannot be deleted/);
  });

  it("bank account numbers are never stored in plain text", async () => {
    const err = await asOwner((tx) => tx.execute(sql`update bank_accounts set account_number_encrypted = '0123456789' where id = ${t.ledger.bankAccountId}`)).catch((e: unknown) => e);
    expect(dbErrorMessage(err)).toMatch(/bank_accounts_number_never_plain/);
  });
});

describe("ledger permissions (RLS backstop for SPEC §3.3)", () => {
  it("viewers can read the ledger but not write it", async () => {
    const rows = await withUser(handle.db, t.viewer.claims, (tx) => tx.select({ id: journalEntries.id }).from(journalEntries));
    expect(rows.length).toBeGreaterThan(0);
    const err = await withUser(handle.db, t.viewer.claims, (tx) =>
      tx.insert(journalEntries).values({ orgId: t.orgId, entityId: t.entityId, entryDate: "2026-03-20", sourceType: "manual", createdBy: t.viewer.id }),
    ).catch((e: unknown) => e);
    expect(dbErrorMessage(err)).toMatch(/row-level security/);
  });

  it("assigned accountants can post manual journals; bookkeepers cannot", async () => {
    const post = (claims: typeof t.accountant.claims, userId: string) =>
      withUser(handle.db, claims, (tx) =>
        insertPostedEntry(tx, {
          orgId: t.orgId,
          entityId: t.entityId,
          userId,
          idempotencyKey: randomUUID(),
          now: new Date(),
          draft: { entryDate: "2026-03-21", memo: "Accrual", sourceType: "manual", lines: [debitLine(t.ledger.accounts.rent, 1n), creditLine(t.ledger.accounts.bank, 1n)] },
        }),
      );
    const posted = await post(t.accountant.claims, t.accountant.id);
    expect(posted.number).toMatch(/^JE-2026-\d{6}$/);

    const bookkeeper = await createAuthUser(handle.db, "bk");
    await asOwner(async (tx) => {
      await tx.insert(memberships).values({ orgId: t.orgId, userId: bookkeeper.id, role: "bookkeeper" });
      await tx.insert(entityAccess).values({ orgId: t.orgId, entityId: t.entityId, userId: bookkeeper.id, role: "bookkeeper", grantedBy: t.owner.id });
    });
    const err = await post(bookkeeper.claims, bookkeeper.id).catch((e: unknown) => e);
    expect(dbErrorMessage(err)).toMatch(/row-level security/);
  });
});
