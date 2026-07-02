# Docs Index

Це вхід у документацію Квестарні. Root [`README.md`](../README.md) лишається public-facing вітриною: що це за гра, чому вона цікава і як її спробувати. Усі runbook-и, дизайн-рішення, задачі, audit-пакети й Codex workflow живуть тут.

Документація тепер навігується за роллю:

- [`DOCUMENTATION_STRUCTURE.md`](DOCUMENTATION_STRUCTURE.md) — правила структури, категорій, назв і безпечних `git mv`.
- [`product/README.md`](product/README.md) — продукт, бренд, позиціонування, roadmap і публічна поверхня.
- [`design/README.md`](design/README.md) — game design, content, термінологія, монстри, квести, лут, досягнення.
- [`architecture/README.md`](architecture/README.md) — технічний дизайн, безпека, persistence, sessions і future architecture notes.
- [`operations/README.md`](operations/README.md) — локальний запуск, smoke/playtesting, support jar і runtime runbooks.
- [`ai/README.md`](ai/README.md) — Codex context, prompt policy, prompt library і agent workflow.
- [`tasks/README.md`](tasks/README.md) — versioned task docs, активний slice, shipped records і drafts.
- [`backlog/README.md`](backlog/README.md) — future ideas, deferred loops і not-yet-active planning.
- [`history/README.md`](history/README.md) — phase closeouts, release notes і historical planning docs.

## Start here by need

| Потреба | Відкрити |
| --- | --- |
| Зрозуміти, що таке Квестарня | [`../README.md`](../README.md), [`PRODUCT_BRIEF.md`](PRODUCT_BRIEF.md), [`GAME_DESIGN.md`](GAME_DESIGN.md) |
| Перевірити бренд, voice або public wording | [`BRAND.md`](BRAND.md), [`CONTENT_STYLE_GUIDE.md`](CONTENT_STYLE_GUIDE.md), [`TERMINOLOGY.md`](TERMINOLOGY.md) |
| Запустити локально або дебажити runtime | [`DEVELOPER_SETUP.md`](DEVELOPER_SETUP.md), [`LOCAL_BOT_RUNTIME.md`](LOCAL_BOT_RUNTIME.md), [`PLAYTESTING.md`](PLAYTESTING.md) |
| Дати Codex задачу або prompt | [`CODEX_WORKFLOW.md`](CODEX_WORKFLOW.md), [`ai/CODEX_PROMPT_POLICY.md`](ai/CODEX_PROMPT_POLICY.md), [`ai/context.md`](ai/context.md), [`tasks/README.md`](tasks/README.md) |
| Знайти актуальний task slice | [`tasks/README.md`](tasks/README.md) |
| Поняти roadmap / phase state | [`ROADMAP.md`](ROADMAP.md), [`phase2/SOCIAL_COMBAT_PLAN.md`](phase2/SOCIAL_COMBAT_PLAN.md), [`PHASE2_DEFERRED_0_2.md`](PHASE2_DEFERRED_0_2.md) |
| Перевірити баланс, fair play або abuse boundaries | [`BALANCE_NOTES.md`](BALANCE_NOTES.md), [`SECURITY_AND_FAIR_PLAY.md`](SECURITY_AND_FAIR_PLAY.md) |
| Знайти future backlog | [`backlog/README.md`](backlog/README.md), [`PHASE2_DEFERRED_0_2.md`](PHASE2_DEFERRED_0_2.md), [`tasks/README.md`](tasks/README.md) |

## Canonical sources of truth

These stay high-signal and should be updated when the feature they describe changes:

- [`BRAND.md`](BRAND.md) — назва, voice, tone, public wording і заборонені варіанти неймінґу.
- [`PRODUCT_BRIEF.md`](PRODUCT_BRIEF.md) — позиціонування, аудиторія, USP і MVP scope.
- [`GAME_DESIGN.md`](GAME_DESIGN.md) — core loop, персонаж, бій, прогресія й майбутні соціяльні механіки.
- [`CONTENT_STYLE_GUIDE.md`](CONTENT_STYLE_GUIDE.md) — український тон, гумор, лапки й формат Telegram-повідомлень.
- [`TERMINOLOGY.md`](TERMINOLOGY.md) — канонічні назви сутностей і місць.
- [`ROADMAP.md`](ROADMAP.md) — фази розвитку й Definition of Done.
- [`TECHNICAL_PLAN.md`](TECHNICAL_PLAN.md) — архітектура, дані, callbacks, deployment і технічні борги.
- [`BALANCE_NOTES.md`](BALANCE_NOTES.md) — формули, економіка, RNG і balance guardrails.
- [`SECURITY_AND_FAIR_PLAY.md`](SECURITY_AND_FAIR_PLAY.md) — приватність, антиаб’юз, idempotency і чесна гра.
- [`DEVELOPER_SETUP.md`](DEVELOPER_SETUP.md) — локальний запуск, Prisma, Render, scripts і troubleshooting.
- [`PLAYTESTING.md`](PLAYTESTING.md) — ручний smoke test поточного playable loop.
- [`CODEX_WORKFLOW.md`](CODEX_WORKFLOW.md) — правила постановки задач, PR і docs-only workflow.
- [`ai/context.md`](ai/context.md) — compact context pack for Codex; keep it under 250 lines.
- [`ai/CODEX_PROMPT_POLICY.md`](ai/CODEX_PROMPT_POLICY.md) — durable prompt/integration policy.
- [`tasks/README.md`](tasks/README.md) — version task convention and task registry.

## Gameplay, content and systems references

- [`BESTIARY.md`](BESTIARY.md), [`MONSTER_LOOT_DROPS.md`](MONSTER_LOOT_DROPS.md), [`MONSTER_FLAVOR_ROUTING.md`](MONSTER_FLAVOR_ROUTING.md), [`MONSTER_ENCOUNTER_AUTHORING_GUIDE.md`](MONSTER_ENCOUNTER_AUTHORING_GUIDE.md) — monster/content references.
- [`QUEST_RESOLUTION_VARIETY.md`](QUEST_RESOLUTION_VARIETY.md), [`QUEST_SKILLS_AND_CHECKS.md`](QUEST_SKILLS_AND_CHECKS.md), [`QUEST_RESOLUTION_CONTENT_SEEDS.md`](QUEST_RESOLUTION_CONTENT_SEEDS.md) — authored quest resolution and deterministic check vocabulary.
- [`NONCOMBAT_TECHNIQUES.md`](NONCOMBAT_TECHNIQUES.md), [`PLAYER_IDENTITY_ABILITIES.md`](PLAYER_IDENTITY_ABILITIES.md) — player identity actions and planned/shipped abilities.
- [`ACHIEVEMENTS_CATALOG.md`](ACHIEVEMENTS_CATALOG.md), [`ACHIEVEMENTS_DESIGN.md`](ACHIEVEMENTS_DESIGN.md), [`ACHIEVEMENTS_PHASE1.md`](ACHIEVEMENTS_PHASE1.md) — rewardless achievements and cosmetic title notes.
- [`DAILY_KORCHMA_ROUNDS.md`](DAILY_KORCHMA_ROUNDS.md), [`LOOT_EXPANSION_CANONICAL_IDS.md`](LOOT_EXPANSION_CANONICAL_IDS.md), [`PROBLEM_QUEST_CHAIN_REFERENCES.md`](PROBLEM_QUEST_CHAIN_REFERENCES.md) — focused system references.
- [`design/latest-events-feed.md`](design/latest-events-feed.md), [`content/latest-events-feed-copy.md`](content/latest-events-feed-copy.md), [`qa/latest-events-feed-qa.md`](qa/latest-events-feed-qa.md) — latest events feed design, copy and QA package.

## Phase 2 and raid planning

Phase 2 is Social Combat & Interactions first, not group-raid-first.

- [`phase2/SOCIAL_COMBAT_PLAN.md`](phase2/SOCIAL_COMBAT_PLAN.md) — головний Phase 2 plan.
- [`phase2/DUELS_AND_INVITES.md`](phase2/DUELS_AND_INVITES.md) — duels and shareable invite cards.
- [`phase2/GROUP_COMBAT_AND_RAIDS.md`](phase2/GROUP_COMBAT_AND_RAIDS.md) — party sessions, group combat and raid growth.
- [`phase2/TRADING_AND_GIFTING.md`](phase2/TRADING_AND_GIFTING.md) — safe gifting/trading boundaries.
- [`phase2/REMORT.md`](phase2/REMORT.md), [`phase2/ITEM_TAGS_AND_CONSUMABLES.md`](phase2/ITEM_TAGS_AND_CONSUMABLES.md), [`phase2/UNSTABLE_BALANCE_PRINCIPLES.md`](phase2/UNSTABLE_BALANCE_PRINCIPLES.md) — shipped/remort/item/balance notes.
- [`PHASE2_MVP_RELEASE_NOTES.md`](PHASE2_MVP_RELEASE_NOTES.md), [`PHASE2_MVP_CLOSEOUT_PLAN.md`](PHASE2_MVP_CLOSEOUT_PLAN.md), [`PHASE2_CLOSEOUT_SMOKE.md`](PHASE2_CLOSEOUT_SMOKE.md), [`PHASE2_DEFERRED_0_2.md`](PHASE2_DEFERRED_0_2.md) — closeout and deferred scope.
- [`phase2-roadmap-audit/README.md`](phase2-roadmap-audit/README.md) — imported roadmap audit package; planning input only until a slice is activated.

## AI / Codex workflow assets

- [`ai/README.md`](ai/README.md) — AI/Codex mini-index.
- [`ai/context.md`](ai/context.md) — compact context pack for new Codex sessions.
- [`ai/prompts/`](ai/prompts/) — ready prompts for implementation, QA, review and handoff.
- [`ai/CODEX_PROMPT_POLICY.md`](ai/CODEX_PROMPT_POLICY.md) — rules for prompt artifacts.
- [`CODEX_WORKFLOW.md`](CODEX_WORKFLOW.md) — human-facing workflow guide.
- [`refactoring-audit/README.md`](refactoring-audit/README.md) — imported refactoring audit package.

## Historical / archived planning

Keep historical docs discoverable, but do not treat them as active implementation scope unless a current task points to them.

- [`history/README.md`](history/README.md) — phase closeout and old planning index.
- [`PHASE1_RELEASE_NOTES.md`](PHASE1_RELEASE_NOTES.md), [`PHASE1_CLOSEOUT_0_1_TRANSITION.md`](PHASE1_CLOSEOUT_0_1_TRANSITION.md), [`PHASE1_CLOSEOUT_SMOKE.md`](PHASE1_CLOSEOUT_SMOKE.md) — Phase 1 closure.
- [`GROUP_HOOK_DESIGN.md`](GROUP_HOOK_DESIGN.md), [`GROUP_RAID_SESSION_NOTES.md`](GROUP_RAID_SESSION_NOTES.md), [`SOCIAL_ACTIONS_BACKLOG.md`](SOCIAL_ACTIONS_BACKLOG.md), [`MANTOK_CHEST_BACKLOG.md`](MANTOK_CHEST_BACKLOG.md) — useful earlier planning, not the current starting point.
- [`BIG_BARREL_BROTHER_GROUP_RAID_PACKAGE.md`](BIG_BARREL_BROTHER_GROUP_RAID_PACKAGE.md), [`BIG_BARREL_BROTHER_GROUP_RAID_MANIFEST.md`](BIG_BARREL_BROTHER_GROUP_RAID_MANIFEST.md), [`design/BIG_BARREL_BROTHER_GROUP_RAID.md`](design/BIG_BARREL_BROTHER_GROUP_RAID.md), [`architecture/GROUP_RAID_SESSION_MODEL.md`](architecture/GROUP_RAID_SESSION_MODEL.md), [`qa/BIG_BARREL_BROTHER_GROUP_RAID_QA.md`](qa/BIG_BARREL_BROTHER_GROUP_RAID_QA.md) — future raid package, preserved as design input.

## Placement rule for new docs

Do not add new one-off Markdown files directly under `docs/` unless they are a canonical source of truth listed above. Prefer the category folders and update the matching `README.md` index. When moving old files, use `git mv`, update relative links with `rg`, and keep the PR docs-only unless explicitly requested otherwise.
