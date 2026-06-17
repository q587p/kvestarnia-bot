# Problem Quest Chain References

Created: 12026-06-17

## Runtime surface

`0.1.6` extends the narrow persistent fight wrapper into a Korhmar/Shynok chain:

```text
13 -> 23 -> 42 -> 93
```

Each stage is still a small once-per-player contract over ordinary won solo fights. It is not a broad quest engine, not a repeatable farm and not a duel/raid system.

## Counting rule

- Stage `13` keeps the old compatibility key `quest.thirteen-small-problems`.
- Stages `23`, `42` and `93` are issued through `daily_actions` with `local_date = once`.
- A stage counts only won ordinary solo fights with `solo_combat_sessions.created_at > issued.created_at`.
- Training doppelganger fights, lost fights, fled fights and expired fights do not count.
- Extra wins before the next stage is issued do not auto-complete that next stage.

## Allusion notes

- `13` is the original Kvestarnia unlucky-paperwork joke and remains the first small list of problems.
- `23` can nod to apophenia, suspicious coincidences and bureaucracy that sees patterns where the table only spilled tea.
- `42` can nod to the famous answer-number shape without copying specific scenes, phrasing or protected characters.
- `93` can nod to will, ceremonial numerology and overconfident paperwork without turning into a real-world doctrine lesson.

Keep references as flavor, not lecture. The player should mainly feel that Korhmar has found more papers than is healthy.

## Guardrails

- Do not copy long quotes, unique scenes or protected character names from external works.
- Do not make player news list exact reward XP/gold/items for each stage.
- Do not let these stages become repeatable rewards without a separate economy review.
- Do not route doppelganger training, duel prep or future PvP into this quest progress.
- Keep turn-in through Korhmar/Shynok so stage issuing remains explicit and fresh counters stay understandable.
