# Service Constructor Dependencies

## Goal

Replace high-arity positional service constructors and `undefined` placeholders with named dependency objects, starting with `FightService` if feasible.

## Scope

- Introduce `FightServiceDependencies` or equivalent.
- Update `createServices()` wiring.
- Preserve all public service methods.
- Keep optional dependencies explicit by property name.
- Add or update factory wiring tests.
- Migrate one service per PR unless the diff remains tiny.

## Non-goals

- No DI container.
- No service locator.
- No dependency injection framework.
- No repository abstraction change.
- No behavior changes.
- No schema/migration.

## Acceptance criteria

- Constructor call sites have no unexplained positional `undefined` placeholders for migrated services.
- Tests confirm runtime factory wiring still creates all services.
- Existing service tests compile without broad mock rewrites.
- Public bot/service contracts remain compatible.

## Relevant files / search terms

- `src/app/createServices.ts`
- `src/services/fightService.ts`
- `src/services/trainingDoppelgangerService.ts`
- `src/services/adventureService.ts`
- `undefined,`
- `new FightService(`
- `new TrainingDoppelgangerService(`

## Focused tests

- `tests/app/factoryWiring.test.ts`
- service constructor unit tests if present;
- `npm run typecheck`.

## Manual QA

None required for pure constructor refactor if tests and typecheck pass. If runtime behavior is touched accidentally, run combat smoke.

## Release surfaces

Usually docs/PR body only. Do not advertise as player news.
