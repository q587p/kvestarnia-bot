# 05 — Docs and Tone Cleanup Notes

## Public README / product surface

The public README still matches the product voice: short session, long progression, Ukrainian-first humor, Telegram-native social game. The shipped feature list should be refreshed after `0.2.30` because it now under-represents:

- Dice Poker rework;
- Mantok set synergies;
- Mantok ability grants;
- Barrel Beer Tutorial;
- class noncombat Priest/Rogue actions if not already merged into the current public docs.

Do not turn README into a changelog. Keep it as a public window.

## Roadmap

`docs/product/roadmap.md` should be updated after `0.2.30`:
- append `0.2.18–0.2.30` in the Phase 2 closeout/deliverables summary;
- explicitly mark Mantok/equipment work as supporting "character matters" rather than replacing social goals;
- preserve the next-pivot note: after current Mantok stability, return to social combat/tournaments/reputation/quest overview.

## Task registry

`docs/tasks/README.md` currently shows mainline `0.2.29` and old active task state. After `0.2.30`:
- add `0.2.30-mantok-ability-grants-foundation.md`;
- decide whether `0.2.31` is hardening or Charkokovalnia;
- avoid duplicate `0.2.30` task names.

## Codex context

`docs/ai/context.md` is close to its line budget. New updates should compact older sections rather than append endless release paragraphs. After `0.2.30`, compress `0.2.23–0.2.30` into a single Mantok/equipment paragraph if needed.

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
