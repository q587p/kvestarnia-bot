# Docs Index

Цей індекс допомагає швидко знайти актуальне джерело правди в документації Квестарні. README лишається public-facing вітриною; докладні runbook-и, дизайн-рішення й плани живуть тут.


## AI / Codex workflow

- [ai/context.md](ai/context.md) — compact context pack for Codex; keep it under 250 lines.
- [ai/rules-for-future.md](ai/rules-for-future.md) — durable token-economy workflow rules.
- [ai/prompts/main-new-version-thread.md](ai/prompts/main-new-version-thread.md) — short startup prompt for a fresh main Codex thread.
- [ai/prompts/second-codex-pr-review.md](ai/prompts/second-codex-pr-review.md) — read-only second Codex PR review prompt; changed files only by default.
- [ai/prompts/phase2-closeout-main-codex.md](ai/prompts/phase2-closeout-main-codex.md) — main Codex prompt for the `0.1.25` Phase 2 MVP closeout task.
- [ai/prompts/phase2-regression-audit.md](ai/prompts/phase2-regression-audit.md) — read-only audit prompt for the Phase 2 regression smoke.
- [ai/prompts/safe-gifting-main-codex.md](ai/prompts/safe-gifting-main-codex.md) — first `0.2.x` implementation prompt for Safe Gifting MVP.
- [ai/prompts/raid-party-session-foundation-main-codex.md](ai/prompts/raid-party-session-foundation-main-codex.md) — future party-session foundation prompt; use only when that docs-only planning slice becomes active.
- [ai/prompts/senior-barrel-brother-group-raid-main-codex.md](ai/prompts/senior-barrel-brother-group-raid-main-codex.md) — future Senior Barrel Brother group raid prompt after the party-session foundation exists.
- [ai/prompts/senior-barrel-brother-balance-review.md](ai/prompts/senior-barrel-brother-balance-review.md) — future balance review prompt for the Senior Barrel Brother planning package.
- [ai/prompts/senior-barrel-brother-group-raid-readonly-review.md](ai/prompts/senior-barrel-brother-group-raid-readonly-review.md) — future read-only review prompt for the Senior Barrel Brother planning package.
- [tasks/README.md](tasks/README.md) — version task doc convention and templates.

## Canonical project docs

- [BRAND.md](BRAND.md) — назва, voice, tone, public wording і заборонені варіанти неймінґу.
- [PRODUCT_BRIEF.md](PRODUCT_BRIEF.md) — позиціонування, аудиторія, USP і MVP scope.
- [GAME_DESIGN.md](GAME_DESIGN.md) — core loop, персонаж, бій, прогресія й майбутні соціяльні механіки.
- [CONTENT_STYLE_GUIDE.md](CONTENT_STYLE_GUIDE.md) — український тон, гумор, лапки й формат Telegram-повідомлень.
- [TERMINOLOGY.md](TERMINOLOGY.md) — канонічні назви сутностей і місць: пригодник/персонаж/герой, Низ, Сутерени Корчми, Спуск і Зіґурат.
- [TECHNICAL_PLAN.md](TECHNICAL_PLAN.md) — архітектура, дані, callbacks, deployment і технічні борги.
- [BALANCE_NOTES.md](BALANCE_NOTES.md) — формули, економіка, RNG і балансні guardrails.
- [QUEST_RESOLUTION_VARIETY.md](QUEST_RESOLUTION_VARIETY.md) — authored quest methods, result grades, costs and idempotent reward ledger for Adventure Choice, starter shawarma and cellar mouse.
- [QUEST_SKILLS_AND_CHECKS.md](QUEST_SKILLS_AND_CHECKS.md) — deterministic quest-resolution check math, technique vocabulary and qualitative chance bands.
- [QUEST_RESOLUTION_CONTENT_SEEDS.md](QUEST_RESOLUTION_CONTENT_SEEDS.md) — minimum authored content direction for general, generated and starter quest-resolution scenes.
- [NONCOMBAT_TECHNIQUES.md](NONCOMBAT_TECHNIQUES.md) — class/race/signature non-combat technique planning plus the shipped `0.2.5` Bard Performance proof in Shynok.
- [LOOT_EXPANSION_CANONICAL_IDS.md](LOOT_EXPANSION_CANONICAL_IDS.md) — adapter boundary для generated loot: canonical class/race ids, title-gate surrogates і equipability filtering.
- [PROBLEM_QUEST_CHAIN_REFERENCES.md](PROBLEM_QUEST_CHAIN_REFERENCES.md) — внутрішні reference notes для корчмарського ланцюжка `13 -> 23 -> 42 -> 93`.
- [ROADMAP.md](ROADMAP.md) — фази розвитку й Definition of Done.
- [SECURITY_AND_FAIR_PLAY.md](SECURITY_AND_FAIR_PLAY.md) — приватність, антиаб’юз, idempotency і чесна гра.
- [SUPPORT_JAR_BACKLOG.md](SUPPORT_JAR_BACKLOG.md) — добровільна «Банка підтримки», `/support`, deep link подяки й no-advantage guardrails.
- [SUPPORT_JAR_LIVE_STATUS.md](SUPPORT_JAR_LIVE_STATUS.md) — майбутній read-only live status Банки через Monobank API без donor state, payment confirmation або ігрових переваг.
- [DEVELOPER_SETUP.md](DEVELOPER_SETUP.md) — локальний запуск, Prisma, Render, scripts і troubleshooting.
- [PLAYTESTING.md](PLAYTESTING.md) — ручний smoke test поточного playable loop.
- [CODEX_WORKFLOW.md](CODEX_WORKFLOW.md) — правила постановки задач, PR і docs-only workflow.

## Codex workflow assets

- [tasks/README.md](tasks/README.md) — версійний task registry, шаблони й архів виконаних slice-ів.
- [ai/context.md](ai/context.md) — стислий контекст для нових Codex-сесій.
- [ai/prompts/](ai/prompts/) — готові prompts для основного агента, QA, review і release handoff.
- [ai/CODEX_TOKEN_ECONOMY_APPLIED.md](ai/CODEX_TOKEN_ECONOMY_APPLIED.md) — коротка нотатка про практичну економію токенів у workflow.

## Phase 1 closeout

- [PHASE1_RELEASE_NOTES.md](PHASE1_RELEASE_NOTES.md) — канонічний підсумок `0.1.0`.
- [PHASE1_CLOSEOUT_0_1_TRANSITION.md](PHASE1_CLOSEOUT_0_1_TRANSITION.md) — межа `0.0.x` → `0.1.x`.
- [PHASE1_CLOSEOUT_SMOKE.md](PHASE1_CLOSEOUT_SMOKE.md) — фінальний smoke/release gate.
- [NEXT_IMPLEMENTATION_BACKLOG.md](NEXT_IMPLEMENTATION_BACKLOG.md) — наступний малий порядок після closeout.

## Phase 2 roadmap reset

Phase 2 більше не починається з великого групового рейду. `0.1.25` закриває перший **Social Combat & Interactions** MVP: opt-in дуелі, реванші, картки результатів, nearby invites, combat locks, remort boundaries, Nyz preview memory and Shynok economy prep. Далі `0.2.x` починається з safe gifting, multi-enemy foundation, architecture stabilization, threat escalation and the first item-tag/one-use bandage slice; broader trading, equipment rebalance, party combat / real raids remain later slices.

- [PHASE2_MVP_RELEASE_NOTES.md](PHASE2_MVP_RELEASE_NOTES.md) — канонічний підсумок `0.1.25` Phase 2 MVP closeout.
- [PHASE2_MVP_CLOSEOUT_PLAN.md](PHASE2_MVP_CLOSEOUT_PLAN.md) — межа `0.1.x`, Phase 2 MVP DoD, backlog disposition і порядок closeout.
- [PHASE2_CLOSEOUT_SMOKE.md](PHASE2_CLOSEOUT_SMOKE.md) — two-player, Shynok і production smoke для закриття Phase 2 MVP.
- [PHASE2_DEFERRED_0_2.md](PHASE2_DEFERRED_0_2.md) — що переноситься в `0.2.x`, рекомендований порядок і WIP-limit.
- [backlog/UNFINISHED_CHARACTER_AND_0_1X_TAILS.md](backlog/UNFINISHED_CHARACTER_AND_0_1X_TAILS.md) — shipped `0.2.4` bandage boundary and deferred race ability / achievement / title / signature tails.
- [phase2/SOCIAL_COMBAT_PLAN.md](phase2/SOCIAL_COMBAT_PLAN.md) — головний план Phase 2.
- [phase2/DUELS_AND_INVITES.md](phase2/DUELS_AND_INVITES.md) — перший MVP для дуелей і shareable invite cards.
- [phase2/GROUP_COMBAT_AND_RAIDS.md](phase2/GROUP_COMBAT_AND_RAIDS.md) — як рейди виростають із дуелей, party sessions і multi-enemy combat.
- [phase2/TRADING_AND_GIFTING.md](phase2/TRADING_AND_GIFTING.md) — безпечний обмін і подарунки між гравцями.
- [phase2/REMORT.md](phase2/REMORT.md) — shipped `/remort` після 13 рівня з capped legacy, preview і вибором preserved manatky без power snowball, плюс follow-up нотатки.
- [phase2/ITEM_TAGS_AND_CONSUMABLES.md](phase2/ITEM_TAGS_AND_CONSUMABLES.md) — item tags, одноразові манатки й бойові дії від предметів.
- [phase2/UNSTABLE_BALANCE_PRINCIPLES.md](phase2/UNSTABLE_BALANCE_PRINCIPLES.md) — як лишати баланс веселим, але не токсичним.

## Future raid planning package

The Senior Barrel Brother package is preserved as docs-only future design input. It does not implement party sessions, raids, schema changes, runtime callbacks or rewards in the current PR.

- [SENIOR_BARREL_BROTHER_GROUP_RAID_PACKAGE.md](SENIOR_BARREL_BROTHER_GROUP_RAID_PACKAGE.md) — package overview and recommended ordering.
- [SENIOR_BARREL_BROTHER_GROUP_RAID_MANIFEST.md](SENIOR_BARREL_BROTHER_GROUP_RAID_MANIFEST.md) — source manifest and scope statement.
- [design/SENIOR_BARREL_BROTHER_GROUP_RAID.md](design/SENIOR_BARREL_BROTHER_GROUP_RAID.md) — proposed gameplay flow for the future group raid.
- [design/SENIOR_BARREL_BROTHER_BALANCE.md](design/SENIOR_BARREL_BROTHER_BALANCE.md) — future balance model, scaling and reward guardrails.
- [content/SENIOR_BARREL_BROTHER_UA_COPY.md](content/SENIOR_BARREL_BROTHER_UA_COPY.md) — Ukrainian copy bank and style guardrails for the future raid.
- [architecture/GROUP_RAID_SESSION_MODEL.md](architecture/GROUP_RAID_SESSION_MODEL.md) — proposed party/raid session model.
- [implementation/REPOSITORY_CHANGE_MAP.md](implementation/REPOSITORY_CHANGE_MAP.md) — future repository change map.
- [tasks/0.2.x-raid-party-session-foundation.md](tasks/0.2.x-raid-party-session-foundation.md) — draft prerequisite task for party sessions.
- [tasks/0.2.x-party-vs-one-boss.md](tasks/0.2.x-party-vs-one-boss.md) — draft bridge from temporary party sessions to real raids.
- [tasks/0.2.x-senior-barrel-brother-group-raid.md](tasks/0.2.x-senior-barrel-brother-group-raid.md) — draft production raid task after the temporary party and one-boss proof.
- [qa/SENIOR_BARREL_BROTHER_GROUP_RAID_QA.md](qa/SENIOR_BARREL_BROTHER_GROUP_RAID_QA.md) — future automated and manual QA matrix.
- [backlog/SENIOR_BARREL_BROTHER_TARGETABLE_ADDS.md](backlog/SENIOR_BARREL_BROTHER_TARGETABLE_ADDS.md) — deferred targetable-adds slice.
- [references/RAID_INSPIRATION_NOTES.md](references/RAID_INSPIRATION_NOTES.md) — inspiration notes without copying external content.

## Earlier planning docs that remain useful

- [GROUP_HOOK_DESIGN.md](GROUP_HOOK_DESIGN.md) — попередній дизайн малого групового рейду; тепер це later input для party/raid slice, не перший Phase 2 крок.
- [GROUP_RAID_SESSION_NOTES.md](GROUP_RAID_SESSION_NOTES.md) — нотатки про session rows, учасників і idempotency для майбутніх рейдів.
- [SOCIAL_ACTIONS_BACKLOG.md](SOCIAL_ACTIONS_BACKLOG.md) — backlog корчемних соціяльних дій, тепер підпорядкований Phase 2 social-combat spine.
- [ACHIEVEMENTS_PHASE1.md](ACHIEVEMENTS_PHASE1.md) — rewardless ачівки/титули як later slice.
- [MANTOK_CHEST_BACKLOG.md](MANTOK_CHEST_BACKLOG.md) — item-volume sink і технічний борг ручного вибору.
