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
  seed: `${character.id}:${monsterId}:${localPeriodId}`
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

У `0.0.17` `/hunt` підключає `monster.start` для дошки й `monster.outcome` для результату, якщо такий рядок існує. У `0.0.18` Hunt Board contract token захищає action callback від content drift за monster id, level, tags і known loot ids, але flavor seed усе ще лишається deterministic від `localPeriodId`, character id, monster id/action і placement.

`/bestiary` у `0.0.18` показує read-only monster descriptions, field notes і trophy hints. Він не обирає character-specific flavor, не створює encounter state і не має впливати на reward math.
