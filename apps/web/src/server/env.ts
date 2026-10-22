import { z } from "zod";

/**
 * Server environment, validated on first use. Secrets are read only from
 * here; never from process.env directly elsewhere.
 */
const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.url(),
  DATABASE_URL: z.string().min(1),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(3).default("Kedge <no-reply@example.com>"),
  /** Write emails to this directory instead of sending them (local, CI). Ignored when RESEND_API_KEY is set. */
  EMAIL_OUTBOX_DIR: z.string().min(1).optional(),
  SENTRY_DSN: z.string().optional(),
  BANK_ACCOUNT_ENCRYPTION_KEY: z.string().min(40).optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    // Report variable names only, never values.
    const names = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid server environment: ${names}`);
  }
  cached = parsed.data;
  return cached;
}
