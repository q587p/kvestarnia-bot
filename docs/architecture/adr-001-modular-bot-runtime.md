# ADR-001: Modular Bot Runtime Registration

Status: Proposed for `0.2.2`  
Decision owners: project maintainer and implementation Codex  
Scope: Telegram adapter assembly only

## Context

`src/bot/createBot.ts` grew with every shipped command and callback. It now owns global middleware, command registration, callback parsing, feature handlers, presenter/keyboard calls and cross-feature routing helpers.

The existing command/callback/presenter/keyboard separation is useful, but the central assembly file remains the owner of nearly every route.

grammY registration order can affect behavior, so a dynamic plugin scan or implicit module discovery would trade one problem for another.

## Decision

Split bot registration into a small, explicit ordered list of coarse feature registrar functions.

Each registrar:

- receives the existing `Bot` plus typed dependencies;
- registers commands and callback namespaces for one vertical slice;
- owns local callback handlers and presenter/keyboard imports;
- does not construct repositories or services;
- does not start process-level resources.

`createBot.ts` remains the public factory and explicitly calls registrars in order.

Cross-cutting middleware remains outside feature modules and is installed before registrars.

## Required properties

- one callback namespace has one owner;
- registration order remains visible in source;
- no dynamic directory scanning;
- no decorator/reflection framework;
- no Telegram types in domain;
- no gameplay behavior change;
- no callback payload change;
- existing command modules remain reusable.

## Consequences

### Positive

- feature work touches a local registrar instead of a central 4k-line file;
- imports become feature-local;
- merge conflicts fall;
- callback ownership is discoverable;
- module-level tests become possible;
- `createBot.ts` becomes reviewable.

### Negative

- there will be more files;
- some cross-feature flows need narrow shared helpers;
- a careless move can change grammY registration order;
- cyclic imports are possible if modules call each other directly.

## Mitigations

- registrars do not import other registrars;
- shared helpers live in named bot adapter modules;
- characterization tests cover route order and key guards;
- no barrel export that hides cycles;
- TypeScript imports should use direct module paths.

## Alternatives rejected

### Keep the single file

Rejected because the growth pattern is ongoing and upcoming multi-enemy/social work will continue touching shared routing.

### One module per callback

Rejected as excessive fragmentation.

### Generic plugin framework

Rejected because explicit ordering is a correctness property and the project does not need runtime plugin discovery.

### Move all handlers into command files

Rejected as a mandatory rule. Some callback orchestration belongs beside its registrar; existing command files should only absorb it when ownership becomes clearer.

## Review trigger

Revisit this ADR only if:

- grammY is replaced;
- a second messaging adapter is shipped;
- modules need independent packaging;
- explicit registration becomes demonstrably unmanageable.
