# Kharakternyk Ward Signs QA

Manual Telegram QA status: pending live Telegram smoke. Automated coverage covers reducer, callback data, keyboard visibility, repository idempotency and Big Barrel start handoff.

## Preconditions

- `BIG_BARREL_BROTHER_RAID_ENABLED=true`.
- Local manual-test accounts with Big Barrel eligible characters:
  - one level `8+` `class.kharakternyk` with at least `5` mana;
  - one non-Kharakternyk supporter with at least `3` mana;
  - optionally one additional Kharakternyk supporter.
- Use `/dev_restore_mana` if needed in local non-production QA.

## Lobby Placement

1. Create a Big Barrel Brother recruiting lobby from the Kharakternyk account.
2. Verify the joined Kharakternyk sees `🧿 Поставити знак`.
3. Tap it once and verify:
   - the card shows a count-only ward sign line;
   - mana drops by exactly `5`;
   - the placer does not receive a separate support row.
4. Tap the old placement button again and verify mana does not drop again.
5. Try placement from a non-Kharakternyk account and verify it fails closed with blocker copy.

## Support

1. Join the lobby with a non-Kharakternyk.
2. Tap `✋ Підперти знак` and verify support count increases by one.
3. Confirm the mana spend is deterministic and no more than `3`.
4. Tap duplicate support and verify the support row and mana do not change.
5. If another Kharakternyk joins, support from that account and verify the support costs `0` mana.

## Final Roster

1. Have a supporter support the sign, then leave before start.
2. Start the raid.
3. Verify the active boss state counts only joined final-roster supporters.
4. Repeat with the placer leaving or remorting before start; the sign must not carry into combat.

## Combat And Replay

1. Resolve Big Barrel turns until the first `Бочковий гуркіт`.
2. Verify the ward triggers once, shows prevented damage on the active card, and marks the sign broken.
3. Refresh the active card and replay the journal/result; the broken state must persist.
4. Continue resolving later turns; ordinary attacks and later broad hits must not trigger the same sign again.
