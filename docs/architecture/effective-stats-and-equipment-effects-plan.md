# План: Effective Stats та Equipment Effects

## Чому це має бути окремий helper
Статистика персонажа не повинна обчислюватися в presenter-ах. Presenter має тільки показувати те, що вже вирішив домен: красиво, коротко й без прихованої математики.

Якщо почати рахувати ефекти в UI:
- `/hero` і `/fight` дуже швидко роз’їдуться;
- баланс стане важко тестувати;
- equipment effects будуть «розмазуватись» між кількома файлами;
- майбутні PR-и стануть більшими, ніж треба.

Отже, потрібен один спільний helper, який рахує **effective** значення й повертає прозорі contribution lines.

## Запропонований API

```ts
buildEffectiveCharacterStats({
  character,
  equipment,
  context
})
```

### Inputs
- stored character stats;
- level bonuses;
- equipped items;
- optional scene/combat context;
- optional class/race/path hints, якщо вони вже є в домені.

### Outputs
- effective stats;
- derived HP;
- derived mana;
- derived attack/defense/resource modifiers;
- contribution lines для пояснення, звідки взялися бонуси.

## Що саме має рахувати helper
На першому етапі helper повинен давати:
- final stats after level bonuses;
- effective `hpMax` та `manaMax`;
- current `hpCurrent` / `manaCurrent`, clamped to effective max;
- physical/ spell / utility modifiers, якщо вони вже потрібні для preview;
- human-readable contribution lines, наприклад:
  - `Рівень +4 HP`
  - `Пательня переконання: +2 сила`
  - `Фартух піностійкого пригодника: +1 виживання`

## Guardrails

### 1. Жодних прихованих змін у `/hero`
Якщо гравець бачить бонуси, це має бути явною частиною summary.
Не можна тихо показати інші HP/mana, ніж ті, що зараз пояснені.

### 2. Без ефектів для junk / cosmetic / priceless trophies
- `junk` не дає бойових бонусів;
- `cosmetic` не дає бойових бонусів;
- `priceless` trophies не дають бойових бонусів, доки контент явно не переведено в effect-bearing item.

### 3. Armor допомагає виживанню, а не безкоштовній шкоді
- armor може підняти HP/defense/resistance;
- armor не повинен сам по собі збільшувати damage;
- якщо armor колись дає damage, це має бути явний, рідкісний і пояснений виняток.

### 4. Accessory effects мають бути маленькі й ситуативні
- невеликий resource discount;
- bonus до конкретного scene;
- вузький bonus до utility або control.

### 5. Equipment effects треба симулювати
Перш ніж combat почне покладатися на цей helper, ефекти мають пройти симуляції:
- не ламати TTK;
- не знищувати новачка;
- не робити один предмет must-have;
- не створювати «порожню» build diversity.

## Де helper має жити
Поточний repo вже має helper-подібну логіку в character summary / progression шарі. Для наступного slice краще:
- залишити один доменний helper як source of truth;
- дати presenter-ам лише готовий результат;
- не дублювати формули в fight, hero, inventory чи equipment screens.

## Migration / schema notes
Для першого helper **не обов’язково** змінювати схему, якщо:
- effects приходять лише з content metadata;
- equipment state вже існує як достатній snapshot;
- hero/combat screens можуть читати helper без нових tables.

Майбутній ризик:
- якщо з’являться item instances, durability, temporary buffs або per-slot state, helper може потребувати додаткових input-ів;
- якщо equipment почне зберігати окремі instance ids, доведеться чітко розділити «content item» і «equipped instance».

## Яких змін не робити в першій версії
- не переносити бойову математику у presenter;
- не змінювати `/hero` тихо;
- не додавати equipment effects у content там, де ще немає helper-а;
- не робити повний stat rebalance одразу;
- не будувати крафт або shop economy паралельно.

## Тест-план

### Unit
- level bonuses додаються стабільно;
- HP/mana clamp працює;
- item effects складаються в правильному порядку;
- junk/cosmetic/priceless items не змінюють бойові значення;
- маленькі accessory bonuses не розганяються.

### Integration
- `/hero` і `/fight` читають один і той самий helper output;
- equipment preview може показати contribution lines без зміни реальних значень;
- inventory/equipment screen відображає item metadata, але не invents effects.

### Regression checklist
- `/hero` не показує приховані бонуси без явної секції;
- fight probe не змінює damage через presenter code;
- reward services не починають випадково рахувати gear bonuses;
- current HP/mana не «оновлюються магічно» без окремого save flow.
