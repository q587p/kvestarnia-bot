# Deferred: Quest Overview Route

Status: optional later `0.2.x` slice; no version assigned

## Why deferred

The current `Квести` reply-keyboard button opens the existing quest hub / quest table flow. That is enough for the current MVP, but it duplicates the physical `📋 Стіл зі справами` surface instead of acting like a player-facing quest journal.

This follow-up should turn `Квести` into a compact overview of active, available and turn-in-ready quests, while location surfaces keep their own place/action navigation.

## Desired player shape

The route should read like a quest journal, not another table of places:

```text
🧭 Квести

🏹 Неспокійні справи
Єгер просить розібратися з неупокоєними проблемами корчми.

Що зробити:
• ✅ Взяти доручення в Єгеря
• ⬜ Перемогти неупокоєні проблеми: 1/5
• ⬜ Повернутись до Єгеря за нагородою

Статус: прогрес 1/5.
Нагорода: досвід, золото й єгерська відмітка.
```

## Candidate behavior

- `Квести` opens a `🧭 Квести` overview card rather than immediately mirroring `📋 Стіл зі справами`.
- Active quests render first, then turn-in-ready quests, then available quests.
- Each visible quest card/section shows:
  - quest title and short requester/problem summary;
  - checklist rows with `✅` / `⬜`;
  - current progress;
  - spoiler-light reward summary before completion.
- Buttons route to the appropriate existing surface:
  - quest table for starter/adventure/daily table affairs;
  - Yeger corner / Barrel route for Yeger progress;
  - cellar for cellar affairs;
  - Nyz/fighting surfaces for combat progress.

## Non-goals

- No new quest engine in the first pass.
- No exact hidden odds or future drop names before commitment.
- No duplicate reward settlement or alternate turn-in path.
- No Mini App UI.

## Acceptance ideas

- The main reply button stays plain `Квести`, without emoji prefix or quest marker suffix.
- The overview can show multiple active quests without forcing the player to remember which location owns them.
- Existing physical place buttons keep their own icons and current-affair markers.
- Existing callbacks remain replay-safe and continue to perform all mutations through the current services.
