# Shynok Food Buffs deep review

```text
Use $kvestarnia-second-codex-readonly.

READ ONLY report only. Do not edit files.

PR: #<PR_NUMBER>
Base: main
Review mode: deep
Task doc: docs/tasks/0.4.7-shynok-food-buffs-mvp.md

Extra focus:
- purchase/replace exact-once and stale current-life/content/price callbacks;
- one-active-food invariant, food-owned storage and no drink-row eviction;
- drink/Sated/Inspiration/Priest/greeting interaction matrix;
- HP/mana maximum/current-value expiry, timeout, flee, restart and remort edges;
- truthful effect consumption across solo, duel, PartyBoss and GroupCombat;
- no-food simulations, gold-sink tuning, migration/restore and kill switch.

Review changed files first. Report blockers, important findings, missing tests and
3–7 highest-risk manual Telegram checks. No implementation or tutorial.
```
