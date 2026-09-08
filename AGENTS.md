# Team Sweden project guidance

- Use Next.js App Router, React, and TypeScript. Deployment to the user-owned GitHub repository, Vercel project, and Supabase project is authorized. Keep unrelated services untouched.
- Read the living design document at `design/product-design.md` for confirmed product decisions.
- Preserve the server authorization boundary. Members see only their own profiles/journals/goals/messages; evaluations, evaluation history, audit reasons, and internal discussions are admin-only. Never substitute client filtering for server filtering.
- Keep local persistence and sessions in `src/server`. Supabase production uses cloud-store.ts; preserve domain behavior, server-side access checks, and atomic revision commits.
- Use New Recruit for army choices. Preserve historical names/revisions and keep disposition distinct from up to three detachment choices.
- Never delete/reset `.local/team-sweden.sqlite` to refresh sample content. It may contain user edits. Tests must use their isolated temporary databases.
- Keep the eight selected-player cap and event capacity checks transactional. Protect shared evaluation writes with revisions.
- Run lint, build, domain tests, and HTTP tests after substantive changes. `npm run test:http` needs a current production build and uses port 3107.
- Preserve the navy/white/yellow visual system, readable faction names, mobile navigation, and accessible labels.
<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
