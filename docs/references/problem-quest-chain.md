# Problem Quest Chain References

Created: 12026-06-17

## Runtime surface

`0.1.6` extends the narrow persistent fight wrapper into a Korchmar/Shynok chain:

```text
13 -> 23 -> 42 -> 93
```

Each stage is still a small once-per-player contract over ordinary won solo fights. It is not a broad quest engine, not a repeatable farm and not a duel/raid system.

## Counting rule

- Stage `13` keeps the old compatibility key `quest.thirteen-small-problems` and is legacy-compatible in `0.1.7`: old ordinary won solo fights can still count toward the first paper until that reward is claimed.
- Stages `23`, `42` and `93` are issued through `daily_actions` with `local_date = once`.
- Stages after `13` count only won ordinary solo fights with `solo_combat_sessions.created_at > issued.created_at`.
- Training doppelganger fights, lost fights, fled fights and expired fights do not count.
- Extra wins before the next stage is issued do not auto-complete that next stage.

## Recovery UX

- `0.1.8` keeps first-paper recovery visible at the Shynok handoff: if stage `13` is issued with old saved progress, the issue message must show the recovered counter instead of saying the journal starts from zero.
- If that recovered first paper is already complete, the same Shynok message should offer the turn-in action immediately.
- Shynok and Quest Hub should use the public problem-chain progress lookup instead of deriving paper actions from `getFightOverviewForTelegramUser`; active training doppelganger fights may block ordinary `/fight`, but they must not hide Korchmar paper actions.
- Active fights may still block starting another fight, but they must not be confused with lost problem-chain progress.

## Allusion notes

- `13` is the original Kvestarnia unlucky-paperwork joke and remains the first small list of problems.
- `23` can nod to apophenia, suspicious coincidences and bureaucracy that sees patterns where the table only spilled tea.
- `42` can nod to the famous answer-number shape without copying specific scenes, phrasing or protected characters.
- `93` can nod to will, ceremonial numerology and overconfident paperwork without turning into a real-world doctrine lesson.

Keep references as flavor, not lecture. The player should mainly feel that Korchmar has found more papers than is healthy.

## Guardrails

- Do not copy long quotes, unique scenes or protected character names from external works.
- Do not make player news list exact reward XP/gold/items for each stage.
- Do not let these stages become repeatable rewards without a separate economy review.
- Do not route doppelganger training, duel prep or future PvP into this quest progress.
- Keep turn-in and next-stage acceptance through Korchmar/Shynok as separate actions so stage issuing remains explicit and fresh counters stay understandable.
