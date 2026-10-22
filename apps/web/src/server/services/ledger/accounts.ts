import type { Account, CreateAccountRequest, UpdateAccountRequest } from "@kedge/api";
import { createAccountRequestSchema, updateAccountRequestSchema } from "@kedge/api";
import {
  assertCan,
  codeRangeFits,
  ConflictError,
  isBalanceSheetType,
  NORMAL_BALANCE,
  NotFoundError,
  typeOfSubtype,
  ValidationError,
  type AccountSubtype,
} from "@kedge/core";
import { schema, withUser, type Tx } from "@kedge/db";
import { and, asc, eq, sql } from "drizzle-orm";
import { writeAudit } from "../../audit";
import { requireClaims, type ServiceContext } from "../../context";
import { orgOfEntity } from "../../actor";
import { entityScope } from "./scope";

type AccountRow = typeof schema.accounts.$inferSelect;

function toAccount(a: AccountRow, balances: Map<string, { balance: bigint; count: number }>): Account {
  const b = balances.get(a.id);
  return {
    id: a.id,
    code: a.code,
    name: a.name,
    type: a.type,
    subtype: a.subtype,
    parentId: a.parentId,
    isLeaf: a.isLeaf,
    isActive: a.isActive,
    systemKey: a.systemKey,
    cashFlowCategory: a.cashFlowCategory,
    description: a.description,
    balance: (b?.balance ?? 0n).toString(),
    hasPostings: (b?.count ?? 0) > 0,
  };
}

/** Normal-direction balances of every account as at `asOf`, from posted lines only (rule 6). */
async function balancesAsOf(tx: Tx, entityId: string, asOf: string): Promise<Map<string, { balance: bigint; count: number }>> {
  const rows = await tx.execute<{ account_id: string; debit: string; credit: string; lines: number; normal_balance: string }>(sql`
    select l.account_id, sum(l.debit)::text as debit, sum(l.credit)::text as credit, count(*)::int as lines, a.normal_balance
      from journal_lines l
      join journal_entries e on e.id = l.entry_id and e.status = 'posted' and e.entry_date <= ${asOf}
      join accounts a on a.id = l.account_id
     where l.entity_id = ${entityId}
     group by l.account_id, a.normal_balance
  `);
  return new Map(
    rows.map((r) => {
      const d = BigInt(r.debit);
      const c = BigInt(r.credit);
      return [r.account_id, { balance: r.normal_balance === "debit" ? d - c : c - d, count: r.lines }];
    }),
  );
}

export async function listAccounts(ctx: ServiceContext, entityId: string): Promise<{ accounts: Account[] }> {
  const claims = requireClaims(ctx);
  return withUser(ctx.db, claims, async (tx) => {
    const scope = await entityScope(tx, claims, entityId, ctx.now);
    const rows = await tx.select().from(schema.accounts).where(eq(schema.accounts.entityId, entityId)).orderBy(asc(schema.accounts.code));
    const balances = await balancesAsOf(tx, entityId, scope.today);
    return { accounts: rows.map((a) => toAccount(a, balances)) };
  });
}

export async function createAccount(ctx: ServiceContext, entityId: string, raw: CreateAccountRequest): Promise<Account> {
  const claims = requireClaims(ctx);
  const input = createAccountRequestSchema.parse(raw);
  return withUser(ctx.db, claims, async (tx) => {
    const scope = await entityScope(tx, claims, entityId, ctx.now);
    assertCan(scope.actor, "coa.edit", entityId, ctx.now);
    const subtype = input.subtype as AccountSubtype;
    const type = typeOfSubtype(subtype);
    if (!codeRangeFits(input.code.slice(0, 4), subtype)) {
      throw new ValidationError(`Code ${input.code} is outside the range for ${type} accounts`, [{ path: "code", message: "Outside the range for this type" }]);
    }
    const cashFlowCategory = isBalanceSheetType(type) ? (input.cashFlowCategory ?? (subtype === "bank" || subtype === "cash" ? "cash" : "operating_working_capital")) : null;
    const [clash] = await tx
      .select({ id: schema.accounts.id })
      .from(schema.accounts)
      .where(and(eq(schema.accounts.entityId, entityId), eq(schema.accounts.code, input.code)));
    if (clash) throw new ConflictError(`Code ${input.code} is already used`);

    const id = crypto.randomUUID();
    const values = {
      id,
      orgId: scope.orgId,
      entityId,
      code: input.code,
      name: input.name,
      type,
      subtype,
      normalBalance: NORMAL_BALANCE[type],
      parentId: input.parentId ?? null,
      cashFlowCategory,
      description: input.description ?? null,
    };
    await tx.insert(schema.accounts).values(values);
    await writeAudit(tx, ctx, claims.sub, { orgId: scope.orgId, entityId, action: "account.create", targetType: "account", targetId: id, after: values });
    const [row] = await tx.select().from(schema.accounts).where(eq(schema.accounts.id, id));
    if (!row) throw new NotFoundError("Account");
    return toAccount(row, new Map());
  });
}

export async function updateAccount(ctx: ServiceContext, accountId: string, raw: UpdateAccountRequest): Promise<Account> {
  const claims = requireClaims(ctx);
  const input = updateAccountRequestSchema.parse(raw);
  return withUser(ctx.db, claims, async (tx) => {
    const [before] = await tx.select().from(schema.accounts).where(eq(schema.accounts.id, accountId));
    if (!before) throw new NotFoundError("Account");
    const scope = await entityScope(tx, claims, before.entityId, ctx.now);
    assertCan(scope.actor, "coa.edit", before.entityId, ctx.now);
    if (input.isActive === false && before.systemKey) throw new ValidationError("System accounts cannot be deactivated");
    if (input.code && input.code !== before.code && !codeRangeFits(input.code.slice(0, 4), before.subtype as AccountSubtype)) {
      throw new ValidationError(`Code ${input.code} is outside the range for this account type`, [{ path: "code", message: "Outside range" }]);
    }
    const set: Partial<typeof schema.accounts.$inferInsert> = {};
    if (input.name !== undefined) set.name = input.name;
    if (input.code !== undefined) set.code = input.code;
    if (input.description !== undefined) set.description = input.description;
    if (input.isActive !== undefined) set.isActive = input.isActive;
    if (Object.keys(set).length > 0) {
      await tx.update(schema.accounts).set(set).where(eq(schema.accounts.id, accountId));
      await writeAudit(tx, ctx, claims.sub, {
        orgId: scope.orgId,
        entityId: before.entityId,
        action: input.isActive === false ? "account.deactivate" : "account.update",
        targetType: "account",
        targetId: accountId,
        before: { name: before.name, code: before.code, description: before.description, isActive: before.isActive },
        after: set,
      });
    }
    const [row] = await tx.select().from(schema.accounts).where(eq(schema.accounts.id, accountId));
    if (!row) throw new NotFoundError("Account");
    return toAccount(row, await balancesAsOf(tx, before.entityId, scope.today));
  });
}

/** The entity an account belongs to, if the caller can see it (for routing account-scoped requests). */
export async function entityOfAccount(ctx: ServiceContext, accountId: string): Promise<{ entityId: string; orgId: string }> {
  const claims = requireClaims(ctx);
  return withUser(ctx.db, claims, async (tx) => {
    const [row] = await tx.select({ entityId: schema.accounts.entityId }).from(schema.accounts).where(eq(schema.accounts.id, accountId));
    if (!row) throw new NotFoundError("Account");
    return { entityId: row.entityId, orgId: await orgOfEntity(tx, row.entityId) };
  });
}
