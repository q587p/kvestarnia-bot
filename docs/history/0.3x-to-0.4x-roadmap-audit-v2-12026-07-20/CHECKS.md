# Package verification

- Live PR refresh: `#179` open, draft, unmerged; base
  `d101867cd80f9c05505899ac7b42adf92e369527`, head
  `e223073a65b96a293ca40ed8e6f14e4bef1b930d`.
- Independent focused re-audit of that head: 7 files / 102 tests passed.
- Proposed delta: 30 files, README plus `docs/` only; no runtime, Prisma schema,
  migration, package, lockfile, test, `.env` or database change.
- `git apply --check PATCH.diff` passes against clean `e223073a`.
- `git diff --check` passes for the proposed repository delta.
- Relative links in changed/new repo docs resolve against the audited tree.
- `docs/ai/context.md`: 104 lines, below the 250-line limit.
- Package-local Markdown links resolve.
- Codex prompt files are English, start with the relevant skill, and read-only
  review prompts explicitly say `READ ONLY report only`.
- All proposed `0.4.5`–`0.4.12` task docs contain the repository's eight required
  sections. Food, consumable and recycling tasks stop at explicit catalog/
  algorithm activation gates rather than delegating product rules to Codex.
- `repo-files/` byte-matches all 30 proposed repository files.
- Independent read-only re-review confirmed the social/economy task, transaction,
  remort, item-use, batch-identity and prompt findings were addressed.

Not claimed:

- full `npm run check` for the docs-only delta;
- production flag values, migration deployment or backup/restore;
- manual Telegram QA;
- merge/deploy readiness for PR #179 until the residual blockers are fixed.
