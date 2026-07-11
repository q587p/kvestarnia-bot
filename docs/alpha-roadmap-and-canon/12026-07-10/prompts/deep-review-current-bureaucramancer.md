# Codex prompt — deep review the current Bureaucramancer release

Review only. Do not modify files, commit, push, merge, or post comments.

Inspect `AGENTS.md`, the canonical AI context/workflow, relevant project skills, the current release task, and the full diff from `main` to the current branch. Treat every bundled follow-up as a separate review track.

Prioritize authorization, CAS/idempotency, callback replay, concurrent signing, snapshot/restart compatibility, Big Barrel personal-vs-broad targeting, Kharakternyk interaction, achievements, migrations, and release metadata. Verify that starter copy, Mantok Chest, Chronicles, remort tuning, and icon-doc changes are intentional and tested.

Run the strongest relevant clean checks. Report findings first, ordered P0–P2, with exact files/lines, reproduction, impact, and smallest safe fix. Then list missing tests and manual Telegram scenarios. If no finding is proven, say so and identify residual risks. Do not expand scope.
