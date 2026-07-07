# Character Flavor

Character-aware flavor keeps Квестарня from feeling like the same room with a different stat sheet. Race, class, звертання/path, title, and selected combinations may change short UI lines, but they must not secretly change rewards, combat power, or progression unless a separate mechanics PR owns that change.

## Korchmar Greetings

Корчмарські привітання in the korchma hall are part of the `/restart` discovery loop: players often create a new character, walk into the hall, and immediately check whether the world noticed who they are. That surface needs more variety than daily quest flavor.

Rules:

- Same class/race should have multiple greeting reactions, not one dominant line.
- Hub NPC greetings should rotate across visits more often than quest start/outcome flavor.
- Korchma greeting selection may mix combo, class, race, звертання/path, and fallback lines by weighted deterministic seed.
- Quest/fight/cellar/raid outcome flavor may keep stricter best-tier selection when repeatability is useful.
- Future races/classes should add korchma greeting coverage in the same PR that introduces them.
- Hidden path labels stay internal. Player-facing lines may hint at mood or theme, but should not announce path names as mechanics.

Good greeting shape:

> Корчмар:
> Сідайте ближче до виходу. Не для безпеки: просто там менше слухає бочка.

Keep lines short, funny, and useful as a hall texture. Do not turn Корчмар into a tutorial narrator.
