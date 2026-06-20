# Phase 1 Release Notes — 0.1.0

## Summary

`0.1.0` closes the `0.0.x` Phase 1 build line as a playable first loop for Квестарня and resets the next roadmap around Phase 2 Social Combat & Interactions. This is a release/docs/smoke milestone: it documents what shipped, marks the next work as `0.1.x` stabilization/playtest, adds Phase 2 planning docs, and does not add new gameplay runtime.

Phase 1 is playable, not final-balanced and not closed-alpha complete. The next line should use real smoke/playtest pain to choose small fixes instead of opening several new feature tracks at once.

After stabilization, the planned Phase 2 spine is: duel invites, result/rematch/tournament cards, trading/gifting, combat variety, `/remort`, multi-enemy combat, and later party combat / real raids.

## What is playable now

- New player onboarding through `/start`, with pronoun, race, class, and persistent character creation.
- `/hero`, `/profile`, and `/me` show level, XP, gold, HP, mana, stats, equipment context, and item valuation.
- Korchma navigation, Quest Hub, Shynok, Barrel raid, light presence, `/online`, `/look`, and public `/presence`.
- Starter adventure and starter fight for early levels.
- Level 3+ persistent solo fights with HP/mana state, attack, special/class action, flee, stale-turn protection, terminal states, and reward replay.
- Equipment effects routed through the shared effective-stats helper.
- Controlled fight loot and idempotent XP/gold/item rewards.
- Inventory, item details, equipment, and value/priceless metadata.
- Mantok Chest auto-pick and manual selection as the first item-volume sink.
- Level 1-13 progression and visible level-up milestones.
- Level 4+ Yeger unquiet quest with tracking wait, ready trail, target fights, progress, and one-time turn-in.
- Outside-korchma Munchkin barter for eligible priced manatky plus wallet gold, hardened by `0.0.30`.
- Public homepage, `/health`, `/news`, and service commands including `/version`, `/news`, and `/restart`.

## Definition of Done status

- New player can get a first item quickly: covered by starter adventure/fight, Barrel, cellar, and inventory surfaces.
- Persistent solo fight exists: level 3+ `/fight` uses saved solo combat sessions.
- Attack/special/flee exist: combat actions are exposed with mana/flee handling.
- HP/mana state is visible and persistent: resources survive terminal fights and recover lazily outside combat.
- Equipment affects combat through shared effective stats: hero, equipment, item detail, and combat share the same summary path.
- Victory grants XP/gold/item through idempotent reward paths: won fights store replay data and do not reroll on repeated callbacks.
- Repeated callbacks do not duplicate rewards: daily-action/session/ledger boundaries cover the current reward paths.
- Inventory and item details exist: `/inventory`, `/items`, `/bag`, item detail callbacks, and equipment views are live.
- Mantok Chest is the first item-volume sink: auto and manual selection consume 5 eligible items into one output with confirmation.
- Level-up 1-13 is visible: the current alpha curve and milestone records cover the Phase 1 range.
- Loss/flee are not harsh full-fail traps: loss can grant a small attempt reward, flee ends without full victory reward, and HP 0 is a rest state.
- Checks pass: required for this closeout PR before merge.
- Docs/news are aligned: this file, README, changelog, news, roadmap, backlog, playtesting, closeout smoke, balance notes, and technical plan should move together.

## Smoke checklist before merge

Run the automated checks:

```bash
npm.cmd run db:validate
npm.cmd run lint
npx.cmd tsc --noEmit
npm.cmd test
npm.cmd run check
git diff --check
```

Manual smoke should cover:

- new player route from `/start` to first item;
- level 3+ persistent fight, stale turn, victory replay, loss/flee, and HP/mana recovery;
- equipment effective stats in `/hero`, `/equipment`, item detail, and new combat;
- Mantok Chest auto and manual paths;
- Yeger tracking wait, ready trail, target fight, progress, and turn-in;
- Munchkin barter replay confirm, no gold-only/gold-heavy exchange, protected/equipped exclusions, `12 -> 13` refusal, and pending Barrel guard;
- Barrel, Shynok, local presence, and public `/presence`;
- `/health`, `/news`, homepage, and `/version` showing `0.1.0` after deploy.

Detailed route: [PHASE1_CLOSEOUT_SMOKE.md](PHASE1_CLOSEOUT_SMOKE.md).

## Known limitations

- Balance is playable but not final.
- No shops, selling, trading, crafting, or broad economy loop.
- No item-instance inventory; current inventory remains stack-based.
- No achievements runtime.
- At `0.1.0` closeout there were no true group raids, guilds, duel/PvP runtime, trading/gifting runtime, `/remort`, or Mini App. The first base `/remort` loop shipped later in `0.1.2`.
- Barrel completion notifications are not a broad durable scheduler/outbox architecture.
- Yeger bait, lure, ambush, and reputation are future work.
- Munchkin manual item selection is future work.
- Food/coffee, NPC rankings, expanded equipment, battle interventions, item tags and one-use manatky are backlog only.

## Deferred to 0.1.x

1. `0.1.1` — playtest bugfixes, copy polish, and small UX papercuts.
2. `0.1.2` — after closeout, this became presence/routing cleanup plus the first runtime `/remort` slice because a player reached the cap during playtest.
3. `0.1.3` — Hlybka routing or fight/quest navigation cleanup if playtest shows it matters.
4. First Phase 2 runtime prep if the core loop remains stable: duel invite MVP.
5. Later Phase 2 order — result/rematch/tournament cards, trading/gifting, combat variety, remort-only follow-ups after the `0.1.2` base loop, multi-enemy combat, party combat / real raids.
6. Side tracks — rewardless achievements, Shynok item-for-beer, bestiary filters, Yeger bait/lure/reputation, and similarly small scoped expansions only if they do not steal the main spine.

## Hard-deferred beyond 0.1.x stabilization

- Shops, selling, trading, crafting, and market systems.
- Item-instance inventory refactor.
- True group raids, guilds, broad PvP modes, market systems and party combat beyond the first opt-in social slices.
- Mini App.
- Broad combat rewrite, multi-enemy combat, summons, monster AI, and large action-system changes.
- Production monetization and any pay-to-win path.

## Maintainer notes

- `0.1.0` should be merged as a release/docs/smoke closeout PR.
- Do not hide gameplay changes inside closeout docs. If a blocker bug appears, make the smallest targeted fix and call it out separately.
- After merge, new runtime feature work should start from the explicit `0.1.x` order in [NEXT_IMPLEMENTATION_BACKLOG.md](NEXT_IMPLEMENTATION_BACKLOG.md), not from leftover `0.0.x` momentum.
