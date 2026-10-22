CREATE TYPE "public"."account_subtype" AS ENUM('current_asset', 'non_current_asset', 'bank', 'cash', 'receivable', 'inventory', 'current_liability', 'non_current_liability', 'payable', 'tax_payable', 'equity_capital', 'retained_earnings', 'drawings', 'revenue', 'other_income', 'cost_of_sales', 'operating_expense', 'finance_cost', 'income_tax_expense');--> statement-breakpoint
CREATE TYPE "public"."account_type" AS ENUM('asset', 'liability', 'equity', 'income', 'expense');--> statement-breakpoint
CREATE TYPE "public"."bank_account_kind" AS ENUM('current', 'savings', 'wallet', 'cash', 'card');--> statement-breakpoint
CREATE TYPE "public"."cash_flow_category" AS ENUM('cash', 'operating_working_capital', 'investing', 'financing', 'none');--> statement-breakpoint
CREATE TYPE "public"."contact_kind" AS ENUM('customer', 'supplier', 'both', 'other');--> statement-breakpoint
CREATE TYPE "public"."entry_status" AS ENUM('draft', 'posted');--> statement-breakpoint
CREATE TYPE "public"."fiscal_year_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TYPE "public"."normal_balance" AS ENUM('debit', 'credit');--> statement-breakpoint
CREATE TYPE "public"."period_status" AS ENUM('open', 'locked', 'closed');--> statement-breakpoint
CREATE TYPE "public"."pl_category" AS ENUM('operating', 'investing', 'financing', 'income_tax', 'discontinued');--> statement-breakpoint
CREATE TYPE "public"."sequence_kind" AS ENUM('journal', 'invoice', 'bill');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('manual', 'transaction', 'invoice', 'bill', 'payment', 'statement_import', 'opening_balance', 'year_end_close', 'reversal', 'fx_revaluation');--> statement-breakpoint
CREATE TYPE "public"."system_account_key" AS ENUM('accounts_receivable', 'accounts_payable', 'vat_output', 'vat_input', 'wht_receivable', 'wht_payable', 'retained_earnings', 'opening_balance_equity', 'suspense', 'rounding', 'fx_gain_loss');--> statement-breakpoint
CREATE TYPE "public"."tax_applies_to" AS ENUM('sales', 'purchases', 'both');--> statement-breakpoint
CREATE TYPE "public"."tax_kind" AS ENUM('vat', 'wht');--> statement-breakpoint
CREATE TYPE "public"."transaction_kind" AS ENUM('money_in', 'money_out', 'transfer', 'owner_in', 'owner_out', 'loan_in', 'loan_repay');--> statement-breakpoint
CREATE TYPE "public"."transaction_status" AS ENUM('draft', 'posted', 'reversed');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" "account_type" NOT NULL,
	"subtype" "account_subtype" NOT NULL,
	"normal_balance" "normal_balance" NOT NULL,
	"parent_id" uuid,
	"is_leaf" boolean DEFAULT true NOT NULL,
	"system_key" "system_account_key",
	"cash_flow_category" "cash_flow_category",
	"pl_category" "pl_category",
	"currency" char(3) DEFAULT 'NGN' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_entity_code_key" UNIQUE("entity_id","code"),
	CONSTRAINT "accounts_id_entity_key" UNIQUE("id","entity_id"),
	CONSTRAINT "accounts_code_format" CHECK ("accounts"."code" ~ '^[0-9]{4,6}$'),
	CONSTRAINT "accounts_normal_balance_matches_type" CHECK ("accounts"."normal_balance" = case when "accounts"."type" in ('asset', 'expense') then 'debit'::normal_balance else 'credit'::normal_balance end),
	CONSTRAINT "accounts_cash_flow_on_balance_sheet" CHECK (("accounts"."type" in ('asset', 'liability', 'equity')) = ("accounts"."cash_flow_category" is not null))
);
--> statement-breakpoint
ALTER TABLE "accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"ledger_account_id" uuid NOT NULL,
	"bank_name" text NOT NULL,
	"account_name" text NOT NULL,
	"account_number_masked" text,
	"account_number_encrypted" text,
	"currency" char(3) DEFAULT 'NGN' NOT NULL,
	"kind" "bank_account_kind" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_accounts_ledger_account_key" UNIQUE("ledger_account_id"),
	CONSTRAINT "bank_accounts_id_entity_key" UNIQUE("id","entity_id"),
	CONSTRAINT "bank_accounts_number_never_plain" CHECK ("bank_accounts"."account_number_encrypted" is null or "bank_accounts"."account_number_encrypted" like 'v1:%')
);
--> statement-breakpoint
ALTER TABLE "bank_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"kind" "contact_kind" NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"tin" text,
	"address" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contacts_id_entity_key" UNIQUE("id","entity_id")
);
--> statement-breakpoint
ALTER TABLE "contacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "fiscal_years" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" "fiscal_year_status" DEFAULT 'open' NOT NULL,
	"closing_entry_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fiscal_years_entity_start_key" UNIQUE("entity_id","start_date"),
	CONSTRAINT "fiscal_years_id_entity_key" UNIQUE("id","entity_id"),
	CONSTRAINT "fiscal_years_dates" CHECK ("fiscal_years"."end_date" > "fiscal_years"."start_date")
);
--> statement-breakpoint
ALTER TABLE "fiscal_years" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"number" text,
	"entry_date" date NOT NULL,
	"period_id" uuid,
	"memo" text DEFAULT '' NOT NULL,
	"status" "entry_status" DEFAULT 'draft' NOT NULL,
	"source_type" "source_type" NOT NULL,
	"source_id" uuid,
	"reverses_entry_id" uuid,
	"reversed_by_entry_id" uuid,
	"reversal_reason" text,
	"posted_at" timestamp with time zone,
	"posted_by" uuid,
	"created_by" uuid NOT NULL,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journal_entries_entity_number_key" UNIQUE("entity_id","number"),
	CONSTRAINT "journal_entries_entity_idempotency_key" UNIQUE("entity_id","idempotency_key"),
	CONSTRAINT "journal_entries_id_entity_key" UNIQUE("id","entity_id"),
	CONSTRAINT "journal_entries_posted_complete" CHECK ("journal_entries"."status" = 'draft' or ("journal_entries"."number" is not null and "journal_entries"."posted_at" is not null and "journal_entries"."period_id" is not null and "journal_entries"."idempotency_key" is not null)),
	CONSTRAINT "journal_entries_reversal_reason" CHECK ("journal_entries"."source_type" <> 'reversal' or ("journal_entries"."reverses_entry_id" is not null and coalesce("journal_entries"."reversal_reason", '') <> ''))
);
--> statement-breakpoint
ALTER TABLE "journal_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "journal_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"line_no" smallint NOT NULL,
	"account_id" uuid NOT NULL,
	"debit" bigint DEFAULT 0 NOT NULL,
	"credit" bigint DEFAULT 0 NOT NULL,
	"currency" char(3) DEFAULT 'NGN' NOT NULL,
	"txn_amount" bigint,
	"fx_rate" numeric(20, 10),
	"contact_id" uuid,
	"tax_code_id" uuid,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journal_lines_entry_line_key" UNIQUE("entry_id","line_no"),
	CONSTRAINT "journal_lines_one_side" CHECK (("journal_lines"."debit" > 0 and "journal_lines"."credit" = 0) or ("journal_lines"."credit" > 0 and "journal_lines"."debit" = 0))
);
--> statement-breakpoint
ALTER TABLE "journal_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "number_sequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"fiscal_year_id" uuid NOT NULL,
	"kind" "sequence_kind" NOT NULL,
	"next_value" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "number_sequences_key" UNIQUE("entity_id","fiscal_year_id","kind"),
	CONSTRAINT "number_sequences_positive" CHECK ("number_sequences"."next_value" >= 1)
);
--> statement-breakpoint
ALTER TABLE "number_sequences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"fiscal_year_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" "period_status" DEFAULT 'open' NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" uuid,
	"lock_reason" text,
	"unlock_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "periods_entity_start_key" UNIQUE("entity_id","start_date"),
	CONSTRAINT "periods_id_entity_key" UNIQUE("id","entity_id"),
	CONSTRAINT "periods_dates" CHECK ("periods"."end_date" >= "periods"."start_date"),
	CONSTRAINT "periods_locked_has_time" CHECK ("periods"."status" = 'open' or "periods"."locked_at" is not null)
);
--> statement-breakpoint
ALTER TABLE "periods" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tax_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"code_key" text NOT NULL,
	"kind" "tax_kind" NOT NULL,
	"name" text NOT NULL,
	"rate_bps" integer NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"applies_to" "tax_applies_to" NOT NULL,
	"recoverable" boolean DEFAULT false NOT NULL,
	"output_account_id" uuid,
	"input_account_id" uuid,
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tax_codes_entity_key_from_key" UNIQUE("entity_id","code_key","effective_from"),
	CONSTRAINT "tax_codes_id_entity_key" UNIQUE("id","entity_id"),
	CONSTRAINT "tax_codes_rate_range" CHECK ("tax_codes"."rate_bps" between 0 and 10000),
	CONSTRAINT "tax_codes_effective_range" CHECK ("tax_codes"."effective_to" is null or "tax_codes"."effective_to" >= "tax_codes"."effective_from")
);
--> statement-breakpoint
ALTER TABLE "tax_codes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"kind" "transaction_kind" NOT NULL,
	"txn_date" date NOT NULL,
	"amount" bigint NOT NULL,
	"bank_account_id" uuid NOT NULL,
	"counter_account_id" uuid NOT NULL,
	"contact_id" uuid,
	"tax_code_id" uuid,
	"wht_code_id" uuid,
	"amounts_include_tax" boolean DEFAULT false NOT NULL,
	"interest_amount" bigint,
	"interest_account_id" uuid,
	"reference" text,
	"notes" text,
	"status" "transaction_status" DEFAULT 'draft' NOT NULL,
	"journal_entry_id" uuid,
	"statement_line_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_id_entity_key" UNIQUE("id","entity_id"),
	CONSTRAINT "transactions_amount_positive" CHECK ("transactions"."amount" > 0),
	CONSTRAINT "transactions_posted_has_entry" CHECK ("transactions"."status" = 'draft' or "transactions"."journal_entry_id" is not null)
);
--> statement-breakpoint
ALTER TABLE "transactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_entity_fk" FOREIGN KEY ("entity_id","org_id") REFERENCES "public"."entities"("id","org_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_parent_fk" FOREIGN KEY ("parent_id","entity_id") REFERENCES "public"."accounts"("id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_entity_fk" FOREIGN KEY ("entity_id","org_id") REFERENCES "public"."entities"("id","org_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_ledger_account_fk" FOREIGN KEY ("ledger_account_id","entity_id") REFERENCES "public"."accounts"("id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_entity_fk" FOREIGN KEY ("entity_id","org_id") REFERENCES "public"."entities"("id","org_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_years" ADD CONSTRAINT "fiscal_years_entity_fk" FOREIGN KEY ("entity_id","org_id") REFERENCES "public"."entities"("id","org_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_posted_by_users_id_fk" FOREIGN KEY ("posted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_entity_fk" FOREIGN KEY ("entity_id","org_id") REFERENCES "public"."entities"("id","org_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_period_fk" FOREIGN KEY ("period_id","entity_id") REFERENCES "public"."periods"("id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_reverses_fk" FOREIGN KEY ("reverses_entry_id","entity_id") REFERENCES "public"."journal_entries"("id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_reversed_by_fk" FOREIGN KEY ("reversed_by_entry_id","entity_id") REFERENCES "public"."journal_entries"("id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_entry_fk" FOREIGN KEY ("entry_id","entity_id") REFERENCES "public"."journal_entries"("id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_entity_fk" FOREIGN KEY ("entity_id","org_id") REFERENCES "public"."entities"("id","org_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_account_fk" FOREIGN KEY ("account_id","entity_id") REFERENCES "public"."accounts"("id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_contact_fk" FOREIGN KEY ("contact_id","entity_id") REFERENCES "public"."contacts"("id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_tax_code_fk" FOREIGN KEY ("tax_code_id","entity_id") REFERENCES "public"."tax_codes"("id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "number_sequences" ADD CONSTRAINT "number_sequences_entity_fk" FOREIGN KEY ("entity_id","org_id") REFERENCES "public"."entities"("id","org_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "number_sequences" ADD CONSTRAINT "number_sequences_fiscal_year_fk" FOREIGN KEY ("fiscal_year_id","entity_id") REFERENCES "public"."fiscal_years"("id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "periods" ADD CONSTRAINT "periods_locked_by_users_id_fk" FOREIGN KEY ("locked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "periods" ADD CONSTRAINT "periods_entity_fk" FOREIGN KEY ("entity_id","org_id") REFERENCES "public"."entities"("id","org_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "periods" ADD CONSTRAINT "periods_fiscal_year_fk" FOREIGN KEY ("fiscal_year_id","entity_id") REFERENCES "public"."fiscal_years"("id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_codes" ADD CONSTRAINT "tax_codes_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_codes" ADD CONSTRAINT "tax_codes_entity_fk" FOREIGN KEY ("entity_id","org_id") REFERENCES "public"."entities"("id","org_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_codes" ADD CONSTRAINT "tax_codes_output_account_fk" FOREIGN KEY ("output_account_id","entity_id") REFERENCES "public"."accounts"("id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_codes" ADD CONSTRAINT "tax_codes_input_account_fk" FOREIGN KEY ("input_account_id","entity_id") REFERENCES "public"."accounts"("id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_entity_fk" FOREIGN KEY ("entity_id","org_id") REFERENCES "public"."entities"("id","org_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_bank_account_fk" FOREIGN KEY ("bank_account_id","entity_id") REFERENCES "public"."bank_accounts"("id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_counter_account_fk" FOREIGN KEY ("counter_account_id","entity_id") REFERENCES "public"."accounts"("id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_interest_account_fk" FOREIGN KEY ("interest_account_id","entity_id") REFERENCES "public"."accounts"("id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_contact_fk" FOREIGN KEY ("contact_id","entity_id") REFERENCES "public"."contacts"("id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_tax_code_fk" FOREIGN KEY ("tax_code_id","entity_id") REFERENCES "public"."tax_codes"("id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_wht_code_fk" FOREIGN KEY ("wht_code_id","entity_id") REFERENCES "public"."tax_codes"("id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_journal_entry_fk" FOREIGN KEY ("journal_entry_id","entity_id") REFERENCES "public"."journal_entries"("id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_entity_system_key" ON "accounts" USING btree ("entity_id","system_key") WHERE "accounts"."system_key" is not null;--> statement-breakpoint
CREATE INDEX "contacts_entity_name_idx" ON "contacts" USING btree ("entity_id","name");--> statement-breakpoint
CREATE INDEX "journal_entries_entity_date_idx" ON "journal_entries" USING btree ("entity_id","entry_date");--> statement-breakpoint
CREATE INDEX "journal_entries_source_idx" ON "journal_entries" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "journal_lines_entity_account_idx" ON "journal_lines" USING btree ("entity_id","account_id");--> statement-breakpoint
CREATE INDEX "transactions_entity_date_idx" ON "transactions" USING btree ("entity_id","txn_date");