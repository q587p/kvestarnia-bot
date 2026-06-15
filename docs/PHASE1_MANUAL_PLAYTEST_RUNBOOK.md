# Phase 1 Manual Playtest Runbook

Цей документ — ручний smoke/regression checklist для Phase 1 Квестарні. Його задача не довести, що бій сам по собі «працює», а перевірити, що гра все ще відчувається як **Квестарня дає справи**, а не як «натисни `/fight` і повторюй».

## Purpose

- Перевірити, що solo loop лишається пригодницьким і корчмарським.
- Підтвердити, що квести, fight, inventory, equipment, bestiary і нагороди зв’язані в один читабельний маршрут.
- Знайти регресії в ідемпотентності, stale callback-ах, reward copy і видимих числах.

## Test setup

- Запускай у local/dev середовищі.
- Використовуй throwaway Telegram account або тестового персонажа.
- Починай із fresh character, коли це можливо.
- Для повторного проходу використовуй `/restart` або dev reset flow, якщо він доступний у цьому середовищі.
- Якщо reset-команди ще нема, використовуй доступний local reset спосіб і занотуй його в лог.
- Поруч із результатами вкажи:
  - branch;
  - bot version;
  - дату;
  - tester;
  - короткий коментар про середовище.

## Script A — Fresh starter flow

Перевір цей маршрут на нового гравця:

1. Напиши `/start`.
2. Створи персонажа.
3. Дійди до корчми або знайди корчемний hub.
4. Відкрий `/quest`.
5. Переконайся, що starter adventure/fight відчувається як окрема **справа**, а не як гола бойова кнопка.
6. Заверши перший доступний starter flow.
7. Перевір, що rewards видно й вони не дублюються при повторному натисканні тих самих callback-ів.
8. Відкрий `/hero`.
9. Перевір, що прогрес видно на цьому ж екрані.
10. Відкрий `/inventory`.
11. Перевір, що видимі манатки або отримані речі показані явно.
12. Якщо `/equipment` уже є в цій гілці, переконайся, що він відкривається з inventory або командою.
13. Якщо `/bestiary` уже доступний, переконайся, що до 3 рівня він залишається gated.

### Acceptance notes

- Усі тексти для гравця мають бути українськими.
- Короткі екрани повинні вміщуватися в один мобільний екран.
- Немає dead ends.
- Немає accidental spoilers для starter monsters.
- Повторні натискання кнопок не дублюють reward-и.

## Script B — Level 3 quest table and persistent fight

Цей сценарій перевіряє `0.0.21+`, а reward replay — з `0.0.23+`.

1. Підійми або підсій level 3 character.
2. Відкрий `/quest`.
3. Перевір, що `Тринадцять дрібних проблем` видно як quest/contract row, а не як просто «fight».
4. Запусти `/fight` або зайди в persistent fight через quest table.
5. Переконайся, що видно HP героя, HP монстра, mana, turn number і last turn/result.
6. Натисни кілька turn buttons.
7. Повтори стару кнопку після нового ходу.
8. Перевір, що stale/repeated turn buttons не завдають шкоди вдруге.
9. Перевір loss/flee/expiry сценарії.
10. Підтвердь, що вони не рахуються як win.
11. Заверши win і перевір, що один win increments quest counter.
12. Для `0.0.23+` перевір, що win показує малу винагороду за бій: XP, золото й іноді одну манатку.
13. Повтори terminal/action callback після win і переконайся, що reward replay показує той самий запис без duplicate grant.
14. Перевір, що terminal state веде назад до quest table / корчми / new fight.

### Observation table

| Step | Expected | Observed | Pass/Fail | Notes |
|---|---|---|---|---|
| 3 | `Тринадцять дрібних проблем` видно як справу |  |  |  |
| 5 | Видно HP/mana/turn/last result |  |  |  |
| 8 | Stale callback не дублює хід |  |  |  |
| 10 | Loss/flee/expiry не рахуються як win |  |  |  |
| 11 | Win increments quest counter |  |  |  |
| 12 | Win reward shown once, replay does not duplicate |  |  |  |

## Script C — Thirteen small problems reward

Цей сценарій перевіряє wrapper reward із `0.0.21+` і має відрізняти його від per-session fight reward із `0.0.23+`.

1. Дійди до `12/13` через seeded або prior wins.
2. Зроби ще одну перемогу в persistent fight.
3. Переконайся, що `13th win` видає рівно одну fixed wrapper reward.
4. Повтори callback.
5. Переконайся, що XP, золото або item не дублюються.
6. Перевір, що counter може показувати `14/13` пізніше, але reward вже не видається вдруге.
7. Перевір, що копірайт відрізняє wrapper reward від `Винагорода за бій`, якщо обидва блоки показані в одному terminal повідомленні.

### Expected wrapper reward for `0.0.21+`

```text
+35 XP
+10 золота
Жетон тринадцяти дрібних проблем
```

Це очікувана поведінка wrapper-а `Тринадцять дрібних проблем`, а не універсальне правило для майбутніх квестів або per-session fight rewards.

## Script D — Equipment effects smoke

Цей сценарій застосовуй тільки для `0.0.22+`, якщо equipment effects уже з’явились у гілці.

1. Екіпіруй reachable item.
2. Відкрий `/hero`.
3. Переконайся, що visible numbers змінилися.
4. Відкрий `/equipment`.
5. Перевір effect lines.
6. Відкрий item detail.
7. Переконайся, що effect lines показані й там.
8. Стартуй новий persistent fight.
9. Перевір, що fight використовує effective HP/mana/armor/weapon/spell-style values.
10. Зміни gear під час active fight.
11. Переконайся, що це не лікує та не refills existing session HP/mana.
12. Перевір, що junk/cosmetic items не дають power.

### Useful examples, if present

- `Пательня переконання`
- `Печатка дрібної переваги`
- `Фартух піностійкого пригодника`
- `Шолом із каструлі раннього доступу`
- `Корковий перстень серйозних справ`
- `Жетон тринадцяти дрібних проблем` як no-power cosmetic

## Script E — Bestiary / Hunt / Cellar sanity

1. Перевір `/bestiary` на level gate, якщо він присутній.
2. Перевір `/hunt`, якщо цей surface уже в гілці.
3. Переконайся, що cellar errand лишається low-level side activity.
4. Переконайся, що ці поверхні не витісняють основний Phase 1 loop із combat/equipment/loot.

### Notes

- Якщо surface ще не merged у цій гілці, познач `N/A` замість вигадування сценарію.
- Не змішуй playtest incomplete surfaces із completed surfaces.

## Script F — Error/recovery cases

1. Відкрий сценарій без персонажа.
2. Перевір outside-korchma gate, якщо він є.
3. Створи active Barrel raid / pending state, якщо він уже доступний у гілці.
4. Переконайся, що fight callbacks блокуються або повертають безпечний стан.
5. Протисни malformed або stale callbacks.
6. Перевір expired fight.
7. Перевір recovery на missing monster content, якщо є тестова сцена або dev fixture.
8. Перевір `/restart` або local reset sanity.

## Phase 1 feel checklist

Відповідай собі на ці питання після прогону:

- Чи quest table звучить як «справа», а не як меню бою?
- Чи fight відчувається як розв’язання конкретної проблеми?
- Чи зрозуміло, навіщо гравець воює?
- Чи reward copy не створює відчуття «фарм за натискання»?
- Чи манатки видно й вони смішні, але не перетворюють UI на бухгалтерію?
- Чи loss/flee поводяться чемно?
- Чи наступна дія завжди очевидна?

## What this runbook does not test

- Full combat engine balance.
- Full loot economy, shops, selling, trading, crafting або item-to-level exchange.
- Group raids або guild systems.
- Paid power.
- Complete endgame progression.

Це лише повторюваний ручний маршрут для Phase 1 smoke/regression.
