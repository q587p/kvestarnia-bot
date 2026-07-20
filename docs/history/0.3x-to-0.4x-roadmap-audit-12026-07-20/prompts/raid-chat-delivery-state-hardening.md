# Raid chat scheduler closeout

```text
Use $kvestarnia-version-task.

Task:
Close the remaining scheduler/lifecycle blockers on the live Big Barrel Raid Chat
PR #179 without reopening already-hardened delivery semantics.

Preflight:
- Fetch live PR #179 metadata and exact base/head. The refreshed audit observed
  e223073a65b96a293ca40ed8e6f14e4bef1b930d; do not assume it is still live.
- Work on that PR branch only. Revalidate findings against any newer head.
- Preserve the e223073a revision/redaction CAS, transition-unique same-life
  rejoin, message-not-modified, permanent send and transient/429 behavior/tests.
- Keep version 0.3.15, schema, player copy, gameplay and rewards unchanged.
- Follow AGENTS.md and docs/ai/context.md. Use a minimal diff.

Remaining required fixes:
1. Replace unconditional setInterval(1_100) idle polling. Use adaptive/event-
   driven active wake behavior and only a documented infrequent bounded startup/
   recovery/retention sweep. Feature-off redaction and crash recovery must remain.
2. Make scheduler stop async and wait for the active tick/gate to a safe boundary.
   Start no queued operation after close; createRuntime must await it before Prisma
   disconnect.
3. Let answerCallbackQuery bypass the per-chat message throttle while prompt/card
   sends retain their spacing.
4. Complete Telegram failure classification: 403/forbidden during send, edit or
   redaction is permanent/non-due; a real grammY HttpError with `Network request
   for '<method>' failed!` is retryable with bounded backoff. Keep exact 429.

Required proof:
- Fake-timer/query-call-count tests: disabled and empty state do not run repository
  work every 1.1 seconds; dirty/due work wakes promptly; recovery/retention remains
  bounded and eventually runs.
- Deferred-operation shutdown test: stop does not resolve too early, no queued
  operation starts after close, runtime disconnect ordering is safe.
- Callback test: acknowledgement is immediate while message sends remain gated.
- Retain the join/rejoin, newer-revision and superseded-redaction CAS regressions.
- Add explicit 403 send/edit/redaction and real-shaped grammY HttpError network
  regressions; retain exact 429 and 5xx tests.
- Run focused raid-chat/party/remort/runtime tests, Big Barrel regressions,
  npm run check and git diff --check. Record manual QA as pending unless run.

Do not merge or deploy.

Final output:
- findings addressed
- changed files
- tests run
- remaining risks / manual QA
- completion status

No tutorial.
```
