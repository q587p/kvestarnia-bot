# 0.3.7 Warrior Raid Taunt QA

Status: an earlier manual Telegram pass found the stale leader recruiting-card problem. Runtime fixes followed; the targeted latest-head recheck and remaining checklist are pending. Automated focused coverage is complete.

## Setup

- Refresh the isolated runtime with `refresh-local-bot.cmd`.
- Use a Big Barrel Brother party containing two Warriors and one non-Warrior, all alive and raid-eligible.
- Keep `⏱️ Dev: добити хід` available locally to advance boss turns; no new helper is required.

## Checklist

1. Confirm only living joined Warriors see `🛡️ На мене!` in the active Big Barrel fight.
2. Confirm the raid defend action uses the distinct `🧱 Захищатися` label.
3. Before the raid starts, act as a non-leader and change readiness, place/support the Ward, file/sign Protocol 13-Z, and join/leave. Confirm every committed change refreshes the leader's recruiting card.
4. Commit two preparation changes quickly from separate accounts so their Telegram deliveries can finish in reverse order. Confirm the leader card never regresses to the older state.
5. Delete or invalidate the leader card, then race two preparation changes. Confirm exactly one fresh leader card is sent, stored, and remains refreshable.
6. Have the leader leave and transfer leadership. Confirm the new leader's existing card is refreshed or replaced with leader-only recruiting controls.
7. Race a preparation change against manual or scheduled boss start. Confirm no recruiting controls appear after the canonical session enters combat.
8. Queue Taunt, then replace it with attack or defend before resolution. Confirm the later action commits and Taunt starts neither effect nor cooldown.
9. Commit Taunt and resolve the activation round. Confirm the boss response redirects into the Warrior immediately.
10. Defend on one round, then commit Taunt on the next. Confirm the stale Defend guard is cleared before the redirected response, while armor and the normal damage pipeline still apply.
11. When practical, create an equipment-action guard, then commit Taunt. Confirm that stale equipment guard is also cleared; passive equipment effects remain active.
12. On a later round while Taunt remains active, choose fresh Defend. Confirm that this new guard applies normally to that round's redirected response.
13. During `Бочковий гуркіт`, confirm the Warrior receives one normal broad-hit instance; every other participant keeps the same HP and mana from that boss response.
14. Count three boss responses including the activation round. Confirm the active row decrements and the effect expires after the third.
15. Restart the local runtime between redirected responses. Confirm the remaining duration and the `N + 5` cooldown survive unchanged.
16. Confirm the same Warrior is blocked until round `N + 5`, with the exact remaining turn wait visible on the durable card.
17. Queue same-round Taunts from both Warriors. Confirm frozen party order selects one, the other no-ops, only the activator cools down, and that Warrior receives the first-use achievement exactly once.
18. Knock out the active Warrior before a later response. Confirm the card and journal show expiry only, without a remaining-duration row.
19. Reduce the boss to a final hit while Taunt is active, then win before the boss response. Confirm the active Taunt row clears and terminal state remains consistent.
20. Replay the activation callback, an overwritten callback, and a prior-turn callback. Confirm no duration extension, duplicate activation, cooldown reset, or repeated achievement.
21. Try forged/stale Taunt callbacks from the non-Warrior, proof boss, terminal fight, and knocked-out Warrior. Confirm fail-closed Ukrainian copy and no mutation.
22. Finish the fight and inspect every stored journal page. Confirm activation, focused/broad redirection, remaining duration and expiry replay without recalculation.
23. Open ordinary PvE, training, quick duel and turn-based duel surfaces. Confirm none gained the raid Taunt action.

## Result

- Manual result: earlier pass found the stale leader-card issue; latest-head targeted recheck and remaining refreshed isolated-runtime run are pending.
- Automated result: domain, callback, keyboard, presenter, service, achievement and Prisma party-boss repository coverage passed during implementation.
