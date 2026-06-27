# Player/Monster Ability Contract Map

## Goal

After the player ability registry exists, map which ability concepts can be shared with monster runtime and which must remain separate.

## Scope

- Document current player ability fields.
- Document current monster runtime effect/runtime fields.
- Identify safe shared vocabulary: ID, source, target scope, tags, cost, cooldown, analytics name.
- Identify non-shared concepts: monster AI loadouts, telegraphs, runtime effects, shields, copied potency, once-per-fight usage.
- Propose a minimal shared type only if it reduces duplication without coupling resolution engines.

## Non-goals

- No runtime rewrite.
- No behavior changes.
- No schema/migration.
- No broad monster ability decomposition.
- No party targeting implementation.

## Acceptance criteria

- A doc explains the overlap and boundary.
- No code changes unless tiny type/export cleanup is clearly safe.
- Future player abilities have a clear path that does not break monster runtime.

## Relevant files / search terms

- `src/domain/combat/combatActions.ts`
- `src/domain/combat/monsterAbilityRuntime.ts`
- `src/content/monsterAbilities.ts`
- `src/content/monsterCombatProfiles.ts`
- `CombatAbilityDefinition`
- `MonsterAbilityRuntimeStateV1`
- `MonsterAbilityEffectKind`

## Focused tests

Docs-only: no tests required. If code moves, run domain tests and typecheck.

## Manual QA

None for docs-only.

## Release surfaces

Architecture docs only.
