---
name: kvestarnia-review-followup
description: Use after an independent Codex review to address blockers, important issues, edge cases, and missing tests for the current Kvestarnia PR without expanding scope.
---

# Kvestarnia Review Follow-up

Use this skill only after a second Codex or human review has produced actionable findings for an existing PR or branch.

The main Codex owns implementation.

## Inputs

Accept a compact input block:

```text
PR: #<number>
Branch: <branch-name>
Base: main
Version task: docs/tasks/<version>-<short-slug>.md
Review findings: <paste blockers, important issues, missing tests, and key edge cases>
```

Optional:

```text
Extra focus: <narrow area>
```

If PR, branch, base, or task doc is missing, infer it only when it can be verified safely. Otherwise report the missing context before making risky changes.

## Core workflow

1. Verify the live PR base/head and the current branch before editing.
2. Read only:
   - the relevant review findings;
   - the linked version task;
   - changed files;
   - direct dependencies needed to verify correctness;
   - existing focused tests.
3. Group findings by severity.
4. Fix blockers first.
5. Fix important issues next.
6. Fix minor issues only when they are low-risk, in scope, and do not distract from correctness.
7. Preserve the original version-task scope.
8. Add or update automated tests required by the review.
9. Run focused tests first, then broader checks when useful.
10. Re-read the review and verify every actionable finding is either fixed or explicitly deferred with a reason.
11. End with a compact PR-ready summary.

## Review severity budget

### Blockers

MUST fix before the PR can be called ready.

Examples:
- data loss;
- duplicate rewards or spending;
- broken transactions;
- race conditions that corrupt state;
- security or privacy regressions;
- migration or schema failures;
- broken core player flow;
- incorrect release behavior.

Do not defer a blocker unless the finding is invalid. If invalid, explain with evidence.

### Important issues

SHOULD fix in the current PR.

May be deferred only when:
- the fix would expand the agreed task scope materially;
- the review finding depends on a separate product decision;
- the proposed fix is riskier than the current issue;
- the issue is already tracked in an explicit follow-up task.

Every deferred important issue must include:
- why it is deferred;
- the concrete risk;
- the recommended follow-up;
- where it is tracked.

### Minor issues / polish

Fix only when:
- the change is small;
- the change is clearly in scope;
- it does not require unrelated refactoring;
- it does not delay blocker or important fixes.

Otherwise list it under remaining findings.

### Looks good / notes

Do not change code merely because the review mentioned something positively.

## Automated test requirement

Automated tests recommended by the review are part of the follow-up task, not optional commentary.

For every blocker or important issue, do one of the following:

1. Add or update an automated regression test that fails before the fix and passes after it; or
2. Explain why an automated test is technically impractical, then add the strongest available lower-level or integration coverage and list the remaining manual QA.

Do not silently skip suggested tests.

Default expectations:
- unit tests for pure domain logic and formulas;
- service/repository tests for transactions, persistence, idempotency, rewards, inventory, remort, and session state;
- integration tests for Prisma/database behavior;
- command/callback tests for Telegram flows;
- presenter tests for stable critical player-facing output;
- duplicate-click and stale-callback tests for mutating callbacks;
- concurrency or compare-and-swap tests for race-condition fixes;
- restart/replay tests when persistence or scheduler behavior is involved.

If the review explicitly recommends a test, track it in the final response as:
- added;
- updated;
- covered by an existing test, with exact test reference;
- deferred with explicit technical justification.

## Kvestarnia risk focus

Check the applicable areas:

- Telegram commands and callbacks;
- duplicate messages and duplicate callback presses;
- stale callback payloads;
- player, character, session, fight, raid, and remort consistency;
- idempotent rewards, progress, spending, crafting, inventory, and achievements;
- concurrent players and race conditions;
- transaction boundaries and replay safety;
- restart/redeploy behavior;
- local runtime versus production behavior;
- Ukrainian player-facing copy and dynamic grammar;
- release/task/changelog/news surfaces when visible behavior changes.

Use additional skills only when materially useful:

- `$kvestarnia-telegram-qa` for a full QA matrix or high-risk Telegram flows;
- `$balance-review` for combat, loot, progression, cooldown, raid, or economy changes;
- `$ukrainian-rpg-content` for substantial Ukrainian player-facing copy;
- `$kvestarnia-local-runtime` for local launcher, Prisma/SQLite, or Windows process-lock issues.

## Scope constraints

Do not:
- start another feature;
- perform unrelated refactoring;
- rewrite architecture unless required by a blocker;
- run a global formatter;
- change lockfiles, schemas, migrations, config, generated files, or snapshots unless required by a finding;
- create a second alternative implementation;
- hide unresolved findings;
- write a tutorial in the final response.

Use a minimal, reviewable diff.

## Done criteria

The follow-up is complete only when:

- every blocker is fixed or disproved with evidence;
- every important issue is fixed or explicitly deferred with justification;
- automated tests recommended by the review are added, updated, mapped to existing coverage, or explicitly justified as impractical;
- focused tests pass, or blockers are reported;
- manual Telegram QA is updated when behavior changed;
- release/task/docs surfaces are updated when required;
- the PR diff remains within scope;
- the final response lists any remaining findings honestly.

## Final output

- Findings addressed
- Automated tests added/updated
- Tests/checks run
- Remaining findings and explicit deferrals
- Changed files
- Risks / follow-ups
- Completion status

No tutorial.
