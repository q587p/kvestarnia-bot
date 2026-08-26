export const GROUP_COMBAT_SHARED_CLASS_ABILITY_IDS = [
  "skill.forceful-strike",
  "skill.hot-spell",
  "skill.boiling-filling",
  "skill.form-thirteen-b",
  "skill.dangerous-couplet",
  "skill.shadow-cut",
  "skill.trick-shot",
  "skill.strict-blessing",
  "skill.steppe-side-eye",
  "skill.careful-strike"
] as const;

export const GROUP_COMBAT_RAID_ONLY_SPECIALIZATIONS = [
  {
    id: "raid.class.warrior.taunt",
    reason: "Redirects the Big Barrel boss response, including its broad-response cadence; GroupCombat already owns multi-enemy focus and generic Warrior class actions.",
    owner: "docs/backlog/group-combat-raid-specializations.md#warrior-raid-taunt"
  },
  {
    id: "raid.class.bard.lament",
    reason: "Consumes the one Big Barrel music slot and counts boss responses; GroupCombat has neither that raid slot nor a single boss-response clock.",
    owner: "docs/backlog/group-combat-raid-specializations.md#bard-lament"
  },
  {
    id: "raid.race.kharakternyk.ward-sign",
    reason: "Is prepared during Big Barrel recruitment and spends charges only on broad boss retaliation; it is not a normal race action.",
    owner: "docs/backlog/group-combat-raid-specializations.md#kharakternyk-ward-sign"
  },
  {
    id: "raid.class.bureaucramancer.protocol-13-z",
    reason: "Freezes recruitment-time signatures and blocks one focused boss response per signer; GroupCombat has no matching signature phase.",
    owner: "docs/backlog/group-combat-raid-specializations.md#bureaucramancer-protocol-13-z"
  }
] as const;
