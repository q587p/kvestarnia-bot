# Codex Prompt Request Template

Use this when asking Codex to write or review a Codex-facing prompt.

```text
Use $kvestarnia-codex-prompt-writer.

Task:
Write a Codex prompt for <feature/problem>.

Context:
- Target branch/base: <branch or commit, if known>
- Target agent: main Codex / second Codex / integration Codex / QA Codex
- Relevant task doc or file: <path>

Requirements:
- English prompt text.
- Start with the relevant `$skill` activation.
- Keep it compact and file/path based.
- Do not paste long project rules.
- For second Codex review: READ ONLY report only, changed files only by default.
- Final output must be compact and non-tutorial.

Output:
- prompt text
- where to store/use it
- risks / assumptions

No tutorial.
```
