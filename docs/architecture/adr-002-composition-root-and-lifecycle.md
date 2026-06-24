# ADR-002: Explicit Composition Root and Runtime Lifecycle

Status: Proposed for `0.2.2`  
Scope: application startup, dependency construction and shutdown

## Context

`src/bot.ts` currently acts as:

- executable entry point;
- repository factory;
- service factory;
- health-server owner;
- bot owner;
- scheduler owner;
- process-signal handler;
- Telegram command synchronizer;
- deploy-notification launcher.

Construction is explicit, which is good, but it occurs in one module and process resources are tied to top-level execution. Several service constructors also require positional optional arguments, making the composition list harder to review.

## Decision

Keep manual dependency injection, but split it into typed factory functions under `src/app/`.

Use:

- `createRepositories(prisma)`;
- `createServices(repositories, config)`;
- `createRuntime(...)`;
- explicit `start()` and `stop()` lifecycle functions.

`src/bot.ts` remains the executable entry point and contains only configuration load, runtime creation, signal wiring and `start()`.

No dependency-injection container is introduced.

## Required properties

- factories are side-effect free except object construction;
- servers, polling and schedulers start only in `start()`;
- shutdown is safe when called once or repeatedly;
- scheduler stop happens before Prisma disconnect;
- bot-disabled mode still starts the intended health behavior;
- deploy notifications remain best-effort;
- Telegram command synchronization remains best-effort;
- local isolated bot tooling remains unaffected.

## Dependency shape

A typed repository object should use concrete names:

```ts
export interface ApplicationRepositories {
  users: UserRepository;
  characters: CharacterRepository;
  soloCombatSessions: SoloCombatSessionRepository;
  // ...
}
```

A typed service object may extend the bot-facing contract with runtime-only services:

```ts
export interface ApplicationServices extends BotServices {
  deployNotifications: DeployNotificationService;
}
```

Avoid a generic service locator such as `container.get("fight")`.

## Constructor migration policy

`0.2.2` does not need to convert every service constructor.

For high-arity constructors:

- prefer a named factory in `createServices.ts` as an immediate readability improvement;
- convert a constructor to one dependency object only when all call sites and tests can be changed mechanically and the diff remains scoped;
- do not mix constructor redesign with gameplay behavior changes.

## Consequences

### Positive

- startup wiring can be tested;
- import-time side effects shrink;
- dependency ownership is visible;
- scheduler and server lifecycle becomes explicit;
- future web/admin adapters can reuse services without importing polling startup.

### Negative

- adds an application layer and more types;
- factory objects can become large;
- careless factory splitting can hide construction order.

## Mitigations

- keep factories direct and boring;
- avoid barrel exports;
- do not create a generic container;
- use one top-level application dependency type;
- add focused runtime lifecycle tests.

## Alternatives rejected

- global singleton registry;
- NestJS module system;
- decorators/reflection;
- constructing dependencies inside feature registrars;
- moving Prisma access into bot handlers.

## Review trigger

Revisit when:

- multiple runtime processes share the same services;
- a worker process is introduced;
- a second transport adapter becomes real;
- startup dependency graphs require automated validation.
