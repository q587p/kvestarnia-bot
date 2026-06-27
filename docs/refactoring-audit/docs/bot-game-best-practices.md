# Bot and Game Best Practices Applied to Kvestarnia

## Telegram callback discipline

Telegram inline `callback_data` is constrained to `1-64` bytes and every callback button press should be answered with `answerCallbackQuery`, even when no visible notification is needed. Kvestarnia already follows this with callback parsers and `safeAnswerCallbackQuery`; the refactor should make this easier to do consistently, not bypass it.

Recommended project practice:

- keep callback payloads compact;
- prefer server-owned opaque tokens for mutable state;
- re-read server state before mutation;
- always answer callbacks;
- make duplicate/stale callbacks replay-safe;
- keep parse failure behavior uniform.

Source notes:

- Telegram Bot API, `InlineKeyboardButton.callback_data`: `1-64 bytes`.
- Telegram Bot API, `CallbackQuery`: clients show a progress bar until `answerCallbackQuery` is called.

## grammY middleware order as architecture

grammY treats command and update handlers as middleware in a stack. A middleware can either handle an update or call `next()` to pass it downstream. Kvestarnia's combat lock, presence middleware, and feature modules depend on this ordering.

Recommended project practice:

- keep cross-cutting middleware order explicit in `createBot()`;
- do not hide lock/presence behavior inside individual feature handlers;
- add source-inspection tests when middleware order matters;
- if a helper calls `next()`, always await it;
- avoid a central feature router that recreates pre-0.2.2 coupling.

Source notes:

- grammY middleware docs describe handlers passed to `bot.on()`, `bot.command()`, and siblings as middleware.
- grammY docs explain the middleware stack and that downstream middleware is only invoked if `next()` is called.

## Game-loop backend practice

Kvestarnia is a short-session RPG bot, not a web CRUD app. Refactoring should protect gameplay semantics:

- authoritative server state;
- deterministic RNG where replay or tests need it;
- frozen snapshots for fights, offers, and rewards;
- terminal replay instead of rerolling;
- bounded logs and cooldowns;
- no exact future reward/odds in pre-commit player copy;
- opt-in social actions;
- one active mutable session of each risky kind unless explicitly designed otherwise.

## Telegram UX practice

For a Telegram-first RPG:

- one mobile-screen message per decision;
- buttons for committed actions;
- details on demand;
- edit the active card when the same interaction continues;
- send separate result/follow-up cards when the state materially changes;
- never strand the user behind a spinning callback progress bar;
- do not expose implementation words like “transaction”, “scheduler”, “row”, or “JSON” in player copy.

## Refactoring implication

The right helper is not “a universal bot framework”. It is a tiny project-local callback route helper that makes the safe path boring:

```ts
registerParsedCallbackRoute(bot, /^v1:item:/, {
  parse: parseItemCallbackData,
  onInvalid: presentInvalidCallback,
  handle: handleItemCallback
});
```

The helper should enforce common safety and leave feature ownership local.
