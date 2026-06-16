# Loot Drops V1

Поточна гра має просту item schema. Цей документ описує monster → item mapping без вимоги негайно робити random loot engine.

У `0.0.17` `/hunt` використовує цей mapping дуже вузько: один детермінований щогодинний контракт може видати максимум один трофей із відповідного списку, тільки через `daily_actions` і без повної випадкової таблиці здобичі.

У `0.0.18` `/bestiary` і `/monsters` можуть показувати ці mappings як «можливі трофеї за нотатками». Це read-only hint, не гарантія drop-а і не повний random loot engine.

У `0.0.24` ordinary ladder рівнів 4–13 теж отримав окремі трофейні нотатки, щоб старші solo-fight монстри не лишалися без flavor-loot покриття.

## Мімік-шаурма — `monster.mimic-shawarma`

- Loot ids: `item.suspicious-shawarma-wrapper`, `item.receipt-of-formal-suspicion`, `item.stamp-of-minor-authority`
- Note: Мімік не падає — він розгортається у докази.

## Льохова Миша з Титулом — `monster.basement-mouse-with-title`

- Loot ids: `item.cheese-of-procedural-doubt`, `item.napkin-of-mouse-diplomacy`, `item.cork-ring-of-serious-business`
- Note: Лут пахне сиром, але поводиться як документ.

## Скелет-вахтер печаток — `monster.stamp-doorkeeper-skeleton`

- Loot ids: `item.stamp-pad-of-last-warning`, `item.bone-key-of-half-access`
- Note: Кістки не забираємо. Забираємо те, чим вони заважали.

## Гоблін з Електронною Табличкою — `monster.spreadsheet-goblin`

- Loot ids: `item.cell-of-responsible-pain`, `item.formula-of-small-losses`
- Note: Трофей дрібний, зате порахований із зайвою точністю.

## Павук дедлайнів — `monster.deadline-spider`

- Loot ids: `item.web-of-tomorrow-promise`, `item.hourglass-with-deadline-teeth`
- Note: Павутина липне до планів, але продається як сувенір.

## Дракончик попереднього погодження — `monster.preapproval-dragonling`

- Loot ids: `item.scale-of-preliminary-approval`, `item.tiny-fire-permit`
- Note: Гаряче, але погоджено. Майже.

## Привид непрочитаних правил — `monster.unread-rules-ghost`

- Loot ids: `item.bookmark-of-unread-courage`, `item.sigh-of-regulation`
- Note: Упав не привид, а закладка. Вона теж втомилась.

## Зграя капців тривожної мобільности — `monster.anxious-slippers-swarm`

- Loot ids: `item.left-slipper-of-tactical-retreat`, `item.sole-of-nervous-mobility`
- Note: Один капець завжди тікає. Саме тому трофей один.

## Борщовий слизень правильної температури — `monster.borshch-slime`

- Loot ids: `item.beet-of-thermal-doubt`, `item.apron-stain-of-courage`
- Note: Не їсти без корчмарського дозволу. Носити як доказ — можна.

## Буханець-бандит умовної нарізки — `monster.conditionally-sliced-loaf-bandit`

- Loot ids: `item.crust-of-conditional-surrender`, `item.bread-knife-of-polite-boundaries`
- Note: Скоринка здалась окремо від середини. Формально це перемога.

## Ґарґулья лічильника черги — `monster.queue-counter-gargoyle`

- Loot ids: `item.ticket-number-never-called`, `item.gargoyle-chip-of-patience`
- Note: Номерок не викликали, отже він ваш назавжди.

## Комар-ревізор дрібних витрат — `monster.audit-mosquito`

- Loot ids: `item.proboscis-of-small-audit`, `item.buzzing-receipt-copy`
- Note: Дзижчання лишилось у копії чека. На жаль, воно теж трофей.

## Архівний книшоїд — `monster.archival-knysh-eater`

- Loot ids: `item.crumb-of-archival-knysh`, `item.folder-with-bite-marks`
- Note: Крихта має інвентарний номер. Не питайте чому.

## Троль останнього коментаря — `monster.final-comment-troll`

- Loot ids: `item.comment-pebble-of-final-word`, `item.underbridge-moderation-badge`
- Note: Останній коментар тепер у торбі. Він усе ще намагається відповісти.

## Медузка звітности — `monster.report-jellyfish`

- Loot ids: `item.tentacle-of-soft-reporting`, `item.ink-bubble-of-quarterly-panic`
- Note: Щупальце не жалить, якщо не питати про квартальні цілі.

## Крамарик без здачі — `monster.no-change-merchantling`

- Loot ids: `item.button-of-exact-change`, `item.receipt-folded-into-accusation`
- Note: Здачі не було. Був ґудзик із позицією.

## Дзеркальце зайвої самокритики — `monster.self-critique-mirror`

- Loot ids: `item.shard-of-constructive-offense`, `item.frame-of-almost-confidence`
- Note: Скалка критикує торбу, але лежить чемно.

## Чайник сухого моря — `monster.dry-sea-teapot`

- Loot ids: `item.whistle-of-dry-tide`, `item.lid-of-maritime-overthinking`
- Note: Свисток досі кличе приплив, але приходить тільки чай.

## Капустяний лицар на перерві — `monster.cabbage-knight-on-break`

- Loot ids: `item.leaf-of-folded-honor`, `item.sauerkraut-squire-badge`
- Note: Честь згорнута в листок. Зберігати в сухому місці.

## Податковий дракон нульової декларації — `monster.zero-declaration-tax-dragon`

- Loot ids: `item.scale-of-zero-declaration`, `item.candle-of-fiscal-dread`
- Note: Дракон не віддав скарб. Він видав «тимчасово не заборонено».

## Скаргова лампа — `monster.complaint-lantern`

- Loot ids: `item.wick-of-complaint-light`
- Note: Лампа лишає по собі тільки гніт і підозру, що скарга ще не закрита.

## Кабан прибутково-видаткової книги — `monster.ledger-boar`

- Loot ids: `item.hoofprint-ledger-scrap`
- Note: Кабан риє в рахунках так, ніби шукає останню копійку в полі.

## Крендель солоної обіцянки — `monster.salted-oath-pretzel`

- Loot ids: `item.salt-knot-of-oath`
- Note: Крендель ламається, але офіційно це називає компромісом.

## Мапа коридору, яка бреше — `monster.liar-corridor-map`

- Loot ids: `item.folded-wrong-turn`
- Note: Мапа показує вихід рівно до того моменту, поки ви не повірите.

## Пінний ревізор у чоботях — `monster.foam-auditor-boots`

- Loot ids: `item.foam-stained-checklist`
- Note: Ревізор лишає після себе не трофеї, а порядок у кружках.

## Химера трьох підписів — `monster.three-signature-chimera`

- Loot ids: `item.third-signature-scale`
- Note: Три голови, дві правки, одна правильна печатка.

## Наглядач сирного сховку — `monster.cheese-vault-warden`

- Loot ids: `item.cold-cheese-key`
- Note: Сирний сховок не ділиться запасами, але дуже любить ключі.

## Гідра календарних переносів — `monster.calendar-hydra`

- Loot ids: `item.weekday-slip-of-postponement`
- Note: Один день відрізався, два виросли, а годинник образився.

## Пророк інвентарної недостачі — `monster.inventory-prophet`

- Loot ids: `item.missing-label-prophecy`
- Note: Пророк каже, що бракує саме того, що ви щойно шукали.

## Писар тихої катастрофи — `monster.quiet-catastrophe-clerk`

- Loot ids: `item.calm-apocalypse-memo`
- Note: Катастрофа зберігається в папці, а папка просить не панікувати.

## Item definitions and effects

Source of truth for current item slots, rarity, valuation and effects is `src/content/monsterLootItems.ts`.

As of `0.0.26`, most handcrafted monster trophies are intentionally equippable and effect-bearing: common trophies usually provide one small hook, uncommon trophies combine two small hooks or a resource bump, and rarer trophies get a slightly clearer identity. A few keepsake/story scraps remain pure `junk` so Квестарня can still have funny evidence that does not pretend to be gear.

Stable ids in this pack:

- `item.stamp-pad-of-last-warning`
- `item.bone-key-of-half-access`
- `item.cell-of-responsible-pain`
- `item.formula-of-small-losses`
- `item.web-of-tomorrow-promise`
- `item.hourglass-with-deadline-teeth`
- `item.scale-of-preliminary-approval`
- `item.tiny-fire-permit`
- `item.bookmark-of-unread-courage`
- `item.sigh-of-regulation`
- `item.left-slipper-of-tactical-retreat`
- `item.sole-of-nervous-mobility`
- `item.beet-of-thermal-doubt`
- `item.apron-stain-of-courage`
- `item.crust-of-conditional-surrender`
- `item.bread-knife-of-polite-boundaries`
- `item.ticket-number-never-called`
- `item.gargoyle-chip-of-patience`
- `item.proboscis-of-small-audit`
- `item.buzzing-receipt-copy`
- `item.crumb-of-archival-knysh`
- `item.folder-with-bite-marks`
- `item.comment-pebble-of-final-word`
- `item.underbridge-moderation-badge`
- `item.tentacle-of-soft-reporting`
- `item.ink-bubble-of-quarterly-panic`
- `item.button-of-exact-change`
- `item.receipt-folded-into-accusation`
- `item.shard-of-constructive-offense`
- `item.frame-of-almost-confidence`
- `item.whistle-of-dry-tide`
- `item.lid-of-maritime-overthinking`
- `item.leaf-of-folded-honor`
- `item.sauerkraut-squire-badge`
- `item.scale-of-zero-declaration`
- `item.candle-of-fiscal-dread`
- `item.wick-of-complaint-light`
- `item.hoofprint-ledger-scrap`
- `item.salt-knot-of-oath`
- `item.folded-wrong-turn`
- `item.foam-stained-checklist`
- `item.third-signature-scale`
- `item.cold-cheese-key`
- `item.weekday-slip-of-postponement`
- `item.missing-label-prophecy`
- `item.calm-apocalypse-memo`
