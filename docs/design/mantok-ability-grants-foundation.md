# Mantok Ability Grants Foundation

Rare manatky can now grant explicit choices instead of hidden power. A grant is authored in `src/content/mantokAbilityGrants.ts`, points at one item id, declares a compact stable key and either exposes a combat action or records a narrow service-perk marker.

Combat grants become `CombatSkillProfile` entries with `source: "equipment"` and `action: "gear"`. The intended live combat surfaces for this slice are ordinary persistent PvE, including multi-enemy fights, Big Barrel Brother/party-boss rounds and turn-based duels. Active keyboards show equipped, level-eligible combat grants only while their current mana/cooldown gates allow pressing them; blocked callbacks remain service-level no-ops for stale or forged presses. Quick duels stay instant and do not expose gear actions.

Persistent fights seed eligible grant ids at combat start from the equipped item snapshot, then refresh the current eligible ids when an active fight card is shown or a current-turn callback is resolved. This allows players to change gear during an active turn without refilling stored combat HP/mana or gaining an extra turn. Gear callbacks use `v1:fight:gear:<sessionId>:<turn>:<grantKey>` and the service rejects stale turns, unknown keys and grants absent from the current equipped snapshot before invoking the combat engine. Multi-enemy fights reuse the same action and status path as single-enemy fights, so journals and reopened cards must keep gear actions and bleed rows stable.

Big Barrel Brother/party-boss gear callbacks use the same compact grant keys and resolve through the party-boss action path. Gear support effects apply before boss retaliation, and active cards plus journal pages render the concrete gear-action label and support rows. Turn-based duel gear callbacks queue and resolve like other turn-based actions; stored round replays show the same concrete gear-action result text. Generic active-combat redirects must preserve fight, party-boss item/gear and turn-based duel shortcuts instead of answering that combat must finish first.

Committed gear actions emit the rewardless first-use achievement event `mantok.gear-action.used`. Stale callbacks, missing grants and forged blocked mana/cooldown attempts do not emit it. The existing `📖 Перекази` board describes this as a visible `Дія спорядження`, and `/lore` is only a help-listed shortcut to that board, not a Telegram side-menu entry.

The first status family is bleed. Bleed is capped, refresh-only and ticks once on committed hero activations before the monster phase. If bleed itself deals terminal damage to the final enemy, combat settles without an extra monster response; direct final hits keep the existing simultaneous-response behavior.

Borrowed class/race-style actions are intentionally weaker, more expensive or slower than native identity actions and never use `source: "class"` or `source: "race"`.
