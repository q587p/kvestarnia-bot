# Queued — Threat Streak Multi-Enemy Fights

Queued combat-variety candidate after `0.1.15 — Combat Lock and Battle Flow Polish`. Final version/order may still change before implementation.

## Goal

Make ordinary monster fights react to player streaks: if a player keeps winning, Kvestarnia's gossip gets ahead of them and the next eligible fight brings extra enemies.

This task should replace the old three-win monster-rest UX for eligible ordinary fights. After a streak, monsters should not block the next start with copy like `монстри взяли коротку перерву й дуже пишаються профспілковою дисципліною`; instead, the next fight starts and one more monster shows up because the hero's reputation arrived first.

## Scope

- Track or derive a per-character ordinary-fight threat tier from recent eligible solo combat outcomes.
- Start eligible ordinary fights at one enemy while the threat tier is base.
- After `3` consecutive eligible wins at one enemy, the next eligible fight starts with `2` enemies.
- At `2+` enemies, every `2` consecutive eligible wins at the current enemy count increase the next eligible fight by one more enemy.
- A defeat resets the current win counter and decreases the enemy count by exactly one for future eligible fights, never below one enemy. Example: if the player reached `5` enemies, they need `4` defeats over time to return to one enemy.
- Flee/expiry/stale non-terminal paths should reset the current win counter without granting escalation; whether they de-escalate like defeats is a balance decision to settle during implementation.
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
- Add `13` authored Ukrainian escalation lines and choose one deterministically/pseudo-randomly per escalated fight card, replay-safe with the combat session. Tone: fame, curiosity, bad decisions and tavern gossip brought more monsters to watch or participate.
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
- No temporary post-streak fight-start block for eligible ordinary fights; the point of this task is to replace monster rest with threat escalation.
- Avoid migrations if practical; prefer deriving streaks from existing `solo_combat_sessions` and storing only the minimum needed for replay/debug.

## Acceptance Criteria

- Three consecutive eligible one-enemy wins make the next eligible ordinary fight start with two enemies.
- At two or more enemies, two consecutive eligible wins at the current enemy count raise the next eligible ordinary fight by one enemy.
- A defeat resets the current win counter and lowers the future enemy count by one, with a minimum of one enemy. From five enemies, four defeats are required to return to one enemy.
- Eligible ordinary fights no longer show the old monster-rest block after three wins; they remain playable and escalate instead.
- Starter fights and `/spar` never affect or consume threat tier.
- Korchmar/problem fights and Yeger fights both use the same threat-tier behavior.
- Fight intro, turn state, terminal result and replay rendering can show multiple enemies safely.
- Fight intro rendering has exactly `13` escalation lines available and replays the stored line for old cards.
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
- Fight service tests for `3` one-enemy wins escalating to two enemies, repeat `2`-win escalation at higher enemy counts, one-step defeat de-escalation, starter/doppelganger exclusions and Korchmar/Yeger inclusion.
- Reward tests for `0.75x` per-enemy scaling and replay idempotency.
- Presenter tests for multi-enemy intro, the `13` escalation-line pool, stored escalation-line replay, HP rows, enemy action lines and HTML safety.
- Dev command tests for `/dev_harder` enabled/disabled/no-character paths.
- Callback/session regression tests for stale turns and active fight restore.

## Manual Telegram QA

1. In local/dev mode, create a level 3+ character.
2. Win three eligible one-enemy ordinary fights; confirm the next eligible fight starts with two enemies instead of a monster-rest block.
3. Resolve one turn and confirm each living enemy produces its own action line.
4. Win the fight and confirm reward is not a full duplicate payout per enemy.
5. Win two more eligible fights at two enemies and confirm the next eligible fight starts with three enemies.
6. Force or play through one defeat at three enemies and confirm the next eligible fight drops to two enemies and the current win counter resets.
7. Use `/dev_harder` and start the next Korchmar/problem fight; confirm more than one enemy appears and one of the stored escalation lines is shown.
8. Start a Yeger fight and confirm the same threat behavior applies.
9. Start `/spar` and confirm the doppelganger remains single-enemy and does not affect threat.

## Escalation Line Seeds

Use these as the initial `13`-line pool or close variants during implementation:

1. `Слава далеко пішла. На шум прийшов ще один охочий подивитися, чи правда ви такі небезпечні.`
2. `Монстри почули, що тут роздають легенди, і стали в чергу без талончиків.`
3. `Хтось у Низу сказав «та він один». Інші сприйняли це як запрошення.`
4. `Ваше імʼя вже шепочуть у щілинах. Зі щілин вилізло підкріплення.`
5. `Перший монстр привів знайомого. Каже, це не допомога, а незалежний нагляд.`
6. `Корчма записала серію перемог. Низ образився й додав свідків.`
7. `До бою приєднався ще один охочий. Дуже випадково. Дуже з зубами.`
8. `Репутація пішла попереду вас і налякала монстрів настільки, що вони зібралися гуртом.`
9. `У Низу вирішили, що одиночні дуелі — це вже занадто спортивно.`
10. `Ще один монстр прийшов просто подивитися. Потім згадав, що має лапи.`
11. `Після ваших перемог монстри провели короткі збори й обрали варіант «нас більше».`
12. `Старий суперник приніс нового. Каже, тепер це навчальний семінар із виживання.`
13. `Чутки про вас розрослися швидше за плісняву під бочками. На чутки прийшли учасники.`

## Release Surfaces

- Update `CHANGELOG.md` and `news.md` if shipped as a numbered release.
- Update `docs/GAME_DESIGN.md`, `docs/PLAYTESTING.md`, `docs/ai/context.md`.
- Mention `/dev_harder` in local/dev command documentation.
