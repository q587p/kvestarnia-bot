# PR Body Template

Use this for release-oriented or runtime PRs. Keep it compact.

```markdown
## Summary

## Version task

## Gameplay impact

## Changed files

## Tests run
- [ ] npm run lint
- [ ] npm run typecheck
- [ ] npm test
- [ ] npm run build
- [ ] npm run check
- [ ] Not run — explain why

## Manual Telegram QA

## User-facing text checklist
- [ ] Player-facing text is Ukrainian
- [ ] Messages are short and Telegram-friendly
- [ ] No sensitive or harmful humor
- [ ] Visible dates use Holocene calendar where applicable; release/news/changelog headings use `1YYYY-MM-DD`

## Safety checklist
- [ ] No secrets in diff
- [ ] Callback data is validated or unchanged
- [ ] Mutating callbacks are idempotent or unchanged
- [ ] DB/schema changes include a migration or are explicitly out of scope

## Balance notes

## Risks / follow-ups
```
