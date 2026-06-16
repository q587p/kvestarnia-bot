# Docs Index

Цей індекс допомагає швидко знайти актуальне джерело правди в документації Квестарні. README лишається public-facing вітриною; докладні runbook-и, дизайн-рішення й плани живуть тут.

## Canonical project docs

- [BRAND.md](BRAND.md) — назва, voice, tone, public wording і заборонені варіанти неймінґу.
- [PRODUCT_BRIEF.md](PRODUCT_BRIEF.md) — позиціонування, аудиторія, USP і MVP scope.
- [GAME_DESIGN.md](GAME_DESIGN.md) — core loop, персонаж, бій, прогресія й майбутні соціяльні механіки.
- [CONTENT_STYLE_GUIDE.md](CONTENT_STYLE_GUIDE.md) — український тон, гумор, лапки й формат Telegram-повідомлень.
- [TECHNICAL_PLAN.md](TECHNICAL_PLAN.md) — архітектура, дані, callbacks, deployment і технічні борги.
- [BALANCE_NOTES.md](BALANCE_NOTES.md) — формули, економіка, RNG і балансні guardrails.
- [ROADMAP.md](ROADMAP.md) — фази розвитку й Definition of Done.
- [SECURITY_AND_FAIR_PLAY.md](SECURITY_AND_FAIR_PLAY.md) — приватність, антиаб’юз, idempotency і чесна гра.
- [DEVELOPER_SETUP.md](DEVELOPER_SETUP.md) — локальний запуск, Prisma, Render, scripts і troubleshooting.
- [PLAYTESTING.md](PLAYTESTING.md) — ручний smoke test поточного playable loop.
- [CODEX_WORKFLOW.md](CODEX_WORKFLOW.md) — правила постановки задач, PR і docs-only workflow.

## Phase 1 closeout

- [PHASE1_RELEASE_NOTES.md](PHASE1_RELEASE_NOTES.md) — канонічний підсумок `0.1.0`.
- [PHASE1_CLOSEOUT_0_1_TRANSITION.md](PHASE1_CLOSEOUT_0_1_TRANSITION.md) — межа `0.0.x` → `0.1.x`.
- [PHASE1_CLOSEOUT_SMOKE.md](PHASE1_CLOSEOUT_SMOKE.md) — фінальний smoke/release gate.
- [NEXT_IMPLEMENTATION_BACKLOG.md](NEXT_IMPLEMENTATION_BACKLOG.md) — наступний малий порядок після closeout.

## Phase 2 roadmap reset

Phase 2 більше не починається з великого групового рейду. Новий напрям: **Social Combat & Interactions** — спершу opt-in дуелі й запрошення, потім картки результатів, реванші, турнірний шум, обмін/дарування, бойова різноманітність, `/remort`, multi-enemy combat і тільки після цього party combat / real raids.

- [phase2/SOCIAL_COMBAT_PLAN.md](phase2/SOCIAL_COMBAT_PLAN.md) — головний план Phase 2.
- [phase2/DUELS_AND_INVITES.md](phase2/DUELS_AND_INVITES.md) — перший MVP для дуелей і shareable invite cards.
- [phase2/GROUP_COMBAT_AND_RAIDS.md](phase2/GROUP_COMBAT_AND_RAIDS.md) — як рейди виростають із дуелей, party sessions і multi-enemy combat.
- [phase2/TRADING_AND_GIFTING.md](phase2/TRADING_AND_GIFTING.md) — безпечний обмін і подарунки між гравцями.
- [phase2/REMORT.md](phase2/REMORT.md) — `/remort` після 13 рівня без power snowball.
- [phase2/ITEM_TAGS_AND_CONSUMABLES.md](phase2/ITEM_TAGS_AND_CONSUMABLES.md) — item tags, одноразові манатки й бойові дії від предметів.
- [phase2/UNSTABLE_BALANCE_PRINCIPLES.md](phase2/UNSTABLE_BALANCE_PRINCIPLES.md) — як лишати баланс веселим, але не токсичним.

## Earlier planning docs that remain useful

- [GROUP_HOOK_DESIGN.md](GROUP_HOOK_DESIGN.md) — попередній дизайн малого групового рейду; тепер це later input для party/raid slice, не перший Phase 2 крок.
- [GROUP_RAID_SESSION_NOTES.md](GROUP_RAID_SESSION_NOTES.md) — нотатки про session rows, учасників і idempotency для майбутніх рейдів.
- [SOCIAL_ACTIONS_BACKLOG.md](SOCIAL_ACTIONS_BACKLOG.md) — backlog корчемних соціяльних дій, тепер підпорядкований Phase 2 social-combat spine.
- [ACHIEVEMENTS_PHASE1.md](ACHIEVEMENTS_PHASE1.md) — rewardless ачівки/титули як later slice.
- [MANTOK_CHEST_BACKLOG.md](MANTOK_CHEST_BACKLOG.md) — item-volume sink і технічний борг ручного вибору.

