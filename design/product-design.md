# Swedish Warhammer 40,000 National Team — Product Design

Status: Living draft v0.9, 8 September 2026. Requirements marked **Confirmed** come from the brief and subsequent answers. Items marked **Proposed** are working recommendations, not approved decisions. **Open** items need clarification before dependent implementation.

## 1. Purpose and scope

**Confirmed:** Help admins evaluate prospects, review their games, guide their development, and manage their progress toward selection for the Swedish national Warhammer 40,000 team.

The player profile is the central workspace: game history and statistics, development goals, selection progress, and conversations. Admins additionally see confidential evaluations and discussions.

**Proposed:** Selection remains a human decision. Evaluation scores and game statistics support discussion; they never automatically accept, advance, or reject a player.

## 2. People, roles, and selection status

**Confirmed:** The site supports admins, prospects, and players. All can keep a game journal. Admins can evaluate prospects and review every user's game journal.

**Confirmed — enrollment:** Anyone can register. Admin approval is required to become a prospect; registering does not automatically enter a user into selection.

**Confirmed:** Everyone can apply in the broad initial application stage. Admins approve prospects, and later configurable phases narrow the pool until eight players are selected.

**Proposed:** Newly registered members can maintain their own profile and journal, then submit a team application. Applicants enter the application phase; admin approval advances them into the prospect pool. Application submission, prospect approval, and subsequent phase changes are separate recorded actions.

**Proposed:** Separate permissions from selection status:

- Account role: admin or member.
- Selection participation: applicant, approved prospect, or selected player in one ongoing process.
- Selection stage: a configurable phase, with an initial application phase and final selected phase.
- Rejection: a separate outcome, rather than an ordinary progression stage.

This allows an admin to keep a journal and preserves accounts and history after rejection or removal from the selected squad. “Selected player” identifies one of the eight squad members; any additional permissions for selected players remain **Open**.

### Permission baseline

| Capability | Profile owner | Other members | Admin |
| --- | --- | --- | --- |
| Keep own journal | Yes | Own journal only | Yes |
| Read a player's profile and statistics | Yes | No | Yes |
| Read a player's game journal | Yes | No | Yes, all journals |
| Read or reply to player-visible profile conversation | Yes | No | Yes |
| Read or write admin-only profile conversation | No, unless admin | No | Yes |
| Read or edit prospect evaluations | No, unless admin | No | Yes |
| Create focus goals for a prospect | No | No | Yes |
| Change selection stages or outcomes | No | No | Yes |
| Configure selection stages | No | No | Yes |
| Create events and approve attendance | No | No | Yes |
| Apply for an event | Yes, all registered users | Own application only | Yes |

**Open:** Admin role assignment and whether admins may evaluate themselves if they are also candidates.

## 3. Main experience and navigation

**Confirmed:** The application interface is in English. The original Swedish evaluation labels below are retained as source wording; English display labels will preserve their meaning, with ambiguous terms reviewed before implementation.

**Proposed:** A restrained, Swedish national team identity: deep blue, yellow accents, readable typography, and accessible contrast. Design for recording games on a phone and comparing prospects on a desktop. No visual concept or implementation has been approved yet.

### Member navigation

- **Overview:** current selection stage, active goals, recent games, and unread messages.
- **My profile:** profile details, statistics, journal, goals, and conversations.
- **Log a game:** a prominent action available throughout the site.
- **Calendar:** upcoming events, event details, and the member's own application status.
- **Team application:** submit an application and view the current selection phase.

**Confirmed:** Members can access only their own profiles, statistics, and journals. Admins can access everyone. Member navigation has no player directory.

### Admin navigation

- **Prospects:** searchable roster with stage, faction, goal progress, last game, and evaluation completeness.
- **Game review:** all journals, filtered by player, date, faction, outcome, and context.
- **Selection:** configurable stages and manual progression decisions.
- **Events:** calendar management, capacity, applications, and attendance approval.
- **Settings:** users, roles, selection configuration, and any approved scoring configuration.

### Player profile

| Section | Content | Visibility |
| --- | --- | --- |
| Header | Name, avatar, factions, selection stage | Owner and admins only |
| Overview | Game statistics, recent activity, active goals | Owner and admins only |
| Journal | Game history and individual game details | Owner and admins only |
| Development | Focus list and supporting evidence | Proposed: owner and admins |
| Conversation | Player/admin discussion | Owner and admins only |
| Evaluation | Scores, notes, and score history | Admins only |
| Internal discussion | Confidential admin discussion | Admins only |

**Proposed:** Keep the player conversation and internal admin discussion in distinctly labelled tabs. Internal messages have a persistent “Admin only” label and a clearly separate composer to reduce accidental disclosure.

## 4. Prospect evaluations

**Confirmed:** Admins evaluate prospects on a scale of 1–5 across these 18 criteria. Each prospect has one shared evaluation that admins edit together. Evaluation data is visible only to admins.

| # | Criterion, as supplied |
| --- | --- |
| 1 | Kunskap kring Grundregler, WTC FAQ & GW FAQ |
| 2 | Kunna sin egen armes regler |
| 3 | Motståndarens Armes regler |
| 4 | Kartförståelse |
| 5 | Förmåga att hantera stress & motgångar |
| 6 | Initiativförmåga |
| 7 | Pålitlighet |
| 8 | Diskussionsförmåga |
| 9 | Laganda |
| 10 | Sportmannaskap |
| 11 | Vinnarskalle |
| 12 | Klockhantering |
| 13 | Analytisk förmåga predictions, matchstrategi & deployment |
| 14 | Bordsalfa & Bordshök |
| 15 | Saklighet och överblick mellan faktionerna |
| 16 | Sannolikhetsbedömning |
| 17 | Precision |
| 18 | Närstrid och dess movement |

**Proposed scoring behavior:**

- Scores are whole numbers from 1 to 5. Unrated is a separate empty state; it is never zero.
- Each criterion supports an explanatory note and optional reference to a game or observation.
- Display the last editing admin and date for each score so admins can distinguish current evidence from older impressions.
- Preserve changes so improvements and disagreements can be reviewed over time.
- Prefer a labelled score table or horizontal bars for comparison. Do not rely on a radar chart alone.
- Prevent silent overwrites when admins edit simultaneously: detect stale changes and ask the editing admin to review the newer value before saving.
- Do not invent an overall ranking or weighting system without agreement.

**Open:** What does each score mean? Are criteria fixed or admin configurable? Should evaluation history support phase snapshots as well as dates? Are any criteria weighted?

**Proposed rubric for discussion:** 1 = substantial development needed; 2 = inconsistent; 3 = reliable baseline; 4 = strong; 5 = exceptional. Criterion-specific examples should be agreed by admins, especially for subjective criteria such as “Bordsalfa & Bordshök”.

## 5. Conversations and confidentiality

**Confirmed:** Each prospect has a conversation space for the player and admins. Admins can also write messages hidden from the player. Other players cannot access either conversation.

**Proposed:**

- Two discussion streams on the same profile: player-visible and admin-only.
- Each message records author, timestamp, and visibility.
- Replies inherit the visibility of their stream.
- Editing or deletion leaves an admin-visible history.
- An internal message cannot be made player-visible by a casual toggle; sharing feedback creates a deliberate new player-visible message.
- Confidential evaluations and messages are excluded from member API responses, notifications, searches, exports, and activity summaries.
- Authorization is enforced on the server and in data access policies, including direct requests to another profile or message ID.

**Open:** Attachments, notification channels, and whether players can initiate new topics rather than using one continuous conversation.

## 6. Game journal

**Confirmed:** Every user can record games with their army, up to three detachments, and disposition, an army-list link, the opponent's corresponding army configuration, opponent name, outcome, date, and context. Admins can review all journals. Detachments and dispositions are distinct selectable concepts.

| Field | Working definition | Status |
| --- | --- | --- |
| Player | The user who owns the journal | Confirmed |
| Date | Date the game was played | Confirmed |
| Own army | Faction played in this game | Confirmed |
| Own detachments | Up to three selections, filtered by army | Confirmed |
| Own disposition | Selectable disposition compatible with the detachment choices | Confirmed |
| Own army-list link | URL to the army list used | Confirmed |
| Opponent name | Free text; opponent need not have an account | Confirmed field; proposed input |
| Opponent army | Opponent faction | Confirmed |
| Opponent detachments | Up to three selections, filtered by opponent army | Confirmed |
| Opponent disposition | Selectable disposition compatible with the opponent's detachment choices | Confirmed |
| Opponent list link | Optional URL | Proposed |
| Outcome | Automatically derived: below 10 loss, exactly 10 draw, above 10 win | Confirmed |
| Layout | A, B, or C; required when saving a game | Confirmed |
| Score | Team score from 0 to 20, from the journal owner's perspective | Confirmed |
| Context | Event, practice, team practice, or other, with notes | Confirmed field; proposed structure |
| Reflection | Plan, what happened, lessons, next action | Proposed |
| Mission / map / round | Optional structured match details | Proposed |
| Rules context | Edition or relevant rules period for historical comparison | Proposed |

**Confirmed:** Record the 0–20 team score. Raw victory points are not part of the current journal requirement.

**Confirmed:** Validate the team score as a whole number from 0 through 20. Derive the outcome on the server: 0–9 loss, 10 draw, 11–20 win. Read existing logs with the same outcome rule. Preserve missing historical layouts as unknown; do not invent A/B/C data.

### Matchup matrix

**Confirmed:** A matrix of army configurations in rows (Y) and columns (X), grouping by faction + detachments + disposition. Each intersection shows three average score estimates, one per layout A/B/C, with independent faction and army-list filters on both axes.

**Implementation conventions:** Detachment order, list URL, names, and catalogue revision do not split a source-ID configuration. Scores are from the row army's perspective; reverse matchups use 20 minus the logged score. Self-matches pool both sides at 10 points and count each log once. Show sample sizes, unknown estimates as a dash, and the highest-minus-lowest observed layout average. No extrapolation or automatic duplicate-log matching. Missing-layout logs are excluded. Preserve privacy: admins use all logs; players use only their own authorized logs. Axis pagination keeps large matrices usable.

**Proposed:** Store each side's faction, detachments, disposition, source identifiers, and catalogue revision with each game so profile changes and catalogue updates do not rewrite history. Keep submitted list URLs with the game; a live URL alone does not guarantee an immutable army list.

### Army configuration and New Recruit data

**Confirmed:** Use New Recruit as the source for available detachments per army and available dispositions for the detachment choices. Support up to three detachments on both sides of a game. Do not merge disposition and detachment into a single field.

**Proposed interaction:** Select faction → select up to three detachments → select a compatible disposition. Recalculate available choices when the faction or detachments change; explicitly identify incompatible existing choices rather than silently changing them. Enforce the same constraints on the server.

**Proposed integration:** Import a versioned local catalogue from New Recruit's current 11th-edition data. Preserve source IDs, labels, compatibility relationships, source revision, and retrieval date. Refresh through an admin-controlled import with a reviewable change summary. Keep the last successful catalogue available if a refresh fails, and preserve retired choices in historical games. Respect source combination restrictions where available; three selection slots alone do not establish a legal combination. Automatic full army-list import is a separate, uncommitted feature.

**Source check, 8 September 2026:** New Recruit's public 11th-edition catalogue lists Detachment and Force Disposition separately, and its detachment pages expose faction options. See [New Recruit's Adeptus Mechanicus catalogue](https://www.newrecruit.eu/wiki/wh40k-11e/warhammer-40%2C000-11th-edition/imperium---adeptus-mechanicus) and [detachment options](https://www.newrecruit.eu/wiki/wh40k-11e/warhammer-40%2C000-11th-edition/imperium---adeptus-mechanicus/2874-c86-3152-393/detachment). These are source-discovery checks, not a complete validated import. The requested source is referred to as newrecruit.app; the accessible source checked here is New Recruit at newrecruit.eu.

**Implementation update, 8 September 2026:** The local app now includes a New Recruit import covering 36 faction/catalogue choices and 432 faction-specific detachment choices, including shared chapter options. The source's Force Disposition conditions test for at least one matching category supplied by the roster, so the selector uses the union of disposition categories from selected detachments. The two Titan catalogues use their source-defined Take and Hold exception without detachment choices. The importer preserves IDs/revisions and resolves chapter visibility and point overrides. This is a journal selector, not a full roster legality engine; battle-size budgets and all roster-dependent modifiers are outside the current implementation.

**Proposed workflow:** Log a game → view it in the journal → edit a mistake if needed → optionally link it as evidence for a focus goal. Admins review game details and can discuss them through the profile conversation.

**Open:** Which fields are mandatory, whether admins can correct games, whether entries need verification, and whether logging a game against another member should create one shared record or two independent entries. No duplicate-matching or automatic opponent entry is assumed for the first version.

## 7. Statistics

**Confirmed:** Each player's page displays statistics and their journal. Evaluation scores remain admin-only.

**Proposed initial statistics:**

- Games played, wins, draws, losses, and win percentage.
- Results by own faction and opposing faction.
- Results over a selected date range and by game context.
- Average 0–20 team score, with sample size and the same filters as the journal.

Show sample sizes and active filters. Proposed win percentage = wins divided by all completed games, including draws in the denominator. Do not imply that raw win rate measures player quality independently of opponents and context.

**Proposed:** Statistics default to the ongoing history, with date and phase-period filters. **Open:** Whether admins need a side-by-side prospect comparison.

## 8. Focus lists and development goals

**Confirmed:** Admins create goals describing what a prospect should work on, improve, or demonstrate to progress to the next selection stage.

**Proposed goal fields:** title, description, success criteria, linked evaluation criteria, creator, creation date, optional due date, and optional target selection stage.

**Proposed workflow:**

1. Admin creates a goal visible to the prospect.
2. Prospect records progress and links relevant journal entries.
3. Prospect marks the goal ready for review.
4. Admin accepts completion or returns it with feedback.

Proposed statuses: Not started, In progress, Ready for review, Completed. Admins can archive obsolete goals with a reason. Completing goals does not automatically advance a prospect.

**Open:** Should goals ever be admin-only? Can players propose goals? Are deadlines and evidence required?

## 9. Selection workflow

**Confirmed:** Selection is one ongoing process, with flexible admin-configurable phases. It begins with a broad application stage open to everyone, then progressively narrows the prospect pool until eight players are selected. A player can also be denied. There are no separate annual/event cycles in the initial scope.

**Proposed English defaults:** Application → Phase 1 → Phase 2 → Selected. This expands the original `fas 1`, `fas 2`, `uttagen` defaults with an explicit application phase. Admins can add, rename, and order intermediate phases; the initial application and final selected roles remain identifiable regardless of their labels.

**Proposed:**

- Admins can add, rename, and order stages.
- Admins move prospects manually, recording who changed the stage and when.
- Keep an internal decision reason separate from feedback shared with the prospect.
- Rejected prospects retain their history; rejection does not delete their account.
- Allow reinstatement or movement backward with an audit record.
- Prevent deletion of an occupied stage until its prospects are reassigned.
- Show phase counts and selected squad occupancy, for example 6/8.
- Prevent a ninth active selected player, including simultaneous admin actions. Filling all eight places is a target; fewer may be selected while decisions are in progress.
- Record replacements and departures while retaining previous selection decisions and evaluation history.

**Confirmed:** Players can see their own current selection phase. A phase change is visible to that player without a separate publishing step; evaluations and internal decision notes remain admin-only.

**Open:** How should rejection outcomes be displayed? Is a decision made by any admin or does it require agreement? Are reserves needed in addition to the eight selected players? Can denied applicants reapply, and when?

### Calendar and event applications

**Confirmed:** Admins create calendar events. Prospects apply to attend, and admins approve who gets to join. Each event includes where, when, and the number of player places.

**Confirmed:** All can apply; there are no selection-phase eligibility restrictions. Working interpretation: this includes all registered users—applicants, prospects, selected players, and admins. Every attendance application still requires admin approval and is subject to event capacity.

| Event field | Definition | Status |
| --- | --- | --- |
| Name | Short event title | Proposed |
| Where | Venue/location; optional address and map link | Location confirmed; structure proposed |
| When | Start and end date/time, supporting multi-day events | Date/time confirmed; structure proposed |
| Player capacity | Maximum number of approved players | Confirmed |
| Description | Purpose, format, and preparation instructions | Proposed |
| Application deadline | Optional closing date/time | Proposed |
| Who can apply | All registered users, regardless of selection phase | Confirmed; scope interpretation above |

**Proposed workflow:** Admin publishes event → registered user applies → application is pending → admin approves or declines → applicant sees the decision. Event approval never advances the applicant's team-selection phase.

**Proposed behavior:**

- Month calendar and chronological agenda, with an event detail page and an admin application-review view.
- One active application per person per event; applicants may withdraw.
- Pending applications do not reserve places. Approval consumes a place; withdrawal releases it.
- Capacity checks occur atomically so concurrent approvals cannot overbook an event. Lowering capacity below approved attendance requires resolving the excess first.
- An optional waitlist requires explicit admin promotion; a free place does not automatically approve someone.
- Admins may edit or cancel events. Preserve applications and decisions for history; clearly display changes to affected applicants.
- Default event timezone: Europe/Stockholm, displayed explicitly, including multi-day and daylight-saving boundaries.
- Registered users see event details and their own application status. Other applicants' identities, profiles, journals, and admin decision notes remain private by default.
- Link journal entries to attended events as optional context; event participation can inform development review without automatically changing scores.

**Open:** Application deadlines, waitlists, and notification channels. Event capacity is independent of the eight-player national-team limit.

## 10. Proposed information model

This remains a conceptual entity model. The local implementation and future production storage choices are described below.

| Entity | Purpose |
| --- | --- |
| User / profile | Identity, profile information, account permissions |
| Selection configuration | One ongoing process, phase definitions, and eight-player selection target |
| Selection stage | Ordered configurable stage definitions |
| Candidacy | Player participation, current stage, and outcome |
| Selection change | Stage/outcome history, actor, reasons, timestamps |
| Evaluation criterion | Stable criterion identifier, label, and rubric |
| Shared evaluation / rating | Prospect, criterion scores, notes, last editing admin, date, and revision history |
| Game entry | Owner, armies, detachments, dispositions, list links, opponent, result, context, date |
| Army catalogue | Versioned New Recruit factions, detachments, dispositions, and compatibility constraints |
| Game army configuration | Each side's source selections and historical labels/revision |
| Event | Location, date/time, capacity, and publication status |
| Event application | Event, applicant, status, decision actor/date, and private decision notes |
| Conversation / message | Profile subject, participants, visibility, author, content, timestamps |
| Focus goal | Prospect, objective, success criteria, status, target stage |
| Goal evidence | Progress notes and links to journal entries |
| Audit event | Sensitive administrative changes and authorship |

**Confirmed technical direction:** Next.js, React, and TypeScript. The user has authorized deployment to GitHub (grymloq/prospectPortal), Vercel, and Supabase. Preserve the separate local demo.

**Local implementation:** Next.js App Router with server API routes and a separate domain service. A local SQLite adapter stores records transactionally and persists opaque sessions; authorization and member filtering occur on the server. The current app-state document is a local convenience, not the future normalized Supabase schema. Demo accounts and fictional records support trying the workflows. Future Supabase work must replace local sessions/storage and add RLS while preserving the tested permissions and transactional rules.

## 11. First release and later options

**Confirmed first-release scope:** English interface, accounts and roles, open team applications, profiles, shared 18-criterion evaluations, confidential conversations, game journals with New Recruit-based army choices, admin journal review, player statistics, focus lists, ongoing configurable selection phases narrowing to eight players, rejection, and calendar events with applications and admin attendance approval.

**Proposed first-release support:** mobile layouts, filters, clear empty states, input validation, secure data access, and history for sensitive admin actions.

**Not committed:** automatic army-list imports, external tournament integrations, prediction models, automatic selection rankings, pairings simulation, attachments, email notifications, exports, and public profiles. These need separate agreement if desired.

## 12. Acceptance criteria

1. An admin can evaluate a prospect on every supplied criterion using only 1–5 or unrated.
2. A non-admin cannot retrieve any evaluation or internal message, including through direct server requests.
3. A player and admins can converse on the player's profile; unrelated players cannot read or post there.
4. An admin-only message never appears in the player's conversation or derived notifications and summaries.
5. Every user can create a game entry containing the agreed journal fields and see it on their profile.
6. Admins can access and filter every user's journal. Ordinary members can access only their own profile, statistics, and journal; direct requests for another member's data are denied.
7. Profile statistics reconcile with the recorded games and selected filters; users with no games see an empty state rather than misleading percentages.
8. An admin can create a focus list and the prospect can read the assigned development goals.
9. Admins can configure stages, move prospects through them, and reject a prospect.
10. Fresh selection configuration includes an open application phase, configurable narrowing phases, and a final selected phase with an eight-player target; proposed English labels are Application, Phase 1, Phase 2, Selected.
11. Access tests cover own profile, another player's profile, and admin access for journals, goals, messages, and evaluations.
12. Core journal and conversation workflows work on both phone and desktop layouts.
13. Anyone can register and submit a team application. Submission enters the application phase; only an admin can approve prospect status. Registration alone does not enter selection.
14. All admins work on the same prospect evaluation; saved score changes appear in that shared assessment.
15. Both sides of a journal entry support up to three detachments and a distinct disposition, with available choices sourced from the verified New Recruit catalogue and its compatibility constraints.
16. Changing catalogue data does not rewrite saved game configurations. Failed refreshes retain the last successful catalogue.
17. Admins can create an event with location, date/time, and player capacity; all registered users can apply regardless of selection phase, and admins can approve or decline.
18. Duplicate applications and concurrent approvals cannot overbook an event. A member cannot read another member's private application or admin notes.
19. Event attendance approval is separate from selection progression; event capacity is independent of the eight selected-player places.
20. The interface uses English, including navigation, validation, and status labels.
21. Game journals record the owner's 0–20 team score, and profile averages use those scores.
22. Players can see their own current selection phase after an admin changes it, without gaining access to evaluations or internal notes.

## 13. Decision register

### Confirmed decisions

1. **Resolved:** Anyone can register and apply in the broad application stage; admins approve prospects.
2. **Resolved:** Members can access only their own profiles, statistics, and journals; admins can access everyone.
3. **Resolved:** One shared evaluation per prospect, edited collaboratively by admins.

4. **Resolved:** Detachments and dispositions are distinct. Support up to three detachments per army and source available choices and relationships from New Recruit.
5. **Resolved:** English interface.
6. **Resolved:** One ongoing process with flexible phases, starting with broad applications and narrowing to eight selected players.
7. **Resolved:** Calendar events include location, date/time, and player capacity; prospects apply and admins approve attendance.
8. **Resolved:** Journal scores use the 0–20 team score.
9. **Resolved:** All can apply to events, interpreted as all registered users; no selection-phase restrictions.
10. **Resolved:** Players can see their own current selection phase.
11. **Resolved:** Next.js, React, TypeScript; Vercel/Supabase deployment now authorized.

### Next clarifications

7. **Resolved:** Outcome follows the score automatically; layout A/B/C is required on save. Other optional journal fields retain current behavior.
8. How should rejection be displayed, and do admins approve transitions jointly?
9. Should focus goals use the proposed evidence-and-review workflow?
10. What profile details, notification channels, and account login method are needed?
11. Is there an existing team name, logo, domain, hosting preference, or visual identity to use?
12. Should events support deadlines and waitlists?
13. What information should the initial team application collect?

## 14. Decision history

- v0.1: Captured the initial brief; separated confirmed requirements, proposed defaults, and open decisions. No application has been built and no technical stack has been selected.
- v0.2: Confirmed open registration with admin approval of prospects; added the enrollment requirement and acceptance criterion. Member visibility and evaluation ownership remain unanswered.
- v0.3: Confirmed private member profiles and journals with full admin access, and one shared evaluation per prospect. Updated navigation, permissions, evaluation behavior, information model, and acceptance criteria.
- v0.4: Confirmed separate detachments/dispositions with up to three detachments and New Recruit sourcing, English UI, ongoing applications and flexible phases selecting eight players, and calendar events with approval-based attendance. Recorded the limited source check and remaining catalogue verification work.
- v0.5: Confirmed 0–20 team scores, event applications open to all (interpreted as all registered users), and player-visible current phases. Removed phase-based event eligibility and retained admin attendance approval. Rejection display remains open because the answer specified current phase only.
- v0.6: Confirmed the user-selected local Next.js/React/TypeScript stack and future Vercel/Supabase direction. Added implementation notes and the actual New Recruit selector import. The local app implements the core workflows; remaining optional features and production migration are tracked in its README.

- v0.7: User authorized production deployment. Supabase Auth and an RLS-protected, server-only Postgres document adapter preserve the existing domain rules using revision-checked atomic writes. Normalized tables remain future work. Production starts empty. Initial admin is emil.barkin@gmail.com. Custom SMTP and sending-domain setup remain required for public signup/reset email delivery.

- v0.9: Confirmed administrator-created, date-identified patches required for game logs; backfill all existing games to Ork release — 2026-09-02. Matrix compact overview retains full drill-down details and adds per-patch filtering (newest patch default, combined option explicit). Added 96 synthetic games to expand the separate demo profile to eight factions, 12 configurations, 264 games.


### Shared matrix planning (confirmed, 8 September 2026)

Every signed-in user may add/update shared army configurations and per-patch, per-layout manual estimates. Display the last editor and timestamp plus change history to all members. Manual estimates override the logged average, use complementary scores in the reverse matchup, and can be cleared to restore logs. Publishing an estimate also shares its army configurations without exposing private journals. Configurations retain faction + unordered detachments + disposition identity; optional names and links annotate them. Standalone configurations require no games. All-patches mode shows logged estimates only to avoid mixing patch-specific manual values. Overview averages are equal-weight means of available layout matchup scores, including overrides; omitted matchups do not count as zero. Show names, detachments and dispositions in axis labels, with overview averages beside those labels.


### Administrator account management (8 September 2026)

Admins have a Users directory including Supabase accounts which have not yet opened the portal. They can invite members through one-time links, promote/demote administrator roles and remove portal access. Invitations are copied and shared manually until SMTP is configured; the app does not claim to send emails. Removal retains journals and attribution, releases selection/event places, and blocks existing sessions at every portal request. Self-removal and self-demotion are prohibited. Provisioned portal roles are authoritative in the versioned database so role changes and last-admin checks are atomic; trusted Supabase app metadata only bootstraps newly provisioned accounts. Account roles remain separate from team selection phases. Admin audit history records each action.
