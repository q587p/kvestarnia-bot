# Codex prompt — prepare current Bureaucramancer Telegram QA

Prepare an executable manual QA runbook; do not claim that Telegram steps were run unless you have direct evidence. Read the current release task, changed behavior, existing playtesting docs, relevant project skills, and dev reset commands.

Use two actors minimum and three where concurrency matters. Cover class/level/mana/cooldown gates, auto-sign, free join, concurrent sign, repeated callbacks, personal hit blocked once per signer, broad hit unaffected, restart/snapshot, Kharakternyk coexistence, achievements, and each bundled follow-up. Include setup, exact action, expected state/copy, cleanup, and evidence fields. Keep identifiers sanitized.

Separate automated prerequisites from human Telegram actions. End with explicit merge blockers, accepted residual risks, and the shortest production smoke after deploy. Do not edit production state or send messages unless explicitly authorized.
