# CLAUDE.md

Standing instructions for working on this repository. Read this file in full at the start of every session.

## What this is

**Kedge** (always use the `APP_NAME` constant, never the literal string) is a multi-tenant, double-entry accounting SaaS. It is for Nigerian small businesses and for the accounting firms that manage many client businesses. It is sold as a commercial product, so correctness, security and polish all matter equally.

**`SPEC.md` is the source of truth** for scope, data model, screens, pipelines, reports and acceptance criteria.
- Before building any feature, read the relevant SPEC section.
- Work strictly phase by phase (SPEC §13). Do not build features from a later phase early.
- If an implementation detail forces a change to the spec, stop. Explain the change and propose an edit to `SPEC.md`. Do not silently diverge.

## Stack

| Concern | Choice |
|---|---|
| Language | TypeScript, `strict: true`, `noUncheckedIndexedAccess: true` |
| Monorepo | pnpm workspaces + Turborepo |
| Web app | Next.js (App Router), deployed on Vercel |
| Database | PostgreSQL on Supabase (also provides Auth and Storage) |
| ORM / migrations | Drizzle ORM + drizzle-kit (SQL migrations committed to the repo) |
| Validation | Zod at every boundary (API input, AI output, file parsing output, env vars) |
| UI | Tailwind CSS + shadcn/ui; Recharts for charts; TanStack Table for data grids |
| Data fetching | TanStack Query on the client against the versioned API |
| Background jobs | Inngest (imports, extraction, report exports, alerts) |
| AI | Anthropic SDK; model set by the `ANTHROPIC_MODEL` env var, never hard-coded |
| PDF/XLSX | `pdfjs-dist` for text extraction; OCR service for scanned files; ExcelJS for XLSX in/out; server-side PDF generation for reports |
| Payments | Paystack (Phase 4) |
| Email | Resend |
| Monitoring | Sentry |
| Testing | Vitest (unit and integration), fast-check (property-based), Playwright (e2e) |

Before adding any dependency not listed here, explain why it is needed and ask first. Prefer fewer, well-maintained packages.

## Repository layout

```
apps/
  web/                 Next.js app: UI, route handlers under /api/v1, server actions call the API layer
  mobile/              (Phase 5) Expo app; consumes /api/v1 only
packages/
  core/                Pure domain logic: money, ledger posting, posting maps, periods, tax,
                       reports, ratios, permissions (can()), entitlements. NO framework or DB imports.
  db/                  Drizzle schema, migrations, RLS policies, triggers, seed data, golden fixtures
  api/                 Request/response Zod schemas and typed API client shared by web and mobile
  importers/           Bank statement templates, generic mappers, PDF/OCR parsing, validators
  ai/                  The only package that calls a model: extraction, categorisation, mapping,
                       commentary. Prompts, Zod output schemas, retries, fixture-recorded tests.
  ui/                  Shared design-system components and tokens
  config/              eslint, tsconfig, tailwind presets, APP_NAME and other constants
docs/
  decisions/           Short ADRs for any decision that changes or clarifies the spec
SPEC.md                Product specification (source of truth)
CLAUDE.md              This file
```

Dependencies only point downward: `apps → api/ui/importers/ai/db → core`. `core` depends on nothing in the repo and makes no network calls; it validates AI output (for example, that commentary cites only snapshot figures) but never calls a model. `db` may import types from `core`.

**API-first.** All business operations live in `packages/core` and are exposed through versioned route handlers at `/api/v1/...`. Web pages and server actions call those operations; they do not contain business logic. The future mobile app must be able to do everything through `/api/v1`.

## Commands

Keep this section accurate as scripts are added.

```
pnpm install
pnpm dev                 # run web app locally (needs apps/web/.env.local, see .env.example)
pnpm build               # production build of every package
pnpm typecheck
pnpm lint
pnpm test                # unit tests (all packages)
pnpm test:integration    # real Postgres at TEST_DATABASE_URL (default postgres://postgres:postgres@127.0.0.1:54322/kedge_test);
                         # each run drops and rebuilds kedge_test and kedge_test_web
pnpm test:e2e            # Playwright; needs `supabase start`, migrations applied and the app built (see README)
pnpm db:generate         # drizzle-kit generate migration from packages/db/src/schema
pnpm db:migrate          # apply migrations to DATABASE_URL
pnpm db:seed             # seed CoA templates, tax codes, golden fixture company (empty until Phase 1)
supabase start           # local Supabase: Postgres :54322, Auth API :54321, Mailpit :54324
```

Custom SQL (RLS policies, functions, triggers) goes in a migration created with
`pnpm --filter @kedge/db exec drizzle-kit generate --custom --name <name>`.

Run `pnpm typecheck && pnpm lint && pnpm test` before declaring any task done. Also run `pnpm test:integration` when anything in `packages/db` or the ledger changed.

---

## Non-negotiable accounting rules

These rules protect the integrity of every user's books. Never relax them, work around them, or "temporarily" disable them, including in seeds, scripts or tests (except tests that assert the rule rejects a violation). If a task seems to require breaking one, stop and ask.

1. **Every posted journal entry balances.** The sum of debits equals the sum of credits, in functional currency, with at least 2 lines. This is enforced twice:
   - in `packages/core` before any write;
   - in PostgreSQL by a deferred constraint trigger that runs at commit.
   Both layers must exist and both must be tested.

2. **One side per line.** Each line has exactly one positive amount, debit or credit. No negative amounts and no zero lines. This is enforced by a CHECK constraint.

3. **Posted entries are immutable.**
   - Never UPDATE or DELETE a posted `journal_entries` row or its `journal_lines`. Database triggers reject it.
   - The only allowed mutation is setting `reversed_by_entry_id` once.
   - A correction is a **reversal**: a new posted entry with debits and credits swapped and linked both ways, with a reason. It is followed by a new correct entry.
   - There is no "edit posted transaction" feature at the data level. The UI may offer "Edit", but it must perform reverse-and-repost.

4. **Money is integer minor units (kobo).**
   - Database columns are `bigint`. In TypeScript, use the `Money` type in `packages/core/money`, which wraps `bigint` together with a currency.
   - Never use `number`, `parseFloat`, `toFixed` or floating-point arithmetic for money.
   - The API sends amounts as **strings of integer minor units** (`"123456"`).
   - Formatting to `₦1,234.56` happens only at the UI edge, via the shared formatter.
   - Tax and split rounding goes through the single `roundMinor()` function (half away from zero). Any residual posts to the `rounding` system account.
   - Rates are integer basis points (`750` = 7.5%). Exchange rates (Phase 5) are `numeric`, converted via `roundMinor()`.

5. **Period locks are absolute.**
   - Nothing posts with an `entry_date` in a `locked` or `closed` period. This covers reversals, imports, opening balances, rules with auto-post, and seeds.
   - It is enforced in core and by a database trigger.
   - Unlocking requires `period.unlock` permission and a reason, and is audited.

6. **The ledger is the source of truth.**
   - Every report is computed from posted `journal_lines`.
   - Do not store balances that can drift. If a cache or materialised view is added for performance, it must be rebuildable from the ledger, and a test must assert it equals the computed value.

7. **Integrity checks run on every report.** These must hold:
   - trial balance debits = credits;
   - assets = liabilities + equity (including current year earnings);
   - cash flow closing cash = balance sheet cash.
   A failure is a P1 bug. Never mask it in the UI.

8. **Atomic, idempotent writes.**
   - Each business operation runs in one database transaction, including its audit log row.
   - Posting endpoints require an idempotency key.
   - Journal numbers are gapless per entity per fiscal year. They are assigned at posting time under a row lock on `number_sequences`.

9. **Nothing posts without a human.**
   - AI output and imported data are suggestions only.
   - The single automatic path is a categorisation rule the user explicitly marked `auto_post = true`.
   - Never add any other auto-posting.

10. **Tax rules are data, not code.** Rates, thresholds and effective dates live in `tax_codes`. Never hard-code a VAT or WHT rate in logic. Seeded values must be marked as needing verification.

11. **Accounting dates are dates.** `entry_date` and similar fields are `date` (no time). Timestamps are `timestamptz` stored in UTC and displayed in the entity's timezone (default `Africa/Lagos`). Never derive an accounting date from a UTC timestamp without converting to the entity timezone first.

12. **The posting map is canonical.** Simple-mode transactions compile to journal entries only through the posting map in `packages/core/ledger/posting-map.ts` (SPEC §4.4). Each mapping has a unit test asserting the exact debits and credits.

## Tenancy and security rules

- **Scope every row.** Every accounting table has `org_id` and `entity_id`, with RLS enabled.
  - The tenant-isolation test (SPEC AC-0.4) is generated from the table list. Every new table must be added to it, and CI fails otherwise.
- **Never query without tenant scope.**
  - Domain functions take an explicit `TenantContext { orgId, entityId, actor }`.
  - Code using the Supabase service-role key (jobs, webhooks) bypasses RLS. It must therefore set tenant context explicitly and still call `can()`.
- **Permissions go through `can(actor, permission, entityId)`** in `packages/core/permissions`, which implements the SPEC §3.3 matrix. Never write ad-hoc role checks in route handlers or components.
- **Audit everything.** Every mutation writes to `audit_log` in the same transaction, recording actor, action, target, before/after and reason. The table is append-only.
- **Secrets and sensitive data:**
  - Secrets live only in env vars, validated by a Zod env schema at startup. Never commit `.env*` files except `.env.example`.
  - Never log statement contents, document text, account numbers, PDF passwords, or amounts tied to named parties. Log IDs and counts only.
  - PDF passwords live in memory for the duration of parsing only. A test asserts they never reach the database, logs or job payloads.
  - Bank account numbers are encrypted at application level and displayed masked (last 4 digits).
- **Uploads** are virus-scanned before parsing, size-limited (20 MB), and type-checked by content sniffing as well as by extension.

## AI usage rules

- All model calls go through `packages/ai` with:
  - a Zod output schema;
  - one retry on validation failure;
  - a graceful fallback to manual entry.
- Minimise inputs: send only what the task needs. Never send account numbers or personal identifiers unnecessarily.
- AI-extracted statements must pass the balance or arithmetic checks, or the user must explicitly accept the failure with a reason.
- Analysis commentary may only cite figures present in the snapshot. Validate this programmatically.
- Respect the org-level "AI features off" setting everywhere.

## Code conventions

- **Pure domain.** `packages/core` contains pure functions and typed errors (`UnbalancedEntryError`, `PeriodLockedError`, `PermissionDeniedError`, …). Route handlers map typed errors to HTTP status codes and stable error codes. Never throw strings.
- **No `any`.** Prefer `unknown` plus Zod parsing. Use exhaustive `switch` statements with `never` checks on enums.
- **Naming.** Database: `snake_case`. TypeScript: `camelCase` for values, `PascalCase` for types and components. Files: `kebab-case`. Enum values match SPEC exactly.
- **Migrations are forward-only.** Never edit a migration that has been applied anywhere. RLS policies and triggers live in migrations, not in the dashboard.
- **Spelling.** British English in UI copy (organisation, categorise). Code identifiers follow existing names.
- **Copy and UX.**
  - Simple mode uses plain language ("Money in", "Fuel budget") and never shows debit or credit.
  - Accountant mode uses standard IFRS terminology.
  - Every screen has empty, loading and error states.
  - Destructive and irreversible actions (post, reverse, lock, close, complete reconciliation) require confirmation that says exactly what will happen.
- **Design quality is a requirement.**
  - Use the design tokens in `packages/ui`. Keep spacing and typography consistent.
  - Make it responsive from 360 px.
  - Meet WCAG 2.1 AA, with full keyboard support on the categorise and reconcile screens.
  - Show amounts in a tabular-figure font, right-aligned.
- **Commits.** Use Conventional Commits (`feat(ledger): …`, `fix(importers): …`). Keep pull requests small and focused on one acceptance criterion or feature where possible.

## Testing requirements

- **Ledger invariants:** fast-check property tests. Random valid entries must always keep the trial balance balanced and the accounting equation true. Random invalid entries must always be rejected.
- **Golden dataset:** "Adaeze Catering Ltd" in `packages/db/fixtures` (12 months, ~400 transactions, bank statements, budget, prior-year trial balance) with **hand-verified** expected statements.
  - Reports must match the expected statements to the kobo.
  - Never "fix" a failing golden test by changing the expected figures unless the expected figures are demonstrably wrong. In that case, explain why.
- **Database rules:** integration tests run against real Postgres, never mocks, for the balance trigger, the immutability triggers, the period-lock trigger, RLS and the append-only audit log.
- **Importers:** each bank template has anonymised sample files and snapshot tests. AI extraction is tested against recorded fixtures, not live calls, in CI.
- **e2e:** Playwright covers onboarding, quick-add transaction, import → categorise → post, reconcile, period lock, and report export.

## Definition of done

A task is done only when all of these hold:

1. It implements the relevant SPEC section and satisfies its acceptance criteria.
2. Typecheck, lint, unit, integration (if DB or ledger code was touched) and relevant e2e tests pass.
3. New tables are covered by RLS policies, the tenant-isolation test and audit logging.
4. No accounting rule above is weakened.
5. UI work has been checked at 360 px and desktop widths, in both display modes where relevant.
6. `CLAUDE.md` (Commands) and `SPEC.md` are updated if anything they describe changed. Decisions go in `docs/decisions/`.

When finishing a task, report:
- what was built;
- which acceptance criteria now pass;
- anything deferred or uncertain.

## Things to ask before doing

- Adding a dependency, an external service, or a paid API.
- Any change to a non-negotiable rule, the posting map, the permission matrix, or the RLS model.
- Seeding or changing tax rates.
- Destructive database operations on any shared environment.
- Anything that would send user financial data to a third party not already listed in the stack.
