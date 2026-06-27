Use `$kvestarnia-version-task`.

Repository: `q587p/kvestarnia-bot`.

Task: behavior-preserving callback route helper.

Read first:

- `AGENTS.md`
- `docs/ai/context.md`
- `tests/scope/architectureStabilizationScope.test.ts`
- `src/bot/modules/social.ts`
- `src/bot/modules/inventory.ts`
- one larger module that will benefit, such as `src/bot/modules/quest.ts`

Use the task doc from this package: `tasks/bot-callback-route-helper.md`.

Goal:

- Add a tiny helper to remove repeated parse failure / `safeAnswerCallbackQuery` / `presentInvalidCallback` ceremony.
- Keep callback regex ownership in vertical modules.
- Do not recreate a central feature router.
- Preserve behavior and callback payload formats.

Start with the smallest safe conversion. Update architecture tests so they still pin ownership but allow the helper.

Expected checks:

- focused tests around invalid callback handling if available;
- `npm run typecheck`;
- architecture scope test.

Final response format:

- Changed files
- Behavior changed
- Tests run
- Risks / follow-ups
- Completion status
