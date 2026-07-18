# Bard support patterns in other games

Research date: 12026-07-17 (Kyiv time).

## Summary

The recurring design pattern is consistent: a long party-wide musical benefit is modest, while a strong combat song is short, limited, non-stacking, or paid for with a turn/resource. That supports a small accuracy bonus for the 13-minute performance state and a once-per-raid, action-costing boss-damage lament.

| Game | Relevant mechanic | Product lesson for Kvestarnia |
| --- | --- | --- |
| D&D 2024 Bard | Bardic Inspiration is a limited benefit given to another creature; Cutting Words spends the same limited class resource to reduce an enemy result. | Do not make a long inspiration an unlimited large damage rider. Buff and debuff should compete for bounded Bard value. |
| Pathfinder 2e | Courageous Anthem gives a small `+1` party bonus for one round; Dirge of Doom applies a short fear debuff. The Composition trait normally allows only one composition at a time. | Keep numbers small and make the encouraging song and lament alternatives instead of stackable copies. |
| Final Fantasy XIV | Bard’s persistent songs provide small party bonuses, while stronger support actions have short durations and long recasts. | A 13-minute buff must have low amplitude; stronger mitigation needs a clear downtime/usage gate. |
| Guild Wars | Anthem of Flame is party-wide but is consumed by the next qualifying attack. | Charge-based support is a safe fallback if continuous accuracy proves too strong in simulations. |
| Darkest Dungeon | The Jester spends a combat turn on party support such as Battle Ballad or Inspiring Tune. | The raid lament should replace the Bard’s attack for that round, not be a free pre-attack button. |

## Sources

- D&D Beyond, [Bard class](https://www.dndbeyond.com/classes/2190876-bard).
- Archives of Nethys, [Courageous Anthem](https://2e.aonprd.com/Spells.aspx?ID=1763), [Dirge of Doom](https://2e.aonprd.com/Spells.aspx?ID=1764), and [Composition trait](https://2e.aonprd.com/Traits.aspx?ID=559).
- Final Fantasy XIV, [official Bard Job Guide](https://na.finalfantasyxiv.com/jobguide/bard/).
- Guild Wars Wiki, [Anthem of Flame](https://wiki.guildwars.com/wiki/Anthem_of_Flame).
- Darkest Dungeon Wiki, [Jester](https://darkestdungeon.wiki.gg/wiki/Jester_%28Darkest_Dungeon%29).

## Kvestarnia-specific balance check

The current Big Barrel formula can produce roughly 300 boss HP for a five-player, level-eight party. A flat `+5` damage rider over 13 attacks for all five players has a raw ceiling of:

`5 players × 13 attacks × 5 damage = 325 damage`

That is too close to an entire early boss before misses and other effects. It also scales badly with multi-hit and area actions.

By contrast, a `+5` percentage-point accuracy bonus over 65 player actions creates at most 3.25 additional expected hits before the canonical hit-chance cap and before accounting for actions that do not roll to hit. It remains noticeable without becoming a second weapon.

For the Lament, a five-player raid over 13 boss responses currently has approximately ten focused responses and three broad responses. Applying a legendary `-5` to each actual target damage instance can prevent at most about 125 damage under the explicit zero clamp, before later Ward/Protocol mitigation. The result is meaningful, but it costs the Bard one attack, requires a rare quality grade, cannot stack, and should be verified by the existing 13-round raid simulations.

## Decision

Use:

- performance grade `rough / pleasant / memorable / legendary` → `+1 / +2 / +3 / +5` percentage points to canonical player hit rolls;
- the same grade → `-1 / -2 / -3 / -5` final flat damage for direct Big Brother retaliation;
- strict non-stacking for Inspiration;
- one encounter-local Bard music choice for Barrel-origin Inspiration versus Lament;
- one normal Bard turn plus a shared per-Bard/per-Barrel availability gate for Lament.

Do not add defense, evasion, crit, or flat player damage in 0.3.14. Treat them as future balance experiments only if telemetry and simulations show that accuracy is too weak.
