# 0004. Integration tests on plain PostgreSQL; e2e on the Supabase CLI

- Status: accepted
- Phase: 0

## Decision

- **Integration tests** (`pnpm test:integration`) run on a real PostgreSQL 16+ database, never mocks. A **test-only shim** (`packages/db/src/testing/supabase-shim.sql`) creates the parts of Supabase that migrations depend on: the `anon`, `authenticated` and `service_role` roles, `auth.users`, `auth.uid()` and `auth.jwt()`. The test database is dropped and rebuilt on every run. The reset helper refuses any database whose name lacks "test" or that is not on localhost.
- **API tests** call the same endpoint definitions as the Next.js route handlers (`executeEndpoint`), so validation, auth and error mapping are what production runs. Only JWT verification is substituted: the test supplies verified claims.
- **End-to-end tests** (`pnpm test:e2e`, Playwright) need the real Supabase stack (`supabase start`), because they cover sign-up, email confirmation through Mailpit, and TOTP. They run in CI.
- **AC-0.4 (tenant isolation)** is generated from `TENANT_TABLES`. A test fails when the live schema has a table missing from the registry, and the API test fails when an endpoint that takes an ID is missing from its target map.
