# Codex prompt - Big Barrel Brother balance review

```text
Use $balance-review.

Review the implemented Big Barrel Brother raid against:
docs/history/early-raid/big-barrel-brother-balance.md
docs/tasks/<actual-version>-big-barrel-brother-group-raid.md

Mode:
- inspect the implementation diff and direct combat/reward dependencies
- run the deterministic group-raid simulator with levels 8/10/13, party sizes 1/2/3/4/5/8, all classes, baseline/solid/strong gear and eligible no-buff/prepared policies
- do not redesign architecture or add content
- do not tune rewards to hide an overtuned/undertuned fight

Report:
- win rate, successful mean/median rounds, knockout rate and cap-loss rate per aggregate cell
- class/race outliers in percentage points
- effect of equipment and eligible buffs
- breakbar success/failure and watcher-clear rates
- unavoidable AoE contribution to wipes
- reward XP/gold/item expected value per successful participant and total group faucet
- whether spotlight recipient fairness can be monopolized

Compare every result to the documented acceptance bands.
Propose the smallest ordered constant changes only:
1. HP bands
2. target count/heavy multiplier
3. oversight thresholds/contributions
4. watcher pressure
5. phase-three vulnerability/damage
6. rewards after combat is stable

Output:
- blockers
- measured table
- accepted deviations with reasons
- exact proposed constant changes
- tests/simulations run
- residual risks

No tutorial. Do not claim production balance from a paper model alone.
```
