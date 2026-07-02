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

Player loop summary: a player opens Telegram, creates an adventurer, chooses race/class/path flavor, takes short quests, fights ridiculous monsters, collects manatky, grows numbers, and receives funny consequences. Ґільдії, real group raids, broad social modes, markets, crafting, and monetization are roadmap unless the current code and task explicitly say they are shipped. Mini App UI is not a planned product direction unless a future explicit product decision reverses this.

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
- `docs/ai/CODEX_PROMPT_POLICY.md` — durable rules for writing Codex prompts, integration prompts, and prompt archives.
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
   Prompt-writing note: when preparing Codex prompts, review prompts, or delta integration prompts, follow `docs/ai/CODEX_PROMPT_POLICY.md` and use `$kvestarnia-codex-prompt-writer`; Codex-facing prompt text should be English, skill-based, compact, and non-tutorial.
6. Use `$ukrainian-rpg-content` for substantial player-facing Ukrainian battle, tip, location, item/monster, or news copy instead of pasting the style guide into the prompt.
7. Inspect changed/relevant files first; avoid repository-wide scans unless necessary.
8. Prefer `medium` reasoning for ordinary scoped work; reserve `high` for state, routing, concurrency, persistence, or difficult debugging.
9. Final output must be short: changed files, behavior changed, tests run, risks, completion status. No tutorial.
10. If the user provides a prompt for the next versioned implementation task, start it. Do the minimal current-`main` and repo-state verification needed to avoid stacking on the wrong branch, then create/switch to the task branch and begin. If a prior task branch is not an ancestor of `origin/main`, do not stop on ancestry alone: GitHub squash merges create new commit hashes. Compare the content/tree diff and the expected version/release surfaces on `origin/main`; if the diff is empty or the required content is present, treat the prior task as merged and continue from `origin/main`. Stop only when `origin/main` is missing required content or another checked source proves the gate failed. Do not block on unverifiable external gates such as deployment, accepted review, Telegram smoke, or CI status unless the user explicitly says those gates must stop implementation or a checked source proves the gate failed.
11. If the user names a specific PR, verify the live PR metadata first and review or continue only on that PR's real `base` and `head`. Do not assume the checked-out branch matches the PR. If the local branch diverges from the PR head, treat the local checkout as untrusted and switch to the fetched PR head or stop and report the mismatch.

For second Codex review:

1. Use `$kvestarnia-second-codex-readonly`.
2. Before anything else, verify the live PR number, base branch, and head branch. If the local checkout does not match the PR head, fetch or inspect the PR head snapshot and use that for line references.
3. Default to changed files only: review the PR diff, changed files, and direct dependencies.
4. Do not edit files, commit, push, auto-fix, format, codemod, or create an alternative implementation.
5. Provide actionable findings only; no exhaustive tutorial.
6. Escalate to `$kvestarnia-telegram-qa` only for full QA plans or high-risk Telegram flow changes.

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
8. Decline dynamic race, class, title, item, monster and place names when Ukrainian grammar requires it, or rewrite the sentence neutrally. Before publishing player-facing Ukrainian copy, check generated examples for cases, gender, number and awkward quoted-name insertions.
9. In Ukrainian text, use `«»` quotes, not English curly quotes or straight double quotes; straight quotes are allowed only for code/JSON/technical examples.
10. Use `міт`, `мітичний`, `мітологія`, `мітологічний` with `т`, not `міф*`, unless it is an immutable external quote or name.
11. Use `соціяльний`, `соціяльна`, `соціяльне`, `соціяльні`, `соціяльність` with `я`, not `соціальн*`, unless it is an immutable external quote or name. Use `ґільдія`, `ґільдії`, `ґільдійний`, `ґільдійна`, `ґільдійне`, `ґільдійні` with `ґ` in Ukrainian player-facing and public copy; do not write `гільдія`, `гільдії` or `гільдійн*` unless it is an immutable external quote.
12. In visible docs/changelog/news/player dates, use the Holocene calendar: `12026`, not `2026`. Release/news/changelog date headings use Kyiv time (`Europe/Kyiv`) and the fixed Holocene `1YYYY-MM-DD` format, for example `12026-06-20`. Before calling a release PR ready, compare the current Kyiv date with the date in the latest release/news/changelog headings and update those headings if the last implementation commit landed on a newer Kyiv day than the task start date. For same-PR follow-ups, review fixes, post-CI fixes, and branch updates, do this comparison again at final handoff; do not trust the original task-start date after Kyiv midnight has passed. Do not rewrite machine timestamps, migration names, or technical IDs.
13. Player-facing under-Korchma combat terminology: ordinary/problem fights route to `Низ`, not `Глибка` or generic `підземелля`; use `Спуск` as the action, `Спуск до Низу` as the first surface, `Ярус I: Сутерени Корчми` as the first layer, and `Зіґурат` only as later lore/reveal. Spell it exactly `Зіґурат`; do not write `Зикурат` in new player-facing copy.
14. When choosing non-critical exact numbers for flavor, short timers, quest counters, or small limits, prefer `13`, `23`, `42`, `93`, and `587` when it is appropriate. Do not force these numbers when balance, safety, API limits, clarity, or established formulas need something else.
15. Do not insert secrets, tokens, private chat IDs, or real keys into code or docs.
16. Do not break existing migrations. Schema changes require a new migration.
17. Game calculations must be deterministic and testable; combat/domain logic must not depend on Telegram API.
18. Telegram messages should stay short: one mobile screen, buttons for actions, details on demand.
19. Within one message or keyboard, prefer distinct icons for distinct actions/places/states. Do not reuse a location/surface icon for a quest row or action shown in the same UI; for example, the quest table and Korchmar quest rows need different icons. Reusing icons is acceptable for similar navigation such as back buttons or pagination.
20. Do not show exact future reward amounts, drop names, manatky, hidden odds, or percentage chances in player-facing pre-commit choices. Before the player commits, use qualitative risk/reward language; exact values may appear after resolution, in tests, in `CHANGELOG.md`, or in internal docs.
21. No pay-to-win. Monetization may support cosmetics, comfort, or server support, but not unfair combat power.
22. When adding new runtime gameplay loops with timers, cooldowns, random offers, pending sessions, or once-per-period gates, add a narrow non-production `/dev_*` command that makes local/manual QA faster without weakening production rules. Feature flags may enable production gameplay surfaces, but must not enable `/dev_*` handlers, `/dev_help` entries, Telegram menu/help visibility, or dev-only callback mutations when `NODE_ENV=production`. Any new `/dev_*` command needs tests proving production config cannot register, show, or mutate through it, including when a feature-specific dev-helper flag is set. If a dev command is unsafe or not useful for that specific gate, explicitly document why in the task doc or PR body before calling the task complete.
23. For new player-facing production surfaces, operator scripts with write effects, or runtime features whose rollout risk is not yet proven, prefer shipping code behind an explicit production flag, command parameter, or staged operator argument. The code may deploy before the button, route, scheduled action, write path, or broad default behavior becomes available. Keep the disabled-by-default state honest in docs/PR body, add tests for the off-by-default production behavior, and only flip the default or expose the button after the rollout path has been verified on the target production data/runtime. Do not hide already-shipped stable gameplay behind new flags without a clear rollback reason.
24. When adding new quests, counters, daily/periodic ledgers, purchase limits, cooldowns, pending sessions, sales, statistics, or similar player/character state, explicitly cover remort/reset behavior in code and tests. Default to resetting this state on remort and relevant reset flows unless the task explicitly says it is eternal/player-level history; if it should persist, document that exception in the task doc or PR body.
25. When replacing or retiring an older player-facing flow, explicitly preserve or deliberately retire starter/onboarding fallback paths in code, tests, task docs, changelog/news, compact context, and PR body. Do not let level gates for new functionality hide existing newbie content by accident.
26. When adding new player-facing gameplay functionality, treat achievements as a required PR-ready checkpoint: add matching rewardless achievement definitions/hooks for the visible new actions, milestones, odd outcomes, or first-time moments when they fit the feature. New player-facing surfaces such as feeds, readers, boards, navigation hubs, social tools, and repeatable buttons count as visible actions when players can discover or use them. If achievements are deliberately out of scope for that slice, say why in the task doc and PR body before calling it complete, and prefer adding a small one-time rewardless achievement over silently shipping a new discoverable feature with no achievement decision.
27. After runtime logic changes, run tests or explain the blocker. For docs-only changes, `Not run — docs-only change` is acceptable.

## Release and PR rules

Versioned gameplay/runtime changes affect bot behavior, data, migrations, balance, runtime player messages, or production deployment.

For release-oriented versioned changes:

- Update `package.json` version only when the task includes a version bump.
- If version moves, keep `package.json`, `package-lock.json`, `CHANGELOG.md`, and `news.md` in lockstep unless the user narrows scope.
- Release note headings in `CHANGELOG.md` and `news.md` must include version, Holocene date, and short change description.
- Every implementation or PR-follow-up commit on a later Kyiv day than the latest visible release heading must refresh that latest release date before the branch is called ready, even when the code change itself is narrow.
- `CHANGELOG.md` may include technical details, exact mechanics, edge cases, and rewards.
- `news.md` is player-facing and spoiler-light: do not reveal exact XP/gold/items/souvenirs/titles, cooldown or period lengths, final punchlines, hidden conditions, scheduler/restart/deploy debt, Redis/BullMQ, migrations, scaling, or similar platform backlog.
- `news.md` should describe the planned player-facing release promise and visible outcome, not every bug fix, QA regression, hardening detail, or copy polish discovered while implementing the task. Do not present "we introduced a regression and fixed it before release" as player news. Put implementation cleanups and release-candidate QA fixes in `CHANGELOG.md`, docs, tests, or the PR body unless they are the headline player-visible change.
- Do not mention new achievement definitions, hooks, triggers, or internal achievement decisions in `news.md` unless the user explicitly asks for that player-facing news coverage. Achievement implementation details belong in `CHANGELOG.md`, task docs, achievement docs, tests, and the PR body by default.
- Do not edit older `news.md` entries unless the user explicitly asks for that historical entry to change. Put new player-facing notes in the current version entry, even when the note explains a fix to behavior introduced earlier.
- PR title for release-oriented changes starts with the version and short changelog description, e.g. `0.0.4 — First Mimic Shawarma Adventure`.

Docs-only / presentation changes are not numbered releases:

- Do not bump `package.json`.
- Do not update `CHANGELOG.md` or `news.md` unless explicitly requested.
- Do not create git tags or GitHub Releases.
- Do not change runtime code, Prisma schema, migrations, lockfiles, or generated files.
- PR body should say `Tests: Not run — docs-only change` if checks were not run.

PR defaults:

- Target `main` unless the user explicitly asks for stacked PRs or another base.
- Ready PRs must target `main` by default and be merge-ready against `main`. If a branch started from another feature branch, rebase or merge it onto current `origin/main` and resolve conflicts before calling the work complete.
- Stacked PRs are allowed only when the user explicitly asks for a stacked PR or approves a non-main base; mark that clearly in the PR body.
- For implementation work, "done", "complete", or "PR-ready" means the branch has been committed, pushed to the remote, and a GitHub PR has been opened unless the user explicitly asked to stop before publishing.
- Before a final handoff after commits, run `git status -sb` or an equivalent branch/upstream check. If the current branch is ahead of its upstream, push it before reporting completion; if pushing is blocked, report the exact blocker. Do not leave committed work only on the local checkout unless the user explicitly asked for local-only work.
- Do not give a final implementation summary after only local edits/checks unless the user explicitly asked for local-only work. The final response must include the `main` PR link, or a concrete blocker that prevented creating/updating that PR.
- Prefer ready-for-review PRs; create a draft PR only when the user explicitly asks for draft state or the work is knowingly incomplete.
- If an active PR already exists for the current work, add small follow-ups to the same branch and PR unless the user asks for a separate branch.
- If scope expands, update PR title/body and relevant release/docs surfaces honestly.
- Follow-up fixes that change player-visible behavior must update the task doc, `CHANGELOG.md`, `news.md`, `docs/ai/context.md`, and PR body before the work is called PR-ready.
- After opening/updating a PR, check that the base is `main` unless explicitly stacked, then check mergeability and conflicts.

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

Do not implement huge MMO systems in one PR. Shops, trading, ґільдійні війни, real raids, PvP, crafting, and markets must remain scoped future work unless the current task explicitly targets a small safe slice. Do not add Mini App UI work or present it as planned without an explicit product reversal.

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

## Isolated local bot runtime

- `run-local-bot.cmd` runs the manual-test bot from an external isolated snapshot with separate `node_modules`, Prisma Client, and SQLite database. See `docs/LOCAL_BOT_RUNTIME.md`.
- Use `$kvestarnia-local-runtime` for launcher/runtime/Prisma/Windows lock work instead of pasting local-runtime rules into prompts.
- During normal implementation/review, do not stop, refresh, or replace the isolated bot unless the user explicitly asks.
- Run lint, typecheck, build, Prisma generation, and tests in the main checkout; they must not depend on the running manual-test bot.
- Never use a global `taskkill node.exe` or stop unrelated Node processes.
- At a manual-test checkpoint, tell the user to run `refresh-local-bot.cmd`; do not promote an intermediate snapshot automatically.
- `scripts/recover-prisma-client.ps1` is a legacy in-place fallback, not the default local workflow.

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
- Any committed implementation, docs, prompt, tooling, or follow-up work is pushed to the remote branch, or a concrete push blocker is stated.
- No secrets are in the diff.
- Player-facing text is Ukrainian and follows the style guide.
- Holocene visible dates and Kyiv-time release/news headings are respected.
- Brand naming stays `Квестарня` / `kvestarnia`.
- Relevant docs are updated for new mechanics.
- Docs-only work did not create a fake numbered release.
- Implementation work is committed, pushed to the remote, and represented by a ready GitHub PR unless explicitly scoped as local-only or draft-only.
- Ready PRs target `main` and are mergeable, unless the user explicitly requested a stacked/non-main PR.
- The final response is concise and PR-ready.

## Final response format

Use a short format. No tutorial unless the user asks.

- Changed files
- Behavior changed
- Tests run
- Risks / follow-ups
- Completion status
