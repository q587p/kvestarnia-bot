# Duel Tournaments QA

Manual Telegram QA status for the implementation pass: not run in Telegram; automated focused coverage added for scoring, rewards, replay-safe claims, duplicate callbacks, period rollover and Latest Events integration.

## Automated Coverage

- Domain scoring covers fixed Kyiv day/week/month windows.
- Domain scoring covers turn-based-only filtering, duplicate duel ids and repeated-opponent downweighting.
- Reward calculation covers daily, weekly and monthly top placement bounds.
- Service coverage confirms duplicate claim callbacks replay the stored claim and do not add gold, items or activity events again.
- Service coverage confirms closed tournament rewards remain claimable after remort by design.
- Service coverage confirms current-period and non-placement claims do not pay.
- Service coverage confirms multiple unclaimed daily/weekly/monthly prize chests are listed inside the bounded lookback and claimed periods disappear.
- Service coverage confirms invalid or stale period keys fail closed without payment.
- Presenter coverage confirms tournament cards omit public loss counts.
- Presenter and keyboard coverage confirms pending prize chests render with Holocene period labels and separate claim buttons.
- Callback, keyboard and presenter coverage confirms `❔ Правила` opens a compact scoring/prize/claim-timing rules card and returns to the current tournament period.
- Presenter coverage confirms visible daily, weekly and monthly tournament period keys use Holocene display dates.
- Duel service, presenter and command coverage confirms combat-style active turn-based cards, active-session journal callbacks are blocked until completion, stored journal pages and targeted rematch invite delivery.
- Latest Events coverage confirms completed quick/turn-based duels render under combat recognition and successful tournament claims are important rows.
- Schema coverage confirms the replay-safe claim table and unique character/period/period-key index.
- Inventory performance follow-up coverage confirms the inventory view model reuses one filter/sort/page result, Mantok Chest auto-select stays equivalent while consuming stack quantities directly, and non-equipment item detail callbacks skip irrelevant equip-preview/craft work.

## Manual Telegram QA

### Must-run release subset

1. Daily rollover: complete a turn-based duel, close/seed the period, claim the previous daily prize chest, and verify the expected gold/items arrive once.
2. Duplicate claim: press the same claim callback again and verify the already-issued copy appears without extra gold/items/Latest Events rows.
3. Quick exclusion: complete a quick duel and verify tournament standings do not change.
4. Active journal absence: during an active turn-based duel, verify the active card has no `📜 Журнал бою`; replay an old journal callback if available and verify it says the journal is after completion without editing the card.
5. Rules card: open `❔ Правила`, verify scoring/prizes/claim timing, then return to the same tournament period.

### Extended checklist

1. Refresh the isolated local bot snapshot with `refresh-local-bot.cmd`.
2. Use two or more test accounts with level 3+ characters.
3. Open Korchma -> `🥊 Бійцівський куток` -> `🏆 Турніри`.
4. Verify daily, weekly and monthly tabs render compact cards.
4a. Open `❔ Правила` and verify it explains scoring, repeated-opponent limits, prize tables and when/how prize chests are claimed.
4b. Verify visible period labels use Holocene years, for example `12026-07`, not `2026-07`.
4c. If rewards are waiting, verify `🥊 Бійцівський куток` marks `🏆 Турніри` with the pending count and the tournament card shows a `🎁 На вас чекають нагороди` block.
5. Complete a turn-based duel and verify the active daily standings update.
5a. During the duel, verify the active card uses compact HP names, natural action lines and the 23-second turn hint.
6. Complete repeated wins against the same opponent and verify points stop growing after the bounded contribution.
7. Complete a quick duel and verify tournament standings do not change.
8. Complete or trigger a training fight and verify tournament standings do not change.
9. After a daily rollover, claim the previous daily prize chest and verify gold plus the matching medical manatky are received once.
10. Press the same claim callback repeatedly and verify the card says the chest was already issued with no resource duplication.
11. Seed or keep several unclaimed daily/weekly/monthly closed periods inside lookback and verify each chest can be claimed independently from the tournament screen.
12. Press stale tournament cards from outside the lookback or with invalid period keys and verify they fail closed without claiming the wrong visible period.
13. Repeat rollover/claim checks for weekly and monthly periods when practical with seeded clock/data or a local DB snapshot.
14. Open `📜 Хроніки Квестарні` -> `⚔️ Бої` and verify completed quick and turn-based duel rows appear as neutral duel-completion records.
15. Open `📜 Хроніки Квестарні` -> `⭐ Важливе` and verify successful daily/weekly/monthly tournament reward claims appear there once per fresh chest, while tournament losses do not create public rows.
16. During an active turn-based duel, verify an old or forged journal callback answers that the journal is available after completion and does not edit the active card.
17. Open `📜 Журнал бою` from a turn-based result and verify the stored round replay does not mutate duel state.
18. Press `🔁 Реванш` from a result and verify the other participant receives the targeted invite card.
19. Open `Манатки`, change filter, sort and page, and verify the card/keyboard text stays unchanged while slow logs include route, item count, filter/sort/page and timing fields only when the callback is slow.
20. Open a non-equipment item detail and verify the visible item card is unchanged and no unnecessary equip-preview behavior appears.
21. Open `♻️ До Дружньої Скрині`, try auto-pick plus manual add/remove/page/preview/confirm, and verify selected quantities and output behavior match the previous rules.
22. Open `✨ Чароковальня`, page/sort the list and preview an item, verifying the list remains responsive and the visible controls are unchanged.

## Known Manual Gap

Full Telegram rollover QA remains pending because the implementation pass did not refresh or run the isolated local bot snapshot.
