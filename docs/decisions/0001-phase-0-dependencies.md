# 0001. Phase 0 dependencies and versions

- Status: accepted (approved by the product owner, 22 Oct 2026)
- Phase: 0

## Context

CLAUDE.md asks for approval before adding dependencies outside the stack table. Phase 0 needed a few that the stack implies but does not name.

## Decision

Added, with approval:

| Package | Why |
|---|---|
| `postgres` (postgres.js) | Driver Drizzle uses with Supabase; works with the transaction pooler (`prepare: false`). |
| `radix-ui`, `lucide-react`, `class-variance-authority`, `clsx`, `tailwind-merge` | The primitives shadcn/ui components are built on. |
| `tsx` (dev) | Runs migration and seed scripts. |
| `eslint-config-next`, `@types/*` (dev) | Next.js lint rules and type definitions. |

Version notes:

- **TypeScript 6.0**, not 7. `typescript-eslint` supports `<6.1`, and TS 7 (the native compiler) has no compatible lint integration yet. Revisit when typescript-eslint supports 7.
- **Next.js 16** renamed Middleware to **Proxy** (`src/proxy.ts`). It only refreshes the session cookie and makes optimistic redirects; authorisation stays in the API layer and RLS.
- **Zod 4**, **Tailwind CSS 4** (CSS-first config; tokens live in `@kedge/ui/tokens.css`), **Vitest 5**.
- Email goes to Resend over its HTTP API with `fetch`, so no Resend SDK is needed.
- Every version is pinned exactly in `package.json`.
