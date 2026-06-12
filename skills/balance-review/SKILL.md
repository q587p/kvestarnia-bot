---
name: balance-review
description: Review combat formulas, loot tables, progression curves, PvP fairness, guild rewards, and Telegram RPG economy risks.
---

# Balance Review Skill

Use this skill when changing combat, loot, progression, economy, cooldowns, PvP, raids, or guild rewards.

## Goals
- Keep early game fast and forgiving.
- Prevent runaway snowball.
- Keep rewards exciting but controlled.
- Ensure formulas are testable and content-driven.

## Review checklist
- What is the expected win rate by level/class?
- What is average fight duration?
- Can duplicate callbacks grant duplicate rewards?
- Does LUCK break rarity distribution?
- Is any class/race clearly dominant?
- Does PvP punish new players?
- Are there enough currency sinks?
- Are cooldowns product decisions, not only anti-spam patches?

## Suggested simulation output
Ask Codex to produce or run a simulation and summarize:

```text
level,class,race,monster_level,win_rate,avg_turns,avg_hp_remaining,p95_damage_taken
1,warrior,human-ish,1,0.86,3.2,8.4,18
```

## Red flags
- Average fight > 6 turns for normal monsters.
- Win rate < 70% in first hour.
- Epic chance affected too strongly by common stats.
- Winner-takes-all raid rewards.
- PvP item loss.
- Any direct paid combat advantage.
