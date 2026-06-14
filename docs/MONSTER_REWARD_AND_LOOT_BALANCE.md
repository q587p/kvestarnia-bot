# Monster Reward and Loot Balance

Цей документ описує, як балансувати монстрові нагороди до того, як у грі з’явиться повний random loot engine.

## Чому deterministic grants безпечніші за random loot

Для поточного MVP deterministic grants краще, бо вони:

- не ламають idempotency;
- легко тестуються;
- не потребують окремого pity/loot roll шару;
- не створюють ситуацію «один і той самий callback дав різні речі»;
- простіше відлагоджуються в Telegram, де гравець бачить лише фінальний текст.

Якщо нагорода залежить від монстра, дня і персонажа, але не від випадкової дерганини всередині callback, ми отримуємо передбачувану гру й менше support-головного болю.

## Idempotency rules

- Один reward-key на персонажа, монстра й локальну дату.
- Stale callback не має видати другу нагороду.
- Повторний callback має повертати вже зарахований результат, а не reroll.
- Якщо користувач натиснув кнопку після закриття hunt в тому ж годинному відтинку, результат має бути stable і explainable.

Рекомендований концепт ключа:

```text
hunt:{characterId}:{monsterId}:{localPeriodId}
```

## Reward bands by monster level

Нижче — **прикладні** діапазони. Їх треба потім перевірити симуляцією, але як planning baseline вони тримаються нижче агресивних economic sources.

| Monster level | XP | Gold | Item |
| --- | --- | --- | --- |
| 1 | 5–8 | 2–4 | common junk trophy або дуже дрібний сувенір |
| 2 | 7–11 | 3–5 | common або uncommon accessory / collectible |
| 3 | 10–15 | 4–7 | guaranteed flavor item або equipment-shell item |
| 5 mini-boss / boss | 18–25 | 8–12 | guaranteed trophy, інколи priceless entry |

### Балансне правило

Якщо hunt — це один deterministic reward per hour, його середня цінність має бути:

- помітною;
- але не настільки високою, щоб `/hunt` почав повністю замінювати cellar, barrel або combat probe;
- і не настільки низькою, щоб його ніхто не хотів натискати.

## Як трактувати `goldValue`

`goldValue` у item content — це **display-only valuation**, а не автоматично spendable gold.

Це означає:

- `goldValue` може допомагати показати, що предмет «відчувається» цінним;
- але item не мусить одразу перетворюватися на гроші;
- якщо предмет priceless або trophy, його value може бути нульовою або умовною;
- не треба обіцяти продаж або торговий sink, якщо його ще немає.

## Reward identity split

Добрий hunt reward має складатися з трьох окремих шарів:

1. **XP/gold for progress**
   Дає зрозумілий прогрес без складної економіки.

2. **Item for memory / collection / equipment shell**
   Предмет має бути цікаво називати, показувати або колись вдягнути, але не обов’язково одразу давати силу.

3. **Flavor for screenshot value**
   Короткий текст, який хочеться переслати друзям.

Не треба, щоб один item одночасно був і валютним sink, і combat buff, і соціальним статусом, і квестовим ключем. Це вже не reward, а невеликий уряд.

## Equipment items before stat effects exist

До появи effective stats helper і equipment effects:

- item може бути preview-equippable;
- item може бути показаний як shell;
- item не повинен нести приховані бойові бонуси;
- armor має допомагати виживанню, а не free damage;
- accessory effects мають бути дуже малими й ситуаційними, коли вони взагалі з’являться;
- junk/cosmetic/priceless trophies не мають давати combat power, якщо їх не конвертовано пізніше окремим механічним рішенням.

## Як не дати `/hunt` з’їсти інші loops

`/hunt` має бути корисним, але не найвигіднішим шляхом до всього одразу.

Guardrails:

- не робити hunt стабільно кращим за barrel за XP + gold;
- не робити hunt кращим за fight, якщо fight вимагає більше ризику;
- не робити hunt джерелом великого gold sink bypass;
- не давати hunt надто часті upgrade items;
- не перетворювати hunt на «щогодинне чергування», від якого нудить.

## Anti-grind guidance

Для майбутніх repeatable hunts:

- одна винагорода на персонажа на локальний день або чіткий cooldown;
- rotation має бути прозорим;
- no hidden reroll economy;
- якщо додається серія зростаючих нагород, вона мусить мати верхню межу;
- catch-up для тих, хто пропустив день, має бути помірний, а не snowball.

## Example reward packages

### Common junk trophy

- XP: 5
- Gold: 2
- Item: `item.crumb-of-archival-knysh`

**Intent:**
Смішний сувенір, який хочеться залишити, а не зразу продати.

### Uncommon accessory

- XP: 9
- Gold: 5
- Item: `item.underbridge-moderation-badge`

**Intent:**
Щось, що виглядає як нагорода, але ще не ламає баланс.

### Boss trophy that is priceless

- XP: 20
- Gold: 10
- Item: `item.scale-of-zero-declaration`

**Intent:**
Сильний story item. Його цінність у легенді, а не в автоматичному sell price.

## Rebalance checklist before runtime PR

- reward band не виходить за рамки темпу гри;
- item grants не дублюються на stale callback;
- trophies не стають прихованими stat sticks;
- `goldValue` не підміняє реальну economy;
- boss reward не робить hunt обов’язковим ритуалом за розкладом для виживання.
