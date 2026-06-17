# Combat Tactics and Flavor

Status: introduced in `0.1.9` as a narrow foundation.

## Purpose

Combat flavor intents are a small pure domain layer for turning already-resolved combat context into short presentation lines. They are not a combat AI, balance system, reward system or PvP runtime.

The first use is `/spar`: the `Сумлінний Допельґанґер` now shows class-aware counter flavor when the copy answers after a player action. This makes training feel more like a mirror of the current character without changing the training economy.

Future uses:
- ordinary monsters with signature moves;
- richer result cards for opt-in duels;
- small race/class/title hooks that make a fight read like this exact character was present.

## Current Contract

The current domain module returns:
- an intent id;
- tags useful for tests and future routing;
- one short Ukrainian text line.

Selection is deterministic. Class hooks have priority for the doppelganger because `/spar` is meant to feel like the copy learned the player’s tricks. Race hooks are fallback flavor, not a balance pass.

`0.1.9` includes class hooks for:
- `class.warrior`;
- `class.mage`;
- `class.varenyk-mancer`;
- `class.bureaucramancer`;
- `class.bard`;
- `class.rogue`;
- `class.ranger`;
- `class.priest`;
- `class.kharakternyk`.

## Guardrails

- No schema migration.
- No new reward path.
- No gold, items, манатки, titles, donor state or paid advantage.
- No problem-chain progress from training.
- No change to `/spar` level gate, cooldown, XP-only reward or resource persistence.
- No hidden formula text in player-facing messages.
- No duel runtime until a later consent/replay-safe social combat slice.

The intent layer may later carry semantic tags for tactics or presentation, but any numeric modifier must be a separate tested balance PR with explicit simulation coverage.
