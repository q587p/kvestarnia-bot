# PartyBoss → GroupCombat ability parity

Status: implemented audit for `0.4.8`.

## Shared typed class abilities

PartyBoss and GroupCombat resolve the same ten canonical class profiles through
`getCombatClassAbilityProfile`: `skill.forceful-strike`, `skill.hot-spell`,
`skill.boiling-filling`, `skill.form-thirteen-b`, `skill.dangerous-couplet`,
`skill.shadow-cut`, `skill.trick-shot`, `skill.strict-blessing`,
`skill.steppe-side-eye`, and `skill.careful-strike`.

GroupCombat already applies each profile's typed primary/secondary target scope,
mana cost, cooldown and recipe. Explicit enemy scopes use the selected canonical
living target; support profiles retain their ally/self scope; support profiles
with authored direct damage use the canonical first living enemy. Damage feeds
the resolved-turn focus calculation only after it is actually dealt. The
exhaustive class-profile and direct-damage scope tests are release blockers.

Race profiles and equipment-granted actions use the same shared typed resolver
and remain covered by the existing exhaustive GroupCombat profile tests. They
are not reclassified as class abilities by this audit.

## Raid-only specializations

The following are not portable class-profile gaps. They depend on Big Barrel
recruitment or its single-boss response clock and remain raid-only:

- `raid.class.warrior.taunt` — redirects focused/broad Big Barrel responses.
- `raid.class.bard.lament` — occupies the raid music slot and counts boss responses.
- `raid.race.kharakternyk.ward-sign` — freezes recruitment support and spends on broad responses.
- `raid.class.bureaucramancer.protocol-13-z` — freezes recruitment signatures and blocks focused responses.

Their separately scheduled design owner is
[`docs/backlog/group-combat-raid-specializations.md`](../backlog/group-combat-raid-specializations.md).
No `0.4.8` combat-engine rewrite or approximate multi-enemy substitute is allowed.
