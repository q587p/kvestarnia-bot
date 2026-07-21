# Party vs many proof implementation

```text
Use $kvestarnia-version-task.

Implement:
docs/tasks/0.4.0-party-vs-many-proof.md

Context:
docs/ai/context.md
docs/architecture/party-combat-evolution-plan.md
docs/design/guilds-and-party-progression.md

Follow AGENTS.md.
Work on this versioned task only after accepted 0.3.16 closeout. Use a minimal
vertical diff. Keep Big Barrel on PartyBossSession and keep generic group workflow
out of FightService. Inspect current actor-action, lease, CAS/timeout and canonical
card seams before implementation. Run domain and real repository race tests first.

No rewards, guilds, production exposure, >3x3 or broad refactor.

Final output:
- changed files
- behavior changed
- tests / load proof / simulations
- migration and rollback evidence
- risks / follow-ups
- completion status

No tutorial.
```
