# Balance Notes

## Балансова мета MVP
MVP має бути веселим, не ідеально збалансованим. Але він не має ламатися від першого power user.

Цілі:
- Бій на рівному рівні триває 2–5 ходів.
- Гравець перемагає звичайного монстра у 75–90% випадків.
- Поразка не карає жорстко.
- Level-up 1–5 швидкий, 6–10 помітно повільніший.
- Рідкісний лут приємний, але не обов’язковий для прогресу.

## Стати MVP
- STR — фізична шкода.
- DEX — ухилення/крит.
- INT — магія/mana.
- CHA — bard/social effects, rewards у квестах.
- LUCK — loot/crit/escape small modifiers.

## Базові формули

### HP
```text
hp_max = 20 + level * 5 + vitality_bonus + class_hp_bonus
```

Якщо немає VIT як окремого стату, class/race дають flat бонус.

### Physical damage
```text
damage = weapon_base + floor(STR * 0.7) + level_bonus - target_armor
minimum_damage = 1
```

### Spell damage
```text
spell_damage = spell_base + floor(INT * 0.9) + level_bonus - target_resist
```

### Hit chance
MVP можна почати без промахів у звичайній атаці або з дуже простим шансом:

```text
hit_chance = clamp(0.85 + (attacker.DEX - defender.DEX) * 0.01, 0.70, 0.95)
```

### Crit chance
```text
crit_chance = clamp(0.05 + DEX * 0.003 + LUCK * 0.002, 0.05, 0.25)
crit_multiplier = 1.5
```

### Escape chance
```text
escape_chance = clamp(0.45 + (DEX + LUCK - monster_level * 2) * 0.01, 0.25, 0.80)
```

## XP curve
Для MVP:
```text
xp_to_next(level) = 50 + level^2 * 25
```

Мета:
- lvl 2 після 3–5 боїв.
- lvl 5 після кількох днів казуальної гри.
- lvl 10 як межа альфи.

## Gold economy MVP
Sources:
- PvE fights.
- Daily.
- Raid rewards.

Sinks:
- Repair після поразки.
- Reroll одного stat на предметі.
- Cosmetic title.
- Створення ґільдії.

У MVP не давати гравцям багато gold без sinks.

## Loot tables
Стартова таблиця:
```text
common:   70%
uncommon: 22%
rare:      7%
epic:      1%
```

Модифікатори LUCK не мають ламати таблицю. Наприклад, LUCK додає не «+10% epic», а маленький бонус до upgrade roll.

## Pity / захист від невдачі
Навіть у MVP варто вести lightweight pity counter:
- Якщо 20 пригод без rare, наступні 5 пригод мають підвищений шанс rare.
- Не гарантувати epic у ранньому MVP.

## Предмети
Кожен предмет має budget:
```text
item_power_budget = base_by_level + rarity_bonus
```

Не робити предмети з безкоштовними бонусами. Якщо предмет дає сильний ефект, він має нижчі стати або кулдаун.

Рівневі, расові, класові або path-залежні обмеження не є безкоштовним дозволом робити предмети надто сильними. Вони можуть додати flavor, рідкість і причину для обміну між гравцями, але не мають створювати ситуацію, де один restricted rare item стає обов’язковим для нормального прогресу.

Предмет може випасти до потрібного рівня, але тоді це має бути очікування з ясним UI, а не пастка: показати потрібний рівень, кому річ пасує, і що її пізніше можна буде вдягнути, підлаштувати або передати іншому герою.

## PvP guardrails
- No item loss.
- No gold steal у MVP.
- Match by level bracket.
- Soft cap на win streak rewards.
- Newbie protection до level 5 або перших 48 годин.

## Anti-snowball
- Рейдові нагороди: участь + performance, але не winner-takes-all.
- Бонуси ґільдії: convenience/cosmetic/малий бонус, не x2 damage.
- Daily catch-up для гравців, що пропустили день.

## Симуляції
Після реалізації combat engine зробити script:
```bash
npm run simulate:combat -- --levels 1-10 --runs 10000
```

Вивід:
- win rate за рівнем.
- average turns.
- damage taken.
- potion usage.
- class/race outliers.

## Балансні червоні прапорці
- Одна раса/клас має win rate на 15%+ вищий за середній.
- Бій триває 8+ ходів у середньому.
- Гравець помирає до того, як зрозумів UI.
- Rare item стає обов’язковим для проходження звичайного контенту.
- Gold накопичується без витрат.
