Use `$kvestarnia-second-codex-readonly`.

Repository: `q587p/kvestarnia-bot`.

Review changed files only unless a changed file clearly depends on a direct neighbor.

Focus areas:

- behavior parity;
- stored combat JSON and cooldown compatibility;
- duplicate/stale callback behavior;
- exact-once reward/resource settlement;
- Telegram callback answer paths;
- domain boundary: no grammY/bot imports in `src/domain`;
- no accidental player-facing Ukrainian copy regression;
- no broad architecture rewrite hidden inside a refactor.

For Player Abilities Registry specifically, verify:

- every current class maps to the same skill ID/profile as before;
- renamed skill legacy cooldown IDs remain readable;
- default/unknown class behavior is unchanged;
- the combat engine still uses the compatibility facade correctly;
- no monster ability runtime behavior changed unless explicitly scoped.

Return only actionable findings. Do not edit files, commit, push, format, or propose an alternative implementation unless asked.
