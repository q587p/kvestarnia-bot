# Mantok Ability Grants Foundation

Rare manatky can now grant explicit choices instead of hidden power. A grant is authored in `src/content/mantokAbilityGrants.ts`, points at one item id, declares a compact stable key and either exposes a combat action or records a narrow service-perk marker.

Combat grants become `CombatSkillProfile` entries with `source: "equipment"` and `action: "gear"`. Persistent fights seed eligible grant ids at combat start from the equipped item snapshot, then refresh the current eligible ids when an active fight card is shown or a current-turn callback is resolved. This allows players to change gear during an active turn without refilling stored combat HP/mana or gaining an extra turn. Gear callbacks use `v1:fight:gear:<sessionId>:<turn>:<grantKey>` and the service rejects stale turns, unknown keys and grants absent from the current equipped snapshot before invoking the combat engine.

The first status family is bleed. Bleed is capped, refresh-only and ticks once on committed hero activations before the monster phase. If bleed itself deals terminal damage to the final enemy, combat settles without an extra monster response; direct final hits keep the existing simultaneous-response behavior.

Borrowed class/race-style actions are intentionally weaker, more expensive or slower than native identity actions and never use `source: "class"` or `source: "race"`.
