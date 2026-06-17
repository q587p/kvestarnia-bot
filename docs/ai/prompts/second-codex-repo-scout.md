# Second Codex — Read-only Repo Scout Prompt

Use this before implementation when the main Codex needs a map, not a competing implementation.

```text
Use $kvestarnia-second-codex-readonly.

Scout this task in read-only mode:
docs/tasks/<version>-<short-slug>.md

Mode:
READ ONLY report only.

Scope:
Start from files and search terms listed in the task doc.
Do not scan the whole repository unless needed.
Do not edit files.

Output:
- relevant files
- current behavior
- risk map
- likely tests
- compact manual QA
- safe notes for main Codex

No implementation.
No tutorial.
```
