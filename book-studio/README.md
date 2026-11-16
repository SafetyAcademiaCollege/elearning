# Book Studio

A multi-tenant web app for training organisations (aviation ATOs, operators, OSH and
VET providers) to write, review and approve bilingual (English/Georgian) manuals and
course books, with AI drafting and an audit-grade record of who wrote what.

## What it does

- **Workspaces per organisation** with invite-only accounts and four roles: owner,
  author, reviewer, approver.
- **Chapters in English and Georgian**, autosaved, with full version history, compare
  and restore.
- **AI drafting, EN↔KA adaptation, consistency checks and blueprinting from notes**,
  through a server-side gateway that enforces each organisation's monthly AI allowance.
- **Provenance you can show a regulator.** AI text can only enter through the gateway,
  which records it as AI-generated. Once a language version has been AI-drafted it stays
  marked as such however much it is edited, following e-book retailers' disclosure rule.
- **Approval workflow**: draft → in review → reviewed → approved (locked as Rev 0, 1, …)
  → new revision with a stated reason. Everything is written to an audit log.
- **Source library and glossary.** The AI may only rely on sources linked to a chapter,
  marks unsupported claims `[CITATION NEEDED: …]`, and uses glossary terms exactly.
- **Six templates**: ATO Training Manual, OSH Course Book, Operations Manual, SMS
  Manual, Instructor Handbook, OSH Induction Booklet.
- **Exports**: Word (DOCX), branded PDF in a controlled-manual layout (cover, record of
  revisions, list of effective chapters, headers and footers, provenance appendix),
  EPUB, and SCORM 1.2 for any LMS.
- **Plans and billing**: Pilot, Starter, Team, Institutional, with Stripe Checkout and
  Customer Portal.

## Layout

```
book-studio/
  app/                      React + Vite web app (static; deploys to Cloudflare Pages)
    src/export/             DOCX, PDF, EPUB and SCORM writers (run in the browser)
    test/                   Vitest unit tests (text format, prompts, pricing, exports)
  supabase/
    migrations/             Database schema, row-level security, workflow, templates
    functions/              Edge functions: ai (gateway), team, billing, stripe-webhook
    tests/                  SQL security and workflow tests on plain Postgres
  docs/                     Deployment, operations and launch smoke test
```

## Architecture

```
Browser (React)  ──►  Supabase, EU (Frankfurt)
                        ├─ Auth (invite-only)
                        ├─ Postgres + row-level security   ◄── all data access
                        ├─ Storage (logos)
                        └─ Edge functions
                             ├─ ai ──────────► Anthropic API (Claude)
                             ├─ team (invites)
                             └─ billing / stripe-webhook ──► Stripe
```

Security rests on the database, not on the app. Every table is protected by row-level
security, users cannot write chapter text or workflow status directly (only through
checked functions), and the AI key never reaches the browser.

## Development

```bash
# Database tests (needs Postgres 16 binaries)
./supabase/tests/run.sh

# App
cd app
npm ci
npm test            # unit tests
npm run build       # type-check + production build
cp .env.example .env.local   # point at a Supabase project, then:
npm run dev

# Edge function type-check
cd supabase/functions && deno check ai/index.ts team/index.ts billing/index.ts stripe-webhook/index.ts
```

Deploying: see [docs/DEPLOY.md](docs/DEPLOY.md). Running it: [docs/OPERATIONS.md](docs/OPERATIONS.md).
Before inviting the first partner: [docs/SMOKE-TEST.md](docs/SMOKE-TEST.md).

## AI models

| Operation | Default model | Why |
|---|---|---|
| Draft chapter, adapt EN↔KA | `claude-opus-5-5` (effort high, streaming, server-side refusal fallback) | Prose quality, Georgian register |
| Consistency check, blueprint | `claude-haiku-5-5` (structured JSON output) | Cheap, fast |

Override per operation with the `DRAFT_MODEL`, `ADAPT_MODEL`, `CHECK_MODEL` and
`BLUEPRINT_MODEL` secrets. Prices for cost metering are in
`supabase/functions/_shared/pricing.ts`.
