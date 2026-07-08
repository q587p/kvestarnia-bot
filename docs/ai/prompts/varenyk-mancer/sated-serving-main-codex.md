# Varenyk-mancer Sated Serving Main Codex Prompt

```text
Use $kvestarnia-version-task.

Task: implement `docs/tasks/0.3.x-varenyk-mancer-sated-serving.md`.

Target branch: create a fresh feature branch from current `origin/main` after verifying the tree and current task numbering.

Context:
- This is a narrow `class.varenyk-mancer` support technique, not a cooking/crafting engine.
- Player-facing copy must be Ukrainian.
- Keep Codex-facing docs and tests English.
- Use existing class noncombat/status/cooldown/effective-stat patterns where possible.
- If the current repository has a newer version/task number, retarget the task filename and release surfaces without changing the feature contract silently.

Feature contract:
- Level 3+ `class.varenyk-mancer` can feed self or an active exact-normalized same-location target outside blocking active flows.
- Self-use is allowed.
- Feeding others is allowed in any current location while same-location active eligible targets exist.
- Successful feeding applies visible `Ситий` for 13 minutes.
- Recipient food cooldown: 93 minutes from successful application.
- Actor spends mana by deterministic serving rank: rank 1..5 costs 8 / 12 / 16 / 20 / 23 mana.
- Rank is based on canonical effective actor intelligence primary, charisma and level secondary.
- Store the resolved rank, mana cost and stat snapshot so replay does not reroll or double-spend.
- Immediate effect: small capped HP/mana restore.
- Outside combat: `Ситий` ticks tiny HP/mana recovery once per minute bucket.
- In combat: `Ситий` ticks on the target's own player turns instead of wall-clock minutes; never on enemy turns; at most once per combat turn id.
- Do not allow the feeding action to target characters currently in active combat/raid; only already-active `Ситий` may tick in combat.
- No gold, XP, loot, public feed, itemized food, shops, transfers, broad crafting, new location or power achievements in this MVP.
- Notify another target privately only after durable success.
- Add focused tests for eligibility, replay/idempotency, cooldowns, mana spend, capped recovery, minute ticks, combat own-turn ticks and Ukrainian presenter copy.

Before implementation:
1. Inspect the current class noncombat Priest/Rogue implementation, status handling, effective-stat summary path, combat tick/status patterns and callback size constraints.
2. Choose the narrowest persistence approach that makes rank, cooldown and ticks replay-safe.
3. Update release/docs surfaces in the style of nearby tasks.
```
