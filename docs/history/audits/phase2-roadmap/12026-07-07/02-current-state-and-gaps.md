# 02 — Current State and Gaps

## Mainline snapshot

Current `main` appears to be at `0.2.29` and records the Barrel Beer Tutorial as the active/latest shipped task in the task registry. The active work in the conversation is `0.2.30 — Mantok Ability Grants Foundation`, currently on an open PR/branch.

## Recently shipped / in-flight groups

### Social/Korchma systems

Shipped:
- safe gifting;
- postal delivery;
- table games / Dice Poker rework;
- Bard Performance;
- latest-events / chronicles;
- class noncombat Priest/Rogue actions;
- Barrel Beer Tutorial.

Gaps:
- turn-based duel tournaments with Korchma-funded rewards;
- better quest overview/journal route instead of the current button acting like a duplicate quest-table opener;
- Rogue reputation/location exposure consequences;
- broader food/drink buffs as a gold sink;
- social game rewards/achievements polish after real play.

### Combat/raids

Shipped:
- persistent PvE combat;
- training doppelganger;
- quick and turn-based duels;
- multi-enemy foundation and threat escalation;
- Big Barrel Brother raid MVP;
- in-combat medical items;
- gear-action foundation in active `0.2.30`.

Gaps:
- fuller raid mechanics beyond Big Barrel MVP;
- raid contribution/reward richness beyond one boss;
- group/party weekly goals;
- dueling tournament reward track;
- class/race/gear action balance once ability grants have real use data.

### Mantok/equipment/economy

Shipped:
- equipment slots;
- balance audit;
- coverage items;
- set synergies;
- medical crafting;
- gift/postal;
- Mantok Chest;
- Shynok sales.

In progress:
- ability grants from rare/epic/soulbound manatky.

Gaps:
- Charkokovalnia / item upgrades should be a separate version after ability-grants stability;
- Shynok resale / Korchmar recycling loop;
- item-instance safety remains future if market/trading grows;
- collections/museum;
- market remains hard-deferred.

### Onboarding/newbie

Shipped:
- starter shawarma/fight;
- cellar route;
- Barrel Beer Tutorial.

Gaps:
- current README/playable list should be refreshed after 0.2.30 and any next tutorial/quest overview changes;
- quest overview route would reduce navigation confusion for new players.

## High-risk open threads

1. **Ability grants touch many combat surfaces.** `0.2.30` spans PvE, Big Barrel, party-boss, turn-based duels, bleed/status, achievements, gear refresh, and UI. Manual QA should remain a release gate.

2. **Charkokovalnia is stacked on an unmerged feature.** This can be useful, but it should not be released as the same version number.

3. **Social rewards need caps.** Tournament rewards should exist, but must be Korchma-funded, capped, replay-safe, and not based on stealing from other players.

4. **Rogue theft needs consequence design.** The current bounded theft can be fun, but repeated theft without reputation/location risk will eventually feel consequence-light.

## Recommended "not now"

- broad market;
- auction house;
- guild wars;
- true MMO raid engine;
- item-instance rewrite unless a concrete feature forces it;
- taunt/threat/shield class system before shield/equipment/role support is mature;
- Mini App / web client.
