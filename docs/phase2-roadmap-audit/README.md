# Phase 2 Roadmap Audit — Квестарня

## 12026-07-07 refresh

The latest imported refresh lives in [`12026-07-07/`](12026-07-07/). It audits the roadmap after the main `0.2.29` line and the active `0.2.30 — Mantok Ability Grants Foundation` release candidate.

Short decision from that refresh:

1. Finish the active Mantok Ability Grants foundation cleanly.
2. Keep `0.2.31` available for polish, bugfixes and QA hardening if needed.
3. Renumber Charkokovalnia / Item Upgrades to a later version instead of sharing `0.2.30`.
4. After the equipment-depth stretch, pivot back toward Phase 2 social loops: turn-based duel tournament rewards, Rogue reputation/location risk and the quest overview route.

The original post-`0.2.7` audit follows below.

Дата аудиту: 12026-06-27, Europe/Kyiv.

Цей архів зібраний як handoff-пакет після аналізу README, roadmap, phase2-доків, task-docs, Codex workflow, public site/Telegram surfaces і відкритого PR `0.2.7 — Player Abilities MVP`.

Import note: on the current `0.2.7` PR branch, the in-repo public site renderer reads `news.md` and renders `0.2.7` as latest; the older `0.0.24` public-site symptom from the audit looks like a cache/deploy-state issue rather than missing source data. The live Telegram bot profile description is not stored in this repository; only source strings and command/help surfaces can be checked here.

## Що всередині

- `analysis/phase2-roadmap-audit.md` — головний висновок: що брати після `0.2.7`, що змінити в планах, що випало з ранніх хвостів.
- `analysis/source-map.md` — карта джерел і що саме з них важливо.
- `docs/phase2-rebalanced-roadmap.md` — запропонована дорожня карта другої фази після `0.2.7`.
- `docs/vision-and-tone-alignment.md` — чи не відхилився проєкт від задуму, що треба повернути/підсвітити.
- `docs/public-surface-fixes.md` — що поправити на сайті, у Telegram-описі, README/news/docs після `0.2.7`.
- `tasks/*.md` — task-docs для наступних Codex-сесій.
- `prompts/*.md` — короткі prompts для Codex, без довгих повторюваних правил.
- `checklists/*.md` — smoke/release/alpha gate чеклісти.

## Найкоротший висновок

Після merge `0.2.7` не стрибати одразу в рейди, party runtime або повний equipment rebalance. Спершу:

1. **Public surface + roadmap sync** — сайт/news/Telegram copy/docs drift.
2. **Achievements + cosmetic title records** — закрити старий Phase 1 identity tail без power creep.
3. **Daily Korchma Rounds** — повернути корчму як щоденний живий хаб і retention loop.
4. **Combat balance + monster signature moves proof** — після class/race abilities перевірити бій і додати монстрам характер.
5. **Inventory/equipment clarity pass** — не повний rebalance, а видимість, фільтри, comparison і аудит предметів.
6. **Postal Mantok Delivery** — розширити safe gifting без location leak.
7. **Party session foundation** → **party vs one boss** → тільки потім реальні рейди.

Назви файлів у цьому архіві зроблені за фічами/проблемами, без номерів Pull Request.
