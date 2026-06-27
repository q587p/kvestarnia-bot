# Bot Callback Route Helper

## Goal

Reduce repeated callback parse/invalid-answer boilerplate in vertical bot modules while preserving module ownership and runtime behavior.

## Scope

- Add a tiny helper such as `registerParsedCallbackRoute`.
- Support parser result shape `{ ok: true, value } | { ok: false }` or adapt with a mapper.
- On parse failure, call `safeAnswerCallbackQuery` with `presentInvalidCallback()` and stop.
- Allow optional named guards for active passage search and pending raid when the caller supplies them.
- Convert one low-risk module first, preferably `social.ts` or a small part of `inventory.ts`, then expand only if tests stay clear.
- Update architecture tests so a helper is allowed but callback namespace ownership remains pinned to vertical modules.

## Non-goals

- No central feature router.
- No callback namespace migration.
- No payload format changes.
- No player-facing copy changes.
- No rewrite of command handlers.
- No new dependency.

## Acceptance criteria

- Callback regexes remain in their vertical owner modules.
- Parse failure behavior is unchanged.
- `answerCallbackQuery` is still called for every handled callback path.
- Architecture tests still pin callback prefix ownership.
- At least one representative callback parser has a focused test or existing integration coverage.

## Relevant files / search terms

- `src/bot/modules/inventory.ts`
- `src/bot/modules/quest.ts`
- `src/bot/modules/tavern.ts`
- `src/bot/modules/combat.ts`
- `src/bot/modules/social.ts`
- `safeAnswerCallbackQuery`
- `presentInvalidCallback`
- `bot.callbackQuery`
- `parse*CallbackData`

## Focused tests

- invalid callback still shows invalid alert;
- valid callback still reaches the same handler;
- active passage search guard still blocks eligible routes;
- pending raid guard still blocks eligible routes;
- architecture stabilization scope test still passes.

## Manual Telegram QA

- Tap one valid button in each converted namespace.
- Tap a stale/invalid button if a dev fixture exists.
- Confirm no spinner remains after callback.
- Confirm no unexpected route movement or presence write.

## Release surfaces

Docs/changelog only if this is part of a release-oriented task. For pure refactor, PR body and architecture notes are enough.
