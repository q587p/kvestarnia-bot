# Combat Balance Analytics

`0.1.21` adds opt-in PvE combat analytics for class/remort balance review. The collector is disabled unless `COMBAT_BALANCE_ANALYTICS_ENABLED` is set to a truthy value.

## What Is Stored

Each completed PvE solo/training combat can write one `combat_balance_battles` row keyed by `combat_id`, plus one `combat_balance_ability_usages` row for each distinct player ability used.

Battle rows store:

- combat source: `regular_mob`, `adventure`, `yeger`, `training` or `other`;
- outcome: `win`, `loss`, `fled`, `timeout`, `cancelled` or `technical_error`;
- start/finish time, balance version, engine version and analytics schema version;
- pseudonymized player analysis key plus internal character id;
- class key, level, remort count, starting HP/mana, ending HP and stat/equipment snapshots;
- monster template/type/level/difficulty/max HP/end HP;
- round/action counts and compact totals for damage, healing, shield/prevention, crits and misses.

Ability rows store use/success/hit/crit/miss counts, total damage/healing/shield/prevention and resource spend per ability key.

## Privacy

Reports and analytics tables do not store Telegram user ids, usernames, display names, chat ids or message ids. `player_analysis_key` is a SHA-256 derived key from the internal character id.

## Runtime Contract

- Combat start freezes an analytics snapshot inside `CombatState.analytics`.
- Each successful committed turn updates a compact accumulator in combat state.
- Terminal recording is best-effort and idempotent through the `combat_id` unique key.
- Analytics failures are logged and must never block combat completion, resource persistence or rewards.
- Old or already-running combats without an analytics snapshot are left readable but skipped by the collector instead of being backfilled with guessed totals.

## Report Command

Default report: levels 10-15, non-test rows only, grouped by class/level/remort.

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
- `--from 2026-06-21`
- `--to 2026-06-22`
- `--min-sample 30`
- `--include-test`

Metrics include battle counts, win/loss/fled/timeout counts, win rate with Wilson interval, average and median rounds, median remaining HP ratio on wins, damage totals and ability usage/win-rate slices.

## Scope Guard

This analytics slice does not tune classes, rewards, loot, monster loadouts, race/signature/title abilities, item actions, parties or multi-enemy runtime.
