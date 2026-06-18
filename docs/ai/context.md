# Kvestarnia Codex Context

Keep this file compact. Target: under 250 lines.

## Identity

- Project: Kvestarnia, a humorous fantasy Telegram RPG.
- Player-facing name: `Квестарня`.
- Technical slug/package/repo prefix: `kvestarnia`.
- Bot username target: `@kvestarnia_bot`.
- Current package version in this repository snapshot: `0.1.16`.

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
- `$balance-review` — combat, loot, progression, and economy risks.
- `$ukrainian-rpg-content` — Ukrainian player-facing battle/tip/location/news/content copy.

Compatibility/reference copies in `skills/` may exist, but default workflow should rely on `.agents/skills/` so `$skill` activation is predictable.

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
- distinct icons for distinct rows/actions in the same message; do not reuse a location/surface icon for a separate quest row.
- starter/onboarding paths when replacing older flows; level 1-2 starter mimic-shawarma must remain reachable before level 3 adventure choice.
- `0.1.14` adventure choice loop: level 3+, deterministic offers from a broad general + race + class + current-title problem pool with at least one personalized candidate when available, declined personalized race/class names in generated copy, stable per-problem offer/button icons, qualitative pre-choice risk/reward copy, readable choice spacing, daily-action idempotency, active-fight guard, preserved level 1-2 starter shawarma that hides from Quest Hub after completion, completed starter lookups do not stamp actionable starter presence, no direct Fighting Corner promo/button from the quest table, complication-to-persistent-fight path that does not spend the claim if combat cannot start, remort resets Yeger once-per-life quest keys, and `/dev_adventure_reset` for local QA that rerolls the same-period offer seed.
- `0.1.15` combat lock and battle flow polish: unfinished persistent, training, or active starter fights centrally redirect normal commands/callbacks and recognized reply-keyboard main-menu text back to battle until terminal state, while real persistent/training/starter combat callbacks, Help, `/help`, and `/version` remain allowed; combat guards run before destination presence writes and blocked routes refresh combat presence instead of stamping hall/news/Yeger destinations; terminal/expired persistent restores show the canonical terminal/reward screen; active training keyboards show only combat actions; current-turn hidden magic without mana and hidden non-mana skills on cooldown waste the hero turn and let the monster act; zero-mana class skills get deterministic `3..5` turn cooldowns; fight keyboards recompute action availability every render; ordinary level 3+ problem fights route first to `Спуск до Низу` with `⬆️ Повернутися до зали` above `⬇️ Спуститися`, then `⬇️ Спуститися` enters the separate first-tier surface/location `Ярус I: Сутерени Корчми` (`location.korchma.deep.level1`) with three passage buttons (`⬅️ Лівий прохід` hard, `🚪 Прямий прохід` normal, `➡️ Правий прохід` easy); adventure three-choice lists show only title plus italic short line before selection; outside direct activity gates show only `Зайти в корчму`; three consecutive eligible ordinary `Низ` fights trigger monster rest from the third fight's stored terminal completion time, not later reward/replay writes; new battle intros reuse existing `Порада дня`; lazy HP recovery can show a one-shot full-health notice during `/hero` or `/fight`; Yeger quest selection/help/turn-in stay at the Barrel-side corner, while active trail taking/checking happens outside via `Надвір` / final-row `До полювання`, and progress still matches eligible monster type/tag source-agnostically by completion time.
- `0.1.16` character stats growth rework: Human-ish race budget is `+1 STR/+1 DEX/+1 CHA`; hidden paths add derived effective stat bonuses (`sun` STR+DEX, `moon` INT+DEX, `boundary` LUCK+CHA) without persisting to `statsJson` or previewing exact mechanics; level stats still total `level - 1` but use deterministic distributed growth biased by class profile plus race/path; `/hero` shows `Зміна:` as a next-level delta instead of cumulative `Ріст:`; active combat still locks adventure/navigation routes but allows safe side surfaces such as inventory/item/equipment callbacks, hero/profile, nearby-player views, restart/remort and support; `/help` future-facing copy points to shops/crafting/guilds instead of saying loot/combat bookkeeping are missing; remort memory keeps 23% of previous distributed level growth per stat, excluding old identity bonuses; `Низ` passage XP/gold/broad loot profile rewards follow effective monster level, not hero-vs-monster level gap; local `/dev_raid_stop` can finish an active pending Barrel raid through normal completion for QA.

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
