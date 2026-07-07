# Old Root Grove Location — optional future task

## Goal

Promote the altar from a yard action surface into a separate, mysterious Korchma-adjacent location only if playtest shows the altar needs its own social presence.

This is a docs-only draft until a human explicitly activates it as a concrete versioned task. It must not ship inside the Old Altar Blessings MVP.

Possible player-facing names:

- `🌳 Тихий Корінь`
- `🌳 Корчемний Корінь`
- `🌳 Кривослива з лицем`

Recommended default: **`🌳 Тихий Корінь`** if the tone should be mystical, **`🌳 Корчемний Корінь`** if it should be more Kvestarnia-comedic.

## Activation criteria

Do this only if at least one is true:

- players gather at the altar and same-yard target lists feel too broad;
- the altar gains multiple actions and crowds the yard card;
- future oaths/achievements/seasonal rites need a distinct place;
- public presence should show altar visitors separately from ordinary yard visitors.

## Scope

- Add a new presence location id, e.g. `location.korchma.old_root`.
- Add a place callback, e.g. `root-grove`.
- Add public presence title and region.
- Add main-menu location button mapping.
- Add movement notice copy.
- Add presenter and keyboard route from yard to the root grove and back.
- Update old altar service so target scope can be exact same root-grove location instead of same yard.
- Preserve existing yard behavior and daily round routing.

## Suggested copy

```text
🌳 Тихий Корінь

За дровами й відрами є стежка, яку Корчма офіційно не визнає. Вона веде до старого кореня, що обхопив жертовник так міцно, ніби памʼятає першу недопиту чарку.

Тут говорять тихіше. Не з поваги — просто дерево дуже добре слухає.
```

Buttons:

```text
🪨 До жертовника
⬅️ У задвірок
```

## Technical touchpoints

Likely files:

```text
src/services/presenceService.ts
src/bot/callbacks/placeCallbackData.ts
src/bot/keyboards/mainMenuKeyboard.ts
src/bot/modules/mainMenu.ts
src/bot/presenters/tavernPresenter.ts
src/bot/keyboards/tavernKeyboard.ts
src/bot/commands/tavernCommand.ts
src/bot/presenters/oldAltarPresenter.ts
src/bot/keyboards/oldAltarKeyboard.ts
```

## Acceptance criteria

- User can navigate `Перед корчмою -> Задвірок -> Тихий Корінь -> Старий жертовник`.
- Main menu current-location button shows the root-grove label while there.
- Public presence can distinguish root-grove visitors from yard visitors.
- Old altar Priest target list uses exact same root-grove location.
- Existing yard daily round scene still opens at `location.korchma.yard`.
- Existing front/yard routes and markers do not regress.

## Non-goals

- No new blessing mechanics.
- No item offering changes.
- No quest chain.
- No separate region outside Korchma.
- No Game of Thrones names, white bark/red leaves copy, or direct IP references.
