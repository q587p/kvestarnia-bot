# Duel Tournaments QA

Manual Telegram QA status for the implementation pass: not run in Telegram; automated focused coverage added for scoring, rewards, replay-safe claims, duplicate callbacks, period rollover and Latest Events integration.

## Automated Coverage

- Domain scoring covers fixed Kyiv day/week/month windows.
- Domain scoring covers turn-based-only filtering, duplicate duel ids and repeated-opponent downweighting.
- Reward calculation covers daily, weekly and monthly top placement bounds.
- Service coverage confirms duplicate claim callbacks replay the stored claim and do not add gold, items or activity events again.
- Service coverage confirms current-period and non-placement claims do not pay.
- Presenter coverage confirms tournament cards omit public loss counts.
- Latest Events coverage confirms tournament claim rows render as combat recognition.
- Schema coverage confirms the replay-safe claim table and unique character/period/period-key index.

## Manual Telegram QA

1. Refresh the isolated local bot snapshot with `refresh-local-bot.cmd`.
2. Use two or more test accounts with level 3+ characters.
3. Open Korchma -> `🥊 Бійцівський куток` -> `🎖️ Турніри`.
4. Verify daily, weekly and monthly tabs render compact cards.
5. Complete a turn-based duel and verify the active daily standings update.
6. Complete repeated wins against the same opponent and verify points stop growing after the bounded contribution.
7. Complete a quick duel and verify tournament standings do not change.
8. Complete or trigger a training fight and verify tournament standings do not change.
9. After a daily rollover, claim the previous daily prize and verify gold plus bandage are received once.
10. Press the same claim callback repeatedly and verify the card says the prize was already issued with no resource duplication.
11. Press stale tournament cards from an older period and verify they do not claim the wrong visible period.
12. Repeat rollover/claim checks for weekly and monthly periods when practical with seeded clock/data or a local DB snapshot.
13. Open `📜 Хроніки Квестарні` and verify one tournament claim event appears.
14. Verify no public event appears for tournament losses.

## Known Manual Gap

Full Telegram rollover QA remains pending because the implementation pass did not refresh or run the isolated local bot snapshot.
