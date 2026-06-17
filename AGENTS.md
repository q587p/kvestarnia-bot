# AGENTS.md — Codex instructions for Kvestarnia

## Project identity and naming

Canonical names:

- Player-facing name and all Ukrainian game copy: `Квестарня`.
- Technical slug, package/namespace, repo/env/config prefix: `kvestarnia`.
- Target Telegram bot username: `@kvestarnia_bot`.
- Repository name: `kvestarnia-bot`.

Do not use without an explicit product decision:

- `Questarnia`
- `Квестарнія`
- `Kvestarnya`
- random transliterations such as `kvestarnya`, `questarnya`, or `kvestarnya-bot`

Rule: if the text is visible to players, write `Квестарня`; if it is a machine identifier, write `kvestarnia`.
Do not invent new brand spellings.

## Project goal

Kvestarnia is a humorous fantasy RPG in Telegram: easy to enter, Ukrainian-first in player-facing copy, silly in tone, and deep enough to support progression. Inspiration includes tabletop RPGs, Munchkin, Robert Asprin's MythAdventures, Monty Python and the Holy Grail, Viva La Dirt League / Epic NPC Man, classic MMORPGs, Terry Pratchett-style systemic absurdity, metamodern warmth, Ukrainian memes, and folklore. Use inspiration as flavor, allusion, or parody spice; do not copy protected scenes, characters, unique places, or long quotes.

Player loop summary: a player opens Telegram, creates an adventurer, chooses race/class/path flavor, takes short quests, fights ridiculous monsters, collects manatky, grows numbers, and receives funny consequences. Guilds, real group raids, broad social modes, markets, crafting, monetization, and Mini App UI are roadmap unless the current code and task explicitly say they are shipped.

## Language policy

Use English for Codex-facing workflow materials:

- version task docs in `docs/tasks/`
- Codex prompts in `docs/ai/prompts/`
- `.agents/skills/*/SKILL.md`
- internal implementation notes intended mainly for Codex
- PR titles/bodies, commit messages, and test names when practical

Use Ukrainian for:

- all player-facing Telegram text
- lore, flavor, names, item descriptions, monster jokes, release/news copy for players
- examples of player messages

## Sources of truth

Before changing code, read only the relevant sources of truth. Avoid broad reading unless the task is unclear.

High-level docs:

- `README.md` — public-facing project window; do not turn it into a dev runbook.
- `docs/BRAND.md` — canonical naming, voice, tone, public wording.
- `docs/PRODUCT_BRIEF.md` — positioning, audience, USP, MVP scope.
- `docs/GAME_DESIGN.md` — core loop, mechanics, progression.
- `docs/CONTENT_STYLE_GUIDE.md` — Ukrainian tone, humor, Telegram message format.
- `docs/TECHNICAL_PLAN.md` — architecture, modules, data, callbacks, deployment.
- `docs/ROADMAP.md` — phases and Definition of Done.
- `docs/BALANCE_NOTES.md` — formulas, economy, RNG.
- `docs/SECURITY_AND_FAIR_PLAY.md` — anti-abuse, privacy, fair play.
- `docs/DEVELOPER_SETUP.md` — local run, Prisma, Render, scripts, troubleshooting.
- `docs/PLAYTESTING.md` — manual smoke test for the current playable loop.
- `docs/CODEX_WORKFLOW.md` — task, PR, review, docs-only, and token-economy workflow.
- `docs/ai/context.md` — compact Codex context pack; keep it under 250 lines.
- `docs/tasks/README.md` — version task doc convention.

If documentation contradicts code, say so in the final response and propose the smallest safe correction.

## Token-efficient Codex workflow

Default rule: one versioned task equals one Codex thread.

For implementation work:

1. Start a fresh Codex thread for each versioned task.
2. Use one short prompt from `docs/ai/prompts/main-new-version-thread.md`.
3. Activate one main skill: `$kvestarnia-version-task`.
4. Point Codex to a short task doc in `docs/tasks/` and the compact context in `docs/ai/context.md`.
5. Do not paste long repeated rules into prompts; rely on `AGENTS.md` and `$skill`.
6. Inspect changed/relevant files first; avoid repository-wide scans unless necessary.
7. Prefer `medium` reasoning for ordinary scoped work; reserve `high` for state, routing, concurrency, persistence, or difficult debugging.
8. Final output must be short: changed files, behavior changed, tests run, risks, completion status. No tutorial.

For second Codex review:

1. Use `$kvestarnia-second-codex-readonly`.
2. Default to changed files only: review the PR diff, changed files, and direct dependencies.
3. Do not edit files, commit, push, auto-fix, format, codemod, or create an alternative implementation.
4. Provide actionable findings only; no exhaustive tutorial.
5. Escalate to `$kvestarnia-telegram-qa` only for full QA plans or high-risk Telegram flow changes.

After closing a versioned task:

1. Run `$kvestarnia-release-checklist` if the task is release-oriented.
2. Write a compact handoff summary.
3. Start the next versioned task in a new Codex thread.
4. Do not carry a long thread across several versioned tasks.

## Working rules for Codex

1. Plan briefly before editing code.
2. Make small, reviewable diffs.
3. Do not rewrite architecture unless the task requires it.
4. Do not add production dependencies without a clear reason.
5. Do not run global formatters on the whole repo unless explicitly requested.
6. Do not change lockfiles, migrations, schemas, config, generated files, or snapshots unless the task requires it.
7. Keep all player-facing strings Ukrainian. No accidental Russian, rough calques, or random English in game copy except technical commands.
8. In Ukrainian text, use `«»` quotes, not English curly quotes or straight double quotes; straight quotes are allowed only for code/JSON/technical examples.
9. Use `міт`, `мітичний`, `мітологія`, `мітологічний` with `т`, not `міф*`, unless it is an immutable external quote or name.
10. Use `соціяльний`, `соціяльна`, `соціяльне`, `соціяльні`, `соціяльність` with `я`, not `соціальн*`, unless it is an immutable external quote or name.
11. In visible docs/changelog/news/player dates, use the Holocene calendar: `12026`, not `2026`. Release/news/changelog date headings use Kyiv time (`Europe/Kyiv`). Do not rewrite machine timestamps, migration names, or technical IDs.
12. When choosing non-critical exact numbers for flavor, short timers, quest counters, or small limits, prefer `13`, `23`, `42`, `93`, and `587` when it is appropriate. Do not force these numbers when balance, safety, API limits, clarity, or established formulas need something else.
13. Do not insert secrets, tokens, private chat IDs, or real keys into code or docs.
14. Do not break existing migrations. Schema changes require a new migration.
15. Game calculations must be deterministic and testable; combat/domain logic must not depend on Telegram API.
16. Telegram messages should stay short: one mobile screen, buttons for actions, details on demand.
17. Within one message or keyboard, prefer distinct icons for distinct actions/places/states. Reusing icons is acceptable for similar navigation such as back buttons or pagination.
18. No pay-to-win. Monetization may support cosmetics, comfort, or server support, but not unfair combat power.
19. After runtime logic changes, run tests or explain the blocker. For docs-only changes, `Not run — docs-only change` is acceptable.

## Release and PR rules

Versioned gameplay/runtime changes affect bot behavior, data, migrations, balance, runtime player messages, or production deployment.

For release-oriented versioned changes:

- Update `package.json` version only when the task includes a version bump.
- If version moves, keep `package.json`, `package-lock.json`, `CHANGELOG.md`, and `news.md` in lockstep unless the user narrows scope.
- Release note headings in `CHANGELOG.md` and `news.md` must include version, Holocene date, and short change description.
- `CHANGELOG.md` may include technical details, exact mechanics, edge cases, and rewards.
- `news.md` is player-facing and spoiler-light: do not reveal exact XP/gold/items/souvenirs/titles, final punchlines, hidden conditions, scheduler/restart/deploy debt, Redis/BullMQ, Mini App UI, migrations, scaling, or similar platform backlog.
- PR title for release-oriented changes starts with the version and short changelog description, e.g. `0.0.4 — First Mimic Shawarma Adventure`.

Docs-only / presentation changes are not numbered releases:

- Do not bump `package.json`.
- Do not update `CHANGELOG.md` or `news.md` unless explicitly requested.
- Do not create git tags or GitHub Releases.
- Do not change runtime code, Prisma schema, migrations, lockfiles, or generated files.
- PR body should say `Tests: Not run — docs-only change` if checks were not run.

PR defaults:

- Target `main` unless the user explicitly asks for stacked PRs or another base.
- Ready PRs should not remain on a non-main base unless they are intentionally stacked and named as such.
- If an active PR already exists for the current work, add small follow-ups to the same branch and PR unless the user asks for a separate branch.
- If scope expands, update PR title/body and relevant release/docs surfaces honestly.
- After opening/updating a PR, check base branch, mergeability, and conflicts.

## Architecture boundaries

Current stack: TypeScript, Node.js, grammY, Prisma, Vitest, ESLint, strict TypeScript, SQLite/PostgreSQL via Prisma depending on environment.

Layer map:

- `src/bot/` — Telegram adapters: commands, callbacks, keyboards, middleware, presenters.
- `src/domain/` — pure game logic: combat, loot, progression, resources, remort, etc.
- `src/content/` — monsters, items, classes, races, flavor, validation data.
- `src/db/` — Prisma client, repositories, transaction-facing persistence.
- `src/services/` — application layer connecting bot/domain/db.
- `src/jobs/` — scheduled/background jobs.
- `tests/` — unit and integration tests matching the source layout.

Telegram must not leak into `src/domain/`. Domain functions receive ordinary objects and return ordinary results; bot/presenter layers turn them into Telegram messages and buttons.

## Gameplay scope guard

MVP/core loop:

1. `/start` creates a character.
2. Race/class/path flavor shapes early identity.
3. Short quests and fights move progression.
4. Turn-based fights support attacks, class action, items, flee, HP/mana, rewards.
5. Loot grants gold, XP, and manatky.
6. Equipment and item views explain what changed.
7. Level growth unlocks new actions.
8. Social/combat systems grow in small, opt-in slices.

Do not implement huge MMO systems in one PR. Shops, trading, guild wars, real raids, PvP, crafting, markets, and Mini App UI must remain scoped future work unless the current task explicitly targets a small safe slice.

## Text style and content safety

Tone: Ukrainian tavern + absurd fantasy + ironic systems.

Good examples:

- «Ви знайшли шолом. Він трохи пахне попереднім героєм, але бонус +2 до впевненості переконує.»
- «Мімік прикинувся скринею. Невдало: скриня не повинна облизуватись.»
- «Ваш бард заграв соло. Монстр отримав 3 шкоди й бажання поговорити з менеджером.»

Avoid:

- Russianisms and accidental surzhyk unless a specific character voice intentionally uses it.
- Real tragedies as punchlines.
- Jokes targeting protected groups.
- Wall-of-text Telegram messages.
- Promising not-yet-shipped roadmap features as shipped.
- Bringing unrelated project layers such as Chornolis, Twin Peaks, Dante, Shakespeare, Amber/LARP, or other personal/project material into Kvestarnia.

## Tests and quality

For significant runtime changes, add or update:

- Unit tests for formulas, combat, loot, level-up, resources, idempotency helpers.
- Presenter tests for stable critical text surfaces.
- Integration tests for command/callback flows when Telegram handlers change.
- Repository/service tests for transactions, rewards, inventory, remort, fights, and idempotency.
- Duplicate/stale callback tests when callbacks mutate state.

For docs-only changes, check links and make sure README stays public-facing while setup/runbook material lives in docs.

Use available scripts from `package.json`:

```bash
npm install
npm run lint
npm run typecheck
npm test
npm run build
npm run check
```

Prefer targeted tests first, then broader checks if needed.

## Definition of Done

A change is done when:

- It matches the requested version task or clearly explains a deviation.
- Runtime logic has relevant tests, or missing tests are explained.
- Commands/checks were run or blockers are stated.
- No secrets are in the diff.
- Player-facing text is Ukrainian and follows the style guide.
- Holocene visible dates and Kyiv-time release/news headings are respected.
- Brand naming stays `Квестарня` / `kvestarnia`.
- Relevant docs are updated for new mechanics.
- Docs-only work did not create a fake numbered release.
- The final response is concise and PR-ready.

## Final response format

Use a short format. No tutorial unless the user asks.

- Changed files
- Behavior changed
- Tests run
- Risks / follow-ups
- Completion status
