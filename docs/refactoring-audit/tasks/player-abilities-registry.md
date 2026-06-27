# Player Abilities Registry

Candidate release: `0.2.7 — Player Abilities MVP`.

## Goal

Replace the hard-coded class-skill switch in `src/domain/combat/combatActions.ts` with a data-driven player ability registry while preserving all current combat behavior and stored cooldown compatibility.

## Scope

- Add a `PLAYER_COMBAT_ABILITIES` registry or equivalent.
- Map current class IDs to current ability IDs/profiles.
- Keep `getCombatSkillProfile(classId)` as a compatibility facade.
- Keep `getClassCombatAbility(classId)` and `getCombatAbilityForAction(...)` compatible.
- Preserve existing `legacyCooldownIds` behavior for renamed skills.
- Add focused tests proving old class IDs map to the same profiles.
- Update compact context/task docs if this ships as the active version task.

## Non-goals

- No new player ability mechanics beyond the registry foundation.
- No race/title/signature/item ability catalog.
- No monster runtime rewrite.
- No combat formula rebalance.
- No stored combat JSON migration.
- No callback payload changes.
- No player-facing copy expansion unless labels are already visible and tests cover them.

## Acceptance criteria

- Existing class skill IDs, costs, cooldowns, stats, damage kind, base damage, multipliers, accuracy, crit, and reductions remain unchanged.
- Unknown class/default behavior remains unchanged.
- Legacy cooldown IDs remain readable.
- The registry is exported for later feature work but does not couple domain to Telegram.
- `npm test` or targeted domain tests pass; broader checks are run or blockers are stated.

## Relevant files / search terms

- `src/domain/combat/combatActions.ts`
- `src/domain/combat/combatEngine.ts`
- `src/domain/combat/combatState.ts`
- `getCombatSkillProfile`
- `getClassCombatAbility`
- `legacyCooldownIds`
- `skill.hot-spell`
- `skill.boiling-filling`
- `skill.trick-shot`
- `skill.shadow-cut`

## Focused tests

- all current class IDs resolve to same `CombatSkillProfile` values as before;
- default/unknown class resolves to `skill.careful-strike`;
- renamed skill legacy cooldown IDs are preserved;
- `getCombatAbilityForAction("attack" | "defend" | "skill", classId)` returns compatible definitions;
- domain import boundary test still passes.

## Manual Telegram QA

- Start or restore an ordinary persistent fight for a class with mana cost.
- Use class skill, then confirm cooldown behavior.
- Try class skill without enough mana if possible.
- Use renamed class skill if a test character exists.
- Confirm battle card labels remain sensible.

## Release surfaces

If activated as `0.2.7`, update:

- `package.json` and lockfile if version bump is included;
- `CHANGELOG.md` with technical details;
- `news.md` only if there is a player-visible ability change, not for pure internal registry extraction;
- `docs/ai/context.md` compactly;
- task doc in `docs/tasks/`.
