# Queued — Threat Streak Multi-Enemy Fights

Queued combat-variety candidate after `0.1.15 — Combat Lock and Battle Flow Polish`. Final version/order may still change before implementation.

## Goal

Make ordinary monster fights react to player streaks: if a player keeps winning, Kvestarnia's gossip gets ahead of them and the next eligible fight brings extra enemies.

## Scope

- Track or derive a per-character ordinary-fight threat tier from recent eligible solo combat outcomes.
- If the player wins `5+` eligible monster fights in a row at the current tier, increase the next eligible fight by one enemy.
- If the player loses `3` eligible multi-enemy fights in a row at the current tier, decrease the next eligible fight by one enemy, but never below one enemy.
- Exclude:
  - training doppelganger fights;
  - starter/newbie fights;
  - any flow that is not backed by the ordinary persistent solo combat path.
- Include:
  - Korchmar/problem fights;
  - Yeger fights;
  - future ordinary monster-fight entry points that reuse the same persistent solo combat path.
- Add `/dev_harder` as a non-production QA command that manually raises the current player's threat tier so their next eligible fight is harder.
- Show the multi-enemy setup in fight intro/presenter copy:
  - list two or more monsters when threat tier is above one;
  - explain in Ukrainian tavern style that the hero's reputation arrived first and brought witnesses with teeth.
- During each enemy phase, each living enemy attacks or uses an ability, producing separate enemy action lines.
- Keep rewards conservative:
  - each enemy contributes about `0.75x` of its normal XP/gold/drop opportunity;
  - reward replay remains idempotent and stored with the completed combat session;
  - do not grant full independent rewards per enemy.

## Non-goals

- No party combat or group raids.
- No PvP or duel runtime changes.
- No doppelganger changes.
- No starter fight changes.
- No broad combat rewrite beyond the minimum multi-enemy shape.
- No new reward economy faucet.
- Avoid migrations if practical; prefer deriving streaks from existing `solo_combat_sessions` and storing only the minimum needed for replay/debug.

## Acceptance Criteria

- Five consecutive eligible wins at the current threat tier make the next eligible ordinary fight start with one additional enemy.
- Repeating the five-win streak at a higher tier can raise the enemy count again.
- Three consecutive eligible losses in multi-enemy fights lower the tier by one for the next eligible fight, with a minimum of one enemy.
- Starter fights and `/spar` never affect or consume threat tier.
- Korchmar/problem fights and Yeger fights both use the same threat-tier behavior.
- Fight intro, turn state, terminal result and replay rendering can show multiple enemies safely.
- Each living enemy gets its own attack/ability resolution line per enemy phase.
- Multi-enemy rewards are idempotent and scaled around `0.75x` per enemy contribution.
- `/dev_harder` is local/dev-only, visible in dev help, and raises the current player's next eligible threat tier without granting XP/gold/items.
- Stale callbacks, active-session restore, terminal replay, flee/loss/expiry and no-character gates remain safe.

## Relevant Files / Search Terms

- `src/domain/combat/`
- `src/services/fightService.ts`
- `src/bot/presenters/fightPresenter.ts`
- `src/bot/keyboards/fightKeyboard.ts`
- `src/bot/commands/devResetCommand.ts`
- `src/services/yegerQuestService.ts`
- `solo_combat_sessions`
- `PersistentFightStartOptions`
- `dev_harder`

## Focused Tests

- Domain combat tests for multiple enemies, per-enemy turns, defeat/win/flee/loss states and serializable state restore.
- Fight service tests for `5+` win escalation, repeat escalation, `3` loss de-escalation, starter/doppelganger exclusions and Korchmar/Yeger inclusion.
- Reward tests for `0.75x` per-enemy scaling and replay idempotency.
- Presenter tests for multi-enemy intro, HP rows, enemy action lines and HTML safety.
- Dev command tests for `/dev_harder` enabled/disabled/no-character paths.
- Callback/session regression tests for stale turns and active fight restore.

## Manual Telegram QA

1. In local/dev mode, create a level 3+ character.
2. Use `/dev_harder` and start the next Korchmar/problem fight; confirm more than one enemy appears.
3. Resolve one turn and confirm each living enemy produces its own action line.
4. Win the fight and confirm reward is not a full duplicate payout per enemy.
5. Start a Yeger fight and confirm the same threat behavior applies.
6. Start `/spar` and confirm the doppelganger remains single-enemy and does not affect threat.
7. Force or play through three losses in a multi-enemy setup and confirm the next eligible fight has one fewer enemy.

## Release Surfaces

- Update `CHANGELOG.md` and `news.md` if shipped as a numbered release.
- Update `docs/GAME_DESIGN.md`, `docs/PLAYTESTING.md`, `docs/ai/context.md`.
- Mention `/dev_harder` in local/dev command documentation.
