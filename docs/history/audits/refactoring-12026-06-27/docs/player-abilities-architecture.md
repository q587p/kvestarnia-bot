# Player Abilities Architecture for `0.2.7`

## Goal

Make player-side combat abilities data-driven enough for `0.2.7 — Player Abilities MVP` without rewriting the combat engine or changing stored combat JSON.

## Current shape

`src/domain/combat/combatActions.ts` already has:

- `CombatAbilityDefinition`;
- `CombatSkillProfile`;
- basic attack/defend ability definitions;
- `getCombatSkillProfile(classId)` switch;
- `getClassCombatAbility(classId)`;
- `getCombatAbilityForAction(action, classId)`.

This is close to the desired abstraction. The problem is that class-specific skills are still embedded in a switch.

## Proposed shape

```ts
export interface PlayerCombatAbilityDefinition extends CombatAbilityDefinition {
  profile: CombatSkillProfile;
  classIds: readonly string[];
  displayLabel: string;
}

export const PLAYER_COMBAT_ABILITIES = {
  "skill.forceful-strike": {...},
  "skill.hot-spell": {...},
  "skill.boiling-filling": {...},
  ...
} satisfies Record<string, PlayerCombatAbilityDefinition>;

export const CLASS_COMBAT_ABILITY_ID_BY_CLASS_ID = {
  "class.warrior": "skill.forceful-strike",
  "class.mage": "skill.hot-spell",
  ...
} as const;
```

Compatibility facade:

```ts
export function getCombatSkillProfile(classId: string | undefined): CombatSkillProfile {
  return getPlayerCombatAbilityForClass(classId)?.profile ?? carefulStrike;
}
```

## Why this order

This gives 0.2.7 a stable place to add player ability metadata before adding mechanics such as race, title, signature, item, or support abilities.

It also protects current combat behavior:

- `resolveCombatTurn` can still call `getCombatSkillProfile()`;
- stored cooldown IDs remain ability-keyed;
- legacy cooldown IDs remain readable;
- battle cards can resolve labels from the registry;
- tests can assert all current classes map to an ability.

## Non-goals for the first pass

- No race ability catalog.
- No title/signature abilities.
- No item active ability catalog beyond existing bandage item turn.
- No party targeting.
- No cooldown schema migration.
- No monster runtime rewrite.
- No combat coefficient rebalance.

## Tests

Add or update tests for:

- every current class maps to the same skill ID/profile as before;
- default/unknown class keeps `skill.careful-strike`;
- legacy cooldown IDs remain on renamed skills;
- `getCombatAbilityForAction("skill", classId)` returns a player ability with stable `primaryTargetScope` and tags;
- labels are not raw IDs where player-facing surfaces need labels;
- no Telegram imports in domain.

## Later extensions

After the MVP:

1. Add ability families by source: `basic`, `class`, later `race`, `signature`, `item`.
2. Add target scopes that can represent allies/party only when party runtime exists.
3. Add analytics event names by ability ID.
4. Consider a shared vocabulary with monster abilities only after player registry has real use.
