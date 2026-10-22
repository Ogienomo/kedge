# 0005. Phase 1 schema additions and scope notes

- Status: accepted (PDF export pending a dependency decision)
- Phase: 1

## Context

Building Phase 1 (SPEC §13) needed a few details the spec does not spell out. None of them weakens an accounting rule.

## Decisions

- **`tax_codes.code_key`.** Seeded tax codes carry a stable key (`VAT_STANDARD`, `VAT_ZERO`, `VAT_EXEMPT`). Tax codes are versioned and immutable, so the display name or id cannot identify "the standard VAT code" across versions. Seeded rows stay marked unverified (`verified_by` is null) until an accountant confirms them (rule 10).
- **`transactions.interest_amount` / `interest_account_id`.** A simple-mode loan repayment splits into principal and interest. The posting map (`compileTransaction`) needs the interest portion and the account it goes to, so they are stored on the transaction.
- **Invitations: `emailSent`.** Sending the invitation email is no longer fatal. The invitation is created in the same transaction as its audit row; the email goes out afterwards and its outcome is returned as `emailSent`, so the UI can offer the link to copy instead.
- **`EMAIL_OUTBOX_DIR`.** Without Resend credentials, emails are written to this directory (development and CI). In production with neither set, sending fails loudly rather than silently dropping mail.
- **Golden dataset WHT rate.** The Adaeze Catering fixture creates its own WHT code with an illustrative rate. It is **unverified** and must not be read as a statement of Nigerian law. The fixture's expected figures are a DRAFT until hand-verified (CLAUDE.md, testing requirements).
- **Report export.** CSV and XLSX are implemented. XLSX subtotals and totals are live `SUM` formulas (AC-1.11). **PDF export is deferred**: server-side PDF generation needs a library that is not yet in the stack, which CLAUDE.md says to ask about first. Printing from the browser (print stylesheet) is the interim option.

## Consequences

- AC-1.11 is met for CSV and XLSX only, until a PDF library is chosen.
- AC-1.8 passes against the DRAFT expected figures. It becomes binding once an accountant signs off the fixture.
