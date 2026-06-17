# Kvestarnia Codex Context

Keep this file compact. Target: under 250 lines.

## Identity

- Project: Kvestarnia, a humorous fantasy Telegram RPG.
- Player-facing name: `Квестарня`.
- Technical slug/package/repo prefix: `kvestarnia`.
- Bot username target: `@kvestarnia_bot`.
- Current package version in this repository snapshot: `0.1.10`.

## Language split

- Codex-facing workflow docs, task docs, prompts, skills, PR text, commits, and test names should be English when practical.
- Player-facing Telegram copy, lore, item/monster names, news, and release flavor stay Ukrainian.
- Ukrainian copy uses `«»`, Holocene visible dates (`12026`), `міт*` with `т`, and `соціяльн*` with `я` where applicable.

## Token-economy rules

- One versioned task per Codex thread.
- Prompts should be short and skill-based: `Use $skill` plus the task doc path.
- Do not paste long repeated instructions into prompts.
- Inspect changed/relevant files before broad scans.
- Second Codex review defaults to changed files only.
- Final Codex responses should be short: changed files, behavior changed, tests run, risks, completion status. No tutorial.
- After a versioned task closes, write a compact handoff and start the next task in a new Codex thread.

## Active skills

Repo-specific skills in `.agents/skills/`:

- `$kvestarnia-version-task` — main implementation for one scoped versioned task.
- `$kvestarnia-second-codex-readonly` — second Codex read-only review, changed-files default.
- `$kvestarnia-telegram-qa` — compact/full Telegram QA plans.
- `$kvestarnia-release-checklist` — release readiness and handoff.

Shared/root skills in `skills/`:

- `$balance-review` — combat, loot, progression, economy risks.
- `$ukrainian-rpg-content` — Ukrainian player-facing RPG content review/generation.

Use one main skill by default. Add another skill only when it materially helps.

## Important docs

- `AGENTS.md` — hard project/Codex rules.
- `README.md` — public-facing project window.
- `docs/README.md` — docs index.
- `docs/CODEX_WORKFLOW.md` — workflow and token-economy rules.
- `docs/tasks/README.md` — version task doc convention.
- `docs/BRAND.md` — naming and public voice.
- `docs/PRODUCT_BRIEF.md` — positioning and MVP scope.
- `docs/GAME_DESIGN.md` — core game loop.
- `docs/CONTENT_STYLE_GUIDE.md` — Ukrainian copy style.
- `docs/TECHNICAL_PLAN.md` — architecture and data model.
- `docs/ROADMAP.md` — phase plan.
- `docs/BALANCE_NOTES.md` — formulas and economy guardrails.
- `docs/SECURITY_AND_FAIR_PLAY.md` — privacy, anti-abuse, idempotency.
- `docs/DEVELOPER_SETUP.md` — local setup and deployment notes.
- `docs/PLAYTESTING.md` — manual smoke tests.
- `CHANGELOG.md` — detailed release history.
- `news.md` — player-facing spoiler-light release news.

## Code map

- `src/bot.ts` — app entry point.
- `src/bot/createBot.ts` — grammY bot assembly and middleware wiring.
- `src/bot/commands/` — command handlers.
- `src/bot/callbacks/` — callback data parsers/serializers.
- `src/bot/keyboards/` — Telegram keyboards.
- `src/bot/presenters/` — Telegram text rendering.
- `src/bot/presence/presenceRouting.ts` — presence/location routing helper.
- `src/services/` — application services connecting bot/domain/db.
- `src/domain/` — pure game logic; no Telegram imports.
- `src/content/` — validated content tables and flavor data.
- `src/db/repositories/` — repository interfaces and Prisma implementations.
- `src/jobs/` — background/scheduled jobs.
- `src/shared/` — shared helpers.
- `tests/` — tests mirror source layers.

## Package scripts

From `package.json`:

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm test`
- `npm run check` = lint + typecheck + build + tests
- `npm run db:generate`
- `npm run db:validate`
- `npm run db:migrate`
- `npm run db:deploy`

Prefer focused tests first, then broader checks.

## Runtime safety focus

For Telegram/gameplay changes, always consider:

- duplicate callback presses
- stale callback data
- idempotent rewards and quest progress
- active fight/session conflicts
- player state/session consistency
- presence/location routing
- DB transactions and replay safety
- restart/redeploy behavior
- short Ukrainian Telegram messages

## Current product direction

- `0.0.x` foundation is closed after `0.0.30`.
- `0.1.x` is stabilization, playtest polish, and careful Phase 2 preparation.
- Phase 2 direction: Social Combat & Interactions, not a group-raid-first roadmap.
- Real PvP, trading, party combat, raids, shops, crafting, guilds, and Mini App UI remain small future slices unless a task explicitly targets one.

## Do not promise as shipped

Do not present the following as current shipped features unless code/task proves it:

- guilds
- real group raids
- broad PvP
- player markets
- crafting economy
- Mini App UI
- paid power
- non-Telegram clients
