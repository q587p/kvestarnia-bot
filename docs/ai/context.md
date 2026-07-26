# Kvestarnia Codex Context — keep under 250 lines

## Identity and language

- Product: Ukrainian-first humorous Telegram RPG `Квестарня`; technical slug/repo/package prefix `kvestarnia`; bot target `@kvestarnia_bot`.
- Current repository version: `0.4.2` — the exact hard `deep-left` pending encounter can be reserved by a 2–3-person `PartySession` and resolved through production-capable `group-combat.v3` behind default-off `LEFT_PASSAGE_PARTY_ATTACK_ENABLED`; solo attack remains available.
  Recruitment lasts three minutes, may start early by the current leader, and freezes the authoritative current-life same-location roster at start.
  The exact preview is primary; reservation-stable backups reuse canonical solo Низ difficulty from each frozen remort life, strongest recent threat pressure and strongest remort, with the first backup threat bonus capped at 23.
  Runtime servicing remains active when new entry is disabled. One-transaction per-player resources/consumables, neutral manual-only XP/gold, one common roll, Chronicle activity, receipts and participant-owned leases converge after restart/retry. The new completion achievement is deferred: 0.4.2 emits no left-passage achievement event and settlement has no achievement-effect fields or projection work.
  Manual Telegram QA, production enablement, merge and deployment remain pending.
- The underlying `0.4.1` restart-safe 2–3 player versus 2–3 enemy proof remains available only behind `GROUP_COMBAT_PROOF_ENABLED` outside production.
  Start freezes current-life identity/resources/stats, supported class/race/gear/items, `Ситий` and `Натхнення`; `group-combat.v2` resolves deterministic targets, mana/cooldown/fumble, threat responses and multiple deaths.
  Timeout remains resource-free guard. Item consumption shares
  the winning action/turn transaction; Dense Bandage keeps five-own-action
  cooldown and Field Kit stays once per fight. Missing frozen inventory
  rewardlessly invalidates instead of retrying forever: every relational
  contribution/settlement row is rewritten to the exact fallback. Invalid
  v1/v2 repair artifacts preserve up to 13 relational participants within the state
  cap; larger/unrepresentable corruption releases all owned leases/statuses
  before deterministic row cleanup and strict terminal-graph validation. Untrustworthy production v3 rows instead retain leases under durable operator repair.
  Terminal CAS writes one immutable zero-reward plan whose participant rows and
  receipts match state/relational identity and contribution before independent
  replay. Pending settlement is exactly zero-attempt/receipt-free/unsettled;
  completed receipts keep positive attempts and settledAt. Character resources,
  XP, gold, items, quests, achievements and activity rewards remain unchanged.
  Contributions record actual damage, healing, guard prevention, control, damage taken and committed actions; terminal cards explain all six icons. Future backlog extends this pattern to raids and other combats only where canonical evidence exists.
  Generic Aid is absent: ally support uses authored class/race profiles. Strict parser/relational/life/session/lease repair releases frozen statuses only after terminal CAS.
  Canonical participant cards remain private-DM, monotonic and
  repairable with truthful remaining time, contribution output and bounded
  journal. Stable query observations/budgets are `32/32` manual start, `31/32`
  due start, `20/20` queue, `22/35` single resolve, `31` concurrent-pair aggregate and `1/1` due scan;
  state/card/callback caps are `32,768`/`4,096`/`64` UTF-8 bytes; measured
  maxima are `5,066` state, `2,155` terminal-card fixture and `46` callback. The 24-case
  simulator completes every requested 2×2/3×3 13/25-turn case, derives zero
  rewards from terminal plans and proves each support cooldown becomes reusable.
  Generated eight-segment v2 action callbacks route through combat-lock/social
  once and performance timing labels v1/v2 GroupCombat as `callback.group-combat`; seven-segment actions fail closed and retained v1
  start/view/journal/back remain compatible. Production availability,
  deployment and manual Telegram QA remain unproven. Proof `/dev_party` is a capped
  2–3 participant, three-minute auto-start whose system-owned transaction reloads the current leader/roster; invalid closure is version-guarded, and only the current leader may start early.
  Stale private cards replay results; public callbacks do not mutate or disclose.
- Player-facing copy, lore and news are Ukrainian. Workflow/task/PR text is English when practical.
- Use `«»`, visible Holocene dates such as `12026-07-16`, `міт*` with `т`, `соціяльн*` with `я`, and `ґільдія` with `ґ`.
- Keep Telegram messages compact. Never expose secrets, private ids, hidden odds or exact future rewards before commitment.

## Workflow

- `AGENTS.md` is the hard rule set. One scoped version task normally equals one fresh Codex thread and one branch/PR.
- Main implementation skill: `$kvestarnia-version-task`; use `$ukrainian-rpg-content` for substantial copy and `$kvestarnia-release-checklist` before
  handoff.
- For a named PR, verify live base/head before work. For a next version, fetch and verify `origin/main`; account for squash merges by checking
  required content/tree state.
- Inspect changed/relevant files first. Keep diffs narrow, deterministic and replay-safe. Do not add dependencies, migrations, flags or broad
  infrastructure unless the task requires them.
- Runtime changes need focused tests, then `npm run check`; final release handoff also runs `git diff --check origin/main...HEAD`.
- Implementation is complete only after commit, push and the requested `main` PR. Do not merge or deploy unless explicitly asked.

## Architecture

- Stack: TypeScript, Node.js, grammY, Prisma, Vitest, ESLint; SQLite is the current Prisma provider, while PostgreSQL remains a possible future
  migration target rather than a supported environment switch.
- `src/bot/`: Telegram adapters, callbacks, keyboards, presenters.
- `src/domain/`: pure deterministic game logic; no grammY/Telegram imports.
- `src/services/`: application orchestration.
- `src/db/`: repositories and transactions.
- `src/content/`: canonical authored content.
- `tests/`: unit/integration coverage matching source seams.
- Stored mutations use server-owned state, life identity, CAS/unique constraints and canonical receipts. Duplicate/stale callbacks must not repeat
  spend, rewards, notifications or achievements.

## Current gameplay anchors

- Core loop: create character, choose race/class/path flavor, take short quests, fight, gain XP/gold/manatky, equip and grow.
- Ordinary persistent PvE supports single/multi-enemy state, class/race/gear actions, items, flee, stored journals and replay-safe settlement.
- Stored combat surfaces that shared changes must consider: persistent PvE,
  Training Doppelganger, turn-based duels, party boss/Big Barrel rounds and the
  gated rewardless group-combat proof. Quick duels have no durable turn identity.
- Under-Korchma combat terminology: `Спуск`, `Спуск до Низу`, `Ярус I: Сутерени Корчми`, later `Зіґурат`.
- Group/party systems remain narrow opt-in slices. No generic market, profession, crafting, guild-war or Mini App direction is shipped by implication.
- Big Barrel raid chat adds no config key and follows `BIG_BARREL_BROTHER_RAID_ENABLED=true`. It authorizes only canonical same-life participants,
  keeps the newest 13 rows across recruiting/active combat, retains terminal final-roster read-only access for 13 days, and never grants rewards,
  achievements or ordinary combat-journal duplication. Kharakternyk ward surfaces use `✴️`, distinct from the Molfar `🧿 Туманний оберіг`.
  `/dev_raid_chat` is non-production only.
- `0.4.2` is the first production-capable GroupCombat consumer, but its entry
  remains default-off. Operator-required v3 rows are invisible and immutable to
  ordinary reads/mutations; only explicit inspection exposes their raw evidence.
  `0.4.3` next owns independent guild identity. Do not turn `PartyBossSession`
  into N×M state or imply guild bank/trade/war scope.

## Shipped class support

- Priest level 3+ noncombat heal/blessing uses active exact-location targets, transactional mana spend and replay-safe records. Do not rebalance it
  through adjacent class work.
- Rogue level 3+ `🗡️ Тиха кишеня` is same-location, recipient-level protected, actor-cooldown and actor-target/day scoped, with bounded gold and
  private retaliation.
- Bard Performance is a bounded location-scoped noncombat event; Shynok alone may receive its existing small house payout, and live cards explicitly
  label the next-performance wait as applying to the current location. While the current Bard's same-life performance is live at that normalized
  location, `/online`, Shynok, and the bar show its remaining reaction window and omit a duplicate start button through a read-only lookup. The frozen
  initial audience receives free non-stacking `✨ Натхнення` for 13 hybrid minutes (`+1/+2/+3/+5` percentage points to canonical player hit rolls by
  performance grade); stronger replaces, equal/weaker does not refresh, and tips never affect combat power. Audience reaction keyboards show only
  notification-time affordable tip amounts, with the transaction still rejecting stale callbacks after later spending. Active timed buffs share one
  presenter shape with bold name/duration and numeric Inspiration modifier; `/hero` groups multiple effects under one `Стани:` heading.
- Inspiration mirrors the durable `Ситий` lease lifecycle in persistent PvE, Training, turn duels and Big Barrel: wall time pauses, each committed
  actor turn pulses once after the exchange, and one generalized lease release synchronizes both statuses. Quick duels remain unchanged. A free Big
  Barrel music slot lets one living Bard commit `🎻 Заграти журливу баладу`, including as the only raid participant; the recruiting card explains that
  the action appears after combat starts. It spends the action, shares the per-Bard/per-location 93-minute music availability with performances, and
  reduces each direct boss target by `1/2/3/5` after guard/action reductions but before Ward/Protocol for 8–13 whole boss responses. Its activation
  and reduction share one action sentence; the live card owns the single active line, while stored journal pages group round-authoritative
  Inspiration, `Ситий`, Lament and cooldown snapshots under `Кулдауни та ефекти:`. Barrel-origin starting Inspiration occupies that slot instead.
  Same-period legacy solo Barrel pending state blocks Big Barrel create/join/start until claimed, including the due boundary, while a leader button
  can recover an elapsed recruiting deadline through the scheduler allowance. Permanently incompatible due parties keep a typed terminal-ineligible
  reason, release their guards, and share idempotent participant-card edit/replacement delivery between manual start and the scheduler; terminal
  replays expose refresh only. Terminal notification failures are isolated per participant and from later scheduler work, with no automatic retry
  promise once the row leaves the due queue. Lament follows the existing `BIG_BARREL_BROTHER_RAID_ENABLED` production surface; there is no
  Bard-specific rollout flag. The helper additionally requires non-production `DEV_GRANT_COMMANDS_ENABLED`.
- Bard Performance callbacks preserve the current normalized location. Quest-spawned persistent fights store and reuse their origin location.
  Adventure problem, problem-help and approach callbacks share one presence policy: `active-fight`, `combat-blocked` and `already-completed` never
  write presence, while explicit navigation, selected problem/help and newly completed non-fight results keep Quest Table movement. Quest monsters
  scale to the current level before canonical once-only remort derivation and show quest remort pressure only in the opening message.
- `Три справи на найближчий час` use a rolling 93-minute cooldown from the successful claim timestamp, not global bucket eligibility. The internal
  bucket remains only for deterministic offer selection; the archive shows canonical rounded-up minutes until the next three affairs.
- Outside combat, ordinary `/duel`, pending duel deep links and pending callbacks emit only a neutral user-activity heartbeat until a fresh final
  transition applies the single authoritative Fighting Corner payload. A participant-wide blocked final Quick acceptance deliberately emits no
  presence write. Under another combat lock routes stop without duel mutation or heartbeat; only the participant's exact current active turn-duel
  token reaches its canonical handler through the lock, including exact action/view/refresh while Friday Barrel is pending. If a canonical
  action/Refresh is classified active while the independent active lookup already returns resolved/null, its source still reaches terminal repair and
  cannot be replaced by another combat or Barrel card. A resolved historical token never inherits the exact-current exemption: stable newer combat
  blocks rematch/rematch-risk before service, while a temporary actor lease makes resource synchronization, recovery suppression and targeted
  challenge creation atomic against a turn-duel, persistent, Training or party-boss lease acquired after prechecks. Busy results write no Character,
  challenge, quest/activity, presence or historical-card/reference state. Rematch presence is deferred until the final Friday decision and atomic
  fence; late pending Friday writes no heartbeat or edit, while an allowed outside-combat rematch writes exactly one neutral heartbeat. Quick Details
  stays read-only; final Quick acceptance separately claims both participant leases atomically. Final turn-duel acceptance keeps the ordered
  transition, intro/advice and new combat card. Each participant has one global CAS-owned canonical private card across actions, remote notifications,
  timeout, combat-lock and Rogue delivery: replacements are inert until the winner revalidates and activates them, retryable existing edits retain the
  old reference, ambiguous active or terminal activation failures retain the claimed candidate for same-message retry, and only definitive
  missing/uneditable activation releases it. Active and resolved deliveries reload the stored session reference, terminal participant reopens share
  the repair path, and safe CAS losers converge on the winner reference. Per-participant serialized authoritative reloads make active rendering
  monotonic and terminal state final; canonical callback sources remain armed until their rewrite succeeds, stale owner refreshes and repeated deep
  links reuse the canonical card, concurrent losers stay inert, and group links remain spectator-safe. The voluntary-duel flavor uses `Форма 13-Д`;
  `Форма 13-А` remains the Bureaucramancer combat/raid form.
- Historical rematch resource warnings, level gates and pair limits now authorize through that same temporary actor lease before returning; no-combat
  outcomes stay unchanged, while a late newer combat wins as busy before heartbeat or source editing. The one deferred neutral heartbeat after an
  allowed commit is best-effort: presence failure is logged, but callback acknowledgement and owner/share/target delivery continue.
- Bureaucramancer `Протокол 13-З`, Kharakternyk ward signs and Warrior `🛡️ На мене!` are narrow Big Barrel mechanics, not generic engines.
- Varenyk-mancer level 3+ `🍽️ Нагодувати` works on self or an active exact-normalized-location recipient from existing locations. Attunement-aware
  INT/CHA/level determine stat rank; after canonical passive mana settlement, the highest affordable rank uses costs `8/12/16/20/23`. Public
  open/preview capture one `now`; the successful preview returns actor/target resources, natural/effective maxima, stats, blessing, exact attuned
  rows, rank and cost from the transaction that persists both planning snapshots, so regeneration occurs once and preliminary interleavings cannot mix
  views across inclusive `readyAt`.
- A fresh feed applies capped immediate `2 + rank HP` with no immediate mana refund. One recipient `CharacterCooldown` owns the current
  activation/receipt; actor-owned pair rows hold each caster's 93-minute repeat wait for that recipient. `😋 Ситий` starts with 13 minutes and does
  not stack, but a permitted same-caster refresh or another caster's fresh feed replaces it with a new activation/rank/timer after settling the old
  payload. The server-owned preview binds the exact applied rank/cost, effective stats, attuned row/slot/version identity, Shynok snapshot,
  target/lives, expiry and observed target activation; concurrent old previews yield one winner. Confirmation prechecks activation/pair state before
  settlement and rolls back all preparatory settlement on plan, affordability or late-CAS loss. Pair-row `availableAt` is authoritative when
  explicitly shortened. Current-life duplicates replay only the durable current receipt before mutable gates and display the matching current-life
  pair wait, or immediate availability after expiry/deletion.
- Outside combat, complete eligible minutes lazily grant the committed internal rank's capped HP/mana portion (`1/1`, `2/1`, `2/2`, `3/2`, `3/3` for
  ranks 1-5); player copy shows the exact values but hides rank. The cursor advances while full, retires the terminal fraction at exact expiry and
  excludes only actual combat-lease time. Exact solo/duel/Big Barrel lease starts and frozen remainders stay combat-owned until guarded release; Hero
  reads cannot consume them. Freeze carries the duration from durable cursor to expiry and preserves sub-minute outside progress separately, so
  entering combat before the first complete outside minute keeps all 13 turns. Wall-clock waiting during a stored combat lease consumes nothing; every
  fresh supported surviving pulse uses the same rank-scaled portion and consumes exactly one complete frozen minute. Release preserves the exact
  frozen duration invariant, rebasing cursor and expiry together without adding the outside remainder twice. Missing/malformed solo or duel state
  reconstructs only the complete matching durable budget active at lease start, never combat-only resource/pulse data; zero duration snaps terminal.
  Early malformed cleanup uses its observed clock, concurrent orphan losers are benign only after the exact lease is claimed/released, and duplicate
  cleanup cannot consume later OOC time or alter a newer activation. Turn-duel acceptance derives read-only warning/confirmation values from one
  inclusive-`readyAt` equipment set; only the winning leased repository transaction atomically persists passive/Sated resources and anchors, rolls
  initiative and owns the final maxima/stats/sets/grants snapshot. Direct solo, pending-passage first/restart Fight and Training share one atomic
  freeze/pre-lease Character CAS; later combat resources stay state-local. Big Barrel keeps the same pre-lease boundary. Durable solo/Training states
  pulse after the hostile response, turn duels after both queued actions, and Big Barrel after retaliation; `0 HP` is never revived and quick duels do
  not pulse.
- Persistent PvE keeps the canonical restricted final response from an enemy alive at attack/class-skill exchange start even when that exchange
  defeats it. Mutual `0 HP` against the final enemy is a hero win; hero `0 HP` with another enemy alive is a loss. The active combat lease, not
  `currentAdventureId` or `currentRaidId`, owns the Varenyk busy block: Cellar, Hunt, quest-table, passage and stale adventure/raid presence markers
  remain feedable when no authoritative lease exists; active Big Barrel combat has participant leases and remains blocked. Hero/Varenyk public lazy
  settlement retries expected guarded CAS losers boundedly, then reloads a version-validated Character/status/self-pair snapshot or leaves recovery
  pending without a generic error. Hero always reports the viewer→viewer current-life wait independently of the current status caster; optimistic and
  strong fallback reads keep that row coherent with Character/status. Missing status still validates Hero's preliminary resource/anchor/life
  fingerprint, so remort cannot reuse an old-life card. Three unstable optimistic pairs fall back to one serializable read-only snapshot. Concurrent
  settlement, remort or fresh activation therefore cannot mix resources, cursor, pair wait or activation identity. Unexpected DB failures remain
  errors, and recovery/cursor/notification effects stay exact-once. Hero renders authoritative post-settlement resources and the ordinary full-HP
  notice once in the same card; Sated recovery is a separate exact-once message, never embedded in Hero. Absent/historical paths stay bounded and
  avoid equipment/drink/planning fan-out. Fresh Sated preview/results use semantic paragraph groups, bold names/values, natural `Одразу до …` / `Далі
  …` effect sentences without label colons, the approved `щохвилини поза боєм або кожен хід в бою (це забирає хвилину дії)` explanation, the shared
  `💫` mana-spent line and a character-card hint; the target list keeps each recipient's status/effect/wait on one compact line and refresh buttons
  say `оновити стан`. All player surfaces hide internal rank. Combat recovery still settles after the completed hostile response/exchange, and zero
  immediate recovery means full HP rather than full mana. Hero keeps the full outside-combat explanation, while one shared combat-effect formatter
  renders remaining turns and exact hidden-rank values on one compact line under journal effects. Fight/Training entries and turn-duel/Big Barrel
  rounds persist their own post-turn Sated snapshot; Training effects stay under the shared heading, same-named raid participants keep distinct rows,
  and resolved public duel journals retain `satedRecovery` plus `varenykSatedAfter`. Recovery lines are nonzero-only, follow the hostile response and
  render plain names/values as `😋 <name>: <i>ситість</i> відновлює …`. Shynok drink durations/modifiers are bold too.
- Recipient remort clears old-life state and invalidates old pair waits; actor remort clears that actor's waits without cancelling another recipient's
  activation. Local `/dev_reset_varenyk_sated` clears only the caller's recipient status and actor-owned pair waits, never another recipient's status.
  Like other dev grants, it is unavailable and non-mutating in production.

- Rewardless Sated achievements cover the first fresh self-feed and first fresh other-feed. Replays and recovery pulses do not unlock them.
- The full outside-combat Sated status keeps its duration and recovery explanation on one compact em-dash line.

## Resource, location and identity rules

- Use canonical character resource reads/mutations and effective maxima; settle passive regeneration before mana affordability/spend where required.
- Equipment effects count only after attunement is complete. Freeze effective snapshots where the action contract requires replay stability.
- Presence uses canonical normalized actionable locations and the existing activity window. Another player must be both active and at the exact
  normalized location when the task says “nearby”.
- Combat leases and incompatible active flows fail closed. A defeated character is not revived by support pulses.
- New cooldown/session/period state must define remort/reset behavior. CharacterCooldown rows are removed with the recipient's character-life reset
  path unless a task explicitly makes history eternal.

## Product guardrails

- No pay-to-win. Economy changes need explicit balance scope.
- New player-visible actions require an achievement decision; achievements are rewardless and ordinary news/lore should not spoil their hooks.
- New quest-visible state must update `🗺️ Квести`. Location/lore concepts must review `📖 Перекази` and `src/content/loreBoard.ts`.
- Long keyboard candidate lists need pagination/filter/search; never silently make eligible rows unreachable.
- Every visible timer/wait blocker should show remaining time derived from canonical timestamps.
- Distinct concepts shown together should use distinct icons.
- Every numbered package release has a matching current `news.md` entry. Hidden,
  rewardless or feature-flagged runtime changes the wording, not this requirement.
- Current release news ends with a short standalone in-world paragraph. `Ще не відчинено:` is only for a genuine unavailable gameplay boundary, never
  manual QA, CI, deploy, rollout, or production-enablement status.
- The newest news entry must not repeat a complete sentence verbatim from its
  own body or any historical entry; rewrite only the current duplicate.

## Key docs

- `docs/tasks/0.4.2-left-passage-party-attack.md` — current repository release
  contract; production enablement, deployment and manual QA remain unproven.
- `docs/tasks/0.4.3-guild-foundation.md` — next planned version contract.
- `docs/tasks/0.3.17-callback-read-path-collapse.md` — previous release contract
  and callback SQL-budget evidence.
- `docs/tasks/0.3.16-closed-alpha-closeout.md` — shipped lifecycle closeout and base-runtime evidence.
- `docs/operations/release-state-ledger.md` — repository/target availability truth; unknown production evidence stays deferred.
- `docs/architecture/party-combat-evolution-plan.md` and `docs/design/guilds-and-party-progression.md` — canonical 0.4.x cutline.
- `docs/design/game-design.md`, `docs/design/player-identity-abilities.md`, `docs/design/noncombat-techniques.md` — gameplay/design anchors.
- `docs/design/achievements-catalog.md` — achievement catalog.
- `docs/content/kvestarnia-lore-current-canon.md`, `src/content/loreBoard.ts` — current lore/reference surfaces.
- `docs/architecture/technical-plan.md`, `docs/architecture/security-and-fair-play.md` — architecture and anti-abuse.
- `docs/operations/developer-setup.md`, `docs/operations/playtesting.md`, `docs/operations/local-bot-runtime.md` — setup, smoke and isolated bot
  workflow.
- `docs/tasks/README.md`, `docs/ai/codex-workflow.md`, `docs/ai/CODEX_PROMPT_POLICY.md` — task/PR/prompt workflow.
- `CHANGELOG.md` and `news.md` — technical and spoiler-light player release surfaces.

## Local runtime

- `run-local-bot.cmd` uses an external isolated snapshot, separate dependencies/Prisma client/SQLite database.
- Runtime ownership compares Windows source paths case-insensitively, so `D:\...` and `d:\...` cannot create separate managers for the same snapshot.
- Do not stop or refresh that bot during ordinary implementation. At a manual checkpoint, tell the user to run `refresh-local-bot.cmd`.
- Build/typecheck/tests run in the main checkout. Never kill all Node processes.
