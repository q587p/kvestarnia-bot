# Kvestarnia Codex Context

Keep this file compact. Target: under 250 lines.

## Identity

- Project: Kvestarnia, a humorous fantasy Telegram RPG.
- Player-facing name: `Квестарня`.
- Technical slug/package/repo prefix: `kvestarnia`.
- Bot username target: `@kvestarnia_bot`.
- Current package version in this repository snapshot: `0.1.18`.

## Language split

- Codex-facing workflow docs, task docs, prompts, skills, PR text, commits, and test names should be English when practical.
- Player-facing Telegram copy, lore, item/monster names, news, and release flavor stay Ukrainian.
- Ukrainian copy uses `«»`, Holocene visible dates (`12026`; release/news/changelog headings use `YYYY-MM-DD`, e.g. `12026-06-19`), `міт*` with `т`, and `соціяльн*` with `я` where applicable.

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
- `0.1.16` character stats growth rework: Human-ish race budget is `+1 STR/+1 DEX/+1 CHA` with mysterious practical flavor instead of an exact preview; hidden paths add derived effective stat bonuses (`sun` STR+DEX, `moon` INT+DEX, `boundary` LUCK+CHA) without persisting to `statsJson` or previewing exact mechanics; level stats still total `level - 1` but use deterministic distributed growth biased by class profile plus race/path; `/hero` and post-reward level-up celebrations show the same race/path-aware next-level delta with `Зміна:` instead of cumulative `Ріст:`; active combat still locks adventure/navigation routes but allows safe side surfaces such as inventory/item/equipment callbacks, hero/profile, nearby-player views, restart/remort and support, with real `v1:rm:*` remort callbacks bypassing the combat redirect before normal remort/pending-raid validation; `/help` future-facing copy points to shops/crafting/guilds instead of saying loot/combat bookkeeping are missing; remort memory keeps 23% of previous actual race/path-biased distributed level growth per stat, excluding old fixed identity bonuses; combat simulation tooling also accepts the hidden path for live-math parity; `Низ` passage XP/gold/broad loot profile rewards follow effective monster level, while XP anti-farm compression checks stored pre-intervention base monster level so an easy-passage drop is not farming but genuinely weak base content remains compressed; front-door outside no longer shows a completed/inactive Yeger teleport or Barrel-side Yeger explainer, while active trails still show outdoor `До полювання`; selected Adventure Choice problem messages hide the safe/medium/risky reward ladder from body copy; local `/dev_raid_stop` can finish an active pending Barrel raid through normal completion for QA.
- `0.1.17` instant duel polish: the shipped quick duel is now `⚡ Миттєва дуель`; forwardable invites have 13 deterministic variants plus owner-only `🎲 Інший текст` rotation that edits only invite copy and preserves token/URL/expiry/state; duel create/rematch/accept uses canonical lazy HP/mana resource sync with persistence and optimistic conflict fallback; accept syncs both participants at the same logical time and recipient warnings come from the recipient snapshot; instant scoring temporarily normalizes only progression-derived level/remort budget while keeping race/class/title/path/equipped manatky/equipment effects personal; current HP/mana matter through a capped hidden readiness penalty; new result JSON stores participant snapshots, balance version and audit fields while old rows remain readable; no XP/gold/items/quest progress/item loss/wagers/tournaments/rating power/turn-based PvP runtime ships in this slice.
- `0.1.18` turn-based player duels: Fighting Corner now offers `⚡ Миттєва дуель` and `♟️ Покрокова дуель`; `DuelChallenge.mode` is stored and server-authoritative (`duel_<token>` quick, `duel_turnbased_<token>` turn-based); `👀 Хто поруч` can page active same-location players, choose a target and create a targeted quick or turn-based in-game invite, targeted recipients get a best-effort cancellation notice only on the actual cancel transition, quick duel participants get a best-effort result card only on the actual accept/resolve transition, and decline/refresh re-renders keep configured invite-link state instead of showing false missing-bot-username warnings; turn-based accept freezes both synced/normalized participant snapshots, creates one `duel_combat_sessions` row plus active combat leases, stores initiative/turn/version/turnExpiresAt and renders recoverable private participant cards plus spectator-safe group cards; active private duel cards show duel actions plus refresh only, hide unavailable class actions using shared combat availability, show viewer skill cooldowns, and omit Fighting Corner navigation while the combat lock would block it; result cards return to the Fighting Corner instead of the quest table or hall; each round queues participant choices privately, then reveals and resolves the round only after both choices or the durable 23-second timeout auto-attacks missing choices; player-action CAS requires `turnExpiresAt > now` and timeout CAS requires `turnExpiresAt <= now`; same-round older-version callbacks may merge once before deadline if the actor has not chosen; resolved actions use shared pure `resolveActorCombatAction(...)` for attack/class skill/mana/cooldown/armor/resist instead of duel-only formulas, with defensive skill mitigation applied to same-round incoming PvP damage; PvP damage uses normalized effective combat level while visible levels stay real; malformed active sessions/orphan leases repair to non-rewarding expired state; surrender/timeout/defeat terminal paths store explicit reasons, resolve the parent challenge as `resolved`, release leases and replay result cards with rematch/share controls; terminal turn-based results grant small replay-safe XP (`1` loss, `2-5` draw, `4-8` win with bounded luck influence) while quick duels remain XP-free; combat lock redirects active duel participants, including restart/remort routes, while ordinary-combat side-surface policy stays unchanged; duel HP/mana stay ephemeral and no gold, items, wagers, item loss, tournaments, broad discovery or rating power ship.

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
