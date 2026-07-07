# Combat Balance Analytics

`0.1.21` adds opt-in PvE combat analytics for class/remort balance review. The collector is disabled unless `COMBAT_BALANCE_ANALYTICS_ENABLED` is set to a truthy value.

## What Is Stored

Each completed PvE solo/training combat can write one `combat_balance_battles` row keyed by `combat_id`, plus one `combat_balance_ability_usages` row for each distinct ability/origin pair used. The tables are created by `20260621100000_add_combat_balance_analytics`; collection remains opt-in and disabled by default.

Battle rows store:

- combat source: `regular_mob`, `adventure`, `yeger`, `training` or `other`;
- outcome: `win`, `loss`, `fled`, `timeout`, `cancelled` or `technical_error`;
- start/finish time, balance version, engine version and analytics schema version;
- pseudonymized player analysis key plus internal character id;
- class key, level, remort count, starting HP/mana, ending HP and stat/equipment snapshots;
- monster template/type/level/difficulty/max HP/end HP;
- round/action counts, separate manual/timeout action counts and compact totals for damage, healing, crits and misses.

Ability rows store `action_origin` (`manual`, `timeout-auto-attack` or `timeout-skip`) plus use/success/hit/crit/miss counts, total damage/healing and resource spend per ability key. Shield/prevented damage and durable write-error counters are intentionally omitted from analytics schema v1 until there is a deterministic source of truth.

## Privacy

Reports and analytics tables do not store Telegram user ids, usernames, display names, chat ids or message ids. `player_analysis_key` is a SHA-256 derived key from the internal character id.

## Runtime Contract

- Combat start freezes an analytics snapshot inside `CombatState.analytics`.
- Each successful committed turn updates a compact accumulator in combat state.
- Timeout auto-actions are intentional committed actions. The collector stores them separately from manual choices so class/ability reports can default to player-selected usage while all-action totals remain available.
- Terminal recording is best-effort and idempotent through the `combat_id` unique key.
- Analytics failures are logged and must never block combat completion, resource persistence or rewards.
- Training doppelganger terminal timeout wins/losses claim the same XP reward and recovery cooldown as manual terminal actions; `expired` and `fled` remain non-rewarding.
- Old or already-running combats without an analytics snapshot are left readable but skipped by the collector instead of being backfilled with guessed totals.

## Report Command

Default report: levels 10-15, grouped by class/level/remort. Rows explicitly flagged as test/admin by the service constructor are hidden unless `--include-test` is passed; production wiring currently records rows as normal player rows.

```bash
npm run report:combat-balance -- --view class
```

Useful options:

- `--view class|mob|ability|data-quality`
- `--format table|json|csv`
- `--levels 10-15`
- `--remort 0`
- `--class class.warrior`
- `--source regular_mob`
- `--balance-version combat-balance-0.1.21`
- `--mob monster.some-id`
- `--ability-actions manual|all` for ability reports; default is `manual`
- `--from 2026-06-21`
- `--to 2026-06-22`
- `--min-sample 30`
- `--include-test`

Metrics include battle counts, win/loss/fled/timeout counts, win rate with Wilson interval, average and median rounds, median remaining HP ratio on wins, damage totals and ability usage/win-rate slices.

## Scope Guard

This analytics slice does not tune classes, rewards, loot, monster loadouts, race/signature/title abilities, item actions, parties or multi-enemy runtime.
