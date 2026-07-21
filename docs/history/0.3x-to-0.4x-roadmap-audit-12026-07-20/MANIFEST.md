# Manifest

## Audit scope

- README, product brief, roadmap, game design, technical plan and doc indexes.
- `CHANGELOG.md`, version task history and old `0.2.x` / `0.3.x` drafts.
- Current source/schema/tests for party, PartyBoss, restart/remort, abilities,
  schedulers, telemetry and feature flags.
- Live GitHub state available during the audit: open PRs/issues and PR #179 tree.

## Base state

- Main SHA: `d101867cd80f9c05505899ac7b42adf92e369527`.
- Initial PR #179 audit head: `af56de0d9256212d22af9a8d265721c9144fd54d`.
- Refreshed live PR #179 head: `e223073a65b96a293ca40ed8e6f14e4bef1b930d`.
- Proposed patch generated from the PR-head worktree, not committed or pushed.

Before integration, refresh live GitHub state. If either head moved, reconcile the
documents rather than forcing stale hunks. Unknown production flags/manual QA
must remain unknown until target-environment evidence exists.

## Proposed repository delta

- Rewrites the product roadmap into a current concise sequence.
- Corrects README/product/game-design/technical-plan current-state claims.
- Adds party-combat architecture, guild/party design and release-state ledger.
- Adds `0.3.16` and `0.4.0`–`0.4.5` task docs.
- Preserves PR #179 CAS/rejoin/failure regressions and adds the remaining
  idle-cadence, graceful-stop, callback-ack and exact combined-race gates.
- Updates task/design/architecture/operations indexes and compact AI context.
- Changes documentation only; no runtime/schema/package/test file is included.

## Verification expectations

- Apply `PATCH.diff` first; use `repo-files/` as conflict/fallback source.
- Check every relative Markdown link.
- Keep `docs/ai/context.md` under 250 lines.
- Run `git diff --check` and review `git diff --stat`.
- Do not bump version/changelog/news for docs-only integration.
