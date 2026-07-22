# Поточний стан 0.3.x

## Репозиторій

- `main` package version: `0.3.14` на SHA
  `d101867cd80f9c05505899ac7b42adf92e369527`.
- Єдиний відкритий PR під час аудиту: draft `#179`, майбутній `0.3.15`, raid
  chat. Первинно перевірено `af56de0d`; live refresh показав hardening head
  `e223073a` з додатковими 20 файлами й приблизно `+790/-134` поверх нього.
- Focused re-audit на clean `e223073a` пройшов 7 файлів / 102 тести, але статично
  підтвердив залишкові idle/stop/callback/403-network gaps.
- Відкритих GitHub issues під час перевірки не було.
- `FightService` — приблизно 5 730 рядків; старий architecture gate міряв близько
  4,2 тис. Це аргумент проти додавання туди нового group workflow, але не за
  великий pre-0.4 rewrite.
- Тестова база велика й активно підтримується; не треба перепроходити кожен
  історичний manual сценарій, треба закрити поточний risk matrix.

## Реально shipped у 0.2.x / 0.3.x

- multi-enemy state і ordinary two-enemy threat escalation;
- safe gifting та postal packages;
- player abilities, achievements і active cosmetic titles;
- party foundation, party-vs-one proof і Big Barrel route;
- Lore Board, Chronicles, tavern games, medical items;
- глибоке equipment/set/gear-action та Charkokovalnia/attunement;
- duel tournaments/journals/rematches;
- quest risk/overview, performance telemetry й read-path work;
- Kharakternyk/Bureaucramancer/Warrior/Bard/Varenyk support slices.
- Shynok player sale for a fixed basket-level 42% rounded-up payout; public
  resale listings and Korchmar recycling are separate deferred work.
- One-use medical-item/order foundation and `Разові`; generic generated
  consumables and take-away purchases are still deferred.

## Код ≠ rollout

`.env.example` тримає кілька поверхонь default-off. Репозиторій не доводить
production значення для:

- party session foundation;
- Big Barrel;
- raid chat;
- tavern games variants;
- HP recovery notifications;
- Fighting Corner onboarding quest.

Manual Telegram QA явно pending щонайменше для частини `0.3.12`, `0.3.14` і
`0.3.15`. Тому документація не повинна називати ці поверхні production-playable
без environment evidence.

## Аналітика

Не можна казати «аналітики немає»: combat balance simulation, performance
telemetry, activity events і Chronicles уже існують. Бракує product/social
funnel: D1/D7, first-day PvE, duel accept/rematch, party create/join/start/finish
і category feedback. Його треба зробити privacy-safe й aggregate-only.

## Документаційний стан

Roadmap досі називав `0.2.x` current line і радив брати наступний prompt із
`0.2.x` tasks. README радив почати з safe gifting `0.2.0`. Technical plan називав
party/raid tables future, хоча відповідні моделі вже є. Game design називав
групову активність later. Це documentation sediment, а не стратегічний провал.

Друга sediment-зона — social/economy promises. Old Altar має майже повний пакет
design/balance/copy/QA, greeting draft не обрав один ефект, food має суперечливі
one-vs-five-buff notes без versioned task, consumables змішані з їжею, а старий
roadmap ставив resale у later `0.3.x` без пізнішого supersession record.

Окремий runtime blocker для Старого жертовника: активне selected-stat Priest
blessing не доведено через усі solo/duel/PartyBoss combat-summary paths. До
реалізації треба canonical blessing-aware summary/freeze contract або чесне
noncombat-only рішення.
