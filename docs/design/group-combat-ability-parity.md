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

## Executable evidence matrix

Every row executes in `tests/domain/groupCombat.test.ts` under
`$abilityId executes the full GroupCombat parity contract`. That parameterized
regression proves valid and invalid target scope, the selected target(s), mana
spend/insufficient-mana rejection (or zero-cost availability), cooldown commit
and next-own-action tick, actual damage contribution to enemy focus, strict
persisted restart replay and terminal deterministic replay. The named focused
tests below cover recipe-specific support or retarget semantics without
duplicating those exact assertions.

| Shared profile | Primary / secondary and actual selection | Support or side-damage proof | Mana / cooldown | Exact executable evidence |
| --- | --- | --- | --- | --- |
| `skill.forceful-strike` | selected single living enemy; dead target canonically retargets | no support; direct damage owns focus contribution | `0` / `1` | full parity row; `retargets a committed single-enemy class action when its authored target dies earlier` |
| `skill.hot-spell` | every living enemy | no ally support; every resolved enemy receives authored spell damage | `5` / `2` | full parity row |
| `skill.boiling-filling` | every living enemy / selected ally-or-self | selected support target is healed while all living enemies take damage | `4` / `2` | full parity row; `commits current Varenyk-mancer support recipes with an authored effect` |
| `skill.form-thirteen-b` | every living enemy | response mitigation is authored control, not personal ranking credit | `4` / `2` | full parity row |
| `skill.dangerous-couplet` | every living enemy / every living ally including self | ally guard affects the intended full ally set | `4` / `3` | full parity row; `commits current Bard support recipes with an authored effect` |
| `skill.shadow-cut` | selected single living enemy; dead target canonically retargets | no ally support; direct damage and response mitigation remain one recipe | `0` / `2` | full parity row; `retargets a committed single-enemy class action when its authored target dies earlier` |
| `skill.trick-shot` | selected canonical primary plus every other living enemy as splash | no ally support; primary and splash damage both feed the actor contribution | `1` / `2` | full parity row |
| `skill.strict-blessing` | lowest-HP living ally / every living ally; side damage selects canonical first living enemy | only the lowest-HP ally is healed, every intended ally is protected, and side damage never follows HP targeting | `4` / `3` | full parity row; `applies strict blessing healing to only the lowest-HP ally and mitigation to every intended ally`; `skill.strict-blessing heals and protects the committed ally while damaging the canonical living enemy` |
| `skill.steppe-side-eye` | every living enemy | response mitigation remains authored control; no ally target is invented | `2` / `2` | full parity row |
| `skill.careful-strike` | selected single living enemy | fallback has no support behavior and contributes only actual direct damage | `0` / `1` | full parity row |

The shared cooldown regressions `ticks ability cooldowns after a committed guard
action`, `ticks ability cooldowns after a committed item action`, and `ticks
cooldowns on timeout guard without counting a manual action` pin non-class-action
tick behavior. `rejects unavailable abilities and commits a deterministic support
fumble without support effects` pins insufficient resources/fumble behavior,
while the full matrix performs strict restart and terminal replay for all ten
profiles. Source-string presence is not accepted as semantic evidence.

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
