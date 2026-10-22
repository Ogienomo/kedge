import { createDb, type AuthClaims, type DbHandle } from "@kedge/db";
import { testDatabaseUrl } from "@kedge/db/testing";
import type { ServiceContext } from "../context";
import { memorySender, type EmailMessage } from "../email";
import { executeEndpoint, type Endpoint, type EndpointResult } from "../api/endpoint";

/** Test-only key (32 zero-ish bytes); production keys come from the environment. */
export const TEST_BANK_KEY = Buffer.alloc(32, 7).toString("base64");

/** The web app's integration tests use their own database next to the db package's. */
export function webTestDatabaseUrl(): string {
  const url = new URL(testDatabaseUrl());
  url.pathname = `${url.pathname}_web`;
  return url.toString();
}

export interface Harness {
  readonly handle: DbHandle;
  readonly outbox: EmailMessage[];
  call<P extends string, B, Q>(
    def: Endpoint<P, B, Q>,
    opts: {
      claims?: AuthClaims | null;
      params?: Record<string, string>;
      body?: unknown;
      query?: Record<string, string>;
      idempotencyKey?: string;
      now?: Date;
      hasVerifiedFactor?: boolean;
    },
  ): Promise<EndpointResult>;
}

export function createHarness(): Harness {
  const handle = createDb(webTestDatabaseUrl());
  const email = memorySender();
  return {
    handle,
    outbox: email.sent,
    call(def, opts) {
      const ctx: ServiceContext = {
        db: handle.db,
        claims: opts.claims ?? null,
        now: opts.now ?? new Date(),
        meta: { ip: "127.0.0.1", userAgent: "vitest" },
        email,
        appUrl: "http://localhost:3000",
        bankAccountKey: TEST_BANK_KEY,
        mfa: { hasVerifiedFactor: async () => opts.hasVerifiedFactor ?? false },
      };
      return executeEndpoint(def, ctx, { params: opts.params ?? {}, body: opts.body, query: opts.query ?? {}, idempotencyKey: opts.idempotencyKey ?? null });
    },
  };
}

/** Extracts the invitation token from the last invitation email sent to `to`. */
export function tokenFromOutbox(outbox: readonly EmailMessage[], to: string): string {
  const msg = [...outbox].reverse().find((m) => m.to === to && m.kind === "invitation");
  const match = msg?.text.match(/\/invite\/([A-Za-z0-9_-]+)/);
  if (!match?.[1]) throw new Error(`No invitation email for ${to}`);
  return match[1];
}

export function body<T>(result: EndpointResult): T {
  return result.body as T;
}
