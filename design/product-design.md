# Swedish Warhammer 40,000 National Team — Product Design

Status: Living draft v0.9, 8 September 2026. Requirements marked **Confirmed** come from the brief and subsequent answers. Items marked **Proposed** are working recommendations, not approved decisions. **Open** items need clarification before dependent implementation.

**Confirmed — beta feedback (8 October 2026):** Signed-in users have a fixed bottom-right BETA FEEDBACK button. Its modal accepts free text, image attachments, and an optional screenshot of the current page, labelled Suggestion, Request, or Bug. Submitted feedback goes to an admin-only Feedback inbox with a table and expandable messages containing sender, timestamp, page context, full text, and attachments. Feedback and attachment access are enforced on the server. Unsaved feedback uses the existing modal close confirmation and draft restoration.

**Confirmed — inbox management:** Admins can mark feedback read or unread and delete it. A circular unread count appears beside Feedback inbox in the menu while unread active messages exist. Read status is shared across the admin inbox. Deleted feedback leaves the inbox and unread count; admins can restore it from the Deleted folder.

**Current additions: 8 October 2026.** The confirmed membership and scrim decisions in section 15 supersede older open-registration access and independent-game assumptions where explicitly stated.

## 1. Purpose and scope

**Confirmed:** Help admins evaluate prospects, review their games, guide their development, and manage their progress toward selection for the Swedish national Warhammer 40,000 team.

The player profile is the central workspace: game history and statistics, development goals, selection progress, and conversations. Admins additionally see confidential evaluations and discussions.

**Confirmed:** My armies lets each player save named army configurations and list links for a ruleset. Lists are private by default and editable only by their owner. Owners can make a list available to others as an opponent selection and withdraw that sharing. Game logging offers the player's saved armies and shared opponent armies for the selected ruleset, while retaining manual entry. Logged games keep independent snapshots when saved lists are edited, unshared, or removed.

**Confirmed:** Players can import a New Recruit shared-list link into the army editor for a selected ruleset. Import fills the list name, faction, detachments, disposition, and source link; players review and save it. The import must match the selected ruleset and obey the 3-DP limit.

**Confirmed — army text entry (10 October 2026):** Add army list in My armies offers Import (New Recruit shared-list link) and Enter own (paste a GW, Simple, NR, Short or Tournament export). Text is read automatically; only missing detachments and force disposition require form inputs, using the shared disposition selector. Complete text exports do not require the manual army configuration or name fields. Every created list receives the army library's summary and archetype classification and remains private by default.

**Confirmed:** Players can choose a personal default saved army. New games prefill that army and its ruleset when available. Opponent names support @ player selection from a directory exposing only active player IDs and names; that player's shared armies appear first for the selected ruleset. Private armies remain private.

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

**Confirmed — mobile navigation (8 October 2026):** Replace the horizontally scrolling top menu with a fixed bottom app bar. The local draft uses Profile, Journal, Matrix, Scrims and More; More exposes the remaining authorized destinations. Preserve the desktop sidebar, account permissions, navigation restoration and navy/white/yellow identity. Reserve space for the bar and device safe areas, and place beta feedback above it.

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

**Confirmed:** A matrix of opponents in rows (Y) and our players or army configurations in columns (X), grouping by faction + detachments + disposition. Each intersection shows three average score estimates, one per layout A/B/C, with independent faction and army-list filters on both axes.

**Implementation conventions:** Detachment order, list URL, names, and catalogue revision do not split a source-ID configuration. Scores are from our player or army column's perspective; reverse matchups use 20 minus the logged score. Self-matches pool both sides at 10 points and count each log once. Show sample sizes, unknown estimates as a dash, and the highest-minus-lowest observed layout average. No extrapolation or automatic duplicate-log matching. Missing-layout logs are excluded. Preserve privacy: admins use all logs; players use only their own authorized logs. Axis pagination keeps large matrices usable.

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

**Confirmed — matchup mission reference (8 October 2026):** Main and scrim matchup details show the GD Missions 11th-edition primary cards selected by both armies' dispositions, with each player's card labelled separately and a single shared card for matching dispositions. The pairing's three numbered layouts appear side by side in a carousel with desktop mouse dragging that stays at the released position, mobile swiping with snap alignment, keyboard navigation and previous/next controls without measurements. Matchup details omit the repeated army-versus-opponent summary above the mission cards. Paired primary cards remain side by side, including on mobile. Source branding and external links are omitted from the interface. Unsupported historical dispositions show an unavailable message rather than an invented mapping.

**Confirmed — inline layout scores (8 October 2026):** Click an individual A/B/C layout score or focus it with Tab/Shift+Tab to edit it directly in the main matrix or a team scrim matrix. Keyboard entry selects the current value for replacement; In the full table, Tab saves a changed value and moves A → B → C, then to A on the next visible opponent row in the same player column. After the final opponent row it continues at the top of the next player column. Shift+Tab reverses that order. Score navigation skips details buttons and pending scores; the start and end allow focus to leave the table. Enter or leaving the input saves; Escape cancels and returns focus to the score without reopening the editor. Read-only scores stay read-only. Clear a main-matrix estimate to restore its logged average; clear a scrim estimate to mark that layout unknown. Manual scores show signed differences such as (+2) or (-1.5) from the current viewer's authorized logged average when one exists. Details retain logged counts, editor attribution, history and scrim planning comments. All-patches mode remains read-only. Editing one scrim layout patches that layout atomically, including null for an unknown score, and preserves the other server-supplied plan scores. Rapid inline edits queue within the browser and advance from each accepted revision. Server revision, prior-value, army-identity and team-authorization checks remain enforced. Inline saves return only the authorized changed cell, retain matrix labels and focus, and do not refetch public archetypes or replace unrelated workspace collections. Pending values display immediately, including cleared scores; failures restore the editable draft. Private logs are comparison data only.

Every signed-in user may add/update shared army configurations and per-patch, per-layout manual estimates. Display the last editor and timestamp plus change history to all members. Manual estimates override the logged average, use complementary scores in the reverse matchup, and can be cleared to restore logs. Publishing an estimate also shares its army configurations without exposing private journals. Configurations retain faction + unordered detachments + disposition identity; optional names and links annotate them. Standalone configurations require no games. All-patches mode shows logged estimates only to avoid mixing patch-specific manual values. Overview averages are equal-weight means of available layout matchup scores, including overrides; omitted matchups do not count as zero. Show names, detachments and dispositions in axis labels, with overview averages beside those labels.


### Administrator account management (8 September 2026)

Admins have a Users directory including Supabase accounts which have not yet opened the portal. They can invite members through one-time links, promote/demote administrator roles and remove portal access. Invitations are copied and shared manually until SMTP is configured; the app does not claim to send emails. Removal retains journals and attribution, releases selection/event places, and blocks existing sessions at every portal request. Self-removal and self-demotion are prohibited. Provisioned portal roles are authoritative in the versioned database so role changes and last-admin checks are atomic; trusted Supabase app metadata only bootstraps newly provisioned accounts. Account roles remain separate from team selection phases. Admin audit history records each action.

## 15. Confirmed membership and scrims — 8 October 2026

### Membership approval

**Confirmed:** Every account has a Confirmed member flag controlled by admins in Users. All existing users are grandfathered as confirmed, including existing authentication accounts which have not opened the portal. New self-registrations remain pending and cannot sign into the portal until an admin confirms them. Self-registration requires no email delivery or email verification. The server creates the password account without sending mail or issuing a session; administrator membership confirmation remains mandatory. Revoking confirmation also blocks existing portal sessions; it does not delete history. Membership is separate from administrator permissions and national-team selection status.

**Implementation convention:** An administrator-created invitation also confirms membership because the administrator has explicitly invited the person. Self-revocation and removal of the last confirmed administrator are prohibited. Authorization uses the server's current membership record, never user-editable authentication metadata.

### Format, calendar and teams

**Confirmed:** An internal scrim consists of two equally sized teams and one round, with one game per player. Eight players per team is the default and the size is configurable. Other events may gain multiple rounds later; multi-round event management is not part of this increment. External scrims have one portal team and a manually entered opposing roster; external players do not need accounts.

**Confirmed:** Admins create scrims in the calendar with a list-submission deadline, a pairing date, a game-end deadline, one fixed rules patch, and team captains. Games may be played from the pairing date through the game-end date. List-deadline and game-end times default to 23:59 on the selected date and can be adjusted. Captains can play (using a roster slot) or be non-playing coaches. Captains manage their own roster and submissions; admins can manage either roster. Admins or a team's captain can rename that scrim team, including after list submission and pairing. Our captain also manages the external team name. Renaming uses revision checks and records an audit entry. Any confirmed portal member may be assigned, regardless of selection status. Captains assign players directly for this increment. A person cannot play or captain on opposing sides of the same internal scrim.

**Confirmed:** Rosters, revealed submitted lists, pairings, match comments and results are available to all confirmed members. They do not grant access to another member's profile, private journal reflection, evaluation, goals or messages. Dates use Europe/Stockholm.

### Lists and disposition validation

**Confirmed — scrim list entry (9 October 2026):** Submit list and Change list first offer Choose from your armies, Import, and Enter own. Saved-army selection lists the player's available armies for the scrim rules patch. Import retains the New Recruit shared-link input and import button. Enter own opens a multiline text field accepting New Recruit text export formats, preserving the full text and line breaks. Text-only entry shows just the pasted export and Save button. The server reads faction, detachments and force disposition from the complete New Recruit export using the scrim rules patch, and reads or generates its name. Missing or ambiguous configuration is rejected with an instruction to paste the full export; previous submissions are never used as fallback metadata. Pasted text is saved with the independent scrim snapshot and private saved army, and is readable in the list drawer under the existing reveal rules. It does not claim verified structured roster identity.

**Confirmed:** Each rostered player has one submitted army list. Players submit from My Armies or enter/import an army directly into the scrim. Direct submissions are also added to that player's private My Armies. Captains may submit on a player's behalf with the same effect. Submissions retain independent army snapshots; later library edits do not change scrim history. Captains do not gain access to a player's unshared army library.

**Confirmed:** For standard teams, every disposition in the selected patch must appear at least once, with at most two lists per disposition. Incomplete drafts may have repeated dispositions and show warnings. The final team submission must satisfy the rule. Smaller teams (fewer players than dispositions) may omit dispositions but cannot repeat any. Team sizes above twice the disposition count cannot satisfy the cap and are rejected.

**Confirmed:** Captains finalize team submissions before the deadline. They may reopen them before that deadline to fix drafts. Rosters and submitted lists lock at the deadline. The Our Team tab shows only the team the member plays on or captains. Opposing Team unlocks only after the deadline and when both full rosters have every list submitted and finalized; before then, the server omits opposing roster members and armies from ordinary member responses. The unlocked opposing roster is read-only. Admins retain a separate Manage teams tab for both rosters; external-scrim captains use it for the external roster. Confirmed spectators without a team can review both rosters under Opposing Team after unlock. No player replacements or list changes are allowed after the deadline.

### Planning and pairing

**Confirmed:** The main Matchup Matrix and scrim matrix reuse the same table, army labels, disposition rendering, tooltips, score cells, averages and database builder. Scrim roster entries show Name - Faction - Disposition on the first line, using the shared disposition icon and color, with the shared View list drawer control below when a list URL is provided. Entries without a submitted list retain their name and submission status. Both matrices put opponents on rows and our players on columns. Scrim player column labels show player name, faction and disposition on three separate lines. Opponent row labels show Name (when available) - Faction, detachments, disposition and the public archetype name (when available) on separate lines. Each line stays unwrapped and truncates with an ellipsis. Both screens use the full-width layout with a numeric opponent-average column and player-average row. Hovering or focusing a list label shows a compact consolidated preview of its stored roster, including attached leaders; the hover expands to show every unit group and full names, wrapping only at the viewport edge. It stays within the viewport and allows pointer or keyboard scrolling when the entire roster exceeds the screen height. Matrix labels retain their single-line truncation. Score cells and their details buttons do not show the army-summary popup on hover or focus. No imported roster is reported explicitly, and hidden opposing submissions are never fetched for previews. Score display and editing retain our players' perspective despite the transposed axes. Averages include available A/B/C scores against the filtered opposite axis, from that axis army's perspective; unknown averages stay blank. Scrims fix the rules patch and player columns to the team's submitted armies while keeping manual edits in the private scrim store. Opponents can be filtered by faction and list using the shared matrix filter controls. Members can add army configurations through the same shared list form; these appear in the main matrix and scrim preparation database without adding any estimates. After opposing lists unlock, new archive lists do not expand the locked opposing roster. Before opposing lists are revealed, the matrix shows only the team's submitted lists against all shared army-archive configurations for the scrim rules patch, including shared saved armies, current shared matrix lists, historical shared list configurations and configurations from journal records the current viewer is authorized to see in the main matrix. Journal-only configurations are filtered per viewer; private journal notes and recorded scores never seed shared scrim plans, using shared A/B/C scores as starting values. Team members can edit these preparation estimates and comments privately within this scrim; neither edits nor comments change the main matrix or another scrim. Unsubmitted players do not appear as player columns. Once list lock has passed and both full submissions are finalized, the matrix switches to only the opposing team's submitted lists. Each side then has a separate player-by-player matrix with A/B/C estimates and comments on each potential pairing. Everyone on that team, including its captain, can edit its plan. Estimates and planning comments remain hidden from the other side and unrelated members until all games have been reported. Administrator status alone does not reveal another team's private plan. Both plans become readable for review after completion.

**Implementation convention:** Already-shared matrix estimates seed independent scrim preparation estimates. Matching preparation estimates, comments and edit history carry forward by army configuration when the opposing submitted lists are revealed; later scrim edits remain independent. Unknown scores remain blank. Private journal data is not published into a team plan. Scrim edits do not change the global matrix. Server revision checks protect concurrent roster, matrix, pairing and result writes; comments record authors and timestamps.

**Confirmed:** Captains or admins enter the completed pairings and choose A, B or C for each game, with no layout quotas. Every player must appear exactly once against the opposite team. Pairings are published after the list deadline and then lock. Pairing assistance/simulation is not included.

### Reporting and result

**Confirmed:** Selecting a scrim in Game Journal fills the player's opponent, both submitted army snapshots, layout and rules patch from the pairing. Either paired player reports the score without opponent confirmation. One atomic operation saves one shared match result and creates/updates complementary journal records for both internal players. External opponents do not receive portal journals. Captains and admins can report scores for exceptional cases. Players can write separate private journal reflections and add visible match comments.

**Confirmed:** Scores are whole numbers from 0 to 20; the opponent receives 20 minus the reported score. The scrim completes when every pairing has a result. Compare the sums for both teams: a lead greater than five points wins; a difference of five or less is a draw (for eight games, 82–78 is a draw and 83–77 is a win). Result corrections update both journals and recompute the winner. Known mirrored scrim records count once in the aggregate matchup matrix; unrelated independent journals are not automatically deduplicated.

**Implementation convention:** Reporting can occur after the calendar span ends, but the played date must fall within that span and cannot be in the future. Deleting only one side's linked journal record is prohibited. Admin cancellation retains existing history. Teams can continue reviewing and updating their own estimates and comments after completion; previous estimates retain author and timestamp history. Result corrections remain available.

## 16. Modal form drafts

**Confirmed:** Dismissing a modal closes immediately without a confirmation prompt. Clicking outside, the close button, Escape, and Cancel all silently retain the form draft. Closing keeps the form input and restores it when that specific form is reopened. Untouched forms close immediately.

**Implementation convention:** Drafts belong to the current signed-in workspace and specific edited item. Both ordinary fields and controlled army/roster/pairing selections are restored. Successful submission consumes the draft. Drafts survive navigation within the workspace, but are cleared on sign-out, account or role changes, and page reload; they are not published or written to another user's storage. Dismissal is disabled while a form is saving/importing. Passwords, file inputs and read-only invitation links are excluded from draft capture.

## 17. Remembered workspace location

**Confirmed:** Reloading or returning to the application restores the last workspace section, selected scrim and scrim tab. Navigation preferences persist in this browser per signed-in account and role. Restoration validates available pages and records against the current authorized server response; unavailable records fall back to the section overview. This stores only navigation identifiers, not forms or private content.

**Confirmed — double-sided primary cards (8 October 2026):** The 11 source-verified primary cards with reverse sides flip on click or keyboard activation. A desktop flip cursor identifies them; no corner overlay is shown. Use a short CSS 3D transition for pointer activation; reduced motion and keyboard activation switch sides immediately. Single-sided primaries remain static.

**Confirmed — admin account deletion:** Admins can permanently delete another user's login after an explicit confirmation. Portal access is revoked before deleting the authentication account. Journals and team history remain attached to the removed profile. Deleted logins are labelled separately from removed access; failed deletion can be retried from removed users. Self-deletion and deleting the last confirmed administrator are blocked on the server.

**Confirmed — scrim captains and coaches:** Admins can replace a team's lead captain, add or remove additional captains, and add or remove non-playing coaches. Captains retain team management permissions; coaches can view and contribute to their own team's private preparation plan but cannot manage rosters, finalize submissions or report other players' results. Coaches never occupy player slots and cannot be assigned as players while coaching. Staff cannot belong to opposing teams. Staff changes use revision checks and audit history and may occur after list lock without changing player entries, armies or pairings; completed and cancelled scrims remain unchanged. Re-created user accounts must be explicitly assigned because account IDs change.

**Confirmed — scrim organizers (10 October 2026):** Admins can assign confirmed members as Scrim Organizers during scrim creation or later. The assignment applies only to that scrim and grants the same management access as an admin for both rosters, submissions, team names, captains/coaches, pairings, results and cancellation. Only admins can assign or remove organizers. Existing list locks, revisions, audit history and completed/cancelled assignment restrictions remain in force. Organizer access does not grant access to other profiles, journals, evaluations, internal messages, private army libraries or unrelated scrims. As for admins, private team plans require team membership until completion. Captains/coaches and organizer selection use compact checkbox rows with names aligned beside the controls, including on mobile.

**Confirmed — mobile matrix opponent list:** Mobile defaults to one selected army/player against compact opponent rows with shared disposition labels, A/B/C score editors, matchup averages and existing details. Users can sort by name, strongest or weakest matchup and switch to the full matrix. Existing faction/list filters apply. Scrims default to the signed-in player when that player has submitted a list; captains and coaches can choose another authorized team entry. Unknown scores stay unknown, all-patches remains read-only, and scrim edits retain the same private plan and revision rules.

**Confirmed — concise interface copy:** Omit the workspace footer tagline, score threshold legends, scrim win/draw rule explanation and How to read this matrix section. Retain actual results, data counts, field labels and validation messages.

**Confirmed — administrator access preview:** Only a confirmed active administrator may view the workspace as another confirmed active user, using actual access or a simulated Member/Admin role. User identity and team assignments determine private content through the existing server view filter. The preview is read-only across all API writes, shows a persistent banner and Exit preview action, and never changes account roles, profile data or sessions. Preview drafts and navigation are separate from normal use; sign-out clears the preview.

**Confirmed — matrix army lists:** Clicking the player name or faction in either matrix view opens the shared army list drawer when a list link is available. Clicking the desktop header background toggles its row or column highlight; clicking the label text only opens the list. Both actions are keyboard accessible.

**Confirmed — user management:** User actions use compact distinct controls, with explicit confirmation, labelled role and access icons, and separate red account deletion. The Users navigation item shows the number of active accounts awaiting membership confirmation on desktop and mobile.


**Confirmed — notifications (9 October 2026):** A top-right bell lists personal notifications with an unread count, individual read actions and Mark all read. Members receive selection/status changes and player-visible profile conversations. Admins receive pending membership registrations, prospect applications, feedback and profile discussion alerts; internal messages remain admin-only. Approved event attendees and scrim participants (including captains/coaches) receive reminders in the 24 hours before event start/end, each named event deadline and scrim list lock. Cancelled events/scrims and completed scrims do not generate reminders. Browser push is opt-in per device. Push lock-screen text is generic; private content is available only after server authorization. Delivery uses a persistent retry queue and scheduled checks. Notifications retain 90 days of history.


**Confirmed — compact My armies (9 October 2026):** Group saved armies by rules patch, newest first, then alphabetically by faction. Patch sections can be collapsed and show dates and army counts. Compact rows show the list name, disposition and detachments, with accessible default, sharing, edit and remove controls. Linked list names open the existing army-list drawer. Preserve saved configurations and historical names.

## 18. Army libraries — adopted implementation defaults, 9 October 2026

**Confirmed — shared disposition selector (10 October 2026):** Missing force disposition in scrim text entry uses the same icon-and-color radio selector as Add army in My armies. Options follow the decoded faction and selected detachments; the server still validates the final selection.

**Confirmed — New Recruit text formats (10 October 2026):** Scrim text entry decodes GW, Simple, NR, Short and Tournament exports using their recorded structure. After pasting or editing text, it automatically displays inputs only for absent configuration: detachments and disposition for Simple, disposition for Short, and whichever choices a GW/NR/Tournament export omits. Users can fill the missing choices before saving. Changing the text clears prior choices and cancels stale reads. Configuration present in the text cannot be overridden, and ruleset limits still apply. Each unit row counts one squad; an explicit root multiplier records models. Simple omits some default models, so its model totals remain unknown. Equipment and leader attachments are retained only when recorded. The shared Army libraries summary and archetype helpers apply; text labels remain partial evidence rather than verified catalogue identities.

**Confirmed — automatic list summaries and archetypes (10 October 2026):** Every newly created army list receives a summary and archetype using the same unit-counting and configuration-identity helpers as Army libraries, regardless of creation in My armies, scrims, matrix or journal. Summaries retain recorded unit and model counts where available. Pasted New Recruit exports can supply display-only unit summaries; uncertain quantities and missing unit data remain explicit, and text labels never qualify as source-verified exact variations. My armies and the shared list drawer expose the summary. Assignment preserves ruleset scope, private-list access, scrim reveal rules, version identity and historical roster facts; it never publishes a list automatically.

This section records defaults adopted from the Army libraries implementation handoff, rather than earlier confirmed product decisions. The implementation contract and ownership record is `army-library-contracts.md`.

Army libraries extends the existing workspace alongside My armies. Confirmed active portal members and administrators see the same shared dataset. The initial filter is the current team default ruleset; All rulesets explicitly exposes segmented patch history. Search, configuration/context filters, stable sorting and pagination keep old, no-game and unclassified public lists discoverable. Current matrix entries are labelled configuration-only; matrix history is not another current list collection.

**Confirmed — dependent army filters (9 October 2026):** Detachment filter choices follow the selected faction. Disposition choices follow configurations containing all selected detachments. Choices use public configurations in the selected ruleset scope, including published historical versions. Changing a faction or ruleset clears the dependent detachment and disposition selections; changing detachments clears disposition. Restored selections that no longer belong to the available choices are cleared. With no faction or detachment filter, choices cover all public configurations in that scope.

**Confirmed — detachment filter control:** Use a compact multi-select dropdown with checkbox options and a clear-selection action, rather than a native multiple-selection list. Preserve the three-detachment limit and the dependent faction/disposition filters.

**Confirmed — army library tables:** Present lists and archetypes as tables with separate identity, faction, detachment, disposition, ruleset and performance columns. Lists show owner and roster completeness; archetypes show shared-list, unclassified-list and variation counts. Names and rows expand the hierarchy, with controls to open existing details. Name, average score and match headers use the existing sort controls. Keep no-game scores unknown and all-ruleset scores segmented. On narrow screens, scroll the table horizontally while keeping its identity column visible.

**Confirmed — nested army browsing:** Use one hierarchy, alphabetically grouped by faction, then archetypes, then lists. Each level collapses independently, initially closed. Expanding a list shows its published roster and links to full details or its current external source. Faction counts cover the complete filtered public dataset, not one result page. Archetypes paginate within each faction and lists paginate within each archetype. Retain configuration filters, historical memberships, sorting, tables, faction avatars and existing detail pages. Returning from details restores the browse filters and open groups.

**Confirmed — one army table:** Render faction, archetype and list rows in one table with one shared header and aligned columns. Indent archetypes beneath factions and lists beneath archetypes. Expanded rosters, loading/error states and pagination occupy full-width rows in the same table. Use one horizontal scroll area and a pinned identity column. Do not nest tables or repeat headers when a group opens.

Saved lists retain their identity, owner and catalogue revision. Immutable versions retain configuration, imported composition/provenance, ruleset and creation time. Configuration/composition/ruleset changes create a version; roster no-op, naming, external-source-link and publication changes do not. Display names and the current external source come from the live saved list; historical snapshot labels remain unchanged. An additive migration creates only one initial known version, never earlier invented history. Unknown old roster/context information remains unknown. No existing local database is reset.

Roster sharing and statistical contribution are separate. The owner explicitly consents per game to sharing their recorded perspective; all legacy/new games default to no consent. No private reflections, opponent identities, evaluations or internal messages enter the library. Opponent faction facts are generalized; finer opponent configuration/list/variation dimensions require independent public visibility. Hidden scrim facts remain excluded before list reveal. Unsharing clears all version publication; re-sharing publishes only the current version. Prior versions require explicit owner publication. Withdrawn/deleted versions and removed/unconfirmed owners immediately disappear from shared counts, analytics, history contexts and discussions. There is no shared-data cache.

Archetypes use configuration identity wrapped in provider/system/edition/battle-size scope. Missing metadata remains an explicit unknown cohort, and continuity across patches is not inferred. Complete normalized New Recruit compositions alone qualify as exact variations. Fingerprints preserve selected units/models/options/enhancements, quantities, nesting and catalogue namespaces; names, owners, source links, export order and points do not identify composition. Unsupported or ambiguous exports remain partial. Classification is deterministic, versioned and non-destructive. Administrators can preview and apply consolidation, with a source signature checked inside the existing atomic revision transaction.

Performance uses average recorded team score out of 20, actual W/D/L, win rate, distinct canonical matches, appearances and contributor counts. Scrim pairing results supply authoritative facts; known mirrored records count one match with actual side outcomes, while ordinary reports require explicit canonical linkage to deduplicate. Conflicting facts are excluded. Manual matrix estimates and discussion opinions never enter statistical samples. List metrics need explicit immutable version references; variations pool separately labelled identical public rosters. Filters apply equally to summaries, comparisons, leader eligibility and trends.

Good/bad matchup labels require a conservative 95% Hoeffding score interval fully above/below 10; otherwise results are uncertain. Canonical match groups preserve dependence between mirror appearances. The appearance-weighted radius is `20 * sqrt(log(40) / 2 * sum(matchAppearanceWeight^2))`. This method assumes independent matches and does not remove player/event concentration or selection effects. Leading observed variation eligibility uses a provisional centralized minimum of 10 distinct eligible matches. Overlapping leader intervals remain tied/indistinguishable and single-player concentration is visible. All-ruleset headline averages and win rates are suppressed in favor of patch segments. Trend tables provide accessible numeric summaries and leave missing periods as gaps.

Game entry records explicit own/enemy version references and optional versioned mission-pack/deployment/side-mission context. Manual context represents the player's recorded selection; disposition-derived reference suggestions never become confirmed context automatically. Existing A/B/C layout remains separate. Scrim submissions capture versions without altering reveal rules or private team plans; linked journal records retain their independent contribution consent.

Dedicated list/archetype discussions support threads, replies, author editing/deletion and administrator moderation. Every target, context and ancestor is authorized again on read/write; withdrawn context hides descendants. Tombstones preserve authorized thread structure without retaining visible deleted text. Private profile conversations use their existing separate store. All mutations retain origin, membership, access-preview and transaction protections. The existing shell, shared controls, disposition presentation, source drawer, tokens and navy/white/yellow visual system remain in use.

**Consolidation correction (9 October 2026):** Within one ruleset, its saved catalogue identifies the game system. Matching imported system metadata must not split an otherwise identical legacy configuration into another archetype. Existing list ownership and roster completeness remain separate: matching faction, disposition and detachments groups configurations, while exact variations still require complete normalized roster evidence. Known edition/battle-size or system conflicts remain separate; nothing is guessed across rulesets. Authorized aliases preserve earlier links and discussions after membership repair.

**Confirmed — list viewing and archetype standards (9 October 2026):** The single collapsible table retains faction → archetype → list rows. List rows offer View List, show unit deviations, and leave detachment/disposition cells to archetypes. The roster-status column is replaced with Unit changes. An archetype's standard is the most repeated complete exact roster among distinct public saved lists, with one latest eligible version per list, archetype and ruleset. Search, paging and game filters do not change it. Ties use deterministic source identity. A marked default takes precedence; administrators manage this shared setting using revision checks. Defaults pin an immutable published version and are ruleset-specific. Withdrawal of publication or member access removes its shared roster and falls back to an eligible standard immediately. Personal default armies remain separate.

**Confirmed — default visual marker (10 October 2026):** The list marked as an archetype's default has a gold star and Default for archetype label beside its name, a pale yellow row background and a yellow edge in the pinned identity column. The cue remains visible while scrolling on mobile and uses the existing authorized default status.

**Import and comparison conventions:** Administrators can import stored New Recruit links in bounded batches. Inventory covers saved armies, current matrix entries, list versions, journal armies, scrim submissions and matrix history. Retrieval is recorded as current external-source evidence; old game, scrim and version snapshots are never reconstructed from today's source. Matching current saved lists receive a new composition version with existing ownership, configuration, names, scope and sharing retained. Source signatures are rechecked inside the existing atomic transaction. Changed configurations, unsupported links and missing catalogues are reported rather than guessed. Lists without links remain without imported unit data. Signature-verified current matrix imports can show comparisons, but cannot be marked defaults or count towards repeated saved-list standards because they have no immutable saved-list version.

Unit comparisons count namespaced selected units, independently of nested equipment and model selections. Known model totals reveal squad-size changes; unknown quantities or partial rosters do not produce definite deviations. Exact roster identity still includes selected loadouts. Source parsing validates attachment references as metadata and preserves every selected unit/model/option/enhancement; it does not validate army legality.

**Confirmed — consolidated roster display (9 October 2026):** List previews, list details and variation rosters primarily show grouped units and explicitly recorded attached leaders. Expand a unit to inspect its models, equipment, enhancements and leader loadout. Repeated unit types combine, with different loadouts retained inside the expansion; different leader assignments remain separate. New Recruit Leading references identify attached leaders; Supporting references retain their distinct label. Unresolved or conflicting references never hide standalone units or infer attachments from matching names. Old versions without assignment metadata remain explicitly unknown. Current source imports capture assignments in a new immutable version; semantic attachment changes affect list history, while volatile source instance IDs do not alter exact roster composition identity.

**Confirmed — condensed unit rows:** Omit the unit chevrons and borders between units. Remove extra vertical padding and margins from unit rows, attached leaders and expanded loadouts. Retain readable equipment indentation, the Loadout label and keyboard-accessible expansion.

**Confirmed — streamlined library browsing:** Expanded list rows show only the consolidated roster, with partial/missing roster states retained. Remove the repeated unit comparison, owner/ruleset summary, roster heading and detail/source actions from this expansion. Keep unit changes and Details/default controls on the list row, with full comparisons and source access in dedicated details. The main hierarchy table omits Owner, Variations, Matches and Contributors columns; all row cells and full-width expansion states align with its eight remaining columns.

**Confirmed — library width and hierarchy:** Give Unit changes the largest column and all remaining table width after compact identity, configuration and performance columns. Omit the Ruleset column for a single selected/default ruleset; show it in All rulesets, preserving segmented scores. Header, faction, archetype, list and full-width content rows share the resulting seven/eight-column layout. Expanded rosters sit one indentation level below their list text, using the same hierarchy steps as faction → archetype → list rows on desktop and mobile.

**Confirmed — compact list comparisons and detachments (9 October 2026):** Unit changes in list rows name each added or removed unit, using green additions and red removals, consistently with list details. Omit the unit-type change-count line. Known squad-size differences remain explicit. Detachment listings across libraries, saved armies, journal, matrix and scrim reports use shared display abbreviations with full-name hover/focus tooltips. Colliding catalogue initials expand to distinguish names; short single-word names remain readable. Selection options, source data, historical names and authorization retain their full names and existing behavior.

**Confirmed — model counts and character loadout differences (9 October 2026):** Added/removed units show recorded squad model counts above one in parentheses, such as +1 Eightbound (3). Mixed squad sizes remain distinct and unknown sizes are omitted. Named selected upgrades and enhancements gained/lost by existing unit types, including characters, appear in the table and details even when unit counts stay the same. Comparisons use complete published source selections and namespaced IDs; names and volatile instance IDs do not identify an upgrade. Identical extra unit copies do not invent upgrade changes. When both unit-group counts and loadouts differ, show recorded before/after group loadouts rather than guessing which character remained. No character keywords or equipment legality are inferred.

**Confirmed — optional equipment display (9 October 2026):** Standard weapons mean the unit's standard New Recruit equipment, independently of an archetype's default list. Expanded rosters and equipment comparisons omit only source-confirmed standard weapon quantities. Additional copies, alternative weapons, upgrades and enhancements remain visible, including upgrades attached to a hidden standard weapon. Historical catalogue definitions must agree; ambiguous, conditional, unknown or newer unsupported source definitions retain their equipment. Stored selections, exact roster fingerprints and historical versions remain unchanged. Before/after group comparisons show only equipment whose recorded totals differ, retaining both totals when a changed choice remains present. The reproducible catalogue index records its upstream repository and commit in `src/data/equipment-defaults.json`; refresh it with `scripts/import-equipment-defaults.mjs` using a matching New Recruit library snapshot and complete catalogue history.
