# Documentation drift

## P0 canonical corrections

| Документ | Drift | Запропоновано |
| --- | --- | --- |
| `README.md` | next step досі safe gifting `0.2.0` | current 0.3 closeout + 0.4 party/guild cutline |
| `docs/product/roadmap.md` | `0.2.x` названо current; довгий release sediment | коротка current roadmap + history links |
| `docs/product/product-brief.md` | playable slice описує дуже ранній foundation | current combat/social/party foundation і rollout caveat |
| `docs/design/game-design.md` | group activity still “later” | 2–3×2–3 expedition та small guild boundary |
| `docs/architecture/technical-plan.md` | party/raid tables called future | implemented delta + separate generic model |
| `docs/tasks/README.md` | old drafts mixed with active; HP recovery “queued” | planned sequence + shipped/deferred/superseded labels |
| `docs/ai/context.md` | current source ends at 0.3.14/optimistic 0.3.15 | blocker-aware RC + 0.3.16/0.4 boundary |

## Нові canonical docs

- `docs/architecture/party-combat-evolution-plan.md`;
- `docs/design/guilds-and-party-progression.md`;
- `docs/operations/release-state-ledger.md`;
- tasks `0.3.16`, `0.4.0`–`0.4.4`.

## Що не робити автоматично

- Не переносити десятки старих файлів у цьому runtime PR: зробити окремий
  docs-only archive cleanup після live-base refresh.
- Не міняти історичні task/changelog claims на «production enabled».
- Не ставити PASS у manual QA evidence log без реального Telegram run.
- Не бампати version/changelog/news для docs-only delta.
- Не знищувати старі design inputs: позначити historical/superseded і дати
  canonical current link.

## Ознака, що docs знову правдиві

Новий Codex thread, читаючи лише `AGENTS.md`, `docs/ai/context.md`, current task і
linked architecture/design docs, не повинен:

- почати старий `0.2.x` task;
- розширити PartyBoss як generic N×M;
- додати group workflow у FightService;
- вважати merged flag default-off feature production-playable;
- обіцяти guild bank/boss/war у foundation.
