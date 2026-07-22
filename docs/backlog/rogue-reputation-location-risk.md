# Deferred: Rogue Reputation and Location Exposure

Status: optional later `0.2.x` slice; no version assigned

## Why deferred

`0.2.25` ships bounded Rogue pickpocketing as a private, gold-only action with no public shame feed. That keeps the MVP small, but Rogue actions should eventually have a broader social cost: repeated theft should affect reputation, especially where the Korchma has witnesses.

## Desired direction

Rogue actions should be able to lower reputation when they are suspicious, noticed or harmful. The penalty should depend on how visible the location is:

- Public Korchma surfaces should be riskier: hall, quest table, Shynok, board, busy corners and other places with many eyes.
- Looser or rougher spaces should be safer: Nyz, passages, yard/outside edges and similar places where fewer people are watching or where trouble is expected.
- Private or hidden spaces should still be server-checked; "fewer eyes" must not become a free abuse route.

## Candidate behavior

- Add a durable reputation ledger or extend an existing character/social ledger, rather than deriving reputation from missing history.
- Apply reputation loss after resolved Rogue actions, with bigger hits for noticed success, noticed failure and caught-badly outcomes.
- Scale the hit by location exposure:
  - high exposure: public Korchma rooms and social hubs;
  - medium exposure: ordinary Korchma side spaces;
  - low exposure: Nyz, passages, yard/outside edges and other low-witness spaces.
- Show player-facing copy that the reputation loss came from being seen or becoming a rumor, not from hidden exact odds.
- Keep exact reputation math out of pre-commit choice copy.

## Non-goals

- No broad justice/guard system in the first pass.
- No public shame feed unless a separate explicit social-feed task asks for it.
- No item theft or expanded Rogue reward scope.
- No automatic PvP retaliation.
- No reputation loss for duplicate replay callbacks.

## Acceptance ideas

- Reputation changes are durable, replay-safe and tested at repository/service level.
- Duplicate Rogue callbacks replay the original result without applying reputation loss again.
- Location exposure is computed from canonical/normalized location ids, not from display text.
- Public locations produce visibly stronger reputation consequences than Nyz/passages/yard-style locations.
- Remort/reset behavior is explicit: either reputation resets with the character life or intentionally persists as player-level history, with tests and task-doc wording.
