# Latest Events Feed — Ukrainian copy

This file contains player-facing Ukrainian copy examples for `📣 Останні події` / `📜 Хроніки Квестарні`.

Implementation guidance stays English; strings shown to players stay Ukrainian.

## Entry points

Preferred button labels:

```text
📣 Останні події
📜 Хроніки Квестарні
```

Return buttons:

```text
⬅️ До дошки
⬅️ До корчми
🔄 Оновити
Далі ➡️
```

Filter buttons:

```text
⭐ Важливе
👥 Пригодники
⚔️ Бої
🎒 Манатки
```

## Screen header

```text
📜 Хроніки Квестарні

Останні корчмарські записи. Літописець клянеться, що майже нічого не прикрасив.
```

Shorter header when the list is long:

```text
📜 Хроніки Квестарні
```

## Empty state

```text
📜 Хроніки Квестарні

Поки що тихо. Літописець гріє чорнило, Корчмар — підозри.
```

Important filter empty state:

```text
⭐ Важливе

Поки що без великих пригод. Це не тиша — це пауза перед чиїмось дуже поганим планом.
```

## Error state

```text
📜 Хроніки Квестарні

Літописець упустив перо в суп. Спробуй оновити сторінку ще раз.
```

## Date labels

Use Kyiv time for grouping.

Preferred labels:

```text
Сьогодні
Вчора
30 червня
1 липня
```

If a year must be shown in player-facing text, use the Holocene year format required by project rules, for example `12026`.

## Event rows

### New character

```text
👋 HH:mm | Новий пригодник у Квестарні: {actor}!
```

Fallback actor:

```text
👋 HH:mm | Новий пригодник у Квестарні: Пригодник без таблички!
```

### Level reached

Use a gender-neutral verb:

```text
🎉 HH:mm | {actor} бере {level} рівень!
```

Milestone variant:

```text
🎉 HH:mm | {actor} бере {level} рівень. Корчмар робить вигляд, що так і планував.
```

### Group raid victory

```text
🏆 HH:mm | Ватага: перемога. Ціль — «{boss}». У протоколі: {participantCount} пригодників.
```

First server victory:

```text
🏆 HH:mm | Перша перемога ватаги. Ціль — «{boss}». Уже сперечаються, хто саме був планом.
```

Compact variant:

```text
🏆 HH:mm | «{boss}» переможено. У ватазі: {participantCount} пригодників.
```

### Rare manatka received

```text
🎒 HH:mm | {actor}: рідкісна манатка — «{item}».
```

Epic variant:

```text
💎 HH:mm | {actor}: епічна манатка — «{item}». Корчмар просить не ставити її на стіл без підставки.
```

### Underdog combat victory

```text
🛡️ HH:mm | {actor}: перемога. Монстр — «{monster}», перевага рівнів: +{delta}.
```

Near-KO variant if the combat result already stores HP safely:

```text
🛡️ HH:mm | {actor}: «{monster}» упав першим. Різниця рівнів: +{delta} не на користь героя.
```

### Future item upgrade, only if the mechanic exists

```text
⚒️ HH:mm | {actor}: «{item}» піднято до +{upgradeLevel}.
```

Do not ship this row until the repository has an item-upgrade source of truth.

### Future overlevel item, only if item levels exist

```text
🎒 HH:mm | {actor}: манатка не за зростом — «{item}» на +{delta} рівнів вище героя.
```

Do not ship this row until items have a durable item level or required level.

## Copy rules

- Keep rows short.
- Avoid dynamic name declension unless the code has a safe grammar helper.
- Use `«»` around item and monster names.
- Escape dynamic values for Telegram HTML.
- Do not reveal hidden odds, future rewards or unreleased mechanics.
- No public shame for losses/deaths in the MVP.
- No accidental Russian or rough calques.
- Use `Квестарня`, `манатки`, `соціяльні`, `ґільдії` where these words appear.
