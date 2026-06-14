# Hunt Journal Progress Plan

## Призначення

`Журнал полювання` — це майбутній progress layer, який допомагає пригоднику згадати, що він уже бачив, що пройшов і який дивний монстр досі йому сниться в паперах.

Він не має перетворюватися на нудний task list. Це має бути коротка історія недавніх hunt-ів, яку хочеться переглядати між сесіями.

## Що видно сьогодні

На першому етапі journal може показувати:

- recent contracts;
- останні 3-5 encounter-и;
- короткий результат кожного action;
- коли саме персонаж уже натискав те саме в межах доступного period/day;
- чи є пов’язаний трофей або note.

## Що видно цього тижня

Щотижневий зріз має додати:

- скільки різних монстрів трапилося;
- які дії гравець найчастіше обирав;
- чи були `strike`, `trick`, `retreat`, `inspect` або інші hunt actions;
- які монстри вже вивчені;
- де з’явився перший encounter badge.

## Reward replay display

Після того як main Hunt Contract Ledger PR існуватиме, журнал має вміти показати:

- оригінальний contract result;
- summary нагороди;
- чи це було вже зараховано;
- чи це repeated callback;
- чи просто archival record.

Ключове правило: якщо гравець натиснув ще раз, UI не повинен бути сухим «вже зроблено». Натомість показуємо той самий результат, але в режимі replay:

```text
🧾 Уже зараховано
Ви це полювання вже закрили. Ось той самий підсумок, щоб не загубити історію в тумані корчми.
```

## Як не зробити з журналу грінд-чекліст

- не ставити жорсткі progress bars до повного collection system;
- не вимагати зібрати всіх монстрів щодня;
- не показувати «ти відстаєш»;
- не забирати reward через те, що запис не відкривали;
- не вимірювати цінність пригодника кількістю прапорців.

Журнал має бути supportive, а не тиснути на темп гри.

## Future support features

Журнал може згодом підживити:

- first encounter badge;
- monster-specific flavor unlocks;
- harmless titles;
- weekly field-note digest;
- group hunt prep;
- «цей монстр вже знайомий» підказки в наступному encounter.

Усе це має бути cosmetic або social. Жодних power bonuses у MVP.

## Suggested screens

- `Сьогоднішні полювання`
- `Недавні контракти`
- `Записи пригодника`
- `Трофейні нотатки`
- `Щотижневі поля`

## Minimal player wording

**Recent contract**

```text
🗒 Недавнє полювання
Ви вже мали справу з цим монстром сьогодні. У журналі лишився короткий підсумок і той самий корчемний запах пригоди.
```

**Completed action**

```text
⚔️ Дія зафіксована
Пригодник обрав удар. Монстр обрав драму. Журнал обрав точність.
```

**Trick result**

```text
🪄 Хитрість спрацювала
Монстр заплутався в поясненні. Журнал, на відміну від нього, усе зрозумів.
```

**Retreat result**

```text
🏃 Відступ зараховано
Пригодник відступив красиво. Журнал не засуджує. Журнал пам’ятає.
```

## Privacy notes

- journal лишається per character by default;
- public or group sharing — тільки opt-in;
- не треба перетворювати журнал на публічний telemetry feed;
- якщо з’явиться share summary, він має маскувати чутливі дані та exact timestamps.

## Anti-FOMO

Journal не повинен карати за пропущені години rotation:

- не ховати майбутній контент назавжди;
- не вимагати встигнути на «єдиний шанс»;
- не робити щогодини найважливішою одиницею гри;
- не підміняти reward cadence психологічним тиском.

## Suggested relationship to later systems

- Hunt Journal читає ledger/projection rows;
- Bestiary collection читає seen/resolved/studied states;
- монстрові трофеї можуть відображатись у journal як memory, а не як додаткова reward system;
- group hunt prep може підсвічувати, хто вже бачив boss або знайомий із типом encounter.

## Suggested follow-up integration patch

Після ledger PR це слід зв’язати з:

- `docs/BESTIARY_COLLECTION_DESIGN.md`
- `docs/BESTIARY_COLLECTION_DATA_MODEL_NOTES.md`
- `docs/BESTIARY_COLLECTION_BACKLOG.md`

Журнал має бути читабельною projection layer, а не новою source of truth.
