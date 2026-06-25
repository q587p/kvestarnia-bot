# Deferred: Targetable Adds for Senior Barrel Brother

Status: optional later `0.2.x` slice; no version assigned

## Why deferred

The first production raid should prove party recruitment, simultaneous actions, one shared boss, multi-character settlement and recovery before combining that with party target selection and several independently acting enemies.

Watcher hazard stacks provide the requested small-monster flavor without violating the safer build order:

1. party session;
2. party versus one boss;
3. party versus boss plus targetable adds.

## Candidate follow-up

At `70%` HP, replace the first watcher stack wave with authored enemies:

- `Око в піні` — fragile magical watcher that amplifies the next area action;
- `Корок-реєстратор` — low-HP trick enemy that adds oversight pressure;
- maximum targetable adds: `1` for parties 1–3, `2` for 4–5, `3` for 6–8.

At `35%`, summon only missing slots; never exceed the cap.

## Required prerequisites

- stable group raid round/action resolver;
- general target-selection callback and presenter contract;
- multi-enemy combat state that supports more than two enemies or a clear raid-owned enemy collection;
- per-enemy ability/runtime persistence;
- deterministic all-enemy action ordering;
- simulation with target policy;
- no per-add reward multiplication.

## Non-goals for the follow-up

- no endless summoning;
- no add-specific XP/gold/loot;
- no mandatory AoE class;
- no tab-target Mini App;
- no threat tank/healer roles.

## Acceptance ideas

- basic attack can select a living target through compact buttons;
- stale target callbacks replay current state;
- killing an add removes its mechanic immediately and dead adds never act;
- boss victory requires boss death; surviving adds either flee or resolve through an authored terminal rule;
- rewards remain one encounter contract;
- targetable adds improve decisions without raising average recommended-group duration above the accepted band.
