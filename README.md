# Team Sweden — prospect portal

Next.js App Router, React, TypeScript, Supabase Auth/Postgres, and Vercel. Production uses Supabase; a separate local SQLite demo remains available.

## Run locally

Requires Node.js 24+ (the local store uses `node:sqlite`).

```sh
npm install
npm run dev
```

Open http://127.0.0.1:3000. Both development and production scripts bind to loopback. `start-local.cmd` is a Windows shortcut for starting the development server from this folder.

The sign-in screen has **Try admin view** and **Try player view** buttons. These use intentionally public local demonstration accounts:

| Account | Email                   | Password   |
| ------- | ----------------------- | ---------- |
| Admin   | admin@teamsweden.local  | Sweden40k! |
| Player  | player@teamsweden.local | Sweden40k! |

All seeded people, applications, evaluations, and games are fictional. Registration creates a member account; it cannot create an admin. Sign out to change accounts. New members can submit a team application and apply for events.

## Implemented

- Private player profiles with stats, matchup summaries, and game journals.
- Admin prospect roster with search, faction/phase filters, and pagination.
- One shared 18-criterion evaluation, with revision checks and archived score/note versions.
- Separate player-visible and admin-only conversations, filtered by the server.
- Focus goals, evidence notes, game links, and admin completion review.
- Journal creation, editing, and deletion for the owner; admin review of every journal.
- Both armies, up to three detachments each, compatible Force Disposition, list URLs, opponent, 0–20 score, explicit outcome, date, context, and reflection.
- Ongoing applications, configurable review phases, rejection/reinstatement, and an eight-player selected-squad ceiling.
- Calendar and agenda views, event creation/editing/cancellation, location, Stockholm date/time, capacity, attendance applications, approval/decline, and withdrawal.
- Transactional event capacity checks and phase changes, including concurrent approval protection.
- English interface, phone layouts, native accessible dialogs, and keyboard focus styling.

## Local persistence and migration boundary

`src/server/store.ts` is the local adapter. It stores the application document transactionally in SQLite at `.local/team-sweden.sqlite`, with separate opaque sessions. Passwords use salted scrypt hashes. Cookies are HTTP-only and SameSite=Strict; mutation routes validate the request origin. The SQLite database and import caches are ignored by Git. `TEAM_DB_PATH` can select a separate database; tests use this to avoid changing local demo records.

`src/server/service.ts` owns authorization, validation, filtered views, and domain mutations. `src/lib/types.ts` defines the domain model. UI components call the API and never receive password hashes, other members' profiles, or confidential admin content in a member response.

## Production deployment

Repository: https://github.com/grymloq/prospectPortal
Vercel: https://prospect-portal-one.vercel.app
Supabase: project obahctwhpbmtyeybxodq (EU West, Ireland).

Apply the checked-in SQL in supabase/migrations before publishing. Set the four variables listed in .env.example in Vercel's **Production** environment. Keep the backend secret out of browser bundles and source control. Preview environments intentionally have no production database credentials.

Vercel always disables local/demo mode, even if TEAM_LOCAL_DEMO or TEAM_DB_PATH is set. A production server with missing configuration fails closed. Development without Supabase configuration uses the local demo; production-mode local demo runs require TEAM_LOCAL_DEMO=true.

Supabase Auth owns accounts, password hashing, verification, rate limits, and recovery. HTTP-only secure cookies carry sessions. API route handlers refresh sessions and verify users with getUser; no protected data is rendered in server components. Site URL and callback allowlist must match the production URL. Configure custom SMTP before opening registration to the public; the default Supabase sender only delivers to organization members.

The cloud adapter preserves the domain rules in service.ts. A private Postgres JSON document holds this small team's application state. RLS is enabled, with all table access and commit RPC execution revoked from anonymous and authenticated browser roles. Only the server backend secret accesses storage; every HTTP request verifies its user and builds an authorized response. An atomic revision-checked SQL update provides optimistic transactions. On contention, domain rules re-run against the latest state, protecting squad/event capacity and evaluation versions.

This is intentionally a server-mediated document model, **not normalized per-entity tables or direct browser RLS access**. Split into normalized tables with per-row policies before introducing direct Supabase client queries, large journal volumes, or cross-team tenancy. No local sample data is copied to production.

To grant an administrator, first register and confirm their account, then load production environment variables into a trusted shell and run:

```sh
node scripts/set-admin.mjs person@example.com
```

The role is stored in trusted Auth app_metadata.portal_role and synchronized on each authenticated request. Signup user metadata cannot grant admin. Never use a first-registrant-becomes-admin rule.

Recovery is available at /forgot-password. Email links use PKCE: open them in the same browser where signup/reset was requested. /auth/error explains expired/mismatched links.
## New Recruit catalogue

The checked-in catalogue was retrieved from New Recruit on 8 September 2026. It contains 36 faction/catalogue choices and 432 faction-specific detachment choices (shared choices across chapters count more than once). The two Titan catalogues do not expose their own detachment configuration and use their source-defined Take and Hold disposition exception.

```sh
npm run catalogue:refresh
```

The importer resolves catalogue links, chapter-specific visibility and point overrides, source IDs, revisions, and disposition categories. Dispositions are the **union** of those supplied by the selected detachments, consistent with the source's category-presence conditions. It saves only the selector data, not unit rules. Failed imports leave the prior catalogue in place.

This is a journal configuration selector, not a full New Recruit roster validator: battle-size budgets, all roster-dependent modifiers, allies, and unit legality are not simulated. Historical games store names and the catalogue revision alongside source IDs.

Sources:

- https://www.newrecruit.eu/api/rpc?p0=get_library
- https://www.newrecruit.eu/api/rpc?p0=books_get_book_row&p1=827374861&p2=827374861
- Faction rows from that library, fetched through `books_get_book_row`.

## Validation

```sh
npm run lint
npm run build
npm test
npm run test:http
```

`npm test` exercises ten domain/privacy checks against a temporary local database. `test:http` starts the production build on loopback port 3107 with an isolated temporary database, runs twelve end-to-end API checks, stops its server, and removes only its own test database. Run the build before that command.

Browser checks covered admin sign-in, roster/profile navigation, all 18 rating controls, the game-entry modal, the three-detachment limit, compatible disposition choices, event details, and responsive overflow. The API suite covers registration, player privacy, team application, phase visibility, messages, journal persistence, focus goals, concurrent event approvals, and sign-out.

## Remaining product decisions

- Final criterion rubrics and English terminology, especially “Bordsalfa & Bordshök”. Original labels are retained as tooltips in the evaluation form.
- Draw thresholds and penalties: score and Win/Draw/Loss remain separate inputs.
- Notification channels, waitlists, event application deadlines, message editing/attachments, and multi-admin agreement are not implemented.
- Current working behavior displays a rejected player as “Not selected”; detailed admin reasons remain private.
- New Recruit refresh is a script, not an admin UI importer.

The living design document is in design/product-design.md. `design/` contains the generated visual reference and implementation tokens.
