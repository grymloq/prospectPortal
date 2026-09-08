# Deployment record — 8 September 2026

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
