# 0.3.7 Warrior Raid Taunt QA

Status: manual Telegram QA not run. Automated focused coverage is complete.

## Setup

- Refresh the isolated runtime with `refresh-local-bot.cmd`.
- Use a Big Barrel Brother party containing two Warriors and one non-Warrior, all alive and raid-eligible.
- Keep `⏱️ Dev: добити хід` available locally to advance boss turns; no new helper is required.

## Checklist

1. Confirm only living joined Warriors see `🛡️ На мене!` in the active Big Barrel fight.
2. Confirm the raid defend action uses the distinct `🧱 Захищатися` label.
3. Before the raid starts, act as a non-leader and change readiness, support the Ward, sign Protocol 13-Z, and when practical join/leave. Confirm every committed change refreshes the leader's recruiting card. Delete or invalidate the old leader card, change state again, and confirm one fresh leader card arrives and remains refreshable.
4. Queue Taunt, then replace it with attack or defend before resolution. Confirm the later action commits and Taunt starts neither effect nor cooldown.
5. Commit Taunt and resolve the activation round. Confirm the boss response redirects into the Warrior immediately.
6. Defend on one round, then commit Taunt on the next. Confirm the stale Defend guard is cleared before the redirected response, while armor and the normal damage pipeline still apply.
7. When practical, create an equipment-action guard, then commit Taunt. Confirm that stale equipment guard is also cleared; passive equipment effects remain active.
8. On a later round while Taunt remains active, choose fresh Defend. Confirm that this new guard applies normally to that round's redirected response.
9. During `Бочковий гуркіт`, confirm the Warrior receives one normal broad-hit instance; every other participant keeps the same HP and mana from that boss response.
10. Count three boss responses including the activation round. Confirm the active row decrements and the effect expires after the third.
11. Restart the local runtime between redirected responses. Confirm the remaining duration and the `N + 5` cooldown survive unchanged.
12. Confirm the same Warrior is blocked until round `N + 5`, with the exact remaining turn wait visible on the durable card.
13. Queue same-round Taunts from both Warriors. Confirm frozen party order selects one, the other no-ops, only the activator cools down, and that Warrior receives the first-use achievement exactly once.
14. Knock out the active Warrior before a later response. Confirm the card and journal show expiry only, without a remaining-duration row.
15. Reduce the boss to a final hit while Taunt is active, then win before the boss response. Confirm the active Taunt row clears and terminal state remains consistent.
16. Replay the activation callback, an overwritten callback, and a prior-turn callback. Confirm no duration extension, duplicate activation, cooldown reset, or repeated achievement.
17. Try forged/stale Taunt callbacks from the non-Warrior, proof boss, terminal fight, and knocked-out Warrior. Confirm fail-closed Ukrainian copy and no mutation.
18. Finish the fight and inspect every stored journal page. Confirm activation, focused/broad redirection, remaining duration and expiry replay without recalculation.
19. Open ordinary PvE, training, quick duel and turn-based duel surfaces. Confirm none gained the raid Taunt action.

## Result

- Manual result: pending refreshed isolated-runtime run.
- Automated result: domain, callback, keyboard, presenter, service, achievement and Prisma party-boss repository coverage passed during implementation.
