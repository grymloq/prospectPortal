# Deployment record — 8 September 2026

## Scrims and membership approval — 8 October 2026

The scrim increment adds configurable equal-size internal/external teams, list deadlines, frozen submitted armies, team-private planning matrices, captains, fixed pairings, shared results with mirrored journals, and membership approval. Multi-round events remain future work.

Validation before release: lint, production build, 53 domain tests and 29 HTTP checks passed. The HTTP suite includes membership approval/revocation and simultaneous scrim reporting. Browser checks on an isolated local database covered calendar creation, four-player roster assignment, direct army submission, My Armies persistence, matrix editing/comments, journal autofill, mirrored-result completion and visible validation errors. Responsive checks at 320px and 390px had no page overflow; the matrix scrolls within its own panel. No fixture scrims were added to production.

Production data rollout: `scripts/confirm-existing-members.sql` was run against **obahctwhpbmtyeybxodq** at 2026-10-08 13:46 UTC. Portal revision advanced from 135 to 136; all four existing portal user records became confirmed. Every existing Auth user already had a portal record. The digest of all non-membership content was identical before and after. RLS remained enabled and anon/authenticated roles had no direct portal-table privileges. The migration is additive and idempotent; the stored cutoff also handles older Auth accounts if later provisioned.

The screen preview uses fictional data from `.local/scrim-qa/browser.sqlite`; it is separate from both the normal local database and production.

Security advisor observations: the existing deny-all `portal_state` design produces an informational “RLS enabled, no policy” notice. The existing `rls_auto_enable()` event-trigger function produces [anon](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) and [authenticated](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) execution-grant notices; no new function or grants were introduced. The actual `portal_commit` function uses invoker permissions and is not executable by anon/authenticated roles. [Leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) is currently disabled. These pre-existing settings were left outside the scrim change.

- Live site: https://prospect-portal-one.vercel.app
- Repository: https://github.com/grymloq/prospectPortal
- Vercel project: prospect-portal, team emil-soderholms-projects.
- Supabase project: obahctwhpbmtyeybxodq, Geodesis Org, free plan, EU West (Ireland).
- Production builds follow pushes to main. Node.js 24, Next.js App Router.
- Four production environment variables are configured. Backend credentials stay server-only.
- Initial administrator: emil.barkin@gmail.com. A one-time setup link was opened privately.
- Production contains no fictional/demo players. The local SQLite database remains untouched.

## Verification

Local build/lint, 10 domain tests, and 12 HTTP integration checks passed.
The deployed site passed checks for anonymous access denial, real Supabase sign-in,
secure HTTP-only cookies, member privacy, forged-role rejection, origin validation,
team applications and visible phases, internal discussion filtering, stale evaluation
rejection, concurrent event approval capacity, and sign-out. Temporary test accounts
and their portal records were removed afterwards.

Direct database checks verified anonymous read/write denial and atomic compare-and-swap
transactions. Live browser inspection verified the production sign-in page has no demo
buttons and the administrator setup link reaches the password form.

## Outstanding sender setup

Public signup and password-reset email delivery require custom SMTP and a verified
sending domain. No email provider has been configured yet. Email verification remains
enabled. The default Supabase sender is limited to organization members.

## Storage boundary

Production currently uses a private, versioned Postgres JSON document behind server
authorization, with RLS enabled and browser database roles denied access. This is not
a normalized schema. See README for the migration boundary and administrator tooling.
