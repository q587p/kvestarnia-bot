# Local Runtime Troubleshooting Prompt

Use this for Windows/Prisma/local manual-test bot launcher issues.

```text
Use $kvestarnia-local-runtime.

Task:
Fix or review the local bot runtime issue.

Failing command:
<run-local-bot.cmd / refresh-local-bot.cmd / status-local-bot.cmd / other>

Useful log excerpt:
<paste only the shortest relevant error block>

Constraints:
- keep the manual-test bot isolated from Codex work in the main checkout
- do not kill all node.exe processes
- do not stop or refresh the running isolated bot unless explicitly needed
- do not touch production env/data/tokens
- keep changes scoped to local scripts/docs unless the task says otherwise

Output:
- root cause
- changed files
- local commands to run
- isolated-runtime vs repository impact
- tests/checks run
- risks / follow-ups

No tutorial.
```
