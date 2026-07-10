# Playtesting поточного loop після `0.1.0`

Цей документ — ручний smoke test для playable Phase 1 loop Квестарні після `0.1.0`. Він не описує весь майбутній дизайн; він допомагає швидко перевірити, що поточні кнопки, нагороди, кулдауни й присутність поводяться очікувано.

Для технічного запуску дивись [`docs/operations/developer-setup.md`](./developer-setup.md).

## 0.3.4 — Quest Overview Route smoke

1. New character outside Korchma: press `🗺️ Квести` or `/quest`; verify the compact overview opens, not `Квести видають усередині.`, and `Перший крок до столу` appears as 0/2.
2. Press `🚪 Зайти в корчму`, then reopen `🗺️ Квести`; verify `Перший крок до столу` appears as 1/2, points to Столу зі справами, and does not complete in the hall.
3. Press `📋 До столу зі справами`; verify normal place movement opens the old `📋 Стіл зі справами` card, presence moves only on that route, the first route quest completes once with its small XP line, and duplicate table refreshes do not pay again.
4. After that completion, press `🗺️ Квести`; verify `Підозріла шаурма` and `Новачкова сутичка` appear with `Зроблено`, `Далі`, and `Де` lines, but still only one inline button: `📋 До столу зі справами`.
5. Complete `Підозріла шаурма` and `Новачкова сутичка`, then press `🗺️ Квести`; verify `Льохова справа` appears with `Зроблено`, `Далі`, and `Де` lines.
6. Open `Льохова справа` and its `💡 Підказка`; verify the method keyboard shows 4 current-character options, not all possible cellar options.
7. Complete `Льохова справа`, wait/reset past its cooldown, then press `🗺️ Квести`; verify it says `не перший спуск` and tells the player to try the cellar again.
8. High-level character with regular `Три справи` ready: press `🗺️ Квести`; verify `🪧 Три справи на найближчий час` appears with `Зроблено`, `Далі`, and `Де` guidance.
9. Level 4+ character with `Справа не до миші` offered or paused after a roleplay attempt: press `🗺️ Квести`; verify the row appears and names the current stage.
10. Level 4+ character holding the grownup cellar bottle: press `🗺️ Квести`; verify `Справа не до миші` appears as claimable and points to Shynok turn-in.
11. High-level character with Charkokovalnia unlock pending and no field kit: press `🗺️ Квести`; verify `Доступ до Чароковальні` says the elf-mage asked for `Польова аптечка` and points toward the Yeger hint.
12. High-level character with Charkokovalnia unlock pending and a field kit in the bag: press `🗺️ Квести`; verify the same row points back to Charkokovalnia turn-in, and the route buttons `Доступ до Чароковальні`, `Надвір`, `У задвірок`, and `Чароковальня` show `✅` instead of `⚠️`.
13. High-level character with completed starter quests: press `🗺️ Квести`; verify starter shawarma/fight rows are absent.
14. Character with no active/taken quests after starter follow-ups are completed/retired: verify the compact empty state points to `Стіл зі справами`.
15. Active Daily Korchma Round at 1/2: verify progress, done-scene text, next-step text and location/turn-in hints.
16. Daily Korchma Round at 2/2 turn-in-ready: verify the row appears as claimable and explains where to turn in.
17. Problem Quest in progress: verify the row appears with progress and turn-in guidance, including prose casing `спуск до Низу`; completed/reward-claimed Problem Quest disappears.
18. Yeger not started: verify no row; Yeger in progress / claimable: verify the row appears with єгерський куток guidance and no direct `До Єгеря` button.
19. Barrel Beer Tutorial completed, retired or merely available: verify no row; in progress / ready to turn in still appears with text-only table, Бочка, шинок or table turn-in guidance.
20. From the full Quest Hub, open the available Barrel Beer Tutorial paper; verify it shows a preview/confirmation card, does not grant the stipend or mark the quest accepted yet, and only `🛢️ Взяти записку` grants the accepted result with the 39-gold received line.
21. Buy a Shynok beer round for a nearby recipient; verify the buyer's card first changes to `Корчмар поставив кухлі`, then the recipient receives the separate beer offer with `Випити`.
22. Before accepting or declining that live offer, reopen Shynok; verify `🍺 Вам пиво!` appears next to `🍹 Напої для себе`, opens the same offer card, and does not drink or decline until an explicit offer button is pressed.
23. After drinking the tutorial beer while another Shynok/table affair remains available, return to the hall; verify `📋 Стіл зі справами ✅` is shown instead of `📋 Стіл зі справами ⚠️`.
24. On a level 4+ character, complete representative Adventure, Daily Korchma Round, Yeger, problem, Hunt Board, cellar mouse, grownup cellar and Charkokovalnia unlock claims; when `Іскрокамінь` appears, verify the fresh result card shows it once, the replayed result card shows the same stored grant, the inventory quantity increased by the shown amount, and replaying the same claim does not reroll or duplicate it. Verify level 3 quest turn-ins do not receive this bonus.
25. Verify ordinary combat rewards still use their existing loot/bandage/Iskrokamin replacement behavior and are not treated as quest turn-ins by this bonus.
26. While active solo combat, active turn-based duel, active/pending Big Barrel or active passage search exists, press `🗺️ Квести` and old `v1:quest:overview`; verify existing blockers win.
27. Verify the overview keyboard contains only `📋 До столу зі справами`; it should not duplicate the main keyboard's `Квести`, refresh, or `До зали` routes and should still have no `До обходу`, `До Трьох справ`, `До Корчмаря`, `До Низу`, `До Єгеря`, `До льоху`, `До бочки`, `До шинку`, or `До задвірка`.
28. Reopen an old overview callback after state changes; verify it routes to current state or fails closed without mutation.

Manual Telegram QA status for the implementation pass: not run in Telegram.

## 0.3.3 — Quest Variety and Risk Refresh smoke

Before manual Telegram QA, run `refresh-local-bot.cmd` so the isolated local bot snapshot picks up this branch.

1. Open `🪧 Три справи`, choose a problem, then open `💡 Підказка`.
2. Verify the visible methods use mixed qualitative risk text: no exact percentages, no exact pre-choice reward amounts, no pile of `майже надійно`, and the compact `Памʼятка` appears at the end.
3. Resolve one calmer method and one risky/generous method across reset periods. Confirm local-failure outcomes still grant `0 XP`, `0 золота`, no item and no fight, while fight-handoff outcomes still route into the existing combat handoff without immediate Adventure reward.
4. Reset/open `Корчмарський обхід` across several Kyiv days. Confirm each offer still has exactly three scenes, each scene has exactly three action buttons, completed scenes replay frozen outcomes, and final reward turn-in remains explicit at `📋 Стіл зі справами`.
5. At levels 2-3, open the cellar mouse errand several times after `/dev_reset_cellar_mouse` cooldown resets. Confirm varied authored replies, tiny rewards, old/stale hidden method callbacks fail closed, and duplicate taps do not double-pay. At level 4+, use the same helper to inspect varied grownup mouse roleplay retry text without waiting.
6. While in active combat or pending raid state, try the Adventure/cellar entry routes and confirm existing blockers still win before completion.

## 0.3.2 — Kharakternyk Ward Signs smoke

Manual Telegram QA status for the implementation pass: not run in Telegram. Use the focused checklist in [`docs/qa/kharakternyk-ward-signs-qa.md`](../qa/kharakternyk-ward-signs-qa.md).

Use two or three local accounts with eligible Big Barrel Brother characters and `BIG_BARREL_BROTHER_RAID_ENABLED=true`.

1. On a level `8+` `class.kharakternyk`, open `🛢️ Бочка`, create a Big Barrel Brother recruiting lobby and tap `🧿 Поставити знак`.
2. Verify the lobby shows `Знак характерника` count-only support state, the Kharakternyk spent the deterministic placement cost once, and duplicate taps replay without another spend.
3. Join with a non-Kharakternyk and tap `✋ Підперти знак`; verify support is recorded once, mana spend matches the callback result, and duplicate taps replay safely.
4. Join with another Kharakternyk if available; verify support uses the same deterministic support-cost range and still increases the count by one.
5. Have one supporter leave before start; start the raid and verify the started fight counts only the final joined roster.
6. Resolve turns until broad `Бочковий гуркіт`; verify unsupported signs trigger once, supported signs decrement visible `Підпор: N/7` on each activation, the active card/journal show prevented damage, and later refreshes do not duplicate resolved activations.

## 0.3.1 — Duel Tournaments smoke

Manual Telegram QA status for the implementation pass: not run in Telegram. Use the focused checklist in [`docs/qa/duel-tournaments-qa.md`](../qa/duel-tournaments-qa.md).

1. Open Korchma -> `🥊 Бійцівський куток`; verify `🏆 Турніри` appears beside existing duel actions and `🏅 Переможці`.
2. Open `🏆 Турніри`; verify day/week/month tabs, current points, rank, remaining time, previous winners and pending prize chests render compactly.
2a. Open `❔ Правила`; verify it explains scoring, repeated-opponent limits, prize tables and post-period claim timing.
2b. Verify visible tournament period labels use Holocene years, for example `12026-07`, not `2026-07`.
2c. If prize chests are waiting, verify the Fighting Corner tournament button shows the pending count.
3. Complete a turn-based duel and verify only the resolved result affects the active tournament.
3a. During the turn-based duel, verify the active card has compact HP names, natural action lines and the 23-second turn hint.
4. Replay old duel cards and duplicate tournament buttons; verify no additional points or rewards are created.
5. Claim an available completed-period prize chest and verify gold plus the matching medical manatky are granted once.
6. Open `📜 Журнал бою` from a turn-based result and verify it replays stored actions without changing the duel.
7. Press `🔁 Реванш` from a result and verify the other participant receives a targeted invite card.
8. Open `📜 Хроніки Квестарні`; verify one tournament claim row appears and no loss row appears.

## 0.2.31 — Mantok Ability Grants Polish smoke

Manual Telegram QA status for this polish pass: not run in this branch. Automated coverage confirms committed Big Barrel Brother and turn-based duel gear-action unlock notifications are surfaced to the relevant Telegram participants; live evidence remains tracked in `docs/qa/mantok-ability-grants-foundation-qa.md`.

1. Use the 0.2.30 Mantok Ability Grants smoke list below, prioritizing Big Barrel Brother and turn-based duel gear actions.
2. On a character without `Манатка натиснула кнопку`, commit one gear action in a Big Barrel Brother raid and verify the acting participant receives the notification once, while other participants receive only their own matching notification if they earned it.
3. Repeat the same check in a turn-based duel after the gear action commits in a resolved round; queued-only choices must not notify early.
4. Replay duplicate, stale, no-mana, cooldown and missing-grant gear callbacks; verify they refresh/replay the card without a second notification, turn advance, mana spend, cooldown tick or monster/boss response.
5. Take `Бочка, або Туди і звідти` and verify the accept result card shows `🛢️ До Бочки ⚠️`.
6. From Shynok, take the next Korchmar problem paper while another Korchma-location quest is available; verify the result card shows `⬅️ До зали ⚠️`.
7. On a remort `7+` character, start a Yeger fight and verify the intro plus active card show `Відплата за минулі пригоди`, not `Натиск Низу`; rewards and Yeger board progress should look unchanged after victory.
8. Compare ordinary one-enemy and two-enemy threat fights: a base-life character should still need three eligible wins before `Натиск Низу`, remort `1` should need two, and remort `2+` should need one; solo remort-pressure cards may show `Відлуння минулих пригод`, while two-enemy threat cards keep the existing `Натиск Низу` pressure language.
9. Open `🎒 Манатки`, choose an equippable item for an occupied slot and verify the `Замінить` line shows the current item's name plus its visible effect before equipping.
10. From `🧥 Єгерський куток`, verify `🛢️ До Бочки` gains `⚠️` when an active table/Shynok/cellar quest waits beyond the hall, but not when the only marker is the Yeger quest visible on the current card.
11. With one outgoing `📮 Пошта Квестарні` package still pending, send a second package with a different manatka and verify it confirms; then try another package with an already reserved item id and verify it stales without charging another fee.

## 0.2.30 — Mantok Ability Grants Foundation smoke

Manual Telegram QA status for the implementation pass: partial local smoke found and fixed gear-action routing, active-fight gear swaps, active overview refreshes, blocked gear-action buttons hiding until usable, Big Barrel support effects starting cooldown without applying support, and corrupted party-boss gear callback notices; full manual pass still pending.

Review follow-up coverage: duel gear no-mana/cooldown callbacks are covered by service and command tests, and the Big Barrel one-use item shortcut has a fail-safe keyboard test proving it remains hidden unless explicitly enabled. Exact local Telegram evidence is still pending for duplicate party-boss gear actions, stale duel gear callbacks and ordinary two-enemy fight gear actions.

1. Seed or win each ability-granting manatka from the `9..13` band and equip it on a level-appropriate character.
2. Start persistent one-enemy and two-enemy fights and verify currently usable gear-action buttons appear after the normal fight controls, while cooldown/mana-blocked gear actions stay in text but not on the keyboard.
3. During the same active turn, change equipment through the allowed side surface, return to the fight and verify newly equipped grant manatky add buttons while removed grant manatky stop working.
4. Use the shield, bleed and borrowed-action buttons; verify each spends the current turn, applies its damage/support effect, writes the effect on the fight card and in `📜 Журнал бою`, spends mana when required and starts only its own gear cooldown.
5. After a gear action starts cooldown, verify its button disappears while the fight card still shows the cooldown line, then take enough ordinary player turns and verify the button returns and can trigger again.
6. Replay a stale gear callback after the turn advances and verify no mana, cooldown, RNG or monster response changes.
7. Verify bleed appears visibly, ticks during committed hero activations in single- and multi-enemy fights and can finish combat without an extra status-kill response.
8. Start a Big Barrel Brother raid with an eligible gear-action manatka; verify the button appears only while usable, resolves during active combat, applies damage/support before boss retaliation, writes the effect to the active card plus `📜 Журнал`, and duplicate/stale/missing-grant gear callbacks do not double-apply effects.
9. In the Big Barrel raid, verify active-combat redirects preserve refresh, item menu, item-use and gear shortcuts, and the one-use shortcut is hidden when no useful one-use manatky are available.
10. Start a turn-based duel with an eligible gear-action manatka; verify the button appears only while usable, resolves during active combat, writes damage/support to the stored round replay, stale/missing-grant callbacks do not advance the duel, and quick duels stay instant without gear actions.
11. Open item detail, `/equipment` and `/hero`; verify granted actions and the Yeger cloak service marker are explained compactly, including aggregate `Дія спорядження` rows.
12. Use the first successful gear action on a character that has not earned `Манатка натиснула кнопку`; verify the rewardless achievement notification appears once, then stale/blocked/repeated gear callbacks do not repeat it.
13. Run `/lore`; verify it opens `📖 Перекази Квестарні` and is absent from the Telegram side command menu. Open `🎒 Манатки` and verify the lore mentions visible `Дія спорядження`, not hidden procs.
14. Verify `Єгерський плащ чужої справи` does not unlock dense bandages, field kits or Yeger boards.
15. Win fights against configured source monsters if convenient; verify grant manatky can appear without removing existing trophy/coverage/set loot.

## 0.2.28 — Mantok Set Synergies Foundation smoke

Manual Telegram QA status for the implementation pass: not run.

1. Seed or win both red-line daggers, equip them in main/offhand, then verify `/equipment` shows `Парні кинджали червоного рядка: 2/2` and the active `Подвійна редактура` stat bonus.
2. Open either dagger detail from `🎒 Манатки`; verify the description includes the static `1/2` or `2/2` set-piece sentence plus the live equipped progress block.
3. Seed two, three and four pieces of `Бочковий панцир старшого Брата`; verify `/equipment` advances through `2/4`, `3/4` and `4/4` with active and next stat thresholds.
4. Unequip or replace one set piece and verify active bonuses drop immediately on `/equipment` and item detail.
5. Equip pieces from two different sets and verify both sets appear without mixing progress.
6. Win fights against configured higher-level source monsters if convenient; verify set pieces can appear as possible item rewards and existing trophies/coverage drops still remain possible.
7. Open `📖 Перекази` -> `🎒 Манатки` and verify the current lore mentions set-like manatky and visible `Дія спорядження` without implying hidden procs.

## 0.2.26 — Mantok Equipment Slot Coverage smoke

Manual Telegram QA status for the implementation pass: not run.

1. Seed or grant one authored coverage item for every slot and open `🎒 Манатки` slot filters. Locally, use `/dev_add_random_item slot=weapon`, `/dev_add_random_item slot=offhand`, `/dev_add_random_item slot=head`, `/dev_add_random_item slot=chest`, `/dev_add_random_item slot=legs`, `/dev_add_random_item slot=accessory`, `/dev_add_random_item slot=tool`, `/dev_add_random_item tag=twohand` and `/dev_add_random_item tag=offhand` as needed; use `/dev_add_item itemId=<item.id>` when exact authored QA items are required.
2. Equip universal weapon, offhand, head, chest, legs, accessory and tool manatky.
3. Equip a two-handed bow and verify the offhand slot is occupied/cleared according to existing twohand confirmation rules.
4. Try an offhand shield and an offhand dagger on a non-warrior and verify explicit offhand items are allowed.
5. Try a class-restricted item on a wrong class and verify the rejection names the class requirement.
6. Try a race-restricted item on a wrong race and verify the rejection names the race requirement.
7. Try a title/path item with a matching and non-matching active title.
8. Verify old generated hats/helmets/scarves, boots/greaves/pants, shields and tools appear under the expected slot filters.
9. Win several normal fights and hourly Yeger contracts, then verify authored coverage manatky can appear as item rewards, including gear that may be useful to another class/race/title later through social item exchange.
10. Open `📖 Бестіарій` records for monsters with coverage loot and verify the possible-loot notes list the new manatky as possible finds, not guaranteed drops.

## 0.2.24 — Mantok Balance Audit smoke

Manual Telegram QA status for the implementation pass: not run.

1. Open `/equipment`, `/gear` or `/equip`; verify tuned generated weapon, chest, accessory and tool manatky still show their canonical slots and visible effects.
2. Open `🎒 Манатки`, then each equipment slot filter. Compare several common/uncommon/rare/epic items in the same slot and, when test data exists, a legendary item; verify the names, rarity, values and effects feel coherent rather than obviously inverted.
3. Open a generated `+1` or higher Loot Expansion item if local data can seed one; verify the item detail shows a visible improvement over the simpler version in the same family.
4. Equip a tuned item into an occupied slot and verify the result card still says the previous manatka stayed in the bag.
5. On a warrior, equip two different ordinary weapons into `Основна рука` and `Друга рука`; on a non-warrior, verify ordinary weapons do not appear as second-hand options unless the manatka is explicitly offhand-capable.
6. If local data can seed a `twohand` item, equip it and verify both hand slots show the same manatka, the offhand line marks it as `дворучна`, combat stats count the item once and replacing either hand asks for confirmation before clearing the conflicting hand.
7. Fill all seven equipment slots if local data can seed enough manatky; a twohand item should count as both hand slots. Verify the rewardless full-slots achievement can appear once and duplicate/rapid same-item equip callbacks do not create duplicate achievement notices or hidden cumulative progress.
8. Run `/chronicles`; verify it opens `📜 Хроніки Квестарні` / `📣 Останні події`, has the same filters as the board entry and can trigger the existing first-open achievement only once.
9. Try Mantok Chest, Shynok sale, gifting/postal transfer and remort preview with equipped/protected items; verify equipped/protected stacks remain blocked as before.
10. Run a few ordinary fights before and after equipping tuned items; verify visible stats match combat behavior and fights do not feel stuck in long loops.
11. Check generated tool/accessory items if local data can seed them; verify tool items appear under `Інструмент`, accessory items under `Аксесуар`, and neither suggests hidden procs.

## 0.2.23 — Mantok Equipment Slot Foundation smoke

Manual Telegram QA status for the implementation pass: not run.

1. Open `🎒 Манатки`, then each equipment slot filter: weapon, offhand, head, chest, legs, accessory and tool. Verify the list stays compact, the title matches the selected slot and back buttons return to the same filtered view.
2. Open `/equipment`, `/gear` or `/equip`; verify all seven slots appear in body-first order: `Голова`, `Тулуб`, `Ноги`, `Аксесуар`, `Інструмент`, `Основна рука`, `Друга рука`; occupied slots show `Показати ...` and `Зняти ...` on one row, and the hand-slot copy/icons do not imply weapon- or shield-only slots.
3. Open starter weapon, head, chest and accessory manatka detail cards; verify each equip line names the correct target slot.
4. Equip a manatka into an occupied slot and verify the result card says the previous manatka stayed in the bag.
5. If local data can seed a generated tool-category manatka, verify it appears under the tool filter and equips into `Інструмент`.
6. On a legacy character or seeded row with old `armor` equipment, verify the item appears in `Тулуб`, can be unequipped and is not duplicated.
7. Try Mantok Chest, postal/gift transfer, Shynok sale or another protected-item path with an equipped item; verify equipped/protected stacks remain blocked as before.

## 0.2.22 — Dense Bandage and Field Kit smoke

Manual Telegram QA status for the implementation pass: not run.

Local setup helpers: use `/dev_add_bandage`, `/dev_add_dense_bandage`, `/dev_add_field_kit` and `/dev_add_yeger_line` to seed the exact medical stacks and Yeger notches needed for combat, Big Barrel and exchange checks when `DEV_GRANT_COMMANDS_ENABLED=true`. Use `/dev_yeger_first_done` and `/dev_yeger_second_done` to fill the Yeger boards with real terminal wins, then turn them in through the normal Yeger buttons.

1. Open `/hunt` / the Yeger corner, then open or take the current Yeger case; verify the corner intro appears only on the corner card, no separate duplicate `Ви підійшли до єгерського кутка.` notice appears before the Yeger card or Yeger daily scene, quest cards return to `Єгерський куток`, and ordinary Yeger exits return to `Бочка`.
1. Before completing the second Yeger `Неспокійні справи 2.0` board, open an ordinary `Бинт відповідальної паніки` item card with enough bandages and verify no advanced craft buttons appear.
2. After the second Yeger board completion, open the ordinary bandage card outside combat with `7`, `8`, `12`, `13` and `14` ordinary bandages; verify `Щільний бинт` appears at `8+` and `Польова аптечка` appears at `13+`.
2a. After turning in `Неспокійні справи 2.0`, verify the result card offers `Створити щільний бинт` and/or `Створити польову аптечку` only when the ordinary bandage stack can pay those recipes.
2b. After turning in `Неспокійні справи 2.0` with one or two `Єгерська риска на дощечці` items in the bag, verify the result card and Yeger corner offer `Обміняти риску` only when at least one exchange can be paid; exchange one notch for `Щільний бинт` and two notches for `Польова аптечка`, then replay an old exchange button and verify no extra notches are spent or items granted.
3. Craft each item and verify ordinary bandage counts decrease by the recipe cost or by a smaller successful savings spend, exactly one crafted item appears and the matching rewardless craft achievement can appear once.
3a. If the remaining ordinary bandage count still covers the same recipe, verify the result card offers `Створити ще`; if not, verify it only returns to the bandage or inventory.
3b. With a higher-level/lucky `class.ranger`, repeat several crafts and verify a successful savings roll can preserve `1-5` ordinary bandages without allowing the craft below the up-front `8` / `13` ordinary-bandage requirement; with a non-ranger class, verify the same recipes spend the fixed cost.
3c. At full HP, try a medical item from its detail card; verify the no-op card says treatment is not needed and offers `До бинта` / `До аптечки` back to the source item detail.
4. Replay an old craft button after the count is no longer sufficient and verify no extra item is granted.
5. Try craft preview/confirm during an active solo fight and verify it is denied without inventory mutation.
6. Use `Щільний бинт` outside combat at full HP, low HP and near max HP; verify no-op uses do not consume.
7. Use `Польова аптечка` outside combat below, at and above its target threshold; verify no-op uses do not consume.
7a. Open `Манатки`, press `Разові`, and verify ordinary/dense/field-kit consumables appear without equipment or junk stacks; inventory message text stays compact without item descriptions, stack counts above one appear on item buttons in parentheses, consumable detail cards say they are applied rather than equipped without trophy/shelf wording, `Єгерська риска на дощечці` detail copy points to Yeger exchange instead of generic trophy/shelf copy, and detail-card back returns to the filtered list.
8. In solo combat, use `Щільний бинт` once, verify its cooldown appears on the fight card, try it again immediately and confirm the separate alert explains the cooldown, then take own turns until the cooldown clears; verify the matching rewardless use achievement can appear once.
9. In solo combat, use `Польова аптечка` once and verify the journal says which HP value it reached, then injure the hero again if convenient and verify a second successful use in the same battle is blocked with a separate once-per-battle alert and the matching rewardless use achievement can appear once.
10. Start a different fight and verify dense cooldown / field-kit once-per-battle state did not leak.
11. In Big Barrel, use an ordinary bandage, `Щільний бинт` and `Польова аптечка` from item-detail combat-use buttons; verify each heals frozen raid HP, field-kit journal copy says which HP value it reached, no-op threshold/full-HP attempts do not consume, dense cooldown and field-kit once-per-battle state stay scoped to the raid, and first raid medical use can unlock its rewardless achievement once.
12. With `class.ranger`, after first-board completion verify the free class supply grants `5` ordinary bandages on the familiar `93`-minute cooldown; after second-board completion verify the dense-bandage supply appears on its own `93`-minute cooldown and the field-kit supply appears on a one-day cooldown.

## 0.2.20 — Latest Events Feed MVP smoke

Manual Telegram QA status for the implementation pass: not run.

1. Open `Дошка корчми`; verify `📣 Останні події` appears and existing `📰 Вісти`, `📖 Перекази`, gifts, postal navigation and `/news` still work.
2. Open `📣 Останні події`; verify the title is `📜 Хроніки Квестарні`, an empty feed is short, the first successful open can grant the rewardless `Хроніка відкрила око` achievement once, there is no manual refresh button, and filter/page or stale legacy refresh-compatible callbacks do not grant XP, gold, items, combat power, separate refresh achievements or duplicate notifications.
3. Create a new disposable character; reopen the feed and verify one public new-adventurer row appears and duplicate onboarding replays do not add another row.
4. Trigger or inspect a configured level milestone; verify one deduped level row appears and ordinary non-milestone rewards do not create noise.
5. Finish one Big Barrel Brother victory; verify exactly one public victory row appears for the terminal boss session and losses/attempt XP create no row.
6. Grant or win a rare/epic/legendary manatka if convenient; verify it appears, while common manatky do not, and only epic/legendary manatky appear under `⭐ Важливе`.
7. Win an underdog fight where the monster is at least 5 levels above the character; verify a row appears, while ordinary wins and losses do not.
8. Try every feed filter and pagination button; verify old refresh/stale callbacks answer safely and callback payloads do not leak ids.
9. Use long or HTML-like character/item names in a disposable path if convenient; verify feed rows escape and truncate names and the message stays mobile-sized.

## 0.2.19 — Monster Trophies And Yeger Supply Gates smoke

Manual Telegram QA status for the implementation pass: not run.

1. Character below Yeger level: open the Yeger corner and verify `🩹 Бинти` is absent.
2. Level-eligible character before starting the first Yeger board: verify `🩹 Бинти` is absent; replay old `v1:ygr:bandages`, paid preview/confirm/cancel and Ranger free-bandage buttons if available locally and verify locked copy with no gold/item/cooldown mutation.
3. In-progress first `5`-target board: verify supplies stay hidden and direct old buttons stay locked.
4. Turn-in-ready but not turned in: verify supplies stay locked until the first board completion row is recorded.
5. After completing and turning in the first board: verify `🩹 Бинти` appears in the Yeger corner.
6. After first-board completion: buy `1`, `5`, `17` or `93` basic bandages as affordable, verify Ranger discount/free `5`-bandage button behavior, then replay stale buttons and verify canonical replay/no double spend.
7. Before completing the second `17`-target board: verify no advanced `Щільний бинт` / `Польова аптечка` route is exposed by this release.
8. Open several early and high-level Bestiary monster records; verify possible trophies are concrete manatky names and exact odds are not shown.
9. Win a few ordinary fights if convenient and verify existing item drop/result presentation still behaves normally.
10. With `DEPLOY_NOTIFICATIONS_ENABLED=true`, trigger a new version marker on a disposable local account.
11. Verify the private update message uses `Остання вість із Дошки корчми`, `Архів вістей` and `Канал вістей`.
12. Verify the version, latest `news.md` title without version/date prefix, first narrative paragraph and `/news` archive hint render with Telegram HTML.
13. Temporarily make latest news unavailable in local test data if convenient; verify the fallback says `Дошка вістей тимчасово мовчить` and still includes archive/channel lines.
14. Re-trigger the same version marker; verify the notification is not resent.

## 0.2.18 — Lore Board MVP smoke

Manual Telegram QA status for the implementation pass: not run.

1. Open `Дошка корчми`; verify `📖 Перекази` appears and existing `📰 Вісти`, gift and postal navigation still works.
2. Open `📖 Перекази`; verify the intro and all categories fit a mobile screen.
3. Open every category: `🏚 Про Квестарню`, `🪧 Місцини корчми`, `🧝 Раси пригодників`, `⚔️ Класи пригодників`, `🧌 Бестіарій`, `🎒 Манатки`, `📜 Звичаї й чутки`.
3a. In `🪧 Місцини корчми`, verify the first screen shows compact subgroups (`🏚 Надвірʼя`, `🍺 Зала й шинок`, `🛢 Бочка й льох`, `🎯 Кутки`, `⬇️ Низ`) instead of one long place list; open each subgroup and verify its entries fit a mobile screen.
4. In normal lore categories, verify entries belong to that category and `🎲 Випадковий із цієї категорії` opens an entry.
5. In `🧌 Бестіарій`, verify `📖 Відкрити Бестіарій` opens the existing Bestiary surface; before level 3 it should keep the existing level gate.
6. With an eligible character, verify Bestiary list pagination has start/back/next/end controls like the news archive, plus `🎲 Випадковий запис`, and that Lore Board-sourced Bestiary screens return with `⬅️ До переказів` / `🪧 До Дошки корчми`, not `🏹 До дошки`.
7. Open several Bestiary details from Lore Board and verify first/previous/next/last record navigation plus `🎲 Випадковий запис` preserves the same `⬅️ До переказів` return.
8. Page to the end of Bestiary and verify `Бочка Пінного Міражу` and `Старший Брат Бочки` appear as special non-level records.
9. Open several lore entries; verify title, source, body and category position render safely with Telegram HTML.
10. Tap global `🎲 Випадковий переказ` several times; verify it never shows an empty or broken card while content exists.
11. Replay stale lore category/entry callbacks after a restart or deploy; verify the bot answers without a spinner hang and returns a safe fallback card.
12. Return to `Дошка корчми`; verify the original board card is restored through the existing place flow, and separately verify `/bestiary` or `/monsters` still returns with the existing `🏹 До дошки` hunt-board button.
13. Confirm reading lore or Bestiary records grants no XP, gold, items, combat power, unlock progress or hidden achievement.

## 0.2.17 — Big Barrel Brother Raid MVP smoke

Use two or three local accounts with eligible characters: non-remorted level 8+ or remorted level 3+. Set `BIG_BARREL_BROTHER_RAID_ENABLED=true`. Keep `PARTY_SESSION_DEV_HELPERS_ENABLED=true` only for timeout/expiry shortcuts; production Big Barrel Brother creation is controlled by the Big Barrel Brother flag.

1. On a non-remorted level 7 account and a remorted level 2 account, open `🛢️ Бочка`; verify the legacy Barrel route still appears.
2. On an eligible account with the Big Barrel Brother flag disabled, open `🛢️ Бочка`; verify it still uses the legacy route.
3. Enable the Big Barrel Brother flag, reopen `🛢️ Бочка` on non-remorted level 8+ and remorted level 3+ accounts, and verify the familiar Barrel card appears first with `🍺 У рейд на бочку`; it must not auto-create recruiting.
4. Tap `🍺 У рейд на бочку`; verify the Big Barrel Brother recruiting card appears without exact reward amounts or odds, includes `📣 Картка запрошення` / `🔗 Запросити на рейд` controls on one row when `BOT_USERNAME` is configured, and starts with the Старший Брат Бочки intervention message.
4a. Press `📣 Картка запрошення`; verify the bot sends the separate forwardable invite card only after this explicit press, not automatically on recruiting open or join.
5. Join the same party from a deep link and from `👀 Хто поруч`; verify duplicate joins replay the same membership, the invite link remains visible on recruiting refresh/join/leave cards, the leader's original recruiting card updates to include the new participant, and no separate invite-card message is sent by the join itself.
5a. Try the same deep-link and `👀 Хто поруч` join as a non-remorted level 7, remorted level 2, already-completed-period or active-combat character; verify the bot shows only generic raid-office rejection copy, does not add the character to the roster and does not reveal the exact private reason.
6. With two recruiting groups open at the Barrel, open `👀 Хто поруч`; verify each group lists participant names and the join buttons identify the leader.
6a. With one participant, verify `🚪 Вийти` and `🧹 Скасувати збір` share one row. With at least two participants in one recruiting group, verify the leader no longer sees `🧹 Скасувати збір`; `🔎 Оновити` sits beside `Готовий` / `Готова` / `Готові` or `Зачекайте`; and `🛢️ Почати рейд` remains the final button.
7. Let recruiting time expire without pressing leader start; verify the fight starts automatically even if the roster is not full.
8. Start another raid manually as leader; verify the shared boss card names `Старший Брат Бочки`, while private cards follow ordinary fight shape: turn heading, viewer HP/mana, boss HP, visible target marker on participants, concrete action controls and the `23 с` turn hint.
9. Verify private action buttons use concrete class/race ability names, matching ordinary combat availability when mana/cooldowns make an action unavailable.
10. Add an under-level, remorted level-2, or already-completed participant through an old/deep-link route; verify start blocks with a generic raid-office line and creates no boss session or `party-boss` lease.
11. In a two-person raid, let the non-leader deal the most damage in round 1; verify ordinary boss hits first go to the leader, then switch to the previous round's top damage contributor, while turn 4 hits all living participants.
12. Submit one action per participant; replay the old action buttons and verify HP/mana/contribution do not mutate twice. Verify `📜 Журнал` is not available while the battle is active.
12a. Wound a participant who owns one-use medical manatky, then open `🎒 Одноразові манатки` from the raid card and choose a concrete item, or use `⚔️ Використати у бою` from the item detail; verify the selected item is consumed, the frozen raid HP row updates, unavailable/full-HP choices are not offered from the menu, and stale/duplicate item buttons do not heal twice.
13. With dev helpers disabled, replay or forge a `boss-timeout` callback before the deadline; verify the turn stays on the same number and no timeout action row is added.
14. Wait past the deadline and trigger the timeout path; verify missing participants defend deterministically.
15. With dev helpers enabled, use the dev timeout control before the deadline; verify missing participants defend and the next turn appears.
16. In a controlled high-HP scenario, continue past rounds 7 and 13 while both sides are still alive; verify there is no automatic loss by round count.
17. Force or finish a victory; verify the result card shows `🎉 Ви перемогли`, exact stored `Винагорода за бій` XP/gold and any item grant for the viewer, names terminal participant rows by character rather than `Ви`, and does not show active-only cooldown rows. Then replay terminal/action buttons and verify Barrel success, XP/gold/items and `party-boss` leases do not duplicate. Open `📜 Журнал` and verify it is paginated, shows action descriptions, boss target rows and target-switch notes.
17a. Open the original `https://t.me/<bot>?start=party_<token>` invite after the victory or loss; verify it opens the stored raid result instead of an expired recruiting message.
18. Use `/dev_raid_reset` locally when the same account needs another Barrel/Big Barrel Brother attempt in the same raid period without waiting for the next `:23` period boundary; after a Big loss, verify it clears the Big Barrel Brother loss retry cooldown for QA.
19. Finish a loss in another period; verify no Barrel success, beer gate, gold or items are written, timeout-only AFK receives no loss attempt XP, and meaningful participants receive the `🎒 За спробу` line only when the 3-minute loss retry cooldown is not active.
19a. Immediately after a meaningful loss, try `/raid`, `🍺 У рейд на бочку`, a deep-link invite and a `👀 Хто поруч` join into another Big group; verify all Big entry/join paths are blocked with a remaining-wait line, then verify they work again after cooldown expiry.
20. Remort or invalidate a disposable participant during recruiting/active combat; verify no active membership key or combat lease orphan remains.
21. Run ordinary solo fight, turn-based duel, postal delivery, Shynok, Adventure, Daily Korchma and legacy Barrel smoke routes afterward.

## 0.2.16 — Party Vs One Boss MVP smoke

Use two or three local accounts. Run in non-production mode or enable `PARTY_SESSION_DEV_HELPERS_ENABLED=true`; this proof remains dev/flag-gated and is not Big Barrel Brother.

1. Account A runs `/dev_party`; Account B and optionally C join through the deep link or private nearby invite.
2. As leader, tap `🧪 Dev: бос-проба`; verify the card says this is a proof, not the real raid route, and shows one shared boss.
3. From Account A, tap `⚔️ Вдарити`; verify A cannot submit a second different action for the same turn.
4. Leave Account B idle; tap `⏱️ Dev: добити хід` and verify B is treated as timeout defend, not an extra attack.
5. Replay old action buttons from the previous turn; verify canonical state appears and HP/mana/contribution do not mutate twice.
6. Open the active proof from a shared/non-participant context if convenient; verify shared cards do not expose private HP, mana, selected actions or Telegram ids.
7. If the proof reaches a sixth resolved turn while the boss and at least one participant are still alive, verify it remains active instead of losing because of turn count.
8. Finish the proof by resolving turns; verify the result grants no XP, gold, items, manatky, achievements, Barrel success or loot.
9. After terminal state, replay result/refresh buttons; verify the same stored result appears and `party-boss` combat leases are gone.
10. Start remort for a participant during active proof on a disposable local character; verify the proof cancels and leaves no active membership key or combat lease orphan.
11. Run ordinary solo fight, turn-based duel, postal delivery, Shynok, Adventure, Daily Korchma and legacy Barrel smoke routes afterward.

## 0.2.15 — Party Session Foundation smoke

Use two or three local accounts. Enable `PARTY_SESSION_FOUNDATION_ENABLED=true` in production-like local config, or run in normal non-production dev mode. The forced expiry button appears only in non-production mode or when `PARTY_SESSION_DEV_HELPERS_ENABLED=true` is explicitly set for manual QA.

1. Account A runs `/dev_party`; verify the card says this is only a temporary party gathering surface with no boss, combat or rewards, and shows a Telegram deep link only when `BOT_USERNAME` is configured.
2. Account A reruns `/dev_party`; verify it reopens the existing live party instead of creating a second one.
3. Account B opens the deep link or taps `🤝 Приєднатися`; verify B appears once and duplicate taps replay the same membership.
4. Try the same invite from an account without a character; verify it routes to friendly onboarding copy and creates no participant.
5. Fill or locally edit the party to eight joined participants; verify the ninth join is rejected without partial membership.
6. Account B taps `🚪 Вийти`; verify B is marked left and can rejoin with the same invite while the session is still recruiting.
7. Account A leaves while other members remain; verify leadership transfers to the earliest remaining joined participant.
8. The current leader taps `🧹 Скасувати збір`; verify old join/leave/cancel buttons replay the cancelled state and do not reopen recruitment.
9. Open a party and, with dev helpers enabled, tap `⏱️ Dev: завершити строк`; otherwise wait past the short local expiry. Verify old buttons show the expired state and active membership keys clear.
10. While Account A has a live party and nearby duel candidates exist, open `/online` or `👀 Хто поруч`; verify `🧭 Покликати у ватагу` appears, sends only best-effort private invites and does not expose exact location or rejection details.
11. Start remort for a character in a live party; verify remort removes that character from the live party, cancels the party if they were alone, or transfers leadership if needed.
12. Run ordinary duel, Shynok, postal gift and Barrel raid smoke routes; verify the party foundation did not create combat locks, rewards, quest counters, wagers or inventory movement.

## 0.2.14 — Adventure Quest Readability and Local Failure smoke

Use one level 3+ account. Local `/dev_adventure_reset` is useful for rerolling offers and duplicate-button checks.

1. Open the Adventure Choice table and select several general problems.
2. Verify each selected card shows the title, hook, `Замовник`, `Проблема`, `Ціль`, then `Можливі способи`.
3. Verify the offer list stays compact and does not show the new problem/goal block before selection.
4. Select generated race, class and title problems when forceable; verify their problem/goal text fits the concrete family and does not expose `race`, `class`, `signature`, grade names, exact odds or future rewards.
5. Open `💡 Підказка`; verify method details remain qualitative and return with `⬅️ Назад`.
6. Complete an ordinary success or mixed result; verify reward and result framing still match the authored method.
7. Force or sample a local failure method; verify the result says `Справу не закрито`, grants 0 XP, 0 золота and no item, starts no fight and shows no HP injury.
8. Replay the same local-failure callback; verify the attempt is already used and no reward, item, HP loss or fight is duplicated.
9. Complete a fight-handoff complication separately; verify rollback/idempotency behavior is unchanged.
10. Reopen the Adventure table after the period claim; verify already-used copy fits both success and failed attempts.

## 0.2.13 — Postal Manatka Delivery smoke

Use two accounts with at least one completed accepted item-transfer relationship. Local seeded inventory is acceptable for quantity and stale-state checks.

1. Open `📰 Дошка корчми`; verify it shows a location card with `📰 Вісти`, `🎁 Подарувати манатку` and `📮 Пошта Квестарні`, while `🍻 Шинок` no longer shows gift or postal buttons. From `📰 Вісти`, verify `⬅️ Назад` returns to `📰 Дошка корчми`.
2. Open `📮 Пошта Квестарні` as sender while the recipient is not nearby; verify recipients appear as known after accepted gift, accepted/finished duel, or explicit Bard applause/tip history without current location or online-status details.
3. Select one eligible manatka type with quantity 1; verify the draft names the recipient, item, quantity, exact visible delivery fee and simple fee formula.
4. Build a package with five distinct eligible manatka types, including one quantity above 1 and one quantity 93 if local data can create the stack.
5. Try adding a sixth type; verify the UI blocks it before confirmation.
6. Try quantity 0, 94 and quantity above the owned stack through stale/old buttons or local state edits; verify no mutation.
7. Confirm the package and verify the recipient notice shows the full package summary and explicit accept/decline controls.
8. Confirm as sender; verify the delivery fee is charged immediately and selected quantities leave the sender inventory for postal custody. Accept as recipient; verify every line moves exactly once and neither player is charged again.
9. Decline, cancel and expire a pending package; verify canonical state and that postal-custody items return to the sender once.
10. Replay accept, decline, cancel and old draft buttons; verify canonical state and no duplicate notices or item movement.
11. Send a bandage or other trade-blocked/one-use stack explicitly; verify it can be packaged, leaves inventory on confirm and delivers on accept.
12. Try equipped, reserved, drifted and missing stacks; verify stale rejection without partial delivery.
13. Lower sender gold below the fee before confirmation; verify the package is not sent, no item moves and no fee is charged.
14. Reopen `📮 Пошта Квестарні`; verify known recipients, packages in transit and completed history appear without current location or online-status details, and pagination works once enough rows exist.
15. Verify nearby `🎁 Подарувати манатку` still works as the old one-unit same-location gift flow and does not list postal-only trade-blocked stacks such as bandages.
16. Try to remort the sender around a confirmed pending delivery; verify remort is blocked with a clear reason, the package stays in postal custody, recipient gets nothing and the sent fee is not refunded.
17. Remort recipient around a pending delivery if convenient; verify postal-custody items return to the original sender and never enter the receiver's new life. Draft postal rows should not block remort and should cancel without moving items.

## 0.2.12 — Two-Enemy Threat Simulation and Outlier Tuning smoke

Use one level 3+ account. Local seeded setup is acceptable for forcing specific monsters.

1. Start ordinary one-enemy Nyz fights across a few representative classes; verify cards, buttons, mana/cooldown rows and terminal settlement still match the 0.2.11 flow.
2. Trigger or locally force a two-enemy threat fight; verify both enemies have separate HP rows and the intro/active cards name the full roster once.
3. During a two-enemy fight, take several turns and verify the backup enemy does not respond on every odd pressure turn while both enemies live, but resumes normal pressure after it becomes the only living enemy.
4. Defeat the primary enemy first; verify target switching, defeated-enemy text and journal HP snapshots remain clear.
5. Win a two-enemy threat fight; replay old action/result/journal buttons and verify exactly one terminal settlement/reward is shown with no duplicate XP, gold, item, quest, Yeger or achievement mutation.
6. Lose or flee a two-enemy threat fight if convenient; verify the terminal card and next ordinary start behavior match the threat-reset rules.
7. Force or encounter `monster.zero-declaration-tax-dragon`; verify tax breath / asset freeze remain readable but no longer feel like a hard wall for ordinary same-level characters.
8. Force or encounter `monster.siege-iron-varenyk`; verify shield/counter turns still read as armored-varenyk flavor but do not stall the fight indefinitely.
9. Use Bisyny and Molfar Soul race abilities in difficult pairings; verify their guard/response mitigation text remains Ukrainian and no raw ids or English fallback appears.
10. Recheck missed/no-effect monster signature turns and battle-journal replay; verify 0.2.11 signature visibility did not regress.
11. Confirm active cosmetic title display remains cosmetic only and does not affect combat, rewards, monster selection or settlement.

## 0.1.25 — Phase 2 MVP closeout smoke

Канонічний closeout gate для бойово-соціяльного зрізу живе в [`docs/history/phase2/closeout-smoke.md`](../history/phase2/closeout-smoke.md), а підсумок релізу — в [`docs/history/phase2/mvp-release-notes.md`](../history/phase2/mvp-release-notes.md).

Для `0.1.25` manual two-account regression після `0.1.24` already accepted; цей документ лишає repeatable маршрут для hotfix-ів і `0.2.x` регресій. Перевіряй quick duel, turn-based duel, nearby targeting, stale callback replay, solo/training combat locks, remort boundaries, Shynok drinks/rounds/sales and `/health` / `/version` / `/news`.

## 0.2.11 — Combat Balance and Monster Signature smoke

Use one level 3+ account. Local dev setup or seeded local fights are acceptable for reaching specific monsters.

1. Start ordinary one-enemy fights across representative levels/classes and verify fight cards stay compact, readable and short.
2. Use Warrior, Bureaucramancer, Rogue, Ranger and Priest class actions; verify mana/cooldown/no-op behavior is unchanged and result text remains Ukrainian.
3. Encounter or locally force selected signature monsters such as the queue gargoyle, ledger boar, preapproval dragonling, pretzel/oath, chimera, inventory prophet or tide accountant; verify named monster actions show short readable consequences or telegraphs with no raw ids.
4. In a two-enemy fight, verify stored monster skill responses can render per-enemy signature text and still disambiguate enemy names.
5. Open the battle journal after signature actions; verify stored skill/telegraph outcomes replay without rerolling or changing damage/effects.
6. Repeat old action/result/journal callbacks; verify canonical replay and no extra reward, progress, XP, gold or item mutation.
7. Win and lose representative fights; verify settlement shape, rewards, quest progress, Yeger progress and threat behavior match the pre-0.2.11 flows.
8. Confirm active cosmetic titles still display cosmetically only and do not affect combat, rewards or monster selection.

## 0.2.10 — Active Cosmetic Title Selection smoke

Use one fresh account plus one account with at least one earned cosmetic title grant. Local dev grants/recalculation are acceptable for setup.

1. Open `/hero` on a character with no title grants; press `🏷️ Титули` and verify the empty state is friendly and has no broken selection buttons.
2. Create or recalculate enough achievements to grant more than 10 title records; reopen `🏷️ Титули` and verify rows show title text, source achievement and no raw ids, while selection buttons are paginated with `◀️ Назад` / `Далі ▶️` instead of one huge keyboard.
3. Select one title; verify it becomes marked active and `/hero` shows a separate `Косметичний титул` line below the generated title.
4. Replay the same select button; verify the title remains active and no duplicate achievement/title rows or notifications appear.
5. Clear the title; verify `/hero` no longer shows the cosmetic title line, then replay the clear button and verify canonical no-op replay.
6. Try selecting a title row from another character or an unknown/stale payload; verify the current title page refreshes safely without exposing internals.
7. Remort locally; verify earned title grants remain, active title state is not duplicated, and old-life select/clear callbacks stale out.
8. Open achievements list, filters and `🔎 Перевірити`; verify title selection did not break achievement browsing/recalculation.
9. Open the Daily Korchma Round route or complete one round; verify its achievement definitions and UI still work.
10. Confirm selecting/clearing titles changes no XP, gold, items, stats, combat, quest, duel, Shynok, Yeger or remort effects.
11. Select an active title on account A, then from account B in the same location open `👀 Хто поруч`, `/online` and `/look`; verify A's title appears compactly and unknown/cleared titles are omitted.
12. Create a nearby duel from A, accept/resolve/replay/rematch it, then clear A's title; verify old result/share/rematch cards keep stored title display while new cards omit it.
13. Open gift target selection, the Korchma arrival board and the duel winners board; verify titles appear only in the documented compact identity rows and do not affect ordering or rewards.

## 0.2.9 — Daily Korchma Rounds smoke

Use one level 2 account and one level 3+ account. Local dev grants/resets are acceptable for setup.

1. On level 2, open the Quest Table and verify `Корчмарський обхід` is hidden.
2. On level 3+, open the Quest Table and `Корчмарський обхід`; verify the first card shows `Берусь за обхід` / `Пізніше`, and `Пізніше` returns without starting the round or changing ordinary location cards.
3. Press `Берусь за обхід`; verify the daily overview shows one `Задвірок корчми` scene and two distinct interior scenes, but only offers `До справ` / `До зали` navigation, not direct scene-location buttons.
4. Walk through normal Korchma navigation to the first required location; verify the active scene opens there, then complete one authored action.
5. Try the second scene action from the wrong location using an old/stale scene card if available; verify no step row/reward is created and the card names the required place.
6. Move through normal navigation to the correct second location and complete it; verify the third scene becomes `не сьогоднішня катастрофа`.
7. Try to claim away from the Quest Table; verify claim is denied. Move to the Quest Table and claim; verify the stored result grants level-scaled XP/gold and replays the same exact values.
8. Replay old overview/scene/action/claim buttons; verify no duplicate step, reward, achievement notification, XP or gold.
9. Remort before and after claim in local QA; verify same-day progress/reward is not cleared or duplicated and old-life action buttons stale out.
10. Restart before and after claim; verify the exact same scene ids/order and reward replay.
11. Locally run `/dev_reset_korchma_round`, reopen the Quest Table and verify the same Kyiv-day route starts again with `0/2` progress.
12. During active combat and while a pending Barrel raid is active, verify daily mutations are blocked.
13. Verify the achievement hook is distinct from Shynok beer-round ids and unlocks only the rewardless daily-round record.

## 0.2.8 — Achievements and Cosmetic Title Records smoke

Use one fresh account plus one existing level 3+ account. Local dev grants are acceptable for level/equipment setup.

1. Open `/hero` and press `🏅 Ачівки`; verify all, earned, locked and hidden rows render compactly with no hidden criteria spoiler and pagination appears when needed.
2. Press `🔎 Перевірити` on an existing account; verify provable old race/class, level/combat/problem/inventory/equipment/side-action rows appear once with historical dates where ledgers exist, then repeat the press and verify no duplicate unlocks.
3. Return from the achievements page to the hero card; repeat old page callbacks and verify views do not mutate rows or create duplicate notifications.
4. Create a fresh character; verify the first achievement notification appears once, includes the current race/class identity records, and the achievement page shows title-grant record markers.
5. Trigger level 3 and level 5 through existing XP/dev-grant paths; verify progress moves forward and grouped notifications appear when several unlocks happen together.
6. Win a starter or persistent monster fight; repeat terminal/result callbacks and verify `achievement.combat.first-win` does not duplicate.
7. Lose or flee a persistent fight if convenient; verify the first loss/flee records appear without XP/gold/item/stat changes from the achievement itself.
8. Turn in a Korchmar problem; verify the problem achievement and any item/level unlocks are grouped after the canonical turn-in card.
9. Receive a reward item, collect or grant `Бинт відповідальної паніки`, and equip a manatka; verify item/bandage/equipment achievements unlock once and old equip callbacks do not duplicate title grants.
10. Remort locally; verify achievement and cosmetic title grant rows remain visible afterward.
11. Confirm achievements and title grants offer no reward claim, title ability, title combat button, XP/gold/item/stat/combat buff or paid advantage.

## 0.2.7 — Player Abilities smoke

Use one level 3+ account with local dev commands enabled where helpful. Use multiple races/classes across fresh or edited local test characters.

1. Start a normal Nyz fight for each active onboarding race and verify the compact race ability button label appears beside the class ability row.
2. Use each race ability once; verify the result card names the ability, spends only its stated mana and shows that ability on cooldown.
3. Press the same race ability again while it is cooling down; verify no turn advances, no mana changes and no monster response is added.
4. Use the class ability while the race ability is cooling down; verify class and race cooldowns are independent.
5. Use refreshed class abilities for Warrior, Mage, Varenyk-mancer, Bureaucramancer, Bard, Rogue, Ranger, Priest and Kharakternyk; verify labels and compact mana hints.
6. Try a mana-gated class/race ability with insufficient mana; verify the card refreshes without spending a turn.
7. In a two-enemy threat fight, use Mage, Bureaucramancer, Bard, Kharakternyk, Бісини or dryland Rusalka abilities and verify each living enemy is affected once.
8. Use Ranger `Рикошетний постріл` in a two-enemy fight and verify the primary target remains clear while splash damage does not double-hit it.
9. Use Domovyk, Dwarf, Molfar Soul, Priest, Bard or Varenyk support-ready abilities; verify current solo fallback affects only the hero and does not claim party behavior.
10. Use `/spar`; verify player class and race abilities work in training, the start card shows `Порада дня`, active training cards show `Бій: N хід` plus the 23-second hint, and the doppelganger keeps existing copied skill behavior while storing the copied race/class ability ids in debug state.
11. Finish a training fight; verify `📜 Журнал бою` reopens stored training turns, and use `/dev_reset_doppelganger` locally to make the next training start available without changing production cooldown rules.
12. Open combat journal pages after class/race ability turns; verify stored ability names, cooldown notices and per-target summaries replay without rerolling.
13. Open quick and turn-based duel screens; verify quick duel remains instant without turn-action buttons, while turn-based duel shows available class/race actions and hides them on mana/cooldown.
14. In focused seeded-state QA or automated tests, force a class/race critical fumble and verify it consumes normal mana/cooldown, shows the stored funny line, applies the stored consequence and replays without rerolling. Do not add this as a player-facing news/manual spoiler path.

## 0.2.6 — Passage Search smoke

Use one level 3+ account with local dev commands enabled where helpful.

1. Open `🪜 Спуск до Низу`, press `🔎 Пошукати`, check before 23 seconds and verify no reward is granted early.
2. Check after the timer; verify the safe tiny result replays without a second reward.
3. Open `🧱 Ярус I: Сутерени Корчми`, press `🔎 Пошукати`, and verify it starts a safe 23-second location search.
4. Start search in one passage with a visible monster; verify the running card shows check and cancel controls.
5. Wait for the timer without pressing `Перевірити`; verify a new result message appears automatically.
6. Reopen the same surface/passage before 13 minutes; verify the fresh card hides `🔎 Пошукати`.
7. While another search runs, press an old `⚔️ Атакувати` passage button; verify confirm-cancel appears instead of starting combat.
8. While it runs, press an old `↩️ Повернутися до Сутеренів` or place button; verify confirm-cancel appears instead of moving.
9. Confirm cancel; verify no reward and that the same node is on cooldown.
10. Search a different passage immediately after cancel/resolution; verify the first node cooldown does not block the second node.
11. Repeat passage search until danger occurs; verify no search reward appears, the existing passage combat opens with the first hero turn skipped, and any second-monster/`Натиск Низу`/full-opponent/tip context appears before the active card.
12. Let a dangerous search become due, then press a current-location reply button or an old place/quest button; verify the danger result is followed by the canonical fight intro/card and the attempted action does not also run.
13. While a search is active, press old quest/fight/inventory/Yeger/Shynok/social buttons and `/fight`; verify the search card/result appears and the attempted action does not move presence, spend resources, create orders or start another activity.
14. Repeat old check/cancel/result callbacks after terminal state; verify no duplicate reward.
15. Move to another location, press an old descent, `Ярус I` or passage `🔎 Пошукати` button, and verify no search action, cooldown, encounter refresh/consume or combat starts.
16. Defeat a pending monster in a first-tier passage, reopen that same passage before 3 minutes and verify `🔎 Пошукати` starts a safe 42-second passage search without a monster token.
17. Use `/dev_reset_passage_search` locally and verify running search/cooldowns clear without changing combat state.

## 0.2.5 — Bard Performance smoke

Use two accounts in Shynok and another shared location with local dev commands enabled where helpful.

1. Make one account a level 3+ Bard; verify the Bard performance button appears inside `🍻 Шинок` even when nobody else is nearby, and not for non-Bards or under-level heroes.
2. Verify `👀 Хто поруч` shows the Bard performance button only when another active character is in the same non-Shynok location.
3. Start a solo performance in `🍻 Шинок`; verify the result card is stable on refresh, the house payout is not rerolled by old callbacks and the zero-audience copy is Shynok-specific.
4. Start a fresh performance with another active same-location account and confirm that account receives one private audience prompt.
5. Press applause; the audience wallet stays unchanged and repeated applause does not create a second response.
6. Start a fresh performance after `/dev_reset_bard_performance`; tip `3` gold from the audience account and verify the audience wallet decreases once, the Bard wallet increases once and repeated tip callbacks replay safely.
7. Try each tip amount (`1`, `3`, `5`, `13`) across fresh performances or reset windows.
8. Move the audience character away before responding; the response should stale without gold movement.
9. Put the audience character in active combat or a pending Barrel raid before responding; mutation should be blocked.
10. Remort either side before an old response; remort-life drift should block mutation.
11. Start in another shared location after resetting cooldown; verify there is no house payout, no Shynok-only shelf/корчмар audience copy, and Shynok cooldown does not block that location.
12. Exhaust the Bard's Kyiv-day Shynok house cap; further Shynok performances can still resolve but house payout clips to `0`.
13. Simulate blocked DM/notification failure: the stored performance and reaction rows remain authoritative.
14. `/help`, `/dev_help`, `/version`, `/news`, `👀 Хто поруч` and Shynok navigation still render normally.

## 0.2.4 — Item tags and bandage smoke

1. Give a wounded out-of-combat hero `Бинт відповідальної паніки`; open `/inventory`, item detail and `🩹 Використати`.
2. Confirm the preview shows the exact current HP recovery and does not mutate inventory before confirm.
3. Confirm use: one bandage is consumed, HP increases only up to the effective max, and the result card replays on repeated confirm.
4. Try at full HP: no use order should spend a bandage.
5. Try during an active persistent PvE fight while wounded: item detail should route to the fight item action, consume exactly one eligible bandage, heal combat HP, advance the turn and let the monster respond; full-HP, stale-turn, missing-stack and reserved-stack attempts should not consume or advance.
6. Open a preview, then change inventory/equipment/reservation state before confirm: confirm must fail stale without healing or consuming.
7. While a bandage use preview is pending, try gift/sale/chest/barter of the same `itemId`: the stack should be reserved.
8. Remort with a pending use order: remort should cancel the use reservation without consuming the bandage.
9. At the Єгер surface, open paid bandage purchase, verify exact price/current gold, confirm once, replay confirm, cancel a fresh preview, intentionally buy again with a new token, and repeat with insufficient gold; if the wallet can still afford a smaller bundle, the stale-free fallback should offer the maximum affordable count and only spend gold after confirming that new token.
10. With `class.ranger`, verify the lower buy price and the periodic free class-supply claim (`5` ordinary bandages after the first board; improved supplies only after the second board); repeated old free-claim callbacks should replay/cooldown safely. Locally, use `/dev_reset_yeger_bandage` to skip the ordinary wait and confirm a fresh claim can be tested without changing production rules.
11. For Yeger trail QA, use `/dev_reset_yeger_trail` after taking a trail to make `🔎 Перевірити слід` available immediately without weakening production timers.
12. Win a low-level monster fight whose authored loot list can include the bandage and verify any bandage grant goes through the existing reward replay path.

## 0.2.3 — Threat escalation smoke

1. Персонаж 3+ має видану звичайну справу і може стартувати ordinary бій у Низі.
2. Заверши 0, 1 або 2 eligible ordinary one-enemy перемоги; наступний ordinary старт лишається one-enemy.
3. Заверши третю consecutive eligible ordinary one-enemy перемогу.
4. Стартуй наступний ordinary бій через `/fight` або passage attack: очікування — exactly two enemies, окремі HP-рядки, stable escalation line.
5. Перезапусти процес або перевідкрий активний бій: ті самі два вороги й та сама escalation line.
6. Дочекайся timeout і потім добий primary enemy: second living enemy стає primary target, dead enemy не діє.
7. Заверши бій і натисни старі action/result кнопки: reward/settlement replay occurs once.
8. Стартуй наступний ordinary бій після перемоги над двома: очікування — знову two-enemy, primary на звичайному рівні, другий ворог з `+2` effective levels.
9. Переможи ще одну escalated пару й стартуй наступний ordinary бій: очікування — знову two-enemy, другий ворог уже з `+4` effective levels.
10. На high-level персонажі або fixed-seed локальному сценарії продовж серію до capped pressure: очікування — другий ворог не переходить effective level `23`, а картка показує `Натиск Низу` з applied/capped bonus.
11. Убий поточну ціль attack/class-skill дією так, щоб вона була жива на початку обміну: очікування — вона може один раз відповісти `в ту саму мить`, але не лікується, не ставить щит і не сапортить себе після `0 HP`.
12. Перевір mutual-KO: якщо герой і final enemy падають до `0 HP` в тому самому обміні, бій завершено як перемогу; якщо лишається інший живий ворог, це поразка.
13. Програй two-enemy бій після знешкодження одного ворога: очікування — є `За спробу` з більш ніж `+1 XP`, але без золота, без манаток і без нового прогресу справи.
14. Перерви серію loss/flee/expiry в eligible one-enemy або escalated two-enemy бою: наступний ordinary старт повертається до one-enemy.
15. Перевір Yeger, Adventure, training, duel, starter і `/dev_two_enemies`: вони не trigger/consume ordinary threat.
16. Після третьої ordinary перемоги більше не має зʼявлятися old `Низ просить тихіше` start denial для eligible ordinary start.

## 0.2.2 — Architecture stabilization smoke

Цей реліз не має змінювати ігрову поведінку. Перевіряй, що маршрути після рознесення bot registration і runtime lifecycle працюють як у `0.2.1`:

1. `/start` і один onboarding callback.
2. `/hero`, inventory item detail і equipment.
3. Поточна навігація Корчмою через reply keyboard та inline place callbacks.
4. Quest Hub → Adventure Choice.
5. Низ: passage preview і старт persistent fight.
6. Активний persistent fight redirects a blocked route back to combat.
7. Safe side surface during combat remains allowed.
8. Training або turn-based duel active lock restores its card.
9. Pending Barrel raid blocks one mutation and allows existing read-only shortcut.
10. Shynok overview and one drink/sale callback.
11. Nearby players and either duel targeting or safe gifting.
12. `/news`, `/help`, `/version`.
13. One stale/old callback.
14. Restart/reopen restores canonical durable state.

## 0.2.1 — Multi-enemy foundation smoke

1. Увімкнути локальні dev-команди й стартувати `/dev_two_enemies`.
2. Перевірити, що бойова картка показує два окремі HP-рядки ворогів і позначає поточну ціль.
3. Атакувати або застосувати класову дію: шкода має йти тільки в першу живу ціль.
4. Добити першу ціль: друга має стати primary target, а мертва ціль не має діяти в enemy phase.
5. На ході ворогів кожен живий ворог має отримати окремий короткий рядок дії.
6. Перемога настає тільки після смерті обох ворогів; flee/loss/expiry лишаються terminal для всього encounter.
7. Повторити старі turn/result кнопки після terminal state: settlement/reward replay має відбутися один раз, без per-enemy множника.
8. Перезапустити процес під час бою й перевірити, що `enemies` відновлюються з JSON, а legacy `monster` лишається primary mirror.
9. Стартувати звичайний `/fight`, Yeger, Adventure complication, training і duel routes: усі вони мають лишатися one-enemy.
10. Вимкнути dev-команди й перевірити, що `/dev_two_enemies` не зʼявляється в `/dev_help`.

## 0.2.0 — Safe gifting smoke

1. Два персонажі стоять активними в одній безпечній місцині.
2. Дарувальник відкриває `👀 Хто поруч` у будь-якій поточній місцині з 2+ активними пригодниками, бачить `🎁 Подарувати манатку`, обирає отримувача й одну придатну манатку.
3. Перед натисканням старої item-кнопки змінити порядок інвентаря або прибрати попередню в сортуванні річ: має обратися саме показана манатка або повернутися stale-selection, не сусідній shifted item.
4. Отримувач приймає: у дарувальника мінус одна одиниця, в отримувача плюс одна.
5. Повторити старі accept/cancel/decline кнопки: кількість не змінюється вдруге.
6. Спробувати екіпіровану, priceless/protected/story, reserved sale/chest/barter/gift річ: подарунок не створюється або accept stale-иться без мутації.
7. Поки gift pending і `expires_at` ще в майбутньому, спробувати продати/скинути/бартерити/подарувати ще одну одиницю того ж `itemId`: увесь stack лишається reserved.
8. Дочекатися пасивного expiry без натискання кнопок і перевірити, що той самий `itemId` знову доступний для gift/sale/chest/barter; старі accept/decline/cancel кнопки replay-ять `expired`.
9. Змінити stack/equipment/content між preview і accept: transfer fails safely.
10. Decline, cancel and expired offers replay their terminal state; cancel notifies the receiver, decline notifies the sender, repeated old terminal buttons do not send duplicate notices, and gift return buttons open the actor's current location instead of the Shynok.
11. Спробувати, коли будь-хто в incompatible combat lease: подарунок блокується.
12. Перезапустити процес між offer і accept: canonical transfer row лишається usable.

## 0.1.0 — Closeout smoke

Канонічний release gate для Phase 1 closure живе в [`docs/history/phase1/closeout-smoke.md`](../history/phase1/closeout-smoke.md). Для `0.1.0` він має покривати new player route, level 3+ persistent fight, HP/mana recovery, equipment effective stats, Mantok Chest auto/manual, Yeger tracking, Munchkin barter safety, Barrel/Shynok/presence, and public health/news/presence surfaces.

Автоматизований набір для release/docs closeout:

```bash
npm.cmd run db:validate
npm.cmd run lint
npx.cmd tsc --noEmit
npm.cmd test
npm.cmd run check
git diff --check
```

Додатковий balance smoke, якщо потрібно окремо перевірити бойову криву:

```bash
npm.cmd test -- tests/domain/resourceRegeneration.test.ts tests/services/fightService.test.ts tests/domain/lootEngine.test.ts tests/tooling/combatSimulation.test.ts
npm.cmd run simulate:combat -- --levels 3,4,8,13 --runs 200 --classes all
npm.cmd run sample:loot -- --levels 3,4,8,13 --runs 100 --seed 1221
```

Що дивитись у balance-звітах:
- рівні 3 і 4 не повинні бути нудно-легкими;
- рівні 8 і 13 не повинні виглядати як математична помилка;
- `needs-rest` і `/hero` мають чітко казати, що HP 0 — це пауза, а не тупик;
- loot sample має лишатися читабельним, а не перетворюватися на ведення війни з манатками.

## Передумови

1. Локальна БД згенерована й мігрована.
2. Бот запущений через `npm run dev` або `run-local-bot.cmd`.
3. Для реального Telegram playthrough у `.env` є `BOT_TOKEN`.
4. Для чистої перевірки можна видалити персонажа через `/restart` або локально через `/dev_reset_me`.

## Швидкий маршрут нового гравця

1. Напиши `/start` у Telegram.
2. Обери звертання, расу й клас кнопками.
3. Підтвердь пригодника на фінальному екрані.
4. Перевір персонажа через `/hero`, `/profile` або `/me`.
5. Перевір, що видно рівень, XP, золото, HP, ману й головну характеристику класу.

Очікування: повторні натискання onboarding callback-ів не створюють дублікати персонажа.

## Корчма, присутність і Бочка

1. Натисни `🗺️ Квести` надворі.
2. Переконайся, що бот підказує: квести видають усередині.
3. Відкрий `/tavern` або натисни `🍺 Корчма`.
4. Екран має показати «Залу корчми» і легкий список тих, хто нещодавно сидів за столами.
5. Перевір `/online` і `/look`.
6. Дані присутності мають бути приблизними: без точних timestamp-ів і без відчуття Telegram-стеження.

## Solo-рейд на Бочку Пінного Міражу

1. Перейди до `🛢️ Бочка`.
2. Натисни `🍺 У рейд на бочку`.
3. Корчмар має пообіцяти «Дві-три хвилини. Максимум».
4. Бот має показати pending-рейд із фактичним очікуванням: на 1 рівні межа `5-8` хвилин, на вищих рівнях можливий максимум росте на `30` секунд за рівень після першого.
5. Поки рейд pending, спробуй `🗺️ Квести`, `/adventure`, `/fight`, `/hunt` або `/cellar`.
6. Очікування: пригодові дії тимчасово заблоковані й не переносять пригодника з рейдової присутності біля Бочки.
   У локальному режимі можна викликати `/dev_raid_stop`, щоб достроково провести active pending-рейд через звичайне завершення; якщо XP піднімає рівень, має прийти звичайне окреме привітання.
7. На pending-картці натисни `🏅 Перевірити рейтинг` і `📰 Перевірити новини`.
8. Очікування: обидві поверхні мають кнопку `⬅️ До рейду`, яка повертає до актуальної картки Бочки.
9. Дочекайся завершення очікування без ручного натискання.
10. Має прийти окреме повідомлення з підсумком і винагородою; ручне `🍺 Перевірити бочку` після очікування лишається fallback.
11. На картці завершеного рейду натисни `🍺 Просте всім` і `🍻 Якісне всім`.
12. Очікування: відкривається Shynok social-round preview з поточною ціною; якщо золота замало, рейтинг щедрости все одно видно.
13. Повторне натискання за той самий рейдовий відтинок не дублює XP, золото або предмети.
14. Перевір, що довший завершений рейд дає більше XP/золота, а повторне натискання показує ті самі збережені значення.
15. Перевір, що після 23-ї хвилини наступної години за київським корчемним часом можна стартувати новий рейдовий відтинок.
16. Якщо тестуєш проміжок 03:00-07:00 за Києвом, новий старт має показати переоблік Бочки, а не створити pending-рейд; о 07:00 старт знову доступний.

## Шинок і «Всім пива»

1. Повернись до зали корчми.
2. Натисни `🍻 Шинок`.
3. Перевір, що відкрилась локація `🍻 Шинок`, а `👀 Хто поруч` показує людей саме в цій місцині.
4. Відкрий `🍹 Напої для себе`, купи чай або пиво й повтори confirm callback з історії.
5. Очікування: золото списується тільки один раз, active drink показує один поточний ефект, а заміна іншого напою вимагає окремого підтвердження.
6. Купи горілку з перцем і почни звичайний eligible PvE-бій у Низі.
7. Очікування: ефект споживається один раз на старті бою, зберігається в бойовому стані після reopen/replay і не переноситься в другий бій.
8. Перевір quick duel, покрокову дуель, стартову сутичку й тренування: напої не мають давати там бойової сили або зникати як використані.
9. Натисни `🍻 Всім пива` до зарахованого рейду, якщо перевіряєш чистий сценарій.
10. Очікування: корчмар відмовляє або підказує спершу заробити корчемну репутацію.
11. Після завершеного рейду натисни `🍻 Всім пива` ще раз.
12. Має з’явитися рейтинг щедрості й явний вибір простого або якісного раунду з поточною ціною.
13. Підтвердь раунд і перевір, що покупець не платить двічі при повторному callback.
14. Іншим персонажем без поточного напою відкрий Шинок і прийми/відхили запропонований кухоль; повторні accept/decline callback-и не мають створювати другий drink state.
15. Іншим персонажем із чаєм, пивом або queued горілкою натисни `Випити`: очікування — коротке попередження про заміну без зміни offer/drink/telemetry, фінальне підтвердження замінює рівно один раз, stale confirm після іншої заміни просить оновити Шинок.
16. Відкрий `💰 Продати манатки` з міксом придатних, екіпірованих, priceless/protected і zero-value речей.
17. Вибери одну одиницю, кілька різних речей і `Усе придатне`; підтвердження має показувати basket-level payout, а виключені речі не потрапляють у selection.
18. Перед confirm зміни екіпірування або кількість вибраної речі.
19. Очікування: sale confirm повертає stale-selection без списання речей і без додавання золота.
20. Підтвердь валідний sale і повтори callback: речі та золото змінюються тільки один раз.

## Стіл зі справами

1. Відкрий `/quest` або кнопку `🗺️ Квести` надворі чи всередині корчми.
2. Має відкритися компактний огляд квестів; на новому персонажі перший маршрутний квест веде до Корчми й Столу зі справами.
3. Натисни `📋 До столу зі справами`.
4. Має відкритися `📋 Стіл зі справами`; на першому маршруті квест завершується тільки після фактичного входу до столу, один раз і без дубля нагороди при повторному відкритті.
5. Hub має показувати лише актуальні справи й кнопку `📦 Архів`.
6. Натисни `📦 Архів`.
7. Очікування: завершені, retired і locked справи показані окремо, а кнопка `📋 До справ` повертає на активний список.
8. На новому персонажі 1 рівня закрий підозрілу шаурму й новачкову сутичку, потім відкрий архів: обидві стартові справи мають бути видимі як завершені, а герой має дорости до 2 рівня навіть після реморту.

## Вибір корчемної пригоди

1. На персонажі 3+ рівня натисни `🪧 Обрати пригоду` або відкрий `/adventure`.
2. Перевір, що бот показує три різні корчемні справи.
3. Обери одну справу.
4. Перевір, що замість старої лінійки `safe/flair/risky` видно 3-4 авторські методи під сцену, расу, клас або титул.
5. Обери метод і перевір результат: текст короткий, метод згадано, нагорода ідемпотентна, exact шансів і майбутньої винагороди не показано до натискання.
6. Якщо метод має малу золоту ціну, перевір персонажа з достатнім золотом і без нього: без золота справа не зараховується й гаманець не змінюється.
7. Повторне натискання старої кнопки в тому самому 93-хвилинному вікні не дублює XP, золото або манатки.
8. Старий `safe/flair/risky` callback з історії має показати stale-refresh/current offer, а не тихо обрати новий метод.
9. У локальному режимі виклич `/dev_adventure_reset` і перевір, що `/adventure` показує інші три справи в цьому самому вікні, а старі кнопки стають застарілими.
10. За активної persistent-сутички `/adventure` має показати safety-стан і не відкривати другу пригоду.

## Сутичка з Міміком-шаурмою

1. Натисни `⚔️ До сутички` або відкрий `/fight`.
2. Екран має показати preview HP пригодника й Міміка-шаурми.
3. Обери один авторський метод шаурми: базовий огляд, класову дію або signature/title-спосіб.
4. Очікування: результат deterministic для персонажа/дати/методу, з винагородою раз на збережену дату; старі `poke`, `receipt`, `flee` callback-и лишаються replay-safe.
5. HP після цієї сцени не зберігається, персонаж не може померти, повна combat state machine ще не створюється.
6. На персонажі 3+ рівня `/adventure` має показувати новий вибір корчемної пригоди, якщо немає активної persistent-сутички.

## Старший покроковий `/fight`

1. На персонажі 3+ рівня відкрий `/fight` усередині корчми.
2. Очікування: бот створює або відновлює один активний бій, показує HP/ману героя, HP монстра, номер ходу й кнопки `Вдарити`, `Захищатися`, класове вміння, `Відступити`.
3. Натисни `Вдарити`.
4. Очікування: змінюється monster HP, може змінитися HP героя, хід збільшується, останній результат видно в тексті.
4a. Якщо монстр має коротку репліку в останньому результаті, повторне відкриття тієї самої картки показує той самий текст, а не новий рандомний рядок.
5. Повторно натисни стару кнопку з попереднього ходу, якщо маєш її в історії.
6. Очікування: stale turn показує поточний стан і не проводить damage вдруге.
7. На магічному/містичному класі витрать або вручну зануль ману в тестовому стані й натисни skill.
8. Очікування: `мани не вистачило`, state не мутує, монстр не отримує безкоштовної відповіді.
9. Натисни `Захищатися`.
10. Очікування: хід просувається, incoming damage зменшується, а повторний захист не виглядає як нескінченна найкраща дія.
11. Дочекайся завершення короткого turn deadline на бойовому екрані, нічого не натискаючи.
12. Очікування: бойова картка сама оновлюється після таймера, спершу зараховується звичайна auto-атака за пропущений хід, а пізні старі кнопки не підміняють її.
13. Під час активного бою відкрий `🎒 Манатки`, `/inventory`, `/hero` і detail/equipment callback-и з торби після дедлайну.
14. Очікування: якщо після дедлайну side surface повертає до бою через combat lock, герой пропускає дію, монстр ходить, а новий хід відкривається без геройської автоатаки; пригодові маршрути на кшталт `Квести` чи `Корчма` все ще повертають до бою.
15. Натисни `Відступити` або доведи бій до завершення.
16. Очікування: завершений стан стабільний, action-кнопки зникають, повторні натискання не відкривають бій заново; для бою з Низу видно `⚔️ Новий бій` і повернення до Низу, а для adventure/Yeger handoff бою — тільки повернення до місця старту.
17. Для перемоги у старшому бою очікування: показується мала винагорода за бій — XP, золото й іноді одна манатка з monsterLoot.
18. Повторно натисни стару terminal/action кнопку після перемоги.
19. Очікування: бот показує той самий підсумок винагороди й не дублює XP, золото, item або level-up.
20. Loss/flee/expired не видають full victory reward і не збільшують видимий progress Korchmar problem chain.
21. Якщо перший problem-chain етап ще не взято, Стіл зі справами має показувати маршрут `🍻 До шинку`, а `/fight` має просити спершу взяти справу без `0/13` лічильника.
22. На 1 рівні Шинок не показує `📋 Взяти справу`, а старий callback не видає папірець; з 2 рівня у шинку `📋 Взяти справу` відкриває перший етап. Тільки після цього звичайна старша перемога збільшує видимий прогрес поточного problem-chain етапу, якщо це не `/spar`.
23. Коли поточний етап готовий, бій не має auto-claim reward: Стіл зі справами показує `🍻 До шинку`, у шинку `📋 Здати справу` видає одноразову нагороду, а `📋 Взяти наступну справу` окремо відкриває наступний етап зі свіжим лічильником.
24. На герої 7-8 рівня старший бій має брати найближчого доступного звичайного монстра, а не випадкову дрібноту 1-2 рівня; якщо контентного рівня ще бракує, XP/золото мають лишатися малими через рівень самого монстра, а не через окремий штраф за рівень героя.
25. У `Ярус I: Сутерени Корчми` перевір лівий/прямий/правий проходи: повторне відкриття того самого проходу до протермінування має показати того самого монстра, інший прохід може мати власну підозрілу тінь, preview copy має не вгадувати стать монстра, `Атакувати` має почати саме показаного монстра, а стара/протермінована кнопка має оновити preview з коротким поясненням замість мовчазного старту іншого бою.
25a. Відкрий preview в одному проході, перейди в інший прохід і натисни стару кнопку `Атакувати`: бот має лишити героя в поточному проході, оновити актуальну картку/клавіатуру і не створити бій зі старого місця.
26. Після кількох звичайних боїв у Низі перевір, що монстр не повторюється одразу, коли в обраному проході є інша придатна ціль; маленькі пули мають працювати без помилок і без зміни Єгерських/пригодницьких/тренувальних правил.
26a. Якщо новіші активні, Єгерські або пригодницькі бої є в історії, звичайний Низ усе одно має брати останніх звичайних монстрів для anti-repeat, а не поводитися так, ніби історія порожня.
27. Стартова картка старшого бою може показати один короткий контекстний настрій монстра; цей настрій не має міняти майбутній лут/XP/gold або Yeger-зарахування.
28. Дай живому монстрові зробити два ходи.
29. Очікування: до другого власного ходу монстра зʼявляється коротка пряма репліка, але повідомлення не перетворюється на стіну тексту.
28a. Якщо монстр застосовує названий прийом, останній результат має показати коротку українську дію з іконкою/назвою, без точних прихованих шансів або майбутніх винагород.
28b. Якщо монстр попереджає важкий прийом, наступна відповідь має спершу показати телеграф, а шкода/ефект мають прийти тільки на його наступній монстрячій активації.
28c. Після дедлайну або проваленого `Відступити` монстр має зробити рівно одну AI-відповідь: basic, defend, telegraph або ability, без подвійного ходу й без нової геройської автоатаки у skip-mode.
30. Поки рейд на Бочку pending, `/fight` і fight callback-и мають показувати рейдовий блок і не переносити presence зі сцени Бочки.

## Миттєва дуель

## 0.1.20 authored quest hardening addendum

Use this with the Adventure Choice, starter shawarma and cellar mouse smoke paths above:

1. On a level 3+ hero, open several Adventure Choice scenes and confirm each selected scene renders 5-7 concrete scene-action buttons, not race/class/signature source captions.
2. Pick two risky methods in different scenes. Before pressing, confirm the hint uses qualitative danger copy only; after completion, confirm any HP loss line shows the exact committed loss and current HP.
3. Try a paid cellar mouse method with insufficient gold. Confirm the same visible method set and cost remain available, no cooldown advances, no result is stored and HP does not change.
4. Complete a cellar mouse method that causes injury, then press the old button again while the cooldown is active. Confirm the on-cooldown path does not reroll, damage again or overwrite the stored audit payload.
5. Trigger a fight-handoff Adventure complication, then repeat the callback. Confirm the stored encounter id matches the started fight, and replay does not start a second fight.
6. With an already active unrelated fight, press a stale/late Adventure handoff callback. Confirm the adventure claim rolls back and the active fight card is shown instead of consuming the quest.
7. With an active training fight or terminal persistent fight, press a stale/late Adventure handoff callback. Confirm the claim rolls back and the final presence/card stays on the canonical training or solo-fight route, not the quest table.
8. Equip or level a hero so effective max HP exceeds the persisted base max, then take a quest injury. Confirm the stored audit keeps the damage-time effective max, while the result card's current HP line matches the returned post-claim `/hero` summary.
9. Test a capped item-grant method, then force rollback after the hero gains the same item again. Confirm rollback removes only the applied quest grant and preserves the later item quantity.

1. На двох персонажах 3+ рівня зайди в `🥊 Бійцівський куток` і створи `⚡ Миттєва дуель`.
2. Очікування: основна картка каже, що результат зʼявиться одразу після згоди, а окреме forwardable-повідомлення має invite link, mode line, fairness line і кнопку `🎲 Інший текст`.
3. Натисни `🎲 Інший текст` автором виклику.
4. Очікування: змінюється тільки текст invite-повідомлення; посилання, token, строк дії й challenge state не змінюються.
5. Натисни `🎲 Інший текст` іншим користувачем.
6. Очікування: короткий callback answer, без edit-а повідомлення.
7. Прийми invite повністю відновленим персонажем.
8. Очікування: немає stale resource warning; перед вирішенням видно explicit confirmation, потім один збережений результат без XP, золота, манаток, quest progress, ставок або втрат.
9. Прийми invite персонажем із частковим HP, частковою маною і обома частковими ресурсами.
10. Очікування: warning описує саме ресурси приймача; після явного confirm результат рахується з малою втомою, але без автоматичної поразки.
11. Створи пару з великою різницею рівня або реморту й прийми дуель.
12. Очікування: Telegram copy не показує формул, але результат не виглядає як гарантована перемога старшого персонажа; манатки й спорядження лишаються персональними.
13. Після resolved-картки зміни імʼя, рівень/реморт або спорядження одного учасника й відкрий стару картку знову.
14. Очікування: replay-facing імена/рівні нової картки лишаються такими, як на момент прийняття, і результат не reroll-иться.

## Покрокова дуель

1. На двох персонажах 3+ рівня зайди в `🥊 Бійцівський куток` і створи `♟️ Покрокова дуель`.
2. Очікування: forwardable-повідомлення має `duel_turnbased_<token>`, mode line для покрокової дуелі, fairness line і кнопку `🎲 Інший текст`.
3. Прийми invite другим персонажем.
4. Очікування: обидва учасники отримують battle card із двома іменами, HP/маною, номером раунду і коротким нагадуванням про 23 секунди на старті.
5. Одним учасником натисни `⚔️ Атакувати`.
6. Очікування: тільки цей учасник бачить свій записаний вибір; інший не бачить дію, шкоду або витрату мани, а persistent HP/мана персонажа не списуються.
7. Другим учасником натисни класову дію.
8. Очікування: раунд просувається рівно один раз, обидві картки відкривають результат, а витрата мани/cooldown збігається з бойовим правилом `/fight`.
9. В іншому раунді натисни `🛡 Захищатися`.
10. Очікування: вибір лишається прихованим до reveal і зменшує incoming damage у цьому раунді.
11. Натисни стару кнопку того самого раунду або повторний вибір після запису.
12. Очікування: бот показує поточний канонічний стан і не проводить другий раунд.
13. Дай одному раунду прострочитися або перезапусти бота й відкрий дуель після дедлайну.
14. Очікування: пропущений вибір ідемпотентно стає звичайною атакою мовчазного учасника, без дубля при повторному відкритті.
15. Під час активної покрокової дуелі натисни `Квести`, `Корчма` або інший пригодовий маршрут.
16. Очікування: combat lock повертає до канонічної картки дуелі; самі duel turn callback-и не блокуються.
17. Натисни `🏳️ Здатися`.
18. Очікування: дуель завершується, результат replay-safe, active lock знято, результат показує малий XP для обох учасників, `🔁 Реванш` створює покроковий реванш.
17. Двома персонажами стань в одній місцині, натисни `👀 Хто поруч` → `🥊 Кинути виклик присутнім`.
18. Очікування: список показує активних поруч із пагінацією, не показує самого гравця, дає вибрати персонажа й формат `⚡` або `♟️`.
19. Обери формат і перевір другий акаунт.
20. Очікування: другому гравцю приходить in-game invite з opt-in кнопками; якщо Telegram не доставив приватне повідомлення, створений pending-виклик у автора не дублює gameplay state.
21. Відхили адресний виклик другим акаунтом.
22. Очікування: автор отримує коротке best-effort сповіщення про відмову; повторний старий decline callback не надсилає друге сповіщення.
23. Відкрий завершену покрокову дуель старим посиланням і повторно натисни старі action/result кнопки.
24. Очікування: показується той самий stored XP, а XP персонажів не збільшується вдруге.

## Єгерська справа `/hunt`

1. На персонажі 1-3 рівня усередині корчми відкрий `/hunt` або `🗺️ Квести`.
2. Очікування: Єгерська справа locked до 4 рівня, action-кнопка `🏹 До Єгеря` не показується, quest start row не створюється.
3. На персонажі 4+ рівня усередині корчми відкрий `/hunt` або `🗺️ Квести` → `🏹 До Єгеря`.
4. Очікування: видно `🧥 Єгерський куток`, справу `Неспокійні справи`, нагороду й кнопку `🏹 Взяти справу`.
5. Натисни `🏹 Взяти справу`.
6. Очікування: старт ідемпотентний, створюється `quest.yeger.unquiet-trial.started` з `localDate: once`, XP/золото не нараховуються.
7. Натисни `👣 Вийти на слід`.
8. Очікування: бот створює короткий persisted tracking wait через `character_cooldowns`, XP/золото не нараховуються, повторне натискання не скорочує час.
9. Відкрий `/hunt` під час очікування.
10. Очікування: видно pending-стан сліду й кнопку `⏳ Чекати слід`.
11. Після очікування відкрий `/hunt` або натисни стару кнопку.
12. Очікування: видно ready-стан і кнопку `🔎 Перевірити слід`.
13. Натисни `🔎 Перевірити слід`.
14. Очікування: перевірка або стартує/повертає ordinary non-boss бій з тегом `undead`, `ghost`, `cursed` чи `unquiet`, або показує no-fight результат без прогресу й винагород.
14a. Якщо перед цим три звичайні бої в Низі підняли ordinary threat, ready Єгерський слід усе одно має стартувати/повернути цільовий бій як Yeger route, без ordinary two-enemy escalation.
15. Якщо активний інший старший бій уже є, бот повертає його без створення другого й не називає нецільового монстра неупокоєною ціллю.
16. Виграй цільовий старший бій і повернись до `/hunt`.
17. Очікування: прогрес росте тільки за перемоги після старту справи; lost/fled/expired і wrong-tag монстри не рахуються.
17a. У локальному режимі можна викликати `/dev_yeger_first_done`: це має створити реальні terminal win rows до `5/5`, але не створити completed quest row і не видати reward до звичайної здачі.
18. Після `5/5` натисни `🏹 Здати Єгерю`.
19. Очікування: одноразова нагорода з рівнево обмеженим XP, `+120 золота`, `Єгерська риска на дощечці`; повторний callback не дублює винагороду.
20. Після першої здачі знову відкрий `/hunt`.
21. Очікування: Єгер пропонує наступну дощечку `Неспокійні справи 2.0` на `17` цілей із прогресом `0/17`, окремим стартом і без повторної риски з першої нагороди.
21a. У локальному режимі після зданої першої дошки можна викликати `/dev_yeger_second_done`: це має створити реальні terminal win rows до `17/17`, після чого друга дошка здається звичайною кнопкою з нормальними reward/achievement hooks.
22. Візьми другу дощечку, переможи одну правильну ціль, потім зроби реморт.
23. Очікування: після реморту `/hunt` починає Єгерський ланцюжок заново з першої дощечки `0/5`, без перенесення старого `1/17`.
24. Старі `v1:hunt:*` callback-и мають безпечно оновити Єгерську дошку, а не видати стару hourly reward.
25. Поки рейд на Бочку pending, `/hunt`, Yeger/hunt callback-и й bestiary callback-и не мають переносити presence зі сцени Бочки; reward actions мають показати рейдовий блок.

## Бестіарій

1. Виклич `/bestiary` на персонажі 1-2 рівня.
2. Очікування: бот показує level gate до 3 рівня й не виводить список монстрів або Міміка-шаурму.
3. Відкрий Стіл зі справами на 1-2 рівні.
4. Очікування: кнопки `📖 Бестіарій` ще немає.
5. Виклич `/bestiary` або `/monsters` на персонажі 3+ рівня.
6. Перевір, що видно короткий список монстрів, `⬅️`/`➡️` там, де сторінки існують, і кнопку `🏹 До дошки`.
7. Натисни `🔎` біля будь-якого монстра.
8. Очікування: detail-запис короткий, український, із HTML-форматуванням без сирих тегів; можливі трофеї подані як нотатки, не гарантований drop.
9. Очікування: це той самий довідковий бестіарій, без зміни локації чи видачі нагород.

## Льохова справа

1. На персонажі 1 рівня відкрий `/quest` або `/cellar` усередині корчми.
2. Очікування: Льохова справа locked до 2 рівня, в активному списку її немає, action-кнопка `🧹 У льох` не показується, presence не переходить у льох.
3. Відкрий `📦 Архів` і перевір, що locked-рядок льохової справи видно там.
4. На персонажі 2-3 рівня, коли денна шаурма й сутичка вже витрачені, відкрий `/quest` або `🗺️ Квести` усередині корчми.
5. Обери «Льохову справу» й перевір, що кнопки можуть включати сценовий, race/class/signature і малий paid-метод; результат не має показувати службові підписи цих слотів.
6. Якщо paid-метод доступний, перевір достатньо/недостатньо золота: без золота cooldown не стартує, item grants не дублюються, золото не списується.
7. Одразу повтори завершений callback.
8. Очікування: результат має авторський мишачий outcome і дрібний трофей відповідної legacy-family дії.
9. Очікування: короткий SQLite cooldown не дозволяє дублювати XP/золото або item grants.
10. Старі `v1:cellar:*` callback-и лишаються replay-safe і не починають несподівано paid-метод без явного v2 method callback.
11. Штучний або старий `v2` method id, якого вже немає в поточній сцені, показує stale/refresh стан і не стартує cooldown, не списує золото й не видає нагороду.
12. `/cellar` працює як secondary fallback command, а не як окремий великий activity engine.
13. На персонажі 4+ рівня `/cellar` або quest-hub льох має відкрити `Справа не до миші`, позначити presence у `Льох корчми` і не показувати старі мишачі action-кнопки.
14. Якщо золота вистачає, натисни `🧀 Купити пломбу`.
15. Очікування: золото списується один раз, `Сирна пломба Корчмаря` зʼявляється один раз, повторний callback не списує золото вдруге.
16. Натисни `🐭 Домовитись без пломби` на іншому тестовому персонажі або зі штучним deterministic roll.
17. Очікування: success видає `Пляшка Пінного Міражу` максимум один раз, failure ставить cooldown для повторної roleplay-спроби, але route через пломбу лишається доступним.
18. Після отримання пляшки перевір, що льоховий екран веде до `🍻 Шинку`, а не показує `🍾 Здати Корчмарю` чи `🎒 Лишити собі` в льосі.
19. У шинку натисни `🍾 Здати пляшку`.
20. Очікування: здача пляшки остаточна, повторне натискання показує already-completed стан і не дублює XP, золото, bottle item або completion progress.

## Манатки й прогрес

1. Перевір `/inventory`, `/items` або `/bag`.
2. Перші збережені манатки мають з’явитися в торбі після відповідних активностей.
3. Для одиничної манатки не треба показувати `×1`.
4. Очікування: `/inventory` показує сумарну оціночну вартість усіх priced манаток; `безцінні` трофеї не додають золота.
5. Якщо у списку більше однієї видимої манатки, перевір кнопки `🕒 Нові спершу` / `🕒 Нові в кінці` і `🔤 А-Я` / `🔤 Я-А`: порядок має зберігатися після пагінації, reply-вибору сторінки, відкриття detail і повернення назад.
6. Натисни inline-кнопку конкретної манатки й перевір деталі: рідкість, категорію, вартість або `безцінна`, опис, кількість і чи це трофей або equippable річ.
7. Очікування: вартість лише показується; кнопок продажу, обміну або списання предметів ще немає.
8. Перевір reachable starter gear: `/fight` з дією `Вдарити` дає `item.pan-of-persuasion`, `/fight` з дією `Збити з пантелику чеком` дає `item.stamp-of-minor-authority`, переговори з мишею можуть дати `item.cork-ring-of-serious-business`, а завершена Бочка — `item.apron-of-foam-resistance`.
9. Для owned weapon/armor/accessory натисни `🧥 Екіпірувати`, потім `🧥 Спорядження` або відкрий `/equipment`, `/gear`, `/equip`.
10. Очікування: видно збережену манатку в правильному слоті; weapon → зброя, armor → тулуб, accessory → аксесуар. Голова й ноги не показуються як живі слоти, доки для них немає реального content.
11. Натисни `Зняти` для зайнятого слота й перевір, що слот очищується, а манатка лишається в інвентарі.
12. Очікування: екран показує ефект екіпірованої речі, наприклад `+2 до удару`, `+1 до захисту` або `+1 Вдачі`.
13. Перевір `/hero`: XP, золото й рівень не змінюються від переодягання, але HP/stat/equipment contribution rows мають показати внесок спорядження; поруч із золотом видно display-only суму в манатках.
14. Smoke для бою: екіпіруй пательню або фартух, почни level 3+ `/fight`, перевір, що нова сесія має effective HP/ману, а бойові ходи відчувають weapon/armor бонус. Переодягання під час активного бою може вплинути на наступні хідні розрахунки, але не має лікувати або доливати ману в уже збереженій сесії.
15. На активному бойовому екрані перевір клавіатуру: мають бути тільки бойові дії й `Відступити`; `⬅️ До столу` або інша втеча до quest hub має зʼявлятися тільки після завершення/втечі/поразки, не під час активного бою.
16. Без пригодника `/inventory`, item detail зі stale callback і `/equipment` мають показувати `/start`, а не ганяти inline-кнопками між екранами.
17. Level-up має бути видимим без ручного ремонту старих персонажів. На `🏅 Пропамʼятна дошка` блок `Реморти Тринадцятки` має показувати всі відомі реморти, а кнопки `Реморт 1`, `Реморт 2` тощо мають відкривати перші зарубки рівнів після вибраного реморту, не базові рівні до нього, якщо для цього життя є дані; персонаж не має дублюватися в одному рівні через legacy/backfill/recorded зарубки.
18. Відкрий `/inventory` і натисни `♻️ До Дружньої Скрині`.
19. Очікування: видно eligible count і кнопки `Згодувати 5 найдешевших`, `Обрати вручну`, `Що вона робить?`, `⬅️ До манаток`.
20. Якщо eligible units менше 5, Скриня має показати friendly no-op і нічого не списати.
21. Якщо eligible units 5+, натисни auto-pick і перевір confirmation: видно рівно 5 units, warning про остаточне списання і confirm/cancel.
22. Confirm має зменшити сумарну кількість inventory units на 4: 5 input units зникають, 1 output unit додається.
23. Повторний confirm callback має показати той самий результат і не додавати ще одну output-манатку.
24. Екіпірований `itemId`, `priceless` і protected/story items не мають потрапляти в eligible count. Через stack-based inventory увесь екіпірований stack захищений.
25. Натисни `Обрати вручну`: екран має показати `0/5`, сторінки, eligible stacks і кнопки додавання/знімання по одній одиниці.
26. Обери 4 units і спробуй перейти до підтвердження через stale/стару кнопку, якщо вона лишилась у чаті: Скриня не має списувати манатки.
27. Обери рівно 5 units: має зʼявитися або стати доступним confirmation із warning, що ці 5 речей зникнуть назавжди.
28. Manual confirm має зʼїсти саме вибрані 5 units, створити рівно 1 output, а повторний confirm має показати той самий результат без нового списання.

## Манчкін-скупник

1. Вийди надвір перед корчмою і натисни `🎒 Манчкін-скупник`.
2. На персонажі з eligible priced манаткою й достатньою сумою манаток + золота натисни auto-preview.
3. Очікування: preview показує конкретні selected stacks, скільки золота докладається з гаманця, переплату й перехід рівня.
4. Натисни confirm.
5. Очікування: списується щонайменше одна eligible манатка, докладене золото, рівень росте рівно на `+1`, XP carry зберігається, milestones записуються.
6. Повторно натисни стару confirm-кнопку.
7. Очікування: бот replay-ить той самий успішний обмін і не списує манатки, золото або рівень вдруге.
8. Перевір персонажа з `1000+` золота, але без eligible priced манаток.
9. Очікування: gold-only і gold-heavy обміни відхилено; Манчкін просить манаток щонайменше на 587 золота.
10. Перевір екіпіровану, безцінну, protected/story, zero-value або missing-content манатку.
11. Очікування: вона не потрапляє в eligible суму й не списується.
12. На спробі переходу `12 → 13` очікування: Манчкін відмовляє, бо 13 рівень лишається бойовим.
13. Поки рейд на Бочку pending, натисни стару кнопку Манчкіна.
14. Очікування: бот показує рейдовий блок і не проводить preview/confirm.

## Реморт після 13 рівня

1. На персонажі нижче 13 рівня виклич `/remort`.
2. Очікування: бот пояснює, що реморт відкривається тільки на 13 рівні, і не створює draft.
3. На персонажі 13 рівня виклич `/remort`.
4. Очікування: видно preview, який прямо каже, що це не `/restart`: рівень, XP, золото, активні бої й екіпірування скинуться, але історія ремортів і кілька явно вибраних манаток можуть піти далі.
5. Зміни звертання, расу або клас через inline-кнопки.
6. Очікування: preview оновлюється без reset-а персонажа.
7. Обери до 5 owned манаток.
8. Очікування: екіпіровані, priced power/effect, protected, story і безцінні манатки зʼявляються як selectable, якщо вони є owned items; archived/unknown ids мають бути видимими fallback-рядками, а не прихованим перенесенням. Кожен вибраний item id переносить по 1 одиниці.
9. Натисни confirm.
10. Очікування: персонаж стає 1 рівня з 0 XP/золота, новою анкетою, очищеним екіпіруванням, закритими active solo fights і малим бонусом памʼяті минулих пригод.
11. Повторно натисни стару confirm-кнопку.
12. Очікування: бот replay-ить той самий реморт і не додає другий remort count, bonus або duplicate items.
13. Відкрий `/hero`.
14. Очікування: видно `Памʼять минулих пригод`, якщо реморт уже був, без дублювання кількости ремортів і без публічної шкали `x/5`; результат реморту показує HP/ману й характеристики, які прийшли зі спомином.
15. Відкрий надвірну дошку памʼяті біля корчми.
16. Очікування: блок `Реморти Тринадцятки` показує перші реморти без технічних id і точних timestamp-ів.

## Сервісні команди

- `/version` — показує поточну версію бота.
- `/news` — читає останню новину й архів із `news.md`.
- `/chronicles` — відкриває `📜 Хроніки Квестарні` / `📣 Останні події`.
- `/restart` — видаляє персонажа поточного Telegram-користувача після підтвердження.
- `/remort` — після 13 рівня відкриває explicit prestige reset із preview, памʼяттю минулих пригод і без прихованого wipe.
- `/dev_help` — у локальному режимі показує доступні dev-команди.
- `/dev_reset_me` — у локальному режимі видаляє тільки персонажа поточного користувача після підтвердження.
- `/dev_add_level [число]` — у локальному режимі додає вказану кількість рівнів; без числа додає 1 рівень.
- `/dev_heal [число]` — у локальному режимі лікує поточного персонажа, зокрема під час активного бою; без числа лікує до максимуму.
- `/dev_add_bandage [число]` — у локальному режимі додає бинти відповідальної паніки; без числа додає один бинт.
- `/dev_add_dense_bandage [число]` — у локальному режимі додає щільні бинти; без числа додає один щільний бинт.
- `/dev_add_field_kit [число]` — у локальному режимі додає польові аптечки; без числа додає одну аптечку.
- `/dev_add_yeger_line [число]` — у локальному режимі додає єгерські риски на дощечці; без числа додає одну риску.
- `/dev_reset_yeger_bandage` — у локальному режимі скидає таймер безкоштовного бинта Єгеря для поточного персонажа.
- `/dev_reset_yeger_trail` — у локальному режимі завершує очікування взятого Єгерського сліду для поточного персонажа.
- `/dev_reset_cellar_mouse` — у локальному режимі скидає cooldown повторюваної льохової справи миші та дорослішої мишачої домовлености для поточного персонажа.
- `/dev_reset_priest_blessing` — у локальному режимі скидає cooldown жрецького благословення/підтримки для поточного персонажа.
- `/dev_reset_quiet_pocket` — у локальному режимі скидає cooldown злодійської `Тихої кишені` для поточного персонажа.
- `/dev_reset_rogue` — у локальному режимі скидає cooldown `Тихої кишені` й забуває цілі, які цей злодій уже перевіряв поточного київського дня.
- `/dev_yeger_first_done` — у локальному режимі доводить першу Єгерську дошку до `5/5` реальними перемогами, лишаючи звичайну здачу квеста.
- `/dev_yeger_second_done` — у локальному режимі доводить другу Єгерську дошку до `17/17` реальними перемогами після зданої першої дошки, лишаючи звичайну здачу квеста.
- `/dev_adventure_reset` — у локальному режимі скидає й перетасовує поточний вибір пригоди для швидкого ручного тесту.
- `/dev_reset_korchma_round` — у локальному режимі скидає поточний київський день Корчмарського обходу для швидкого ручного тесту.
- `/dev_raid_stop` — у локальному режимі завершує active pending-рейд на Бочку через звичайну reward-логіку й показує level-up привітання, якщо XP вистачило на рівень.
- `/dev_raid_reset` — у локальному режимі скидає pending-таймер, зарахований поточний відтинок Бочки й 3-хвилинний кулдаун після програшу Старшому Брату Бочки без reward-логіки, щоб швидко повторити рейд у тому самому періоді.
- `/dev_raid_win` — у локальному Big Barrel Brother бою виставляє HP Старшого Брата Бочки в `0`; наступна дія або timeout має завершити рейд перемогою ватаги, навіть якщо всі учасники теж на `0 HP`.
- `/dev_reset_monster_rest` — legacy local helper; після `0.2.3` eligible ordinary starts більше не блокуються monster-rest denial, тож команда лишається harmless cleanup для старих локальних сценаріїв.
- `/dev_two_enemies` — у локальному режимі стартує ordinary persistent бій із двома ворогами для перевірки multi-enemy foundation; він не trigger/consume production ordinary threat escalation.

## `0.1.0` Phase 1 Definition of Done

Це поточний короткий Definition of Done для закритої Phase 1 петлі. Детальний ручний маршрут живе в [`docs/history/phase1/closeout-smoke.md`](../history/phase1/closeout-smoke.md):

1. `/start` створює персонажа без дублювання.
2. `/hero` показує level, XP, gold, HP, mana, stats, next-level forecast і equipment summary.
3. `/fight` стартує active combat, а не старий one-click probe.
4. Fight screen має HP/mana героя й HP ворога.
5. Attack змінює monster HP.
6. Class/special action має зрозумілий cost/effect.
7. Flee завершує fight без повної винагороди.
8. Mana too low має зрозумілий fallback.
9. Повторний callback того самого ходу не проводить ще один хід.
10. Victory видає XP/gold/item.
11. Для персонажа 3+ у `Низ` перевір три проходи: правий відчутно скромніший за прямий, лівий платить більше досвіду за прямий для схожої базової загрози, золото в бою варіюється, а нульове золото частіше компенсується манаткою.
12. `/inventory` показує item, а item detail показує rarity, value/priceless і effect, якщо є.
13. `/equipment` дозволяє екіпірувати owned equippable item.
14. `/hero` змінює effective stats після equip.
15. Наступний fight показує або використовує змінені values.
16. Level-up text показується при перетині threshold і перелічує distributed stat delta.
17. Level 13 cap / alpha behavior зрозумілий.
18. Mantok Chest auto/manual працює як перший item-volume sink.
19. Yeger tracking і turn-in не дублюють прогрес або reward.
20. Munchkin barter не дозволяє gold-only/gold-heavy обмін, replay-ить completed confirm і не проводить `12 -> 13`.
21. `/version` після deploy показує `0.1.0`.

## Що це ще не перевіряє

- Persistent HP loss і смерть персонажа.
- Магазини, продаж, обмін, crafting, consumable item actions і item-to-level exchange.
- Групові raid rows.
- Ґільдії, PvP, market і seasons.

Ці речі мають з’являтися окремими маленькими PR з власними tests і оновленням релевантних docs.
