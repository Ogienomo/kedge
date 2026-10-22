# Kedge — Product Specification

> The product name is **Kedge**. It lives in one config constant (`APP_NAME`) and must never be hard-coded elsewhere.

| | |
|---|---|
| Version | 0.1 |
| Date | 22 October 2026 |
| Status | Draft for build |
| Market | Nigeria first; architecture must not prevent other markets later |
| Platforms | Responsive web (v1); native mobile via Expo (later phase) |

## Contents

1. Product overview
2. Glossary
3. Tenancy, users and roles
4. Accounting model
5. Data model
6. Screens
7. Pipelines (bank import, categorisation, reconciliation, financial statement upload)
8. Budgeting
9. Reports
10. AI features and guardrails
11. Billing and plans
12. Non-functional requirements
13. Delivery phases and acceptance criteria
14. Open questions

---

## 1. Product overview

### 1.1 Vision

Kedge is double-entry accounting software for Nigerian small businesses and the accounting firms that serve them. A business owner can run their books without knowing what a debit is, and an accountant can open the same books and find a complete, auditable, IFRS-aligned ledger.

### 1.2 Target users

| Segment | Who | What they need | How they buy |
|---|---|---|---|
| **Small business** | Owner-managed SMEs: services, trading, schools, clinics, agencies; 1–50 staff | Know where money went, stay within budget, produce statements for banks, investors and tax filings, with no accounting jargon | Self-serve sign-up, monthly subscription |
| **Accounting firm** | Practices and freelance accountants managing 5–200 client businesses | Manage many clients from one login, import client statements fast, close periods, produce client-ready reports under the firm's brand | Firm plan priced per active client entity |

A firm's client can also be invited to use their own books directly. The firm and the client then collaborate on one ledger.

### 1.3 Product principles

1. **Simple surface, rigorous core.** Every user action ends up as a balanced journal entry. Simple mode hides the mechanics; it never bypasses them.
2. **Nothing posts without a human.** AI and import pipelines produce suggestions. Only a user, or a deterministic rule the user explicitly enabled, can post to the ledger.
3. **The ledger is the single source of truth.** Every report is computed from journal lines. No stored balance may drift from the ledger.
4. **Everything is auditable.** Posted entries are immutable, corrections are reversals, and every change is logged with who, what, when and why.
5. **Nigeria-native.** NGN defaults, Nigerian bank statement formats, VAT and WHT handling, and Nigerian number formatting (₦1,234,567.89).
6. **Attractive and fast.** Quality of design is a selling point, not decoration. Every screen has a considered empty state, loading state and error state.

### 1.4 Scope

**In scope for v1 (Phases 0–4):**
- multi-tenant firms and businesses
- double-entry ledger
- simple-mode transactions
- bank statement import and reconciliation
- budgeting
- core financial statements
- financial statement upload (import history and analysis)
- VAT and WHT tracking
- invoices and bills
- subscription billing

**Later (Phase 5+):**
- multi-currency with FX revaluation
- live bank feeds via open banking
- native mobile app
- public API
- fixed asset register
- group consolidation

**Out of scope:** payroll processing, inventory costing (FIFO/weighted average), tax return e-filing.

---

## 2. Glossary

| Term | Meaning |
|---|---|
| Organisation (org) | The paying tenant. Either a **firm** or a **business**. |
| Entity | One set of books, i.e. one legal business. A firm org has many; a business org usually has one. |
| Chart of accounts (CoA) | The list of ledger accounts for an entity. |
| Journal entry (JE) | A dated, balanced set of debit and credit lines. The atomic unit of the ledger. |
| Transaction | A simple-mode record (income, expense, transfer, etc.) that generates a JE when posted. |
| Minor units | The integer amount in the currency's smallest unit (kobo for NGN). ₦1.00 = 100. |
| Period | A month within a fiscal year. Has a status: open, locked or closed. |
| Statement import | A bank statement file uploaded for categorisation and reconciliation. |
| Financial statement upload | An income statement, balance sheet or trial balance uploaded for history import or analysis. |
| Functional currency | The currency an entity keeps its books in (default NGN). |

---

## 3. Tenancy, users and roles

### 3.1 Tenancy model

```
Organisation (firm | business)
 ├── Memberships (org-level roles)
 └── Entities (books)
      ├── Entity access grants (entity-level roles)
      └── All accounting data (accounts, journals, imports, budgets…)
```

- Every accounting row carries `org_id` and `entity_id`. Tenant isolation is enforced by PostgreSQL row-level security (RLS) **and** by application-level scoping. Both are required.
- A business that signs up directly gets an org of kind `business` with one entity. It can add more entities, for example a second company, subject to its plan.
- A firm creates client entities under its org. It can then invite the client's own staff to that entity only.
- One user can belong to several orgs, for example a freelance accountant working with two firms. The org switcher is in the top bar.

### 3.2 Roles

Org-level roles:

| Role | Scope | Summary |
|---|---|---|
| **Org Owner** | Org | Everything, including billing, deleting the org and transferring ownership. Exactly one per org. |
| **Org Admin** | Org | Manage users, entities, settings and access grants. No billing ownership transfer. |
| **Accountant** | Assigned entities | Full accounting rights on assigned entities, including journals, period close, reconciliation and statement upload. Cannot manage org users. |
| **Bookkeeper** | Assigned entities | Record transactions, import statements, categorise and reconcile. Cannot post manual journals, lock periods or edit the CoA. |

Entity-level roles (for client users invited into a single entity):

| Role | Scope | Summary |
|---|---|---|
| **Client Owner** | One entity | View all reports, record transactions, upload documents, manage budgets, invite Client Staff. |
| **Client Staff** | One entity | Record transactions and upload receipts only. |
| **Viewer** | One entity | Read-only access to reports and the ledger. Used for auditors, investors and bankers. Access can be time-bound (`expires_at`). |

### 3.3 Permission matrix

✓ = allowed, — = denied, A = assigned entities only.

| Permission | Org Owner | Org Admin | Accountant | Bookkeeper | Client Owner | Client Staff | Viewer |
|---|---|---|---|---|---|---|---|
| `billing.manage` | ✓ | — | — | — | — | — | — |
| `org.users.manage` | ✓ | ✓ | — | — | — | — | — |
| `entity.create` | ✓ | ✓ | — | — | — | — | — |
| `entity.settings.edit` | ✓ | ✓ | A | — | ✓ | — | — |
| `entity.users.invite` | ✓ | ✓ | A | — | ✓ (Staff, Viewer) | — | — |
| `coa.edit` | ✓ | ✓ | A | — | — | — | — |
| `transaction.create` | ✓ | ✓ | A | A | ✓ | ✓ | — |
| `transaction.post` | ✓ | ✓ | A | A | ✓ | — | — |
| `journal.manual.post` | ✓ | ✓ | A | — | — | — | — |
| `journal.reverse` | ✓ | ✓ | A | — | — | — | — |
| `statement.import` | ✓ | ✓ | A | A | ✓ | — | — |
| `reconciliation.complete` | ✓ | ✓ | A | A | — | — | — |
| `period.lock` | ✓ | ✓ | A | — | — | — | — |
| `period.unlock` | ✓ | ✓ | A | — | — | — | — |
| `year.close` / `year.reopen` | ✓ | ✓ | — | — | — | — | — |
| `budget.edit` | ✓ | ✓ | A | — | ✓ | — | — |
| `fs_upload.import_history.post` | ✓ | ✓ | A | — | — | — | — |
| `fs_upload.analysis` | ✓ | ✓ | A | A | ✓ | — | — |
| `report.view` | ✓ | ✓ | A | A | ✓ | — | ✓ |
| `audit_log.view` | ✓ | ✓ | A | — | ✓ | — | — |
| `data.export` | ✓ | ✓ | A | — | ✓ | — | — |

Permissions are checked in the domain layer through one function, `can(actor, permission, entityId)`. RLS is the backstop, not the primary check.

### 3.4 Display modes

Each user chooses a mode per entity. The default is **Simple** for client roles and **Accountant** for firm roles.

| | Simple mode | Accountant mode |
|---|---|---|
| Recording | "Money in / Money out / Transfer" forms with categories | The same forms, plus manual journals |
| Accounts | Shown as categories with no codes | Full CoA with codes, types and subtypes |
| Ledger | Hidden | Journals, general ledger, trial balance |
| Reports | Plain-language labels and explanations | Standard IFRS labels with drill-down to lines |
| Period close | Hidden | Visible |

The mode changes presentation only. Permissions are governed by role, never by mode.

### 3.5 Invitations

- An invitation is sent by email, holds one role and one scope (org or entity), and expires after 7 days.
- Accepting creates the user if needed (email verification required) and grants the role.
- Every invite, accept, revoke and role change is written to the audit log.

---

## 4. Accounting model

### 4.1 Chart of accounts

- Account types and normal balances:
  - **Asset** — debit
  - **Liability** — credit
  - **Equity** — credit
  - **Income** — credit
  - **Expense** — debit
- **Subtypes** drive statement presentation. Examples:
  - `current_asset`, `non_current_asset`, `bank`, `cash`, `receivable`, `inventory`
  - `current_liability`, `non_current_liability`, `payable`, `tax_payable`
  - `equity_capital`, `retained_earnings`, `drawings`
  - `revenue`, `other_income`, `cost_of_sales`, `operating_expense`, `finance_cost`, `income_tax_expense`
- **Cash flow category** (required on balance sheet accounts, for the indirect cash flow statement): `cash`, `operating_working_capital`, `investing`, `financing`, `none`.
- **Code ranges** in the default templates:
  - 1000–1999 Assets
  - 2000–2999 Liabilities
  - 3000–3999 Equity
  - 4000–4999 Income
  - 5000–5999 Cost of sales
  - 6000–7999 Operating expenses
  - 8000–8999 Other income and expense, finance costs, tax
- **Hierarchy.** Accounts may have a parent of the same type, up to 3 levels deep. Only leaf accounts accept postings.
- **Templates offered at entity creation:**
  - General SME
  - Service business
  - Trading business
  - School
  - Firm custom template (a firm can save its own template)
- **Deactivation.** An account with postings cannot be deleted, only deactivated. A deactivated account rejects new postings but stays in historical reports.
- **Forward compatibility.** IFRS 18 replaces IAS 1 from 1 January 2027 and introduces operating, investing and financing categories in the income statement. Income and expense accounts therefore carry an optional `pl_category` field so that IFRS 18 presentation can be added without restructuring the schema.

### 4.2 System accounts

These are created automatically for every entity. They cannot be deleted or have their type changed, but they can be renamed.

| Key | Type | Purpose |
|---|---|---|
| `accounts_receivable` | Asset | Customer balances (invoices) |
| `accounts_payable` | Liability | Supplier balances (bills) |
| `vat_output` | Liability | VAT charged on sales |
| `vat_input` | Asset | Recoverable VAT on purchases |
| `wht_receivable` | Asset | WHT deducted by customers (credit notes held) |
| `wht_payable` | Liability | WHT deducted from suppliers, due to the tax authority |
| `retained_earnings` | Equity | Accumulated profit; target of the year-end close |
| `opening_balance_equity` | Equity | Contra account for opening balances; should be zero once set-up is complete |
| `suspense` | Asset | Temporary holding for unclassified items; reports warn when it is non-zero |
| `rounding` | Expense | Rounding residuals |
| `fx_gain_loss` | Income | Realised and unrealised FX (Phase 5) |

### 4.3 Journal entries

- **Header fields:**
  - `entity_id`
  - `entry_date` (date only, no time)
  - `memo`
  - `source_type` (`manual`, `transaction`, `invoice`, `bill`, `payment`, `statement_import`, `opening_balance`, `year_end_close`, `reversal`, `fx_revaluation`)
  - `source_id`
  - `status`
- **Lines:** each line has an account, exactly one positive amount on **either** the debit or the credit side, and optionally a contact, a tax code and a description.
- **Lifecycle:** `draft` → `posted`. A posted entry is shown as *reversed* when `reversed_by_entry_id` is set; its `status` stays `posted`, because the original entry is never mutated beyond that one link.
  - **Drafts** may be unbalanced and freely edited. They have no number and do not affect reports.
  - **Posting** requires the entry to balance, a minimum of 2 lines, an open period, active leaf accounts, and the right permission. Posting assigns a gapless number per entity per fiscal year in the format `JE-2026-000123`.
  - **Posted entries are immutable.** No field may change, except that `reversed_by_entry_id` may be set once.
  - **Reversal** creates a new posted entry with the debits and credits swapped, `source_type = reversal`, and the two entries linked in both directions. The reversal date defaults to the original date. If that period is locked, the reversal is dated on the first open date. A reason is required.
- **Idempotency.** Every post request carries an idempotency key. A repeated request returns the original result.
- **Attachments.** Any entry may have files attached (receipts, invoices, contracts).

### 4.4 Transactions (simple layer)

A simple-mode transaction is a form that compiles to a journal entry. The posting map is fixed in the domain layer, and every row is covered by a unit test.

| Transaction | Debit | Credit |
|---|---|---|
| Money in: sale or income received | Bank | Income (net); VAT output (if VAT applies) |
| Money in, customer deducted WHT | Bank (net received); WHT receivable | Income (gross); VAT output (if any) |
| Money out: expense paid | Expense (net); VAT input (if recoverable) | Bank |
| Money out, we deducted WHT | Expense (gross) | Bank (net paid); WHT payable |
| Transfer between own accounts | Destination bank | Source bank |
| Owner puts money in | Bank | Owner's capital |
| Owner takes money out | Drawings | Bank |
| Loan received | Bank | Loan liability |
| Loan repayment | Loan liability (principal); Finance cost (interest) | Bank |
| Customer pays an invoice (Phase 4) | Bank | Accounts receivable |
| We pay a bill (Phase 4) | Accounts payable | Bank |

**VAT-inclusive amounts** are split as follows. Rates are stored as basis points, so 7.5% = 750.

```
net = round_half_away_from_zero(gross × 10000 / (10000 + rate_bps))
vat = gross − net
```

### 4.5 Fiscal years, periods and closing

- The fiscal year start month is set per entity (default January). Periods are calendar months within the fiscal year.
- **Period statuses:**
  - **open** — posting allowed.
  - **locked** — no posting of any kind. Unlocking requires `period.unlock` and a written reason, and is audited.
  - **closed** — applies to all periods of a fiscal year after the year-end close. Reopening requires `year.reopen`, automatically reverses the closing entry, and is audited.
- **Close checklist** (shown before locking a period; each item can be overridden with a reason, which is logged):
  1. All bank accounts reconciled to period end
  2. Suspense balance is zero
  3. No draft entries dated in the period
  4. Opening balance equity is zero (first period only)
  5. Trial balance balances (an integrity check; it should always pass)
- **Year-end close** posts one `year_end_close` entry dated on the last day of the year. It zeroes every income and expense account against `retained_earnings`. Within an unclosed year, the balance sheet shows a computed "Current year earnings" line under equity.

### 4.6 Money, currency and rounding

- All amounts are stored as `bigint` minor units. The API sends amounts as **strings** of integer minor units, for example `"123456"` for ₦1,234.56, so that JSON number precision is never an issue.
- Every entity has a functional currency (default NGN, 2 decimal places). The currency table holds ISO 4217 codes and minor-unit exponents.
- Rounding is half away from zero and happens in exactly one function, `roundMinor()`. Any residual from splitting an amount across lines posts to the `rounding` account.
- Display formats:
  - NGN: `₦1,234,567.89`, with negatives in parentheses in reports: `(₦12,500.00)`
  - Accountant mode may switch to `₦'000` presentation.
- Multi-currency (Phase 5): each line stores the transaction currency amount, the rate used, and the functional currency amount. The balance rule applies to functional amounts.

### 4.7 Tax codes

- Tax rules live in data, never in code. Each tax code carries:
  - `kind` (`vat`, `wht`)
  - `name`
  - `rate_bps`
  - `effective_from`, `effective_to`
  - linked accounts
  - `recoverable` (for VAT input)
  - `applies_to` (sales, purchases, both)
- **Seeded defaults:** VAT standard rate 7.5%, VAT zero-rated, and VAT exempt. Each seeded default is marked "verify before launch".
- **WHT codes** are seeded empty with category names only. Rates must be entered and verified against current regulations by a qualified tax adviser before launch. Nigeria's 2025 tax reform acts changed several rules, and rates will keep changing.
- When a rate changes, a new code version is created with a new `effective_from`. The transaction date selects the version in force.

### 4.8 Opening balances

There are three ways to bring in opening balances:

1. **Manual entry.** A grid of balance sheet accounts with balances as at the cut-over date.
2. **Trial balance upload.** CSV or XLSX, mapped to the CoA (see §7.4).
3. **Balance sheet upload.** PDF or XLSX of the last audited or management balance sheet (see §7.4).

All three post one `opening_balance` entry dated the day before the go-live date, with any difference sent to `opening_balance_equity`. Set-up is complete when `opening_balance_equity` is zero. Until then, a dashboard banner flags it.

---

## 5. Data model

This is a PostgreSQL schema sketch. Unless noted otherwise, every table has:
- `id uuid pk default gen_random_uuid()`
- `created_at timestamptz`
- `updated_at timestamptz`
- `org_id uuid not null`, for RLS

Accounting tables also have `entity_id uuid not null`. Amounts are `bigint` minor units. Enumerations are Postgres enums or check constraints.

### 5.1 Identity and tenancy

```
organisations     name, kind(firm|business), plan_code, billing_status(trialing|active|past_due|cancelled),
                  trial_ends_at, logo_file_id, brand_colour
users             (managed by auth provider) id, email, full_name, phone, mfa_enabled, locale
memberships       org_id, user_id, role(org_owner|org_admin|accountant|bookkeeper), status(active|suspended)
                  UNIQUE(org_id, user_id)
entities          org_id, legal_name, trading_name, rc_number, tin, vat_registered bool,
                  functional_currency char(3) default 'NGN', fiscal_year_start_month smallint default 1,
                  timezone default 'Africa/Lagos', industry, coa_template, go_live_date, status(active|archived)
entity_access     entity_id, user_id, role(accountant|bookkeeper|client_owner|client_staff|viewer),
                  expires_at null, granted_by
                  UNIQUE(entity_id, user_id)
user_entity_prefs user_id, entity_id, display_mode(simple|accountant), last_viewed_at
invitations       org_id, entity_id null, email, role, token_hash, expires_at, accepted_at, invited_by
```

### 5.2 Ledger

```
accounts          entity_id, code, name, type(asset|liability|equity|income|expense), subtype,
                  normal_balance(debit|credit), parent_id null, is_leaf bool, system_key null,
                  cash_flow_category null, pl_category null, currency char(3), is_active bool, description
                  UNIQUE(entity_id, code); UNIQUE(entity_id, system_key) WHERE system_key IS NOT NULL
fiscal_years      entity_id, start_date, end_date, status(open|closed), closing_entry_id null
periods           entity_id, fiscal_year_id, start_date, end_date, status(open|locked|closed),
                  locked_at, locked_by, lock_reason, unlock_reason
journal_entries   entity_id, number text null, entry_date date, period_id, memo,
                  status(draft|posted), source_type, source_id null,
                  reverses_entry_id null, reversed_by_entry_id null, reversal_reason null,
                  posted_at, posted_by, created_by, idempotency_key
                  UNIQUE(entity_id, number); UNIQUE(entity_id, idempotency_key)
journal_lines     entity_id, entry_id, line_no, account_id, debit bigint default 0, credit bigint default 0,
                  currency char(3), txn_amount bigint null, fx_rate numeric(20,10) null,
                  contact_id null, tax_code_id null, description
                  CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0))
number_sequences  entity_id, fiscal_year_id, kind(journal|invoice|bill), next_value
```

**Database-enforced invariants.** These are triggers, and they hold in addition to the domain checks.
- **Balance check.** A deferred constraint trigger fires at commit. For any entry with `status = 'posted'`, it requires `sum(debit) = sum(credit)` and at least 2 lines.
- **Immutability.** A trigger rejects UPDATE and DELETE on `journal_lines` whose entry is posted. It also rejects UPDATE on posted `journal_entries`, except a single null-to-value set of `reversed_by_entry_id`.
- **Period check.** A trigger rejects posting an entry whose `entry_date` falls in a period that is not `open`.
- **Account check.** A trigger rejects lines on inactive or non-leaf accounts, and on accounts belonging to a different entity.

### 5.3 Simple layer and contacts

```
contacts          entity_id, kind(customer|supplier|both|other), name, email, phone, tin, address, is_active
transactions      entity_id, kind(money_in|money_out|transfer|owner_in|owner_out|loan_in|loan_repay),
                  txn_date, amount bigint, bank_account_id, counter_account_id, contact_id,
                  tax_code_id null, wht_code_id null, amounts_include_tax bool, reference, notes,
                  status(draft|posted|reversed), journal_entry_id null, statement_line_id null, created_by
bank_accounts     entity_id, ledger_account_id, bank_name, account_name, account_number_masked,
                  account_number_encrypted, currency, kind(current|savings|wallet|cash|card), is_active
```

### 5.4 Banking

```
statement_imports entity_id, bank_account_id, document_id, format(csv|xlsx|pdf_text|pdf_scanned),
                  parser_template, period_start, period_end, opening_balance, closing_balance,
                  balance_check(passed|failed|not_available), status(uploaded|parsing|review|completed|failed),
                  row_count, duplicate_count, error_message
statement_lines   entity_id, import_id, bank_account_id, line_date, description, reference,
                  amount bigint (signed: + inflow, − outflow), running_balance null, dedupe_hash,
                  status(new|suggested|categorised|posted|matched|excluded|duplicate),
                  suggested_account_id, suggested_contact_id, suggestion_source(rule|ai|history),
                  suggestion_confidence numeric(4,3), transaction_id null, matched_entry_id null
                  UNIQUE(bank_account_id, dedupe_hash)
categorisation_rules entity_id, name, priority, conditions jsonb, action jsonb, auto_post bool default false,
                  is_active, hit_count, created_by
reconciliations   entity_id, bank_account_id, statement_end_date, statement_end_balance,
                  ledger_balance, difference, status(in_progress|completed|reopened), completed_by, completed_at
reconciliation_items reconciliation_id, statement_line_id, journal_line_id
```

### 5.5 Documents and financial statement uploads

```
documents         entity_id, storage_key, file_name, mime_type, size_bytes, sha256, kind(receipt|statement|
                  financial_statement|attachment|other), uploaded_by, virus_scan(pending|clean|infected)
document_links    document_id, target_type, target_id
fs_uploads        entity_id, document_id, purpose(import_history|analysis), statement_type(income_statement|
                  balance_sheet|cash_flow|trial_balance), period_start, period_end, currency,
                  scale(units|thousands|millions), status(extracting|review|validated|posted|analysed|failed),
                  arithmetic_check jsonb, posted_entry_id null, created_by
fs_line_items     upload_id, line_no, label, parent_line_no null, is_subtotal bool, amount bigint,
                  prior_amount bigint null, page_no, bbox jsonb null, confidence numeric(4,3),
                  mapped_account_id null, mapped_metric null, mapping_source(user|ai|firm_memory|synonym),
                  mapping_status(unmapped|suggested|confirmed|ignored)
mapping_memory    org_id, normalised_label, account_code, statement_type, use_count
financial_snapshots entity_id, upload_id null, period_start, period_end, source(upload|ledger),
                  metrics jsonb   -- standardised figures: revenue, cost_of_sales, current_assets, …
comparatives      entity_id, fs_upload_id, account_id, period_start, period_end, amount
```

### 5.6 Budgets and tax

```
budgets           entity_id, fiscal_year_id, name, status(draft|active|archived), is_primary bool
budget_lines      budget_id, account_id, period_id, amount bigint
                  UNIQUE(budget_id, account_id, period_id)
budget_alerts     budget_id, account_id null, threshold_pct smallint, channel(in_app|email), last_fired_at
tax_codes         entity_id, kind(vat|wht), name, rate_bps int, effective_from, effective_to null,
                  applies_to(sales|purchases|both), recoverable bool, output_account_id, input_account_id,
                  verified_by null, verified_at null
```

### 5.7 Sales and purchases (Phase 4)

```
invoices / bills  entity_id, contact_id, number, issue_date, due_date, currency, status(draft|sent|
                  partially_paid|paid|void), subtotal, tax_total, total, amount_paid, journal_entry_id
invoice_lines / bill_lines  parent_id, description, account_id, quantity numeric, unit_price bigint, tax_code_id, line_total
payments          entity_id, kind(received|made), contact_id, bank_account_id, date, amount, journal_entry_id
payment_allocations payment_id, invoice_id|bill_id, amount
```

### 5.8 Platform

```
audit_log         org_id, entity_id null, actor_user_id, action, target_type, target_id,
                  before jsonb, after jsonb, reason null, ip, user_agent, at timestamptz
                  -- append-only: no UPDATE/DELETE grants; trigger rejects both
subscriptions     org_id, plan_code, paystack_customer_code, paystack_subscription_code,
                  status, current_period_end, active_entity_count
notifications     user_id, entity_id null, kind, payload jsonb, read_at
jobs              kind, status, payload jsonb, attempts, last_error  -- if not using a hosted queue's own store
```

### 5.9 Row-level security

- RLS is enabled on every table in §5.1–5.8, except `jobs`, which only server code reads. `audit_log` is readable by users with `audit_log.view` for their own org or entity.
- **Read policy:** the requesting user must have an active `membership` in the row's `org_id` with an org-wide role, **or** an unexpired `entity_access` grant for the row's `entity_id`. Accountants and Bookkeepers with org membership also need an `entity_access` grant for each entity they work on, which is how assignment is implemented.
- **Write policies** mirror §3.3.
- Server code that runs with elevated database credentials (background jobs, webhooks) must set the tenant context explicitly and pass the same domain permission checks.

---

## 6. Screens

**Shared rules:**
- All authenticated screens share an app shell: org switcher, entity switcher, mode toggle, global search (`/`), quick add (`N`), notifications and user menu.
- Every list screen has search, filters, sorting, pagination (or virtualised scrolling for ledgers), an empty state with a primary action, and CSV export where it makes sense.

### 6.1 Public and authentication

| Route | Screen | Key elements | Phase |
|---|---|---|---|
| `/` | Landing | Value proposition for both segments, product screenshots, pricing summary, sign-up call to action | 4 |
| `/pricing` | Pricing | Business and Firm plans, FAQ, trial terms | 4 |
| `/signup` | Sign up | Email and password, or Google sign-in; choose "I run a business" or "I'm an accountant/firm" | 0 |
| `/login`, `/mfa`, `/forgot-password` | Authentication | MFA via TOTP; rate-limited | 0 |
| `/invite/[token]` | Accept invitation | Shows the inviting org or entity and the role; accept creates or links the account | 0 |

### 6.2 Onboarding

| Route | Screen | Key elements | Phase |
|---|---|---|---|
| `/onboarding/business` | Business set-up wizard | (1) Business details: legal name, trading name, RC number, TIN, VAT registered, industry. (2) Fiscal year start and go-live date. (3) CoA template, with a preview. (4) Bank accounts. (5) Opening balances: skip, manual, or upload (§4.8). (6) Finish → dashboard with a set-up checklist | 1 |
| `/onboarding/firm` | Firm set-up wizard | Firm details, logo and brand colour, add first client (runs the business wizard for that entity), invite team | 1 |
| `/[entity]/setup` | Set-up checklist | Progress card: CoA reviewed, bank accounts added, opening balances done, first import, first reconciliation | 1 |

### 6.3 Firm practice workspace

| Route | Screen | Key elements | Phase |
|---|---|---|---|
| `/practice` | Client list | Table of client entities. Columns: name, assigned staff, last reconciled date, unreconciled lines, suspense balance, latest locked period, budget alerts, health indicator. Filter by assignee. Bulk actions | 1 (basic), 3 (health) |
| `/practice/clients/new` | Add client | Runs the business wizard under the firm org; optionally invites a client owner | 1 |
| `/practice/team` | Team | Members, roles, entity assignments matrix | 1 |
| `/practice/templates` | Firm templates | Custom CoA templates, categorisation rule packs, report branding | 3 |

### 6.4 Entity workspace

Base route: `/e/[entityId]/…`

| Route | Screen | Key elements | Phase |
|---|---|---|---|
| `dashboard` | Dashboard | **Simple mode:** cash position across bank accounts, money in vs money out (this month and trend), top expense categories, budget status bars, "Needs your attention" (uncategorised lines, unreconciled accounts, set-up items), quick add. **Accountant mode** adds: trial balance check, suspense balance, period status, draft count | 1 |
| `transactions` | Transactions | Filterable list (date, kind, category, contact, bank, status, amount range); row opens a detail drawer | 1 |
| `transactions/new` (drawer) | Quick add | Tabs: Money in, Money out, Transfer, Other. Fields: date, amount, bank, category, contact, VAT and WHT toggles, reference, attachment. Shows a live "This will record:" preview of the journal (in accountant mode) | 1 |
| `transactions/[id]` | Transaction detail | Fields, attachments, linked journal, audit history; Reverse action with a reason | 1 |
| `contacts`, `contacts/[id]` | Contacts | List and detail with transaction history and outstanding balance (Phase 4) | 1 |
| `banking` | Bank accounts | Cards per account: ledger balance, last statement balance, last reconciled date, unreconciled count; actions Import and Reconcile | 2 |
| `banking/import` | Import wizard | (1) Choose account. (2) Upload file (drag and drop; password prompt for protected PDFs). (3) Parsing progress. (4) Parse summary: rows, date range, balance check result, duplicates skipped. (5) Go to review | 2 |
| `banking/review` | Categorise lines | Table of statement lines with a suggested category and contact, a confidence badge, and the suggestion source. Inline edit, bulk categorise, split line, "Create rule from this", exclude. Keyboard-driven (J/K to move, Enter to accept). Post selected | 2 |
| `banking/rules` | Rules | Ordered list; rule editor (conditions: description contains or regex, amount range, direction, reference; actions: account, contact, tax code, auto-post); test the rule against past lines before saving | 2 |
| `banking/reconcile/[bankAccountId]` | Reconcile | Header: statement end date and balance entered; ledger balance; difference (must reach ₦0.00). Two panes: statement lines and ledger lines, with auto-matched pairs pre-ticked. Manual match (one-to-many), create entry from an unmatched line. Complete (enabled only when difference = 0). Prior reconciliations list with PDF report | 2 |
| `accounts` | Chart of accounts | Tree or table by type, code, name, subtype, balance; add, edit, deactivate; import CoA from CSV | 1 |
| `accounts/[id]` | Account ledger | Running-balance ledger for the account with date filter; drill to entries | 1 |
| `journals` | Journals | List by number, date, memo, source, amount, status; filter by source type | 1 |
| `journals/new` | Manual journal | Line grid (account, debit, credit, contact, tax, description); live totals with the difference highlighted; save draft or post; recurring option (Phase 3) | 1 |
| `journals/[id]` | Journal detail | Lines, source link, attachments, audit trail, reversal links, Reverse button | 1 |
| `periods` | Periods and close | Fiscal years with month periods and status chips; lock and unlock (reason required); close checklist (§4.5); year-end close wizard showing a preview of the closing entry | 1 (lock), 3 (checklist, year-end) |
| `budgets` | Budgets | List by fiscal year; set primary | 2 |
| `budgets/[id]` | Budget editor | Grid of accounts × months. Tools: copy from last year's actuals (± %), spread annual amount evenly or by seasonality, fill right; income and expense totals; net budget | 2 |
| `budgets/[id]/vs-actual` | Budget vs actual | Per account and month: budget, actual, variance ₦, variance %, traffic-light colour; YTD view; drill to transactions | 2 |
| `reports` | Reports hub | Cards for each report (§9) with a short description and last-viewed parameters | 1 |
| `reports/[report]` | Report viewer | Parameters (period, comparison, basis, level of detail); rendered statement; click any figure to drill to the ledger; export PDF, XLSX, CSV; save a view | 1 |
| `statements/upload` | Financial statement upload | Choose purpose: "Bring in my history" or "Analyse a statement". Choose statement type, period, currency and scale; upload the file | 3 |
| `statements/[uploadId]/review` | Extraction review | Left: document preview with highlighted source regions. Right: extracted lines (label, amount, prior-year amount, confidence) with mapping drop-downs; arithmetic check panel; Confirm | 3 |
| `statements/[uploadId]/analysis` | Analysis | Key figures, ratio cards with formulas on hover, common-size statements, year-on-year change, AI commentary (labelled), export PDF | 3 |
| `invoices`, `bills`, `payments` | Sales and purchases | Lists, editors, PDF invoice with firm or entity branding, record payment, receivables and payables ageing | 4 |
| `tax` | Tax centre | VAT summary by period (output, input, net payable), WHT schedules (deducted from us and by us), tax code management | 3 |
| `documents` | Documents | All uploaded files with links to what they support; unlinked receipts inbox | 2 |
| `settings/*` | Entity settings | Profile, fiscal year, tax codes, numbering, users and access, notifications, data export, archive entity | 1–4 |
| `audit` | Audit log | Filterable log (actor, action, target, date); entry detail shows a before/after diff | 1 |

### 6.5 Organisation and account

| Route | Screen | Key elements | Phase |
|---|---|---|---|
| `/org/settings` | Org settings | Name, branding, entities list, members | 1 |
| `/org/billing` | Billing | Plan, active entity count, invoices, change plan, payment method (Paystack) | 4 |
| `/account` | My account | Profile, password, MFA, sessions, default display mode | 0 |

---

## 7. Pipelines

All pipelines run as background jobs. Each one is idempotent, retryable and observable: status is visible in the UI, and failures carry a human-readable reason. Uploaded files are virus-scanned before parsing.

### 7.1 Bank statement import

```
upload → scan → detect format → parse → normalise → validate → dedupe → suggest → review (user) → post → reconcile (user)
```

1. **Upload.** Accepted formats are CSV, XLSX and PDF, up to 20 MB. Password-protected PDFs prompt for the password. **The password is used in memory only and never stored or logged.**
2. **Detect format.** The file is matched against a parser template registry (column headers, PDF text signatures). Initial templates: GTBank, Access, Zenith, First Bank, UBA, Moniepoint, OPay, Kuda. Each template is built and tested against real anonymised sample statements, and the priority order is confirmed with pilot users. Files that match no template fall to the generic path.
3. **Parse.**
   - **CSV/XLSX:** a template, or the generic column mapper (user maps date, description, debit, credit or amount, balance; the mapping is saved per bank account).
   - **Text PDF:** text extraction with layout, then the template.
   - **Scanned PDF, or a PDF with no template:** OCR, then AI extraction into a strict schema `{date, description, reference, debit, credit, balance}`.
4. **Normalise.**
   - Dates are parsed to ISO; ambiguous formats (DD/MM vs MM/DD) are resolved by the template or by validating across rows. Nigerian statements default to DD/MM.
   - Amounts become signed minor units.
   - Descriptions are trimmed with whitespace collapsed.
5. **Validate.**
   - If running balances exist: `opening + Σ amounts = closing`, and each row's balance follows from the previous one.
   - A failure marks `balance_check = failed`, highlights the first broken row, and blocks posting until the user fixes or confirms. **For AI-extracted statements, the balance check is the main guard against extraction errors.**
6. **Dedupe.** `dedupe_hash = sha256(bank_account_id | date | amount | normalised_reference || normalised_description)`. Exact hash collisions with existing lines are marked `duplicate`. Near-duplicates (same date and amount, different description) are flagged for the user to decide.
7. **Suggest** (§7.2).
8. **Review and post.** The user accepts or edits suggestions. Posting creates `transactions` and journal entries in one database transaction per batch.

### 7.2 Categorisation

Suggestions are applied in priority order:

1. **Rules** (deterministic). These are ordered, and the first match wins. If the rule has `auto_post = true`, the line posts without review. This is the only automatic posting path, and the user must enable it explicitly per rule.
2. **History.** If the same normalised counterparty was categorised the same way at least 3 times in this entity, the app suggests that category with confidence 0.9.
3. **AI.** The model is sent the description, amount, direction and the entity's CoA, and returns `{account_code, contact_name, confidence, rationale}`. Lines with confidence below 0.6 are shown as "Needs review", with no pre-selection.
4. **Fallback.** Uncategorised lines stay in review. Users can bulk-assign them to suspense, which is flagged on the dashboard.

Every correction feeds back into the history layer and offers "Create a rule?" after 3 similar corrections.

### 7.3 Reconciliation

1. The user selects a bank account and enters the statement end date and end balance. These are pre-filled from the latest import.
2. **Auto-match** candidates are found in this order:
   - (a) a statement line already linked to the transaction it created;
   - (b) same amount, date within ±3 days, unmatched ledger line on the bank account;
   - (c) same amount and a reference match.
   Pairs with more than one candidate are not auto-matched.
3. The user matches the rest manually (one-to-one or one-to-many with equal sums), creates entries for unmatched statement lines, or marks ledger lines as outstanding (uncleared cheques, transfers in transit).
4. `difference = statement_end_balance − (ledger balance at end date − outstanding items)`. **Complete is enabled only at a difference of exactly 0.**
5. Completing the reconciliation freezes its matches and produces a reconciliation report (PDF). Reopening is allowed only for the most recent reconciliation, requires a reason, and is audited.

### 7.4 Financial statement upload: import history

Purpose: bring an entity's past into Kedge.

1. **Upload** a PDF or XLSX of an income statement, balance sheet or trial balance. The user enters the period, currency and scale (units, ₦'000, ₦'m). The app auto-detects the scale from headers and asks the user to confirm it.
2. **Extract.**
   - XLSX: parsed structurally.
   - PDF: text extraction or OCR, then AI extraction into `fs_line_items` with the label, amount, prior-year amount, subtotal flag, hierarchy, page number, bounding box and confidence.
3. **Arithmetic validation** (shown in a check panel):
   - subtotals equal the sum of their children;
   - balance sheet: total assets = total liabilities + equity;
   - income statement: the reported profit equals the computed profit;
   - trial balance: total debits = total credits.
   Failures are highlighted at the line level.
4. **Map.** Each non-subtotal line is mapped to an entity account. Suggestions come from, in order: the firm's mapping memory, a synonym dictionary (for example "Turnover" → revenue, "Trade debtors" → receivables), then AI. Subtotals are not mapped. Every line must be confirmed or explicitly ignored before the upload counts as validated.
5. **Post.**
   - **Balance sheet or trial balance at the cut-over date** → one `opening_balance` journal entry (§4.8).
   - **Prior-period income statements** → stored in `comparatives`, **not posted to the ledger.** Reports use them for prior-year comparison columns. This keeps the ledger free of summarised, unverifiable history.
6. Confirmed mappings are written to `mapping_memory` so the next client's statements map faster.

### 7.5 Financial statement upload: analysis

Purpose: analyse any statement (the entity's own, a prospect's, or a supplier's) without touching the ledger.

1. Steps 1–3 are the same as §7.4. Mapping targets **standard metrics** (`revenue`, `cost_of_sales`, `operating_expenses`, `finance_costs`, `current_assets`, `cash`, `receivables`, `inventory`, `current_liabilities`, `payables`, `total_debt`, `total_equity`, `total_assets`, …) rather than ledger accounts.
2. A `financial_snapshot` is created.
3. **Ratios.** Each one shows its formula, inputs, and a "not computable" state when an input is missing.

| Group | Ratios |
|---|---|
| Profitability | Gross margin, operating margin, net margin, return on assets, return on equity |
| Liquidity | Current ratio, quick ratio, cash ratio |
| Leverage | Debt-to-equity, debt-to-assets, interest cover |
| Efficiency | Receivable days, payable days, inventory days, cash conversion cycle, asset turnover |
| Growth (if comparative present) | Revenue growth, profit growth, equity growth |

4. **Common-size statements:** income statement items as a percentage of revenue, and balance sheet items as a percentage of total assets.
5. **AI commentary.** A short narrative on strengths, risks and questions to ask. It is clearly labelled "AI-generated — verify before relying on it", and every figure it cites must come from the snapshot. Commentary that references a figure not present in the snapshot is rejected and regenerated.
6. **Ledger comparison.** If the snapshot belongs to an entity with ledger data for the same period, the app offers a comparison of uploaded vs ledger figures with differences highlighted.

---

## 8. Budgeting

- Budgets are set per entity, per fiscal year, per account (income and expense; optionally balance sheet accounts for capex), per month. One budget per fiscal year is **primary** and drives dashboards and alerts. The others serve as scenarios, for example "Conservative" and "Growth".
- **Creation tools:**
  - start blank;
  - copy last year's actuals with a uniform or per-account percentage adjustment;
  - copy another budget;
  - annual amount spread evenly or by a seasonality profile;
  - CSV import/export.
- **Budget vs actual:** actuals come from posted journal lines on the accrual basis. Variance is shown in ₦ and %, with favourable/unfavourable judged by account type (income above budget is favourable; expense above budget is unfavourable).
- **Alerts:** per-account or total thresholds (default 80% and 100% of the period budget), delivered in-app and optionally by email. Each alert fires at most once per threshold per period.
- **Simple mode** shows budgets as category spending bars ("You've used 82% of your Fuel budget this month").

---

## 9. Reports

### 9.1 Common behaviour

- **Parameters:** date range or period, comparison (previous period, same period last year, budget, uploaded comparatives), basis (accrual by default; cash), detail level (summary or by account), and an option to show or hide zero lines.
- **Drill-down:** every figure links to the ledger lines that compose it.
- **Exports:**
  - PDF, branded with the entity name and the firm logo where applicable, carrying a basis note, the generation timestamp and a page footer;
  - XLSX with live subtotal formulas;
  - CSV.
- **Integrity banner.** Every report run executes the integrity checks below. Any failure shows a blocking red banner, raises an internal alert, and is treated as a P1 bug.
  - trial balance debits = credits;
  - balance sheet: assets = liabilities + equity;
  - cash flow: closing cash = balance sheet cash and bank.

### 9.2 Report catalogue

| Report | Definition | Phase |
|---|---|---|
| **Trial balance** | Every account's debit or credit balance at a date. Totals must be equal. | 1 |
| **General ledger** | Every line per account for a range, with opening balance, running balance and closing balance. | 1 |
| **Income statement (P&L)** | Revenue − cost of sales = gross profit; − operating expenses (by nature by default) = operating profit; ± other income and finance costs = profit before tax; − income tax = profit for the period. Grouping comes from account subtypes. | 1 |
| **Balance sheet (statement of financial position)** | Non-current and current assets; equity (capital, retained earnings, current year earnings, drawings); non-current and current liabilities. Classification comes from subtypes. | 1 |
| **Cash flow statement (indirect method)** | Profit before tax, adjusted for non-cash items (depreciation, amortisation, unrealised FX) and changes in operating working capital; then investing and financing flows. Built from `cash_flow_category` and the movements on balance sheet accounts. Must reconcile to the change in cash. | 3 |
| **Budget vs actual** | §8 | 2 |
| **Cash position** | Bank and cash balances by account at a date, with last reconciled date | 2 |
| **Expense by category / Income by source** | Simple-mode friendly breakdowns with charts | 1 |
| **VAT summary** | Output VAT, input VAT (recoverable), net payable or refundable for the period, with a transaction listing | 3 |
| **WHT schedules** | WHT deducted from suppliers (payable), and WHT deducted by customers (credit notes receivable), with contact, TIN, amount and rate | 3 |
| **Receivables and payables ageing** | Current, 1–30, 31–60, 61–90 and 90+ days, by contact | 4 |
| **Reconciliation report** | §7.3 | 2 |
| **Journal report** | All entries for a range with their lines; filter by source | 1 |

### 9.3 Financial statement pack

**Phase 3.** A firm can generate a "Financial statement pack" PDF for a period. It contains a cover, an index, the income statement, balance sheet and cash flow with comparatives, and placeholders for notes that the accountant completes in a rich-text editor. Notes are stored per entity per period.

---

## 10. AI features and guardrails

| Feature | Model input | Output | Guardrails |
|---|---|---|---|
| Statement extraction (bank and financial) | Page text or OCR text, plus the target schema | Structured JSON validated against a Zod schema | Balance and arithmetic checks must pass or be explicitly accepted by the user; line-level confidence is shown; source regions are highlighted |
| Categorisation suggestions | Line description, amount, direction, the CoA (codes and names only) | Account code, contact, confidence | Never auto-posts; low confidence means no pre-selection |
| Statement line mapping | Labels, the CoA or metric list | Mapping and confidence | User confirms every line |
| Analysis commentary | Snapshot metrics and ratios only | Short narrative | Figures cross-checked against the snapshot; labelled as AI-generated |

**Rules for every AI call:**
- The model is configured by environment variable.
- Inputs are minimised: no names of individuals or account numbers unless they are necessary for the task.
- Outputs are schema-validated, with one retry on validation failure before failing gracefully to manual entry.
- Every call is logged with token counts and latency, but **without the financial content**.
- Users can turn off AI features per org.

---

## 11. Billing and plans

- **Payment provider:** Paystack subscriptions, billed in NGN.
- **Plans** (prices are placeholders, to be decided):
  - **Business:** 1 entity, up to 3 users, all core features.
  - **Business Plus:** up to 3 entities, 10 users, AI analysis, priority support.
  - **Firm:** priced per active client entity per month, unlimited firm users, branding, firm templates, practice dashboard.
- **Trial:** 14 days, full features, no card required.
- **Plan limits** are enforced in the domain layer through one `entitlements(org)` function.
- **Lapsed subscriptions:** after a 7-day grace period the org becomes **read-only**. Users can still view and export everything, but cannot post. **Data is never deleted for non-payment** without the notice periods set in the terms of service.
- **Webhooks** are signature-verified and idempotent (keyed by Paystack event ID).

---

## 12. Non-functional requirements

| Area | Requirement |
|---|---|
| **Security** | TLS everywhere. Encryption at rest (database and storage). Bank account numbers encrypted at application level and masked on display (last 4 digits). MFA available to all users and enforceable per org. Session expiry after 12 h, with re-authentication for sensitive actions (period unlock, year reopen, billing, data export). Rate limiting on authentication and uploads. Content Security Policy. Dependency scanning in CI. |
| **Privacy and compliance** | Designed for the Nigeria Data Protection Act 2023: privacy notice, lawful basis recorded, data processing agreement template for firms (who are controllers for their clients' data), data subject request handling (export and deletion), and a breach response runbook. Financial records retention is configurable to meet statutory retention requirements; confirm the periods with legal counsel before launch. Never log statement contents, amounts tied to identities, or document text. |
| **Performance** | p95 under 2 s for any report on an entity with 250,000 journal lines. p95 under 300 ms for ledger list pages. A 1,000-row CSV import parsed in under 10 s; a 20-page PDF under 60 s. |
| **Reliability** | Daily backups plus point-in-time recovery. Background jobs retry with exponential backoff, and land in a dead-letter queue with an alert. Target 99.9% monthly availability after launch. |
| **Auditability** | Every mutation is written to `audit_log` in the same database transaction as the change. |
| **Accessibility** | WCAG 2.1 AA: keyboard operability (essential for review and reconcile screens), visible focus, colour never the only signal, screen-reader labels on tables and charts. |
| **Responsiveness** | Fully usable from 360 px width. Dense accountant tables may scroll horizontally *inside* their container, never the page. |
| **Localisation** | English (Nigeria) first. All strings externalised. Currency and number formatting via `Intl` with the `en-NG` locale. |
| **Observability** | Structured logs, error tracking, uptime monitoring, job dashboards. |

---

## 13. Delivery phases and acceptance criteria

Each phase is complete only when all of its acceptance criteria (AC) pass in automated tests where marked (T), or by a manual demo on staging where marked (M).

### Phase 0: Foundation

Scope: monorepo, CI, authentication, orgs, memberships, entities shell, RLS, audit log, design system, app shell.

- **AC-0.1 (T)** A user can sign up, verify their email, log in, enable TOTP MFA, and log in with MFA.
- **AC-0.2 (T)** Sign-up creates an org of the chosen kind, and the creator is Org Owner.
- **AC-0.3 (T)** Invitations work for every role in §3.2, expire after 7 days, and are audited.
- **AC-0.4 (T)** **Tenant isolation:** for every table, a user with no grant on org B gets zero rows from org B through both the API and direct SQL under their database role. The test is generated from a list of every table, so new tables fail CI until they are covered.
- **AC-0.5 (T)** `audit_log` rejects UPDATE and DELETE.
- **AC-0.6 (T)** CI runs typecheck, lint, unit tests, integration tests (against a real Postgres) and e2e smoke tests on every pull request. Merging to `main` deploys to staging.
- **AC-0.7 (M)** The app shell, org and entity switchers, and mode toggle render correctly at 360 px and at 1440 px, in light and dark themes.

### Phase 1: Ledger core

Scope: CoA and templates, journals, periods (lock and unlock), simple transactions, contacts, opening balances (manual), trial balance, general ledger, P&L, balance sheet, journal report, category reports, business and firm onboarding, basic practice list, audit viewer.

- **AC-1.1 (T)** Posting an unbalanced entry is rejected by the domain layer with a typed error, **and** by the database when the domain layer is bypassed. Nothing is written in either case.
- **AC-1.2 (T)** Any attempt to update or delete a posted entry or its lines fails at the database level.
- **AC-1.3 (T)** Reversing an entry creates a mirrored posted entry, links both entries, and nets every affected account to zero.
- **AC-1.4 (T)** Posting into a locked period fails. Unlocking requires the permission and a reason, and is audited.
- **AC-1.5 (T)** Journal numbers are gapless and unique per entity per fiscal year under concurrent posting (50 parallel posts in the test).
- **AC-1.6 (T)** Every row of the §4.4 posting map produces the documented debits and credits, including the VAT-inclusive split and the WHT cases.
- **AC-1.7 (T)** **Property-based test:** for 10,000 randomly generated valid entries, the trial balance always balances, and assets = liabilities + equity (including current year earnings) at every date.
- **AC-1.8 (T)** **Golden dataset:** the fixture company "Adaeze Catering Ltd" (12 months, roughly 400 transactions, hand-calculated expected statements) produces a trial balance, P&L and balance sheet that exactly match the expected figures, to the kobo.
- **AC-1.9 (T)** Idempotency: replaying a post request with the same key returns the same entry and creates nothing new.
- **AC-1.10 (M)** A non-accountant tester completes business onboarding and records 10 transactions in simple mode without help, in under 15 minutes.
- **AC-1.11 (M)** P&L and balance sheet export to PDF and XLSX, and the XLSX subtotals are live formulas.

### Phase 2: Banking and budgets

Scope: bank accounts, statement import (CSV/XLSX first, then PDF templates and AI fallback), dedupe, rules, history and AI categorisation, review screen, reconciliation, documents inbox, budgets, budget vs actual, alerts, cash position.

- **AC-2.1 (T)** Each shipped bank template parses its anonymised sample statements with 100% of rows correct, and the balance check passes.
- **AC-2.2 (T)** Re-importing the same statement, or an overlapping one, creates zero duplicate lines.
- **AC-2.3 (T)** An AI-extracted statement with one deliberately corrupted amount fails the balance check, and the broken row is identified.
- **AC-2.4 (T)** Password-protected PDFs import correctly, and the password appears in no log, database row or job payload. A test asserts this.
- **AC-2.5 (T)** Lines never post without user action, except through a rule with `auto_post = true`.
- **AC-2.6 (T)** Reconciliation cannot be completed with a non-zero difference. Completed matches are frozen.
- **AC-2.7 (T)** The golden dataset's bank statement reconciles to zero difference for every month.
- **AC-2.8 (T)** Budget vs actual matches hand-calculated variances for the golden dataset. Alerts fire once per threshold per period.
- **AC-2.9 (M)** An accountant categorises a 300-line statement in under 10 minutes using the keyboard only.

### Phase 3: Statements, tax and close

Scope: financial statement upload (import history and analysis), comparatives, mapping memory, cash flow statement, tax codes, VAT summary, WHT schedules, close checklist, year-end close and reopen, practice health indicators, firm templates, financial statement pack, recurring journals.

- **AC-3.1 (T)** A trial balance upload (XLSX) for the golden dataset's prior year maps and posts an opening balance entry that leaves `opening_balance_equity` at zero.
- **AC-3.2 (T)** Uploads whose arithmetic fails cannot be posted or analysed until each failure is fixed or explicitly accepted with a reason.
- **AC-3.3 (T)** Imported prior-year income statement figures appear as P&L comparatives and are absent from the ledger.
- **AC-3.4 (T)** Every ratio in §7.5 matches hand-calculated values for two fixture statements, and shows "not computable" when an input is missing.
- **AC-3.5 (T)** The cash flow statement for the golden dataset reconciles to the change in cash and bank, to the kobo.
- **AC-3.6 (T)** A tax rate change via a new effective-dated code applies only to transactions dated on or after `effective_from`.
- **AC-3.7 (T)** Year-end close zeroes all income and expense accounts into retained earnings. Reopening reverses the closing entry, and both actions are audited.
- **AC-3.8 (T)** AI commentary that cites a figure not present in the snapshot is rejected.
- **AC-3.9 (M)** On a 5-page PDF income statement, extraction plus mapping review takes an accountant under 5 minutes.

### Phase 4: Commercial launch

Scope: invoices, bills, payments and allocations, receivables and payables ageing, branded PDF invoices, Paystack billing and entitlements, read-only lapse mode, landing and pricing pages, data export (full entity export as CSV/XLSX, plus attachments as ZIP), NDPA artefacts, security review.

- **AC-4.1 (T)** Invoice, payment and allocation flows post correct entries, and ageing matches fixtures.
- **AC-4.2 (T)** Paystack webhooks are verified and idempotent. Plan limits are enforced. Lapsed orgs are read-only but can export.
- **AC-4.3 (T)** A full entity export re-imports into a fresh entity (round-trip test) with identical trial balances.
- **AC-4.4 (M)** An external penetration test or security review is completed and all high and critical findings are fixed.
- **AC-4.5 (M)** Lighthouse scores of 90 or above for performance and accessibility on the landing and dashboard pages.

### Phase 5+: Expansion

Multi-currency and FX revaluation; open-banking bank feeds; Expo mobile app (record transactions, snap receipts, view dashboards and reports, approve items); public REST API with OAuth; fixed asset register with depreciation runs; group consolidation.

---

## 14. Open questions

| # | Question | Owner | Needed by |
|---|---|---|---|
| 1 | Product domain (name decided: Kedge) | Product owner | Phase 4 |
| 2 | Pricing per plan (NGN) and the firm per-entity price | Product owner | Phase 4 |
| 3 | VAT and WHT seed configuration verified by a Nigerian tax adviser | Product owner + adviser | Phase 3 |
| 4 | Statutory record retention periods and NDPA obligations confirmed by legal counsel | Product owner + counsel | Phase 4 |
| 5 | Pilot firms (target 3) and businesses (target 10) for anonymised statement samples and usability testing | Product owner | Phase 2 |
| 6 | Open-banking provider selection for bank feeds | Engineering | Phase 5 |
| 7 | Whether to support a school-specific module (fees, terms), given the school CoA template | Product owner | Phase 5 |
