# Monster Flavor Routing

## Пропонований модуль

Додати `src/content/monsterFlavor.ts` або інший маленький data module. Не змішувати весь новий monster content у presenters.

Рекомендований shape:

```ts
import type { CharacterFlavorSelector } from "./characterFlavor";

export type MonsterFlavorPlacement =
  | "monster.start"
  | "monster.action"
  | "monster.outcome"
  | "monster.loot-note";

export interface MonsterFlavorLine {
  id: string;
  monsterId: string;
  placement: MonsterFlavorPlacement;
  selector?: CharacterFlavorSelector;
  action?: string;
  priority?: number;
  text: string;
}
```

## Selector behavior

Не дублювати випадковість у presenter-ах. Вибір рядка має бути deterministic у тестах:

```ts
selectMonsterFlavorLine(character, {
  monsterId,
  placement: "monster.start",
  action,
  seed: `${character.id}:${monsterId}:${localDate}`
});
```

Якщо `characterFlavor.ts` уже має приватний selector scoring, є два безпечні варіянти:

1. винести scoring helper у маленький shared module (`src/content/flavorSelectors.ts`);
2. або для першого PR зробити простий локальний helper у `monsterFlavor.ts`, покритий тестами.

## Мінімальні tests

- combo перемагає class/race/path;
- class перемагає race/path;
- race перемагає path;
- fallback повертається для невідомих race/class;
- однаковий seed дає той самий рядок;
- player-facing text не містить hidden path назв або raw HTML markers;
- кожен monster id із `monsters.ts` має хоча б один fallback `monster.start` line і loot note.

## Action names

Поки немає повного combat engine, не навʼязувати в коді бойові дії. Для data contract можна тримати універсальні action keys:

- `attack`;
- `trick`;
- `inspect`;
- `flee`;
- monster-specific alias у майбутньому.

У першому PR достатньо `monster.start`, `monster.outcome` і `monster.loot-note` як content hooks, навіть якщо вони ще не всі підключені до Telegram flow.
