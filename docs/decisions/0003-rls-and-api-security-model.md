# 0003. RLS and API security model

- Status: accepted (implements SPEC §5.9; small schema additions, SPEC edit proposed)
- Phase: 0

## Decision

**The API runs as the user.** Route handlers verify the Supabase JWT (`getClaims()`), then run each operation in one transaction under `set local role authenticated` with the caller's claims (`withUser()` in `@kedge/db`). RLS therefore applies to every query the API makes, exactly as it would to direct SQL with the user's token. Domain checks (`can()`) run first. RLS is the backstop, and a backstop firing (SQLSTATE 42501) returns 403.

**The service role is used in one place:** looking up an invitation by token before the visitor is signed in. That lookup only reads.

**Policies call `SECURITY DEFINER` helpers in a private `app` schema** (`app.entity_role`, `app.can`, `app.can_org`, `app.can_grant`, …). This avoids RLS recursion and keeps policies short. The permission matrix is mirrored in `app.permission_matrix`. An integration test asserts it equals `PERMISSION_MATRIX` in `@kedge/core`, and that `app.can()` agrees with `can()` for every role.

**Guards that RLS cannot express** are triggers:
- billing fields on `organisations` (`billing_status`, `plan_code`, `trial_ends_at`) can only be changed by trusted server code, and new orgs must start on a trial;
- an invitee can only mark their own invitation accepted, and nobody can edit an invitation (only revoke or accept it);
- `users.email` is managed by Supabase Auth;
- `audit_log` rejects UPDATE, DELETE and TRUNCATE for every role, including the table owner.

**`anon` has no table privileges.** Everything needed before sign-in runs on the server.

**CSRF.** Cookie-authenticated writes must be same-origin, on top of SameSite cookies. Bearer-token clients (mobile) are exempt.

**MFA.** A user with a verified TOTP factor must present an `aal2` session. The proxy redirects pages to `/mfa`, and the API returns `401 mfa_required`. The `users.mfa_enabled` mirror is set by the server after asking Supabase Auth, never by the client.

## Schema additions beyond SPEC §5.1

- `organisations.created_by`: lets the creator take the first (owner) membership, and only while the org has no members.
- `invitations.accepted_by`, `revoked_at`, `revoked_by`: revocation (SPEC §3.5 says revokes are audited) and acceptance tracking.
- `users` is a profile mirror of `auth.users`, maintained by a trigger.
- Composite foreign keys `(entity_id, org_id) → entities(id, org_id)`, so a row can never pair an entity with another org.

## Operational notes

- **Turn off the Supabase Data API for `public`** in hosted projects (Settings → API → exposed schemas). The app never uses PostgREST. RLS still protects the data if the Data API is left on.
- Personal profile edits have no org, so they are not in `audit_log`. Supabase Auth keeps its own audit trail for credential and MFA changes.
