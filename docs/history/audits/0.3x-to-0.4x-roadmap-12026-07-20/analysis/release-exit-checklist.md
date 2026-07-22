# 0.3.x release-exit checklist

## PR 0.3.15

- [x] Live head refreshed to `e223073a`; hardening delta re-audited.
- [x] Newer revision vs stale ack repository regression exists.
- [x] Revoke/redaction vs stale render ack repository regression exists.
- [ ] Exact combined leave/rejoin vs in-flight stale redaction race green (pieces
  are covered separately at `e223073a`).
- [ ] Idle/disabled scheduler query-count bounded.
- [x] Initial 429/500/permanent-400 tests exist.
- [ ] 403 send/edit/redaction permanent regression green.
- [ ] Real-shaped grammY `HttpError` network-request retry regression green.
- [ ] Async scheduler stop/drain green.
- [ ] Callback acknowledgement bypasses message throttle.
- [ ] Migration/restore and full automated checks green.
- [ ] 2–3-account Telegram QA recorded.

## 0.3.16 lifecycle

- [ ] Leader/nonleader restart blocked transactionally in active PartyBoss.
- [ ] Delete/resolve race cannot create ghost/orphan state.
- [ ] Multi-actor remort policy explicit and tested.
- [ ] Strict PartyBoss parser/repair and orphan scan.
- [ ] Sated + Inspiration release parity.
- [ ] One corrupt row does not block healthy scheduler work.
- [ ] Final-slot join and last-action/timeout races.
- [ ] Support abilities fixed+simulated or rollout disabled with owner.

## Operations/product truth

- [ ] Exact SHA/version/deploy/migrations/backup recorded.
- [ ] Every default-off feature has target flag evidence and decision.
- [ ] Automated vs manual QA separated.
- [ ] Kill-switch owner and rollback steps recorded.
- [ ] Privacy-safe product/social aggregate report.
- [ ] Feedback path decision.
- [ ] Admin allowlist implement/defer/retire decision.
- [ ] Production observation window recorded.

## Documentation

- [ ] README/roadmap/product/design/architecture/tasks/context agree.
- [ ] `docs/ai/context.md` under 250 lines.
- [ ] Old drafts labeled superseded/deferred, not active.
- [ ] Relative links and `git diff --check` pass.
- [ ] No unknown rollout/manual evidence converted to PASS.

Only after these gates should the implementation line move to `0.4.0`.
