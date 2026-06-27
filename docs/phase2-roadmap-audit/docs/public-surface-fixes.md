# Public Surface Fixes

## Problem

Public surfaces are behind the repository state. This can mislead players and future Codex threads.

## Fix list

### Website

- Sync latest news with repository `news.md` beyond `0.0.24`.
- Add visible current build line: `0.2.x` / latest deployed version, if safe.
- Update `Що вже можна спробувати` after `0.2.7` to include class/race abilities without overexplaining mechanics.
- Keep future raids/guilds as roadmap wording, not playable wording.
- Consider replacing top `Telegram RPG українською` with `Гумористична фентезі-РПҐ у Telegram`, then say Ukrainian-first in the body.

### Telegram bot description

Current wording with `ґільдії` may sound ready. Replace with a current-playable pitch.

Suggested:

```text
Квестарня — гумористична фентезі-РПҐ у Telegram про пригодників, корчму, квести, дурнуватих монстрів і манатки.
```

### README

After `0.2.7` merges:

- add Player Abilities to playable list;
- update current movement paragraph;
- ensure Phase 2 deferred docs do not still call Race Abilities next.

### Product Brief

- Replace older `Бочка підтримки` wording with canonical `Банка підтримки Квестарні`.
- Mark original MVP group-mini-raid/world-boss/leaderboard/admin commands as still desired but not current playable scope.

### Roadmap / Deferred docs

- Move Race Abilities from proposed to shipped/active.
- Add `post-0.2.7` order:
  1. public sync;
  2. achievements/title records;
  3. daily korchma rounds;
  4. combat balance/monster signatures;
  5. inventory/equipment clarity;
  6. postal delivery;
  7. party foundation.

## Acceptance criteria

- Site no longer shows `0.0.24` as if it were the latest if repo has newer news.
- Telegram description does not promise guilds as playable.
- README, Roadmap, Deferred, Docs Index and AI context agree on current version line.
- No package bump unless runtime/site deploy code changes require it.
- Player-facing copy is Ukrainian, short and in Brand tone.
