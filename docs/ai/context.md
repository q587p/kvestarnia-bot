# Kvestarnia Codex Context — keep under 250 lines

## Identity and language

- Product: Ukrainian-first humorous Telegram RPG `Квестарня`; technical slug/repo/package prefix `kvestarnia`; bot target `@kvestarnia_bot`.
- Current version: `0.3.12` — Varenyk-mancer `🍽️ Нагодувати` / `😋 Ситий` support.
- Player-facing copy, lore and news are Ukrainian. Workflow/task/PR text is English when practical.
- Use `«»`, visible Holocene dates such as `12026-07-14`, `міт*` with `т`, `соціяльн*` with `я`, and `ґільдія` with `ґ`.
- Keep Telegram messages compact. Never expose secrets, private ids, hidden odds or exact future rewards before commitment.

## Workflow

- `AGENTS.md` is the hard rule set. One scoped version task normally equals one fresh Codex thread and one branch/PR.
- Main implementation skill: `$kvestarnia-version-task`; use `$ukrainian-rpg-content` for substantial copy and `$kvestarnia-release-checklist` before handoff.
- For a named PR, verify live base/head before work. For a next version, fetch and verify `origin/main`; account for squash merges by checking required content/tree state.
- Inspect changed/relevant files first. Keep diffs narrow, deterministic and replay-safe. Do not add dependencies, migrations, flags or broad infrastructure unless the task requires them.
- Runtime changes need focused tests, then `npm run check`; final release handoff also runs `git diff --check origin/main...HEAD`.
- Implementation is complete only after commit, push and the requested `main` PR. Do not merge or deploy unless explicitly asked.

## Architecture

- Stack: TypeScript, Node.js, grammY, Prisma, Vitest, ESLint; SQLite/PostgreSQL by environment.
- `src/bot/`: Telegram adapters, callbacks, keyboards, presenters.
- `src/domain/`: pure deterministic game logic; no grammY/Telegram imports.
- `src/services/`: application orchestration.
- `src/db/`: repositories and transactions.
- `src/content/`: canonical authored content.
- `tests/`: unit/integration coverage matching source seams.
- Stored mutations use server-owned state, life identity, CAS/unique constraints and canonical receipts. Duplicate/stale callbacks must not repeat spend, rewards, notifications or achievements.

## Current gameplay anchors

- Core loop: create character, choose race/class/path flavor, take short quests, fight, gain XP/gold/manatky, equip and grow.
- Ordinary persistent PvE supports single/multi-enemy state, class/race/gear actions, items, flee, stored journals and replay-safe settlement.
- Stored combat surfaces that shared changes must consider: persistent PvE, Training Doppelganger, turn-based duels and party boss/Big Barrel rounds. Quick duels have no durable turn identity.
- Under-Korchma combat terminology: `Спуск`, `Спуск до Низу`, `Ярус I: Сутерени Корчми`, later `Зіґурат`.
- Group/party systems remain narrow opt-in slices. No generic market, profession, crafting, guild-war or Mini App direction is shipped by implication.

## Shipped class support

- Priest level 3+ noncombat heal/blessing uses active exact-location targets, transactional mana spend and replay-safe records. Do not rebalance it through adjacent class work.
- Rogue level 3+ `🗡️ Тиха кишеня` is same-location, recipient-level protected, actor-cooldown and actor-target/day scoped, with bounded gold and private retaliation.
- Bard Performance is a bounded location-scoped noncombat event; Shynok alone may receive its existing small house payout.
- Bureaucramancer `Протокол 13-З`, Kharakternyk ward signs and Warrior `🛡️ На мене!` are narrow Big Barrel mechanics, not generic engines.
- Varenyk-mancer level 3+ `🍽️ Нагодувати` works on self or an active exact-normalized-location recipient from existing locations. Attunement-aware INT/CHA/level determine stat rank; after canonical passive mana settlement, the highest affordable rank uses costs `8/12/16/20/23`.
- A fresh feed applies capped immediate `2 + rank HP` and `1 mana`, then one recipient-global `CharacterCooldown`: `😋 Ситий` lasts 13 minutes and the recipient wait lasts 93 minutes. The server-owned preview binds the exact applied rank/cost, effective stats, attuned row/slot/version identity, Shynok snapshot, target/lives and expiry; confirmation never silently changes that plan. Current-life duplicate confirms replay the receipt before mutable gates, and payload `availableAt` remains authoritative if only the row is shortened.
- Outside combat, complete eligible minutes lazily grant capped `+1 HP/+1 mana`; the cursor advances while full, retires the terminal fraction at exact expiry and excludes only actual combat-lease time. Hero reads under a lease preserve its frozen remainder. Stored combat owns that original remainder until guarded solo/turn-duel/Big Barrel release, including malformed/orphan and party-remort cleanup; duplicate release cannot consume later OOC time or alter a newer activation. Duel acceptance settles natural effective maxima (base + level + attuned equipment) without rewriting max columns, then rebuilds the ratio-balanced snapshot. Durable combat states pulse after the owner's committed action/spend and before the following hostile response; quick duels do not pulse.
- Persistent PvE keeps the canonical restricted final response from an enemy alive at attack/class-skill exchange start even when that exchange defeats it. Mutual `0 HP` against the final enemy is a hero win; hero `0 HP` with another enemy alive is a loss. Hero renders authoritative post-settlement resources and the ordinary full-HP notice once in the same card, then uses an indexed fast path for finished historical rows. Expired receipt replay shows only the true wait or renewed availability.
- Active Sated never stacks, refreshes, extends or changes rank, even if its wait is manually cleared. A new activation requires both inactive status and a genuinely ended wait. Recipient remort clears old-life state; actor remort does not cancel another recipient's activation.
- Local `/dev_reset_varenyk_sated` clears only the caller's Sated status/wait. Like other dev grants, it is unavailable and non-mutating in production.

## Resource, location and identity rules

- Use canonical character resource reads/mutations and effective maxima; settle passive regeneration before mana affordability/spend where required.
- Equipment effects count only after attunement is complete. Freeze effective snapshots where the action contract requires replay stability.
- Presence uses canonical normalized actionable locations and the existing activity window. Another player must be both active and at the exact normalized location when the task says “nearby”.
- Combat leases and incompatible active flows fail closed. A defeated character is not revived by support pulses.
- New cooldown/session/period state must define remort/reset behavior. CharacterCooldown rows are removed with the recipient's character-life reset path unless a task explicitly makes history eternal.

## Product guardrails

- No pay-to-win. Economy changes need explicit balance scope.
- New player-visible actions require an achievement decision; achievements are rewardless and ordinary news/lore should not spoil their hooks.
- New quest-visible state must update `🗺️ Квести`. Location/lore concepts must review `📖 Перекази` and `src/content/loreBoard.ts`.
- Long keyboard candidate lists need pagination/filter/search; never silently make eligible rows unreachable.
- Every visible timer/wait blocker should show remaining time derived from canonical timestamps.
- Distinct concepts shown together should use distinct icons.

## Key docs

- `docs/tasks/0.3.12-varenyk-mancer-sated-support.md` — active version contract and pending manual QA.
- `docs/qa/varenyk-mancer-sated-support-qa.md` — compact Telegram checklist; no fabricated results.
- `docs/design/game-design.md`, `docs/design/player-identity-abilities.md`, `docs/design/noncombat-techniques.md` — gameplay/design anchors.
- `docs/design/achievements-catalog.md` — achievement catalog.
- `docs/content/kvestarnia-lore-current-canon.md`, `src/content/loreBoard.ts` — current lore/reference surfaces.
- `docs/architecture/technical-plan.md`, `docs/architecture/security-and-fair-play.md` — architecture and anti-abuse.
- `docs/operations/developer-setup.md`, `docs/operations/playtesting.md`, `docs/operations/local-bot-runtime.md` — setup, smoke and isolated bot workflow.
- `docs/tasks/README.md`, `docs/ai/codex-workflow.md`, `docs/ai/CODEX_PROMPT_POLICY.md` — task/PR/prompt workflow.
- `CHANGELOG.md` and `news.md` — technical and spoiler-light player release surfaces.

## Local runtime

- `run-local-bot.cmd` uses an external isolated snapshot, separate dependencies/Prisma client/SQLite database.
- Do not stop or refresh that bot during ordinary implementation. At a manual checkpoint, tell the user to run `refresh-local-bot.cmd`.
- Build/typecheck/tests run in the main checkout. Never kill all Node processes.
