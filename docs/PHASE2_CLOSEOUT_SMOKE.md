# Phase 2 Closeout Smoke

This checklist proves that the shipped Phase 2 Social Combat MVP remains coherent after `0.1.24` and before the `0.1.25` closeout release.

## Goal

Verify there are no duplicate rewards, broken combat leases, presence leaks, stale callback mutations or cross-mode drink-power leaks.

## Scope

- Current `main` after `0.1.24`.
- Two normal characters plus one remorted fixture where available.
- Quick duel, turn-based duel, nearby targeting, rematch and share.
- Solo fight, passage preview memory, survivor re-attack and terminal settlement.
- Shynok self-drinks, rounds, sales and combat isolation.
- Remort and active-combat boundaries.
- Stale and duplicate callbacks.

## Automated Gate

Run:

```bash
npm run db:validate
npm run lint
npm run typecheck
npm run build
npm test
npm run check
git diff --check
```

Focused suites should cover duel challenge/session repositories and services, combat timeout scheduler, fight/training services, presence routing and nearby duel targets, remort service, Shynok domain/repository/service, reward replay and stale callback integration.

## Two-Player Manual Smoke

### Onboarding / Phase 1 Regression

- [ ] New character reaches first item.
- [ ] `/hero`, inventory and equipment agree on effective stats.
- [ ] Level 3+ ordinary fight can win, lose and flee.
- [ ] Terminal result replay does not duplicate rewards.

### Presence And Targeting

- [ ] Both players in the same location see a valid nearby interaction.
- [ ] Moving one player invalidates a stale target safely.
- [ ] Public presence does not reveal exact sensitive location.

### Quick Duel

- [ ] Create a deep-link invite.
- [ ] Accept, decline, cancel and expire.
- [ ] Resolve once.
- [ ] Repeat old buttons.
- [ ] Rematch preserves participants and mode.
- [ ] Share card stays stable after later character changes.

### Turn-Based Duel

- [ ] Both players accept and receive private actionable cards.
- [ ] Hidden choices reveal only after both choices or timeout.
- [ ] Duplicate same-round callback records one choice.
- [ ] Callback-vs-timeout race has one winner.
- [ ] Surrender, timeout and terminal XP grant once.
- [ ] Group/shared view is spectator-safe.
- [ ] Both active leases release at terminal state.

### Solo / Training Combat

- [ ] Combat lock redirects incompatible navigation.
- [ ] Timeout recovery reaches canonical active or terminal card.
- [ ] Nyz preview stays sticky.
- [ ] Survivor re-attack keeps monster identity and HP as designed.
- [ ] Training remains XP-only and excluded from ordinary quest progress.

### Remort

- [ ] Unsupported active duel blocks remort without mutation.
- [ ] Supported solo/training remort path forfeits old-life settlement safely.
- [ ] New-life HP/mana is not overwritten by old-session recovery.
- [ ] Memorial board shows current and historic life rows correctly.

### Shynok Cross-Mode

- [ ] Drink effects do not enter either duel mode or training/starter fights.
- [ ] Round offers and sales are idempotent.
- [ ] Active combat and raid locks are respected.

## Shynok Manual QA

Use at least two characters, ideally a third remorted fixture.

### Entry And Gates

- [ ] `🍻 Шинок` opens from the correct korchma interior.
- [ ] Wrong-place stale button returns to the correct current surface without moving presence incorrectly.
- [ ] Active combat blocks new drink/round/sale mutations and returns canonical combat state.
- [ ] Pending Barrel raid gate behaves as documented.
- [ ] `👀 Хто поруч` remains location-scoped.

### Self Drinks

- [ ] Open all four drink previews; price/effect/duration copy is understandable.
- [ ] Confirm spends gold once.
- [ ] Repeat confirm from history: no second spend or new duration.
- [ ] Insufficient gold: no drink and no mutation.
- [ ] Replacing a timed drink shows a warning.
- [ ] Recovery accrued under the old drink is settled before replacement.
- [ ] Tea/beer recovery is forward-only, not retroactive.
- [ ] Expired order asks for a fresh preview.
- [ ] Multiple stale preview buttons cannot overwrite a later confirmed drink.

### Combat Isolation

- [ ] Beer penalty is frozen into a newly started ordinary eligible PvE fight.
- [ ] Reopening/replaying that fight preserves the same modifier.
- [ ] Pepper vodka is consumed by the first eligible ordinary PvE start.
- [ ] Repeat attack/start callbacks do not consume or apply it twice.
- [ ] Restart after fight creation cannot leave the same queued vodka available for another fight.
- [ ] Quick duel receives no drink power.
- [ ] Turn-based duel receives no drink power.
- [ ] Starter fight receives no drink power.
- [ ] Training doppelganger receives no drink power.
- [ ] Successful remort behavior for active and queued drinks is defined and tested.

### `Всім пива`

- [ ] Preview shows frozen tier, price and recipient count.
- [ ] Changing presence after preview does not silently change stored price/recipients.
- [ ] Confirm spends once and records generosity once.
- [ ] Repeat confirm replays.
- [ ] Recipient sees an opt-in offer, not an automatic drink.
- [ ] Accept replaces current drink once and settles old recovery correctly.
- [ ] Repeat accept does not extend or replace again.
- [ ] Decline once; repeat decline replays.
- [ ] Expired offer cannot apply a drink.
- [ ] Multiple offers are distinguishable enough to choose safely.
- [ ] Buyer does not receive unintended duplicate recipient state.

### Sell Manatky

- [ ] Only eligible known, priced, unequipped, unreserved and unprotected items appear.
- [ ] Add/remove one unit.
- [ ] Select several and `Усе придатне`.
- [ ] Pagination keeps selection.
- [ ] Payout is basket-level 42%, floored once.
- [ ] Zero payout cannot confirm.
- [ ] Equip or consume a selected item before confirm: stale-selection, no mutation.
- [ ] Start another sale/chest/barter reservation: competing operation cannot double-consume.
- [ ] Valid confirm moves items/gold once.
- [ ] Repeat confirm replays exact result.
- [ ] Cancel and expiry leave inventory unchanged.

### Memorial Board

- [ ] Open several `Реморт N` details.
- [ ] Historic lives shown at level 13 do not vanish from intermediate level rows.
- [ ] Explicit recorded milestones win over inferred/backfilled rows.
- [ ] No duplicate character-level row appears.

## Production Deploy Smoke

### Before Deploy

- [ ] Exact-head CI successful.
- [ ] Migration file reviewed.
- [ ] Current database backup/restore point available.
- [ ] Environment/secrets unchanged unless explicitly required.
- [ ] Release date/version surfaces match Kyiv date.
- [ ] Rollback decision is known: code rollback alone may not undo schema; prefer forward fix unless the runbook says otherwise.

### Deploy

- [ ] Apply Prisma migration.
- [ ] Start runtime.
- [ ] No migration/startup error.
- [ ] `/health` green.
- [ ] `/version` correct.
- [ ] `/news` current.
- [ ] Homepage/health server responds.

### Smoke

- [ ] Existing character loads.
- [ ] New onboarding still works.
- [ ] Ordinary fight starts/resumes.
- [ ] Quick and turn-based duel entry works.
- [ ] Shynok opens.
- [ ] One cheap self-drink confirm/replay.
- [ ] One safe sale in a test fixture or dry production account.
- [ ] Round flow with two controlled accounts where safe.
- [ ] Remort memorial board opens.
- [ ] Logs show no repeated mutation/repository errors.

### After Deploy

- [ ] Record deployed commit, version and migration.
- [ ] Record smoke result.
- [ ] File non-blocking issues with feature slugs.
- [ ] Do not start a new feature until the blocker window is clear and the regression smoke is recorded.

## Output Matrix

| Flow | Pass/Fail | Evidence | Bug/task |
|---|---|---|---|

Closeout passes only if every duplicate-reward, lease, migration, crash-recovery and privacy row passes. Only P0/P1 issues block closeout. Everything else gets a named deferred task.
