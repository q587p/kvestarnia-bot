# 05 — Docs and Tone Cleanup Notes

## Public README / product surface

The public README still matches the product voice: short session, long progression, Ukrainian-first humor, Telegram-native social game. The shipped feature list should be refreshed after `0.2.31` because it now under-represents:

- Dice Poker rework;
- Mantok set synergies;
- Mantok ability grants;
- Barrel Beer Tutorial;
- class noncombat Priest/Rogue actions if not already merged into the current public docs.

Do not turn README into a changelog. Keep it as a public window.

## Roadmap

`docs/product/roadmap.md` should be updated after `0.2.31`:
- append `0.2.18–0.2.31` in the Phase 2 closeout/deliverables summary;
- explicitly mark Mantok/equipment work as supporting "character matters" rather than replacing social goals;
- preserve the next-pivot note: after current Mantok stability, return to social combat/tournaments/reputation/quest overview.

## Task registry

`docs/tasks/README.md` should treat `0.2.31` as the Phase 2 closeout / hardening cutline. After `0.2.31`:
- keep `0.2.30-mantok-ability-grants-foundation.md` and `0.2.31-polish-bugfixes.md` as recently shipped;
- start the next feature line at `0.3.0-charkokovalnia-item-upgrades.md`;
- avoid new active `0.2.x` feature task names.

## Codex context

`docs/ai/context.md` is close to its line budget. New updates should compact older sections rather than append endless release paragraphs. After `0.2.31`, compress `0.2.23–0.2.31` into a single Mantok/equipment paragraph if needed.

## Tone

The tone is still strong and coherent:
- Ukrainian-first, not localization;
- friendly, ironic, not cruel;
- Korchma as social infrastructure;
- fun-per-message;
- screenshot-worthy manatky.

One risk: as systems deepen, some cards may become dense. For new features, prefer:
- one action per short message;
- result first, mechanics second;
- exact numbers after commitment, not before;
- buttons over rules dumps.

## Product warning

Public copy should not promise:
- full group raids;
- guilds;
- market;
- crafting as broad system;
- tournament rewards;
- Charkokovalnia;
- ability-granting gear;
until the specific version is merged and deployed.
