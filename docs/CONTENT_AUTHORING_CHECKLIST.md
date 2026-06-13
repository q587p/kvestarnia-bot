# Content Authoring Checklist

Цей чекліст використовувати при додаванні нових квестів, предметів, реплік NPC, рейдів, манаток і майбутніх сезонних подій.

## Коротке правило

Кожен новий шмат контенту має спитати:

> «Як на це смішно реагує хоча б одна раса, один клас і одна дивна комбінація?»

Якщо відповідь «ніяк» — контент ще не квестарняний.

## Перед merge нового квесту

Перевірити:

- [ ] Є neutral fallback для всіх персонажів.
- [ ] Є мінімум 2 race-specific hooks.
- [ ] Є мінімум 2 class-specific hooks.
- [ ] Є мінімум 1 combo-specific hook.
- [ ] Є хоча б 2 варіанти для найбільш видимого flavor placement-а, щоб текст не був завжди однаковий.
- [ ] Hidden path використовується лише як внутрішній selector, без серйозних player-facing назв.
- [ ] Жарти не спираються на реальні стереотипи людей.
- [ ] Репліки короткі: одна думка, один жарт, один punch.
- [ ] Якщо є reward — repeated callback не дублює XP/gold/items.
- [ ] Тести перевіряють fallback і принаймні один matching hook.

## Перед merge нового предмета

Перевірити:

- [ ] Назва смішна сама по собі.
- [ ] Description не просто пояснює предмет, а додає joke.
- [ ] Є хоча б 2 майбутні item-inspect hooks для race/class.
- [ ] Якщо предмет повʼязаний з квестом, outcome згадує його не як loot table, а як трофей абсурду.

Приклади:

- `item.receipt-of-formal-suspicion` + Бюрокромант → родинне тепло до чека.
- `item.wet-hero-ticket` + Русалка сухопутна → документ із вологою репутацією.
- `item.suspicious-shawarma-wrapper` + Вареник-мант → тістологічна недовіра.

## Перед merge нового NPC-line

Перевірити:

- [ ] NPC має голос. Корчмар ≠ миша ≠ бочка ≠ мімік.
- [ ] Якщо NPC реагує на героя, selector має бути явно описаний у content data.
- [ ] Не більше 1–2 character-aware lines в одному повідомленні.
- [ ] Для корчмаря тон: теплий, підозрілий, бюрократичний, трохи втомлений.
- [ ] Для миші тон: мала, нахабна, політично сирна.
- [ ] Для бочки тон: мовчить, але всі приписують їй наміри.
- [ ] Для міміка-шаурми тон: вечеря, яка зробила поганий career move.

## Перед merge нового рейду

Перевірити:

- [ ] Є role-hints для принаймні 4 класів.
- [ ] Є race-specific жарт для принаймні 2 рас.
- [ ] Є хоча б 1 combo-specific raid hint.
- [ ] Підказки не обіцяють mechanics, яких ще немає.
- [ ] Не вимагається конкретний склад групи.
- [ ] Підказки не карають гравця за «неправильний» клас.
- [ ] Якщо рейд або вихід із корчми вимагає групу, перевірено можливий канонічний український переклад `You must gather your party before venturing forth.`; якщо його нема, використано впізнавану корчемну адаптацію українською.

## Перед merge нового класу або раси

Перевірити:

- [ ] Є короткий description, який уже смішний у character creation.
- [ ] Є unavailableReasons, якщо щось обмежене.
- [ ] Є 3–5 combo titles.
- [ ] Є 3 korchma greeting lines.
- [ ] Є 2 quest hooks для існуючих квестів.
- [ ] Є 1 raid role hint.
- [ ] Є 1 item-inspect idea для майбутнього.

## Тональні правила

### Добре

- «Межа підписала пропуск заднім числом.»
- «Корчмар ховає словник під баром.»
- «Миша погодилась на автономію за шафою.»
- «Бочка отримала шкоду по самоповазі.»
- «Туман просив не вплутувати його в цей білд.»

### Погано

- «Обраний шлях відкрив перед вами древню долю.»
- «Ця стать має бонус до магії.»
- «Ця раса природно краща в X.»
- «Ви не можете пройти квест без класу Y.»
- «+20% damage, бо так смішно.»

## Flavor density

Для Telegram короткість важлива.

Рекомендовано:

```text
Заголовок
1–2 рядки сцени
NPC quote або character hook
Кнопки / питання
```

Outcome:

```text
Результат
1 character-aware line
Нагорода
Можливо level-up
Наступний крок
```

Не перетворювати кожен action на стіну тексту.

## Selector naming

IDs мають бути стабільні й читабельні:

```text
flavor.korchma.greeting.race.bisyny.001
flavor.korchma.greeting.combo.drantohor-kharakternyk.001
flavor.quest.mimic-shawarma.start.class.bureaucramancer.001
flavor.quest.cellar-mouse.outcome.domovyk.negotiate.001
flavor.raid.friday-barrel.hint.class.rogue.001
```

Не використовувати порядкові назви без контексту типу `line1`, `joke2`.

## Tests

Мінімум:

- fallback works when no selector matches;
- exact combo beats class/race fallback;
- deterministic seed returns stable line;
- different seed can return different line;
- hidden path names are not present in player-facing strings;
- presenters stay compact enough.

## Restart-loop note

Раз на деякий час контент може натякати:

> «Інша біографія — інші підозри корчмаря.»

Але не перетворювати `/restart` на банер. Це discovery hook, не реклама.
