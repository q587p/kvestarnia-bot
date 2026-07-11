# Task: Current Bureaucramancer release gate

## Outcome

Довести поточний release candidate з «Особистим протоколом 13-Б» до merge/deploy стану без розширення scope й із перевіреним interaction contract.

## Scope

- Deep changed-files review усіх блоків гілки.
- Виправлення лише підтверджених findings.
- Unit/integration tests для authorization, CAS/replay, snapshot/restart, personal vs broad hits і achievements.
- Multi-actor Telegram QA.
- Deploy/rollback verification і release docs.

## Обов’язкові review tracks

1. Core protocol state machine та cooldown/mana rules.
2. Concurrent sign, repeated callback і snapshot versioning.
3. Big Barrel targeting та сумісність із Kharakternyk ward.
4. Rewardless achievement semantics.
5. Starter copy, Mantok Chest, Chronicles, remort pressure та icon docs — кожен як окремий review block.

## Non-goals

- Нові класи, raid mechanics або rewards.
- Перебудова FightService чи scheduler framework.
- Включення passive HP notification draft.
- Balance changes, яких уже немає у changed files.

## Acceptance

- [ ] Scope freeze записано в task/PR description.
- [ ] Немає unresolved P0/P1 review findings.
- [ ] `npm run check` проходить на final head.
- [ ] Telegram QA двома/трьома акторами пройдена й датована.
- [ ] Restart/replay evidence збережено без identifiers.
- [ ] Release metadata/news/changelog описують лише фактичний scope.
- [ ] Production smoke і rollback observation завершені.

## Prompt sequence

1. `prompts/deep-review-current-bureaucramancer.md`
2. `prompts/fix-current-bureaucramancer-review-findings.md`
3. `prompts/telegram-qa-current-bureaucramancer.md`
4. `prompts/release-closeout.md`
