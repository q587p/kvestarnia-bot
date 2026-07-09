# Kharakternyk Ward Signs QA

Manual Telegram QA status: pending live Telegram smoke. Automated coverage covers reducer, callback data, keyboard visibility, repository idempotency and Big Barrel start handoff.

## Preconditions

- `BIG_BARREL_BROTHER_RAID_ENABLED=true`.
- Local manual-test accounts with Big Barrel eligible characters:
  - one level `8+` `class.kharakternyk` with at least `13` mana;
  - one non-Kharakternyk supporter with at least `8` mana;
  - optionally one additional Kharakternyk supporter.
- Use `/dev_restore_mana` if needed in local non-production QA.

## Lobby Placement

1. Create a Big Barrel Brother recruiting lobby from the Kharakternyk account.
2. Verify the joined Kharakternyk sees `🧿 Поставити знак`.
3. Tap it once and verify:
   - the card shows a count-only ward sign line;
   - the actor receives a separate confirmation with `💫 Мани витрачено`;
   - mana drops by the deterministic placement cost (`8..11`, from the base `13` discounted by effective Intelligence plus Luck);
   - the placer does not receive a separate support row.
4. Tap the old placement button again and verify mana does not drop again.
5. Try placement from a non-Kharakternyk account and verify it fails closed with blocker copy.

## Placement Race

1. Join the same Big Barrel Brother recruiting lobby with two level `3+` Kharakternyk accounts that each have at least `13` mana.
2. Have both accounts tap `🧿 Поставити знак` as close together as possible.
3. Verify exactly one card shows the sign as placed and the other account receives clear no-mutation copy such as `Знак уже стоїть біля бочки.`.
4. Verify only the winning Kharakternyk spent the deterministic placement cost; the losing Kharakternyk's mana did not change.
5. Refresh the lobby and verify there is one count-only sign line, not two signs or signer names.
6. Join with a supporter, tap `✋ Підперти знак`, and verify the support count attaches to the winning sign and duplicate support still does not spend twice.

## Support

1. Join the lobby with a non-Kharakternyk.
2. Tap `✋ Підперти знак` and verify support count increases by one.
3. Confirm the separate support confirmation shows `💫 Мани витрачено`, and the mana spend is deterministic in the `5..8` range and may be lower with stronger effective Intelligence plus Luck.
4. Double-tap `✋ Підперти знак` quickly and verify:
   - exactly one support is recorded for that participant;
   - mana drops only once;
   - the duplicate callback copy says the support already holds the sign;
   - the support count remains one for that participant.
5. Support from another participant and verify the support count increases separately.
6. If another Kharakternyk joins, support from that account and verify it uses the same deterministic support-cost range, not a free class exception.

## Final Roster

1. Have a supporter support the sign, then leave before start.
2. Start the raid.
3. Verify the active boss state counts only joined final-roster supporters.
4. Repeat with the placer leaving or remorting before start; the sign must not carry into combat.

## Combat And Replay

1. Resolve Big Barrel turns until the first `Бочковий гуркіт`.
2. With no supports, verify the ward triggers once, shows prevented damage on the active card/journal, then marks the sign fully broken.
3. With supports, verify each broad-hit activation reduces the visible `Підпор: N/7` count by one and keeps the sign carried until the last support is spent.
4. On the final supported activation, verify the active card says the sign fully cracked and recent actions say no supports remain.
5. Refresh the active card and replay the journal/result; the carried/broken state and remaining supports must persist.
6. Continue resolving later turns after the final activation; ordinary attacks and later broad hits must not trigger the same sign again.
