# PR #179: refreshed release assessment

Initial audit head: `af56de0d9256212d22af9a8d265721c9144fd54d`.

Refreshed live head: `e223073a65b96a293ca40ed8e6f14e4bef1b930d`.
Refresh live metadata again before implementation or merge.

Independent focused re-audit on a clean `e223073a` archive passed 7 files / 102
tests (13 command/delivery unit, 74 raid-chat/session/remort integration and 15
gate/runtime unit tests). Residual findings below are static/test-gap findings,
not failures hidden by a red suite.

## Fixed/hardened in e223073a

### Revision and privacy-redaction acknowledgement

`markDeliveryRendered` now parks only when redaction is false and the desired
revision is not newer than the rendered snapshot. Otherwise it advances only the
known rendered revision and leaves newer/redaction work due.

`markDeliveryRedacted` now carries expected revision/reference identity. Focused
repository tests cover a newer revision and a superseded reference. Keep these as
permanent regressions.

### Same-life rejoin identity

The joined event source key now includes the claimed PartySession version and
life. Rejoin updates `joinedAt`; integration tests prove two real same-life join
events and re-armed delivery state.

### Initial-send Telegram failure classes (partial)

The delivery path recognizes `message is not modified`, retries `429`, mocked
5xx and selected network strings, and parks permanent/unclassified initial send
failures. Tests cover exact `429`, mocked 500 backoff and permanent 400
peer-invalid behavior. The remaining real-error gaps are listed below.

### Disabled lifecycle cleanup

Revoke/composer cancellation/terminal retention work no longer depends entirely
on fresh event append being enabled. Remort integration coverage was expanded.

## Remaining merge blockers

### 1. Idle scheduler still polls every 1.1 seconds

`src/bot/partyRaidChatDeliveryScheduler.ts:16,53–54,71–73` still creates an
unconditional interval and calls disabled-redaction preparation, retention
cleanup and due scan. With no rows this is at least four SQL statements per tick,
roughly 3.6 statements/s on the small hosted baseline, including while chat is
default-off.

Required fix: adaptive/event-driven active cadence plus a documented infrequent
bounded recovery/retention sweep. Required fake-timer test: empty/disabled query
call count does not grow every 1.1 seconds.

### 2. Stop is synchronous and does not drain active work

`partyRaidChatDeliveryScheduler.ts:28,56–61` returns `stop(): void` and only clears
the interval. `createRuntime.ts:97–114` does not await this scheduler, so an active
tick/gate can continue DB/Telegram work after Prisma disconnect begins.

Required fix: async close/drain or bounded safe-boundary abort; no queued work
starts afterward; runtime awaits it. Test with a deferred Telegram operation.

### 3. Callback acknowledgement is still message-throttled

`src/bot/commands/partyRaidChatCommand.ts:236–240` still sends
`safeAnswerCallbackQuery` through the per-chat message gate. Callback answers are
not chat messages; prompt/card sends need spacing, acknowledgements do not.

Required fix/test: callback ack is immediate while sends remain gated.

### 4. Failure classification is incomplete for real Telegram errors

Existing-card edit/redaction uses `isPermanentPartyCardEditError`, which does not
recognize Telegram 403. A blocked/forbidden edit falls into the outer retry loop
indefinitely. Conversely, grammY 1.43 `HttpError.message` uses
`Network request for '<method>' failed!`; the new initial-send classifier does not
match that phrase and can park a transient network failure as permanent.

Required tests/fix:

- 403 send/edit/redaction reaches an explicit non-due permanent state;
- a real-shaped grammY `HttpError` network request takes bounded retry;
- retain exact 429 and 5xx/network tests.

## Merge decision

Do not merge until the four live-head blockers are fixed, focused tests and full
check are green, migration/restore evidence is recorded and manual 2–3-account
Telegram QA is run. The default-off flag does not neutralize the idle cost because
the scheduler is constructed and cleanup still runs while disabled.
