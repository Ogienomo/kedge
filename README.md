# Kedge

Double-entry accounting for Nigerian small businesses and the accounting firms that serve them.

- **Product spec:** [`SPEC.md`](SPEC.md) is the source of truth.
- **Working rules:** [`CLAUDE.md`](CLAUDE.md) covers the non-negotiable accounting, security and testing rules.
- **Decisions:** [`docs/decisions/`](docs/decisions).

## Status

Phase 0 (Foundation) is built: monorepo, CI, authentication with TOTP MFA, organisations, memberships, entity shells, invitations, RLS on every table, an append-only audit log, the design system and the app shell. See SPEC §13 for what comes next.

## Getting started

Requirements: Node 22.12+, pnpm 10, the [Supabase CLI](https://supabase.com/docs/guides/local-development) and Docker.

```sh
pnpm install
supabase start                              # Postgres, Auth and Mailpit on localhost
cp .env.example apps/web/.env.local         # then fill in the keys printed by `supabase status`
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54322/postgres pnpm db:migrate
pnpm dev                                    # http://localhost:3000
```

Without `RESEND_API_KEY`, app emails (invitations) are written to `apps/web/.dev-outbox/`. Supabase's own emails (sign-up confirmation, password reset) appear in Mailpit at http://127.0.0.1:54324.

## Tests

```sh
pnpm typecheck && pnpm lint && pnpm test    # fast checks
pnpm test:integration                       # needs Postgres on :54322 (supabase start is enough)
pnpm --filter @kedge/web build && pnpm test:e2e   # needs supabase start and migrations applied
```

## Layout

```
apps/web          Next.js app: pages, /api/v1 route handlers, server services
packages/core     Pure domain logic: permissions (can()), invitation rules, typed errors
packages/db       Drizzle schema, SQL migrations (RLS, triggers), test fixtures
packages/api      Zod request/response contracts and the typed API client
packages/ui       Design tokens and shared components
packages/config   tsconfig, ESLint, APP_NAME and other constants
supabase/         Local Supabase config and auth email templates
```
