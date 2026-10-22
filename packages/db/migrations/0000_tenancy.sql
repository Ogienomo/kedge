CREATE TYPE "public"."billing_status" AS ENUM('trialing', 'active', 'past_due', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."display_mode" AS ENUM('simple', 'accountant');--> statement-breakpoint
CREATE TYPE "public"."entity_role" AS ENUM('accountant', 'bookkeeper', 'client_owner', 'client_staff', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."entity_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."invitation_role" AS ENUM('org_admin', 'accountant', 'bookkeeper', 'client_owner', 'client_staff', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."membership_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."org_kind" AS ENUM('firm', 'business');--> statement-breakpoint
CREATE TYPE "public"."org_role" AS ENUM('org_owner', 'org_admin', 'accountant', 'bookkeeper');--> statement-breakpoint
CREATE TABLE "entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"legal_name" text NOT NULL,
	"trading_name" text,
	"rc_number" text,
	"tin" text,
	"vat_registered" boolean DEFAULT false NOT NULL,
	"functional_currency" char(3) DEFAULT 'NGN' NOT NULL,
	"fiscal_year_start_month" smallint DEFAULT 1 NOT NULL,
	"timezone" text DEFAULT 'Africa/Lagos' NOT NULL,
	"industry" text,
	"coa_template" text,
	"go_live_date" date,
	"status" "entity_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entities_id_org_key" UNIQUE("id","org_id"),
	CONSTRAINT "entities_fiscal_year_start_month_check" CHECK ("entities"."fiscal_year_start_month" between 1 and 12)
);
--> statement-breakpoint
ALTER TABLE "entities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "entity_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "entity_role" NOT NULL,
	"expires_at" timestamp with time zone,
	"granted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entity_access_entity_user_key" UNIQUE("entity_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "entity_access" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"entity_id" uuid,
	"email" text NOT NULL,
	"role" "invitation_role" NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by" uuid,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid,
	"invited_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_token_hash_key" UNIQUE("token_hash"),
	CONSTRAINT "invitations_email_lowercase" CHECK ("invitations"."email" = lower("invitations"."email"))
);
--> statement-breakpoint
ALTER TABLE "invitations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "org_role" NOT NULL,
	"status" "membership_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_org_user_key" UNIQUE("org_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "organisations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" "org_kind" NOT NULL,
	"plan_code" text,
	"billing_status" "billing_status" DEFAULT 'trialing' NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"logo_file_id" uuid,
	"brand_colour" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organisations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_entity_prefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"display_mode" "display_mode" NOT NULL,
	"last_viewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_entity_prefs_user_entity_key" UNIQUE("user_id","entity_id")
);
--> statement-breakpoint
ALTER TABLE "user_entity_prefs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"full_name" text,
	"phone" text,
	"mfa_enabled" boolean DEFAULT false NOT NULL,
	"locale" text DEFAULT 'en-NG' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"entity_id" uuid,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text,
	"before" jsonb,
	"after" jsonb,
	"reason" text,
	"ip" text,
	"user_agent" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_access" ADD CONSTRAINT "entity_access_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_access" ADD CONSTRAINT "entity_access_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_access" ADD CONSTRAINT "entity_access_entity_fk" FOREIGN KEY ("entity_id","org_id") REFERENCES "public"."entities"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_accepted_by_users_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_entity_fk" FOREIGN KEY ("entity_id","org_id") REFERENCES "public"."entities"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organisations" ADD CONSTRAINT "organisations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_entity_prefs" ADD CONSTRAINT "user_entity_prefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_entity_prefs" ADD CONSTRAINT "user_entity_prefs_entity_fk" FOREIGN KEY ("entity_id","org_id") REFERENCES "public"."entities"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_entity_fk" FOREIGN KEY ("entity_id","org_id") REFERENCES "public"."entities"("id","org_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_one_owner_per_org" ON "memberships" USING btree ("org_id") WHERE "memberships"."role" = 'org_owner';--> statement-breakpoint
CREATE INDEX "audit_log_org_at_idx" ON "audit_log" USING btree ("org_id","at");--> statement-breakpoint
CREATE INDEX "audit_log_entity_at_idx" ON "audit_log" USING btree ("entity_id","at");