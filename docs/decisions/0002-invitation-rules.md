# 0002. Who can invite whom

- Status: accepted (clarifies SPEC §3.3 and §3.5; SPEC edit proposed)
- Phase: 0

## Context

SPEC §3.3 grants `entity.users.invite` to Owner, Admin, Accountant (assigned) and Client Owner ("Staff, Viewer" only), and `org.users.manage` to Owner and Admin. It does not say which roles an Accountant may invite, or how firm staff are assigned to a client through an invitation.

## Decision

Implemented in `invitableRoles()` (`packages/core/src/invitations`) and mirrored in the RLS helper `app.can_grant()`:

| Inviter | Org scope | Entity scope |
|---|---|---|
| Org Owner, Org Admin | Org Admin, Accountant, Bookkeeper | Accountant, Bookkeeper, Client Owner, Client Staff, Viewer |
| Accountant (assigned to the entity) | — | Client Owner, Client Staff, Viewer |
| Client Owner | — | Client Staff, Viewer |
| Bookkeeper, Client Staff, Viewer | — | — |

- **Org Owner is never invited.** There is exactly one, and ownership is transferred (a later feature), not granted.
- **Org Admin is org-scope only.** Client roles are entity-scope only.
- **Accountant or Bookkeeper invited to an entity** gets an org membership with that role (if they have none) **and** an entity grant. That is the assignment model of SPEC §5.9. Invited at org scope, they get the membership only and are assigned later.
- Accepting requires the signed-in user's email to match the invitation, case-insensitively.
- A person can have only one pending invitation per org and scope. To resend, revoke and invite again.
- Only a hash of the token (SHA-256) is stored. The token itself exists only in the email.
