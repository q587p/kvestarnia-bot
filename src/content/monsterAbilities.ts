// Generated from the monster abilities proposal package, then validated by tests.
export type MonsterAbilityRole = "artillery" | "cleanser" | "controller" | "defender" | "setup" | "skirmisher" | "striker" | "sustain" | "trickster";
export type MonsterAbilityPowerBand = "minor" | "standard" | "strong" | "ultimate";
export type MonsterAbilityTargetScope = "all-allies" | "all-enemies" | "lowest-hp-ally" | "lowest-hp-enemy" | "self" | "self-and-single-enemy" | "single-enemy" | "single-enemy-and-self";
export type MonsterAbilityParameterKey = "abilityPotencyMultiplier" | "accuracyAndEvasionPenaltyPp" | "accuracyPenaltyPp" | "bleedDamageMultiplier" | "bleedTicks" | "bonusAgainstDebuffedTargets" | "bonusDamageMultiplierBelowHalfHp" | "bossFallbackAbilityPotencyMultiplier" | "burnDamageMultiplier" | "burnTicks" | "charges" | "cleanseNegativeEffects" | "copyLastDirectActionPotency" | "counterChance" | "critPenaltyPp" | "damageMultiplier" | "damageMultiplierWhenShieldBreaks" | "damageReduction" | "durationOwnActivations" | "durationTargetActivations" | "evasionBonusPp" | "evasionPenaltyPp" | "extendLongestCooldownBy" | "fallbackShieldMaxHpFraction" | "fleeChancePenaltyPp" | "groupTargetConfusion" | "healTargetMaxHpFraction" | "lockAbilitySource" | "lockAnyOneAbility" | "manaCostIncrease" | "manaDrain" | "markIncomingDamageMultiplier" | "nextAttackBonusIfShieldSurvives" | "outgoingDamageMultiplier" | "predictRepeatedLastAction" | "reapplyLastExpiredNegativeEffect" | "reflectFlatDamage" | "removePositiveEffects" | "repeatLastActionPenalty" | "riderByTurnCycle" | "riderByTurnParity" | "selfDamageReduction" | "selfEvasionBonusPp" | "selfHealMaxHpFraction" | "shieldMaxHpFraction" | "slowAttackerPp" | "soloFallbackShieldMaxHpFraction" | "statusResistancePp" | "targetAccuracyPenaltyPp";

export type MonsterAbilityParameterValue = number | boolean | string | readonly string[] | readonly Record<string, unknown>[];

export type MonsterAbilityParameters = Readonly<Partial<Record<MonsterAbilityParameterKey, MonsterAbilityParameterValue>>>;

export interface MonsterAbilityDefinition {
  readonly id: string;
  readonly label: string;
  readonly role: MonsterAbilityRole;
  readonly targetScopes: readonly MonsterAbilityTargetScope[];
  readonly cooldownOwnActions: number;
  readonly powerBand: MonsterAbilityPowerBand;
  readonly parameters: MonsterAbilityParameters;
  readonly telegraphOneEnemyAction: boolean;
  readonly oncePerFight: boolean;
  readonly tags: readonly string[];
}

export const monsterAbilities = [
  {
    "id": "monster.sauce-spit",
    "label": "🌯 Соусний плювок",
    "role": "controller",
    "targetScopes": [
      "single-enemy"
    ],
    "cooldownOwnActions": 2,
    "powerBand": "minor",
    "parameters": {
      "damageMultiplier": 0.65,
      "accuracyPenaltyPp": 10,
      "durationTargetActivations": 1
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "food",
      "mimic"
    ]
  },
  {
    "id": "monster.title-tax",
    "label": "👑 Податок на титул",
    "role": "controller",
    "targetScopes": [
      "single-enemy"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "minor",
    "parameters": {
      "damageMultiplier": 0.4,
      "outgoingDamageMultiplier": 0.9,
      "durationTargetActivations": 2
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "diplomacy",
      "tiny-boss"
    ]
  },
  {
    "id": "monster.royal-scurry",
    "label": "🐭 Відступ високої особи",
    "role": "defender",
    "targetScopes": [
      "self"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "minor",
    "parameters": {
      "evasionBonusPp": 18,
      "damageReduction": 0.25,
      "durationOwnActivations": 1
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "tiny-boss",
      "mobility"
    ]
  },
  {
    "id": "monster.stamp-denied",
    "label": "🛑 Печатка «Не допущено»",
    "role": "controller",
    "targetScopes": [
      "single-enemy"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "standard",
    "parameters": {
      "damageMultiplier": 0.55,
      "lockAbilitySource": "class",
      "durationTargetActivations": 1,
      "bossFallbackAbilityPotencyMultiplier": 0.8
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "bureaucracy",
      "undead"
    ]
  },
  {
    "id": "monster.audit-formula",
    "label": "📊 Формула збитків",
    "role": "setup",
    "targetScopes": [
      "single-enemy"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "minor",
    "parameters": {
      "markIncomingDamageMultiplier": 1.2,
      "charges": 1,
      "durationTargetActivations": 2
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "numbers",
      "bureaucracy"
    ]
  },
  {
    "id": "monster.deadline-web",
    "label": "🕸 Павутина «на вчора»",
    "role": "controller",
    "targetScopes": [
      "single-enemy"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "standard",
    "parameters": {
      "damageMultiplier": 0.4,
      "evasionPenaltyPp": 15,
      "durationTargetActivations": 2
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "time",
      "web"
    ]
  },
  {
    "id": "monster.smoke-without-approval",
    "label": "💨 Дим без погодження",
    "role": "controller",
    "targetScopes": [
      "all-enemies"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "standard",
    "parameters": {
      "damageMultiplier": 0.55,
      "accuracyPenaltyPp": 10,
      "durationTargetActivations": 1
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "dragon",
      "fire",
      "bureaucracy"
    ]
  },
  {
    "id": "monster.preapproved-bite",
    "label": "🐉 Укус за формою",
    "role": "striker",
    "targetScopes": [
      "single-enemy"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "strong",
    "parameters": {
      "damageMultiplier": 1.25,
      "burnDamageMultiplier": 0.15,
      "burnTicks": 2
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "dragon",
      "mini-boss"
    ]
  },
  {
    "id": "monster.unread-clause",
    "label": "🔎 Пункт дрібним шрифтом",
    "role": "controller",
    "targetScopes": [
      "single-enemy"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "standard",
    "parameters": {
      "repeatLastActionPenalty": 0.2,
      "durationTargetActivations": 2
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "rules",
      "tutorial"
    ]
  },
  {
    "id": "monster.slipper-scatter",
    "label": "🥿 Розбіг у різні боки",
    "role": "skirmisher",
    "targetScopes": [
      "self",
      "all-enemies"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "standard",
    "parameters": {
      "selfEvasionBonusPp": 20,
      "durationOwnActivations": 2,
      "damageMultiplier": 0.35
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "swarm",
      "mobility"
    ]
  },
  {
    "id": "monster.temperature-offense",
    "label": "🌡 Температурна образа",
    "role": "striker",
    "targetScopes": [
      "single-enemy"
    ],
    "cooldownOwnActions": 2,
    "powerBand": "standard",
    "parameters": {
      "damageMultiplier": 0.75,
      "riderByTurnParity": [
        "minor-burn",
        "minor-chill"
      ],
      "durationTargetActivations": 2
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "food",
      "temperature"
    ]
  },
  {
    "id": "monster.conditional-knife",
    "label": "🔪 Ніж умовної нарізки",
    "role": "striker",
    "targetScopes": [
      "single-enemy"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "standard",
    "parameters": {
      "damageMultiplier": 1,
      "bleedDamageMultiplier": 0.15,
      "bleedTicks": 2
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "bandit",
      "knife",
      "bread"
    ]
  },
  {
    "id": "monster.queue-number",
    "label": "🎟 Ваш номер ще не настав",
    "role": "defender",
    "targetScopes": [
      "self-and-single-enemy"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "standard",
    "parameters": {
      "selfDamageReduction": 0.35,
      "targetAccuracyPenaltyPp": 10,
      "durationTargetActivations": 1
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "queue",
      "stone",
      "gatekeeper"
    ]
  },
  {
    "id": "monster.small-expense-audit",
    "label": "🦟 Ревізія дрібних витрат",
    "role": "controller",
    "targetScopes": [
      "single-enemy"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "minor",
    "parameters": {
      "damageMultiplier": 0.45,
      "manaDrain": 1
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "audit",
      "gold",
      "insect"
    ]
  },
  {
    "id": "monster.archive-chew",
    "label": "📚 З’їсти доказ",
    "role": "sustain",
    "targetScopes": [
      "single-enemy-and-self"
    ],
    "cooldownOwnActions": 4,
    "powerBand": "standard",
    "parameters": {
      "damageMultiplier": 0.55,
      "removePositiveEffects": 1,
      "selfHealMaxHpFraction": 0.06
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "archive",
      "paper",
      "food"
    ]
  },
  {
    "id": "monster.final-comment",
    "label": "💬 Останній коментар",
    "role": "controller",
    "targetScopes": [
      "single-enemy"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "standard",
    "parameters": {
      "damageMultiplier": 0.5,
      "abilityPotencyMultiplier": 0.8,
      "durationTargetActivations": 1
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "troll",
      "argument"
    ]
  },
  {
    "id": "monster.transparent-report",
    "label": "🪼 Прозорий звіт",
    "role": "defender",
    "targetScopes": [
      "self"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "standard",
    "parameters": {
      "shieldMaxHpFraction": 0.18,
      "reflectFlatDamage": 1
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "paperwork",
      "soft",
      "floating"
    ]
  },
  {
    "id": "monster.no-change",
    "label": "🪙 Без здачі",
    "role": "defender",
    "targetScopes": [
      "self"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "standard",
    "parameters": {
      "shieldMaxHpFraction": 0.2,
      "nextAttackBonusIfShieldSurvives": 0.15
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "merchant",
      "gold",
      "trickster"
    ]
  },
  {
    "id": "monster.mirror-doubt",
    "label": "🪞 Віддзеркалити сумнів",
    "role": "trickster",
    "targetScopes": [
      "single-enemy"
    ],
    "cooldownOwnActions": 4,
    "powerBand": "strong",
    "parameters": {
      "copyLastDirectActionPotency": 0.7
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": true,
    "tags": [
      "mirror",
      "mind",
      "cursed"
    ]
  },
  {
    "id": "monster.dry-whistle",
    "label": "🫖 Свист сухого моря",
    "role": "controller",
    "targetScopes": [
      "all-enemies"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "standard",
    "parameters": {
      "accuracyPenaltyPp": 15,
      "durationTargetActivations": 1
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "teapot",
      "water",
      "sound"
    ]
  },
  {
    "id": "monster.cabbage-plate",
    "label": "🥬 Квашена броня",
    "role": "sustain",
    "targetScopes": [
      "self"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "standard",
    "parameters": {
      "shieldMaxHpFraction": 0.2,
      "selfHealMaxHpFraction": 0.05
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "plant",
      "knight",
      "armor"
    ]
  },
  {
    "id": "monster.tax-breath",
    "label": "🔥 Деклараційне полум’я",
    "role": "artillery",
    "targetScopes": [
      "all-enemies"
    ],
    "cooldownOwnActions": 4,
    "powerBand": "standard",
    "parameters": {
      "damageMultiplier": 0.9
    },
    "telegraphOneEnemyAction": true,
    "oncePerFight": false,
    "tags": [
      "dragon",
      "boss",
      "tax"
    ]
  },
  {
    "id": "monster.asset-freeze",
    "label": "🧊 Заморозити активи",
    "role": "controller",
    "targetScopes": [
      "all-enemies"
    ],
    "cooldownOwnActions": 4,
    "powerBand": "standard",
    "parameters": {
      "manaCostIncrease": 1,
      "durationTargetActivations": 2
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": true,
    "tags": [
      "gold",
      "tax",
      "bureaucracy"
    ]
  },
  {
    "id": "monster.compound-interest",
    "label": "📈 Складний відсоток",
    "role": "sustain",
    "targetScopes": [
      "self"
    ],
    "cooldownOwnActions": 4,
    "powerBand": "strong",
    "parameters": {
      "selfHealMaxHpFraction": 0.08,
      "outgoingDamageMultiplier": 1.2,
      "durationOwnActivations": 2
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "boss",
      "gold"
    ]
  },
  {
    "id": "monster.complaint-glare",
    "label": "💡 Підсвітити скаргу",
    "role": "controller",
    "targetScopes": [
      "single-enemy"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "standard",
    "parameters": {
      "accuracyPenaltyPp": 15,
      "repeatLastActionPenalty": 0.15,
      "durationTargetActivations": 2
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "sound",
      "paperwork"
    ]
  },
  {
    "id": "monster.complaint-echo",
    "label": "📣 Відлуння скарги",
    "role": "artillery",
    "targetScopes": [
      "all-enemies"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "standard",
    "parameters": {
      "damageMultiplier": 0.45,
      "bonusAgainstDebuffedTargets": 0.25
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "sound",
      "unquiet"
    ]
  },
  {
    "id": "monster.ledger-charge",
    "label": "🐗 Прибутково-видатковий таран",
    "role": "striker",
    "targetScopes": [
      "single-enemy"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "strong",
    "parameters": {
      "damageMultiplier": 1.4
    },
    "telegraphOneEnemyAction": true,
    "oncePerFight": false,
    "tags": [
      "beast",
      "ledger",
      "audit"
    ]
  },
  {
    "id": "monster.ledger-audit",
    "label": "📒 Звірка копит",
    "role": "setup",
    "targetScopes": [
      "single-enemy"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "standard",
    "parameters": {
      "markIncomingDamageMultiplier": 1.15,
      "manaDrain": 1,
      "durationTargetActivations": 2
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "paperwork",
      "audit"
    ]
  },
  {
    "id": "monster.salted-oath",
    "label": "🥨 Солона обіцянка",
    "role": "defender",
    "targetScopes": [
      "self"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "standard",
    "parameters": {
      "shieldMaxHpFraction": 0.22,
      "counterChance": 0.25
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "bread",
      "rules"
    ]
  },
  {
    "id": "monster.crumb-ambush",
    "label": "🍞 Крихітна засідка",
    "role": "striker",
    "targetScopes": [
      "single-enemy"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "standard",
    "parameters": {
      "damageMultiplier": 0.9,
      "bonusDamageMultiplierBelowHalfHp": 0.35
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "food",
      "bread"
    ]
  },
  {
    "id": "monster.reopen-case",
    "label": "🗃 Відкрити закрите",
    "role": "controller",
    "targetScopes": [
      "single-enemy",
      "self"
    ],
    "cooldownOwnActions": 4,
    "powerBand": "strong",
    "parameters": {
      "reapplyLastExpiredNegativeEffect": true,
      "fallbackShieldMaxHpFraction": 0.15
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": true,
    "tags": [
      "paperwork",
      "rules",
      "unquiet"
    ]
  },
  {
    "id": "monster.denied-closure",
    "label": "📄 Відмова в закритті",
    "role": "controller",
    "targetScopes": [
      "single-enemy"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "standard",
    "parameters": {
      "damageMultiplier": 0.55,
      "lockAbilitySource": "race",
      "durationTargetActivations": 1,
      "bossFallbackAbilityPotencyMultiplier": 0.85
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "bureaucracy",
      "rules"
    ]
  },
  {
    "id": "monster.false-exit",
    "label": "🚪 Намальований вихід",
    "role": "trickster",
    "targetScopes": [
      "single-enemy"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "standard",
    "parameters": {
      "fleeChancePenaltyPp": 20,
      "groupTargetConfusion": true,
      "durationTargetActivations": 2
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "map",
      "trickster"
    ]
  },
  {
    "id": "monster.corridor-redraw",
    "label": "🗺 Перемалювати коридор",
    "role": "defender",
    "targetScopes": [
      "self"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "standard",
    "parameters": {
      "evasionBonusPp": 20,
      "damageReduction": 0.2,
      "durationOwnActivations": 2
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "paper",
      "rules"
    ]
  },
  {
    "id": "monster.foam-inspection",
    "label": "🍺 Пінна перевірка",
    "role": "controller",
    "targetScopes": [
      "all-enemies"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "standard",
    "parameters": {
      "damageMultiplier": 0.55,
      "abilityPotencyMultiplier": 0.8,
      "durationTargetActivations": 1
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "audit",
      "sound"
    ]
  },
  {
    "id": "monster.queue-audit",
    "label": "🧾 Черга на ревізію",
    "role": "setup",
    "targetScopes": [
      "lowest-hp-enemy"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "standard",
    "parameters": {
      "markIncomingDamageMultiplier": 1.15,
      "durationTargetActivations": 2
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "audit",
      "queue"
    ]
  },
  {
    "id": "monster.chimera-bite",
    "label": "🐲 Підписаний укус",
    "role": "striker",
    "targetScopes": [
      "single-enemy"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "strong",
    "parameters": {
      "damageMultiplier": 1.15,
      "bleedDamageMultiplier": 0.12,
      "bleedTicks": 2
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "chimera",
      "construct"
    ]
  },
  {
    "id": "monster.chimera-veto",
    "label": "✒️ Вето другої голови",
    "role": "controller",
    "targetScopes": [
      "single-enemy"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "standard",
    "parameters": {
      "damageMultiplier": 0.45,
      "lockAnyOneAbility": true,
      "durationTargetActivations": 1,
      "bossFallbackAbilityPotencyMultiplier": 0.8
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "chimera",
      "bureaucracy"
    ]
  },
  {
    "id": "monster.chimera-minority-report",
    "label": "🛡 Окрема думка третьої голови",
    "role": "defender",
    "targetScopes": [
      "self"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "strong",
    "parameters": {
      "shieldMaxHpFraction": 0.25,
      "counterChance": 0.3
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "chimera",
      "cursed"
    ]
  },
  {
    "id": "monster.vault-lock",
    "label": "🧀 Замкнути сиросховище",
    "role": "defender",
    "targetScopes": [
      "self"
    ],
    "cooldownOwnActions": 4,
    "powerBand": "strong",
    "parameters": {
      "shieldMaxHpFraction": 0.3
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "food",
      "stone",
      "gatekeeper"
    ]
  },
  {
    "id": "monster.cold-rind",
    "label": "❄️ Холодна скоринка",
    "role": "defender",
    "targetScopes": [
      "self"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "standard",
    "parameters": {
      "damageReduction": 0.25,
      "slowAttackerPp": 10,
      "durationOwnActivations": 2
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "food",
      "stone"
    ]
  },
  {
    "id": "monster.napkin-denial",
    "label": "🧻 Без серветки не приймаємо",
    "role": "cleanser",
    "targetScopes": [
      "self"
    ],
    "cooldownOwnActions": 4,
    "powerBand": "strong",
    "parameters": {
      "cleanseNegativeEffects": 1,
      "statusResistancePp": 40,
      "durationOwnActivations": 2
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "gatekeeper",
      "food"
    ]
  },
  {
    "id": "monster.reschedule",
    "label": "📅 Перенести на потім",
    "role": "controller",
    "targetScopes": [
      "single-enemy"
    ],
    "cooldownOwnActions": 5,
    "powerBand": "strong",
    "parameters": {
      "extendLongestCooldownBy": 1
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": true,
    "tags": [
      "time",
      "paperwork"
    ]
  },
  {
    "id": "monster.hydra-monday",
    "label": "🐍 Понеділок відростає",
    "role": "sustain",
    "targetScopes": [
      "self"
    ],
    "cooldownOwnActions": 4,
    "powerBand": "strong",
    "parameters": {
      "selfHealMaxHpFraction": 0.12,
      "outgoingDamageMultiplier": 1.15,
      "durationOwnActivations": 2
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "time",
      "hydra"
    ]
  },
  {
    "id": "monster.deadline-flood",
    "label": "🌊 Потоп дедлайнів",
    "role": "artillery",
    "targetScopes": [
      "all-enemies"
    ],
    "cooldownOwnActions": 4,
    "powerBand": "strong",
    "parameters": {
      "damageMultiplier": 0.65,
      "accuracyAndEvasionPenaltyPp": 12,
      "durationTargetActivations": 2
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "time",
      "water",
      "paperwork"
    ]
  },
  {
    "id": "monster.inventory-prophecy",
    "label": "🔮 Я знав, що ви це натиснете",
    "role": "trickster",
    "targetScopes": [
      "self"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "strong",
    "parameters": {
      "predictRepeatedLastAction": true,
      "evasionBonusPp": 25,
      "counterChance": 0.35
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "mind",
      "paperwork"
    ]
  },
  {
    "id": "monster.shortage",
    "label": "📦 Інвентарна недостача",
    "role": "controller",
    "targetScopes": [
      "single-enemy"
    ],
    "cooldownOwnActions": 4,
    "powerBand": "strong",
    "parameters": {
      "removePositiveEffects": 1,
      "manaDrain": 2
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "gold",
      "paperwork"
    ]
  },
  {
    "id": "monster.missing-line",
    "label": "➖ Рядок мінус влучність",
    "role": "controller",
    "targetScopes": [
      "single-enemy"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "standard",
    "parameters": {
      "accuracyPenaltyPp": 15,
      "critPenaltyPp": 10,
      "durationTargetActivations": 2
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "mind",
      "paperwork"
    ]
  },
  {
    "id": "monster.quiet-catastrophe",
    "label": "🌑 Тиха катастрофа",
    "role": "artillery",
    "targetScopes": [
      "all-enemies"
    ],
    "cooldownOwnActions": 5,
    "powerBand": "ultimate",
    "parameters": {
      "damageMultiplier": 1.05
    },
    "telegraphOneEnemyAction": true,
    "oncePerFight": false,
    "tags": [
      "cursed",
      "paperwork"
    ]
  },
  {
    "id": "monster.internal-memo",
    "label": "📑 Внутрішня службова кінця світу",
    "role": "controller",
    "targetScopes": [
      "all-enemies"
    ],
    "cooldownOwnActions": 4,
    "powerBand": "strong",
    "parameters": {
      "outgoingDamageMultiplier": 0.85,
      "accuracyPenaltyPp": 10,
      "durationTargetActivations": 2
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "paperwork",
      "cursed"
    ]
  },
  {
    "id": "monster.soft-collapse",
    "label": "🫥 М’який обвал",
    "role": "defender",
    "targetScopes": [
      "self",
      "all-enemies"
    ],
    "cooldownOwnActions": 4,
    "powerBand": "strong",
    "parameters": {
      "shieldMaxHpFraction": 0.2,
      "damageMultiplierWhenShieldBreaks": 0.4
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "soft",
      "cursed"
    ]
  },
  {
    "id": "monster.common-heavy-charge",
    "label": "💥 Важкий наскок",
    "role": "striker",
    "targetScopes": [
      "single-enemy"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "strong",
    "parameters": {
      "damageMultiplier": 1.3
    },
    "telegraphOneEnemyAction": true,
    "oncePerFight": false,
    "tags": [
      "beast",
      "giant",
      "brute"
    ]
  },
  {
    "id": "monster.common-evasive-step",
    "label": "💨 Непевний крок",
    "role": "skirmisher",
    "targetScopes": [
      "self"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "standard",
    "parameters": {
      "evasionBonusPp": 22,
      "damageReduction": 0.15,
      "durationOwnActivations": 2
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "mobility",
      "air",
      "trickster"
    ]
  },
  {
    "id": "monster.common-stone-guard",
    "label": "🪨 Кам’яний заслін",
    "role": "defender",
    "targetScopes": [
      "self"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "standard",
    "parameters": {
      "shieldMaxHpFraction": 0.22,
      "damageReduction": 0.15,
      "durationOwnActivations": 1
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "stone",
      "armor",
      "construct"
    ]
  },
  {
    "id": "monster.common-paper-snare",
    "label": "📄 Паперова пастка",
    "role": "controller",
    "targetScopes": [
      "single-enemy"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "standard",
    "parameters": {
      "accuracyPenaltyPp": 12,
      "evasionPenaltyPp": 12,
      "durationTargetActivations": 2
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "paper",
      "paperwork",
      "bureaucracy"
    ]
  },
  {
    "id": "monster.common-arcane-static",
    "label": "✨ Містичний розряд",
    "role": "controller",
    "targetScopes": [
      "single-enemy"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "standard",
    "parameters": {
      "damageMultiplier": 0.7,
      "abilityPotencyMultiplier": 0.85,
      "durationTargetActivations": 1
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "magic",
      "folklore",
      "mind"
    ]
  },
  {
    "id": "monster.common-biting-retort",
    "label": "🦷 Кусюча відповідь",
    "role": "striker",
    "targetScopes": [
      "single-enemy"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "standard",
    "parameters": {
      "damageMultiplier": 1.05,
      "bleedDamageMultiplier": 0.1,
      "bleedTicks": 2
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "beast",
      "humanoid",
      "reptile"
    ]
  },
  {
    "id": "monster.common-echo-wave",
    "label": "📣 Хвиля відлуння",
    "role": "artillery",
    "targetScopes": [
      "all-enemies"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "standard",
    "parameters": {
      "damageMultiplier": 0.5,
      "accuracyPenaltyPp": 8,
      "durationTargetActivations": 1
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "sound",
      "wind",
      "air"
    ]
  },
  {
    "id": "monster.common-hungry-mend",
    "label": "🍽 Поживне відновлення",
    "role": "sustain",
    "targetScopes": [
      "self"
    ],
    "cooldownOwnActions": 4,
    "powerBand": "standard",
    "parameters": {
      "selfHealMaxHpFraction": 0.09,
      "outgoingDamageMultiplier": 1.1,
      "durationOwnActivations": 1
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "food",
      "beast",
      "sustain"
    ]
  },
  {
    "id": "monster.common-forest-feint",
    "label": "🌿 Лісовий фінт",
    "role": "trickster",
    "targetScopes": [
      "self-and-single-enemy"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "standard",
    "parameters": {
      "selfEvasionBonusPp": 18,
      "repeatLastActionPenalty": 0.15,
      "durationTargetActivations": 2
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "forest",
      "folklore",
      "trickster"
    ]
  },
  {
    "id": "monster.common-muddy-grip",
    "label": "🫧 Мокра хватка",
    "role": "controller",
    "targetScopes": [
      "single-enemy"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "standard",
    "parameters": {
      "damageMultiplier": 0.5,
      "evasionPenaltyPp": 15,
      "durationTargetActivations": 2
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "water",
      "swamp",
      "cellar"
    ]
  },
  {
    "id": "monster.common-treasure-shield",
    "label": "🪙 Скарбовий заслін",
    "role": "defender",
    "targetScopes": [
      "self"
    ],
    "cooldownOwnActions": 4,
    "powerBand": "strong",
    "parameters": {
      "shieldMaxHpFraction": 0.25,
      "nextAttackBonusIfShieldSurvives": 0.15
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "gold",
      "merchant",
      "treasure"
    ]
  },
  {
    "id": "monster.common-ominous-gaze",
    "label": "👁 Недобрий погляд",
    "role": "controller",
    "targetScopes": [
      "single-enemy"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "strong",
    "parameters": {
      "accuracyPenaltyPp": 12,
      "critPenaltyPp": 10,
      "outgoingDamageMultiplier": 0.9,
      "durationTargetActivations": 2
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "gaze",
      "mind",
      "night"
    ]
  },
  {
    "id": "monster.common-group-rally",
    "label": "📯 Згуртувати своїх",
    "role": "defender",
    "targetScopes": [
      "all-allies"
    ],
    "cooldownOwnActions": 4,
    "powerBand": "strong",
    "parameters": {
      "shieldMaxHpFraction": 0.14,
      "damageReduction": 0.1,
      "durationOwnActivations": 1
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "leadership",
      "swarm",
      "royal"
    ]
  },
  {
    "id": "monster.common-cold-snap",
    "label": "❄️ Різкий холод",
    "role": "controller",
    "targetScopes": [
      "all-enemies"
    ],
    "cooldownOwnActions": 4,
    "powerBand": "strong",
    "parameters": {
      "damageMultiplier": 0.45,
      "accuracyAndEvasionPenaltyPp": 10,
      "durationTargetActivations": 2
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "ice",
      "water",
      "night"
    ]
  },
  {
    "id": "monster.common-fire-burst",
    "label": "🔥 Спалах",
    "role": "artillery",
    "targetScopes": [
      "all-enemies"
    ],
    "cooldownOwnActions": 4,
    "powerBand": "strong",
    "parameters": {
      "damageMultiplier": 0.65,
      "burnDamageMultiplier": 0.1,
      "burnTicks": 2
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "fire",
      "dragon",
      "heat"
    ]
  },
  {
    "id": "monster.common-rule-lock",
    "label": "📎 Тимчасова заборона",
    "role": "controller",
    "targetScopes": [
      "single-enemy"
    ],
    "cooldownOwnActions": 4,
    "powerBand": "strong",
    "parameters": {
      "lockAnyOneAbility": true,
      "durationTargetActivations": 1,
      "bossFallbackAbilityPotencyMultiplier": 0.85
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "rules",
      "bureaucracy",
      "gatekeeper"
    ]
  },
  {
    "id": "monster.common-swarm-overrun",
    "label": "🐾 Навала дрібноти",
    "role": "artillery",
    "targetScopes": [
      "all-enemies"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "standard",
    "parameters": {
      "damageMultiplier": 0.55,
      "selfEvasionBonusPp": 12,
      "durationOwnActivations": 1
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "swarm",
      "insect",
      "household"
    ]
  },
  {
    "id": "monster.common-armor-break",
    "label": "🔨 Розхитати захист",
    "role": "setup",
    "targetScopes": [
      "single-enemy"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "strong",
    "parameters": {
      "markIncomingDamageMultiplier": 1.18,
      "charges": 2,
      "durationTargetActivations": 2
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "siege",
      "audit",
      "brute"
    ]
  },
  {
    "id": "monster.common-mana-leak",
    "label": "💧 Витік мани",
    "role": "controller",
    "targetScopes": [
      "single-enemy"
    ],
    "cooldownOwnActions": 4,
    "powerBand": "strong",
    "parameters": {
      "manaDrain": 2,
      "manaCostIncrease": 1,
      "durationTargetActivations": 2
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "magic",
      "water",
      "gold"
    ]
  },
  {
    "id": "monster.pass-the-blame-lid",
    "label": "🥘 Кришка крайнього",
    "role": "defender",
    "targetScopes": [
      "self"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "standard",
    "parameters": {
      "shieldMaxHpFraction": 0.22,
      "reflectFlatDamage": 1
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "kitchen",
      "armor",
      "blame"
    ]
  },
  {
    "id": "monster.bypass-sheet-loop",
    "label": "🦊 Обхідний лист навколо вас",
    "role": "trickster",
    "targetScopes": [
      "single-enemy"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "standard",
    "parameters": {
      "accuracyPenaltyPp": 15,
      "fleeChancePenaltyPp": 10,
      "durationTargetActivations": 2
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "paperwork",
      "forest",
      "trickster"
    ]
  },
  {
    "id": "monster.fermentation-rise",
    "label": "🫧 Підйом закваски",
    "role": "sustain",
    "targetScopes": [
      "self"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "standard",
    "parameters": {
      "selfHealMaxHpFraction": 0.08,
      "shieldMaxHpFraction": 0.18
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "food",
      "fermentation",
      "construct"
    ]
  },
  {
    "id": "monster.quorum-croak",
    "label": "🐸 Кворумне кумкання",
    "role": "controller",
    "targetScopes": [
      "all-enemies"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "standard",
    "parameters": {
      "accuracyPenaltyPp": 12,
      "abilityPotencyMultiplier": 0.9,
      "durationTargetActivations": 1
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "water",
      "bureaucracy",
      "sound"
    ]
  },
  {
    "id": "monster.emergency-dance",
    "label": "🌲 Евакуаційний танець",
    "role": "skirmisher",
    "targetScopes": [
      "self",
      "all-enemies"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "standard",
    "parameters": {
      "damageMultiplier": 0.4,
      "selfEvasionBonusPp": 20,
      "durationOwnActivations": 2
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "forest",
      "wind",
      "dance"
    ]
  },
  {
    "id": "monster.bulk-misfortune",
    "label": "🧾 Гуртова невдача",
    "role": "controller",
    "targetScopes": [
      "all-enemies"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "standard",
    "parameters": {
      "outgoingDamageMultiplier": 0.88,
      "manaDrain": 1,
      "durationTargetActivations": 1
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "swarm",
      "greedy",
      "household"
    ]
  },
  {
    "id": "monster.fourth-grind-rumor",
    "label": "🌀 Четвертий помел чуток",
    "role": "controller",
    "targetScopes": [
      "all-enemies"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "standard",
    "parameters": {
      "repeatLastActionPenalty": 0.2,
      "accuracyPenaltyPp": 8,
      "durationTargetActivations": 2
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "rumor",
      "sound",
      "wind"
    ]
  },
  {
    "id": "monster.hoof-tow-away",
    "label": "🐗 Евакуація копитом",
    "role": "striker",
    "targetScopes": [
      "single-enemy"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "strong",
    "parameters": {
      "damageMultiplier": 1.35
    },
    "telegraphOneEnemyAction": true,
    "oncePerFight": false,
    "tags": [
      "beast",
      "road",
      "armor"
    ]
  },
  {
    "id": "monster.three-right-turns",
    "label": "🧭 Три правильні повороти",
    "role": "trickster",
    "targetScopes": [
      "all-enemies"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "strong",
    "parameters": {
      "groupTargetConfusion": true,
      "fleeChancePenaltyPp": 15,
      "durationTargetActivations": 2
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "map",
      "forest",
      "trickster"
    ]
  },
  {
    "id": "monster.wet-ember",
    "label": "🔥 Мокра жарина",
    "role": "controller",
    "targetScopes": [
      "single-enemy"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "standard",
    "parameters": {
      "damageMultiplier": 0.75,
      "riderByTurnParity": [
        "minor-burn",
        "minor-chill"
      ],
      "durationTargetActivations": 2
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "fire",
      "water",
      "temperature"
    ]
  },
  {
    "id": "monster.master-key-theft",
    "label": "🔑 Позичити майстер-ключ",
    "role": "controller",
    "targetScopes": [
      "single-enemy"
    ],
    "cooldownOwnActions": 4,
    "powerBand": "strong",
    "parameters": {
      "lockAnyOneAbility": true,
      "removePositiveEffects": 1,
      "durationTargetActivations": 1
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": true,
    "tags": [
      "key",
      "archive",
      "mobility"
    ]
  },
  {
    "id": "monster.hr-bite-interview",
    "label": "🦷 Співбесіда на зуб",
    "role": "striker",
    "targetScopes": [
      "single-enemy"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "strong",
    "parameters": {
      "damageMultiplier": 1.1,
      "markIncomingDamageMultiplier": 1.15,
      "durationTargetActivations": 2
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "humanoid",
      "beast",
      "bureaucracy"
    ]
  },
  {
    "id": "monster.licensed-theft",
    "label": "✨ Ліцензована крадіжка блиску",
    "role": "trickster",
    "targetScopes": [
      "single-enemy-and-self"
    ],
    "cooldownOwnActions": 4,
    "powerBand": "strong",
    "parameters": {
      "removePositiveEffects": 1,
      "shieldMaxHpFraction": 0.15
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "gold",
      "air",
      "trickster"
    ]
  },
  {
    "id": "monster.dietary-gaze",
    "label": "🌭 Дієтичний погляд",
    "role": "controller",
    "targetScopes": [
      "single-enemy"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "strong",
    "parameters": {
      "critPenaltyPp": 15,
      "accuracyPenaltyPp": 10,
      "outgoingDamageMultiplier": 0.9,
      "durationTargetActivations": 2
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "food",
      "reptile",
      "gaze"
    ]
  },
  {
    "id": "monster.dry-water-fee",
    "label": "🚱 Плата за відсутню воду",
    "role": "controller",
    "targetScopes": [
      "single-enemy"
    ],
    "cooldownOwnActions": 4,
    "powerBand": "strong",
    "parameters": {
      "manaDrain": 2,
      "manaCostIncrease": 1,
      "durationTargetActivations": 2
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "water",
      "merchant",
      "bureaucracy"
    ]
  },
  {
    "id": "monster.curfew-roar",
    "label": "🦁 Рев після відбою",
    "role": "artillery",
    "targetScopes": [
      "all-enemies"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "strong",
    "parameters": {
      "damageMultiplier": 0.55,
      "accuracyPenaltyPp": 12,
      "critPenaltyPp": 8,
      "durationTargetActivations": 1
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "fire",
      "gatekeeper",
      "night"
    ]
  },
  {
    "id": "monster.return-to-first-instance",
    "label": "🦆 Повернути на першу інстанцію",
    "role": "controller",
    "targetScopes": [
      "single-enemy"
    ],
    "cooldownOwnActions": 4,
    "powerBand": "strong",
    "parameters": {
      "extendLongestCooldownBy": 1,
      "reapplyLastExpiredNegativeEffect": true
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": true,
    "tags": [
      "bureaucracy",
      "water",
      "argument"
    ]
  },
  {
    "id": "monster.promo-fine-print-flare",
    "label": "🔥 Акційний дрібний шрифт",
    "role": "trickster",
    "targetScopes": [
      "single-enemy"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "strong",
    "parameters": {
      "damageMultiplier": 0.65,
      "burnDamageMultiplier": 0.15,
      "burnTicks": 2,
      "repeatLastActionPenalty": 0.15
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "fire",
      "social",
      "trickster"
    ]
  },
  {
    "id": "monster.pipe-blockade",
    "label": "🐟 Законне перекриття труби",
    "role": "defender",
    "targetScopes": [
      "self"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "strong",
    "parameters": {
      "shieldMaxHpFraction": 0.25,
      "slowAttackerPp": 10,
      "durationOwnActivations": 2
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "stone",
      "water",
      "cellar"
    ]
  },
  {
    "id": "monster.final-approval-caw",
    "label": "🐦 Остаточне «кар»",
    "role": "controller",
    "targetScopes": [
      "single-enemy"
    ],
    "cooldownOwnActions": 4,
    "powerBand": "strong",
    "parameters": {
      "lockAnyOneAbility": true,
      "outgoingDamageMultiplier": 0.85,
      "durationTargetActivations": 1
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "bureaucracy",
      "air",
      "mind"
    ]
  },
  {
    "id": "monster.unverified-reputation",
    "label": "🐈 Неперевірена репутація",
    "role": "trickster",
    "targetScopes": [
      "self"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "strong",
    "parameters": {
      "predictRepeatedLastAction": true,
      "evasionBonusPp": 25,
      "counterChance": 0.3
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "folklore",
      "diplomacy",
      "trickster"
    ]
  },
  {
    "id": "monster.horn-signed-contract",
    "label": "😈 Договір, підписаний рогом",
    "role": "setup",
    "targetScopes": [
      "single-enemy"
    ],
    "cooldownOwnActions": 4,
    "powerBand": "strong",
    "parameters": {
      "markIncomingDamageMultiplier": 1.2,
      "manaCostIncrease": 1,
      "durationTargetActivations": 2
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "demon",
      "merchant",
      "fire"
    ]
  },
  {
    "id": "monster.budget-saw",
    "label": "🪚 Розпиляти кошторис",
    "role": "artillery",
    "targetScopes": [
      "all-enemies"
    ],
    "cooldownOwnActions": 4,
    "powerBand": "strong",
    "parameters": {
      "damageMultiplier": 0.65,
      "bleedDamageMultiplier": 0.1,
      "bleedTicks": 2
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "water",
      "audit",
      "knife"
    ]
  },
  {
    "id": "monster.copper-coil-draft",
    "label": "🐍 Мідний протяг",
    "role": "skirmisher",
    "targetScopes": [
      "single-enemy-and-self"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "strong",
    "parameters": {
      "damageMultiplier": 0.75,
      "selfEvasionBonusPp": 20,
      "durationOwnActivations": 2
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "metal",
      "gold",
      "air"
    ]
  },
  {
    "id": "monster.black-day-reserve",
    "label": "🥔 Резерв на чорний день",
    "role": "sustain",
    "targetScopes": [
      "self"
    ],
    "cooldownOwnActions": 5,
    "powerBand": "strong",
    "parameters": {
      "selfHealMaxHpFraction": 0.15,
      "shieldMaxHpFraction": 0.2
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": true,
    "tags": [
      "plant",
      "food",
      "warehouse"
    ]
  },
  {
    "id": "monster.horn-accounting",
    "label": "🐂 Рогова звірка",
    "role": "striker",
    "targetScopes": [
      "single-enemy"
    ],
    "cooldownOwnActions": 4,
    "powerBand": "strong",
    "parameters": {
      "damageMultiplier": 1.4,
      "markIncomingDamageMultiplier": 1.15,
      "durationTargetActivations": 2
    },
    "telegraphOneEnemyAction": true,
    "oncePerFight": false,
    "tags": [
      "beast",
      "forest",
      "audit"
    ]
  },
  {
    "id": "monster.shortcut-with-interview",
    "label": "🌲 Коротка стежка через співбесіду",
    "role": "trickster",
    "targetScopes": [
      "all-enemies"
    ],
    "cooldownOwnActions": 4,
    "powerBand": "strong",
    "parameters": {
      "groupTargetConfusion": true,
      "accuracyPenaltyPp": 15,
      "durationTargetActivations": 2
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "forest",
      "map",
      "gatekeeper"
    ]
  },
  {
    "id": "monster.armored-filling",
    "label": "🥟 Броньована начинка",
    "role": "defender",
    "targetScopes": [
      "self"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "strong",
    "parameters": {
      "shieldMaxHpFraction": 0.12,
      "counterChance": 0.08
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "food",
      "construct",
      "armor"
    ]
  },
  {
    "id": "monster.wrong-address-delivery",
    "label": "📦 Доставка не за адресою",
    "role": "artillery",
    "targetScopes": [
      "all-enemies"
    ],
    "cooldownOwnActions": 4,
    "powerBand": "strong",
    "parameters": {
      "damageMultiplier": 0.65,
      "accuracyPenaltyPp": 5,
      "burnDamageMultiplier": 0.08,
      "burnTicks": 2
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "dragon",
      "fire",
      "delivery"
    ]
  },
  {
    "id": "monster.balance-the-tide",
    "label": "🌊 Звести приплив із відпливом",
    "role": "sustain",
    "targetScopes": [
      "single-enemy-and-self"
    ],
    "cooldownOwnActions": 4,
    "powerBand": "strong",
    "parameters": {
      "damageMultiplier": 0.55,
      "manaDrain": 1,
      "selfHealMaxHpFraction": 0.07
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "water",
      "bureaucracy",
      "time"
    ]
  },
  {
    "id": "monster.pea-scope-creep",
    "label": "🫛 Розширення технічного завдання",
    "role": "sustain",
    "targetScopes": [
      "self"
    ],
    "cooldownOwnActions": 4,
    "powerBand": "strong",
    "parameters": {
      "outgoingDamageMultiplier": 1.15,
      "selfHealMaxHpFraction": 0.05,
      "durationOwnActivations": 3
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "giant",
      "plant",
      "bureaucracy"
    ]
  },
  {
    "id": "monster.reactivate-archive",
    "label": "🐉 Активувати архів вогнем",
    "role": "artillery",
    "targetScopes": [
      "all-enemies"
    ],
    "cooldownOwnActions": 5,
    "powerBand": "strong",
    "parameters": {
      "damageMultiplier": 0.7,
      "reapplyLastExpiredNegativeEffect": true
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": true,
    "tags": [
      "dragon",
      "archive",
      "fire"
    ]
  },
  {
    "id": "monster.seven-drafts-dance",
    "label": "💨 Танок семи протягів",
    "role": "skirmisher",
    "targetScopes": [
      "self",
      "all-enemies"
    ],
    "cooldownOwnActions": 4,
    "powerBand": "strong",
    "parameters": {
      "damageMultiplier": 0.55,
      "selfEvasionBonusPp": 25,
      "durationOwnActivations": 2
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "forest",
      "wind",
      "dance"
    ]
  },
  {
    "id": "monster.strategic-puree",
    "label": "🎃 Стратегічне пюре",
    "role": "sustain",
    "targetScopes": [
      "self"
    ],
    "cooldownOwnActions": 4,
    "powerBand": "strong",
    "parameters": {
      "shieldMaxHpFraction": 0.25,
      "damageMultiplierWhenShieldBreaks": 0.45,
      "selfHealMaxHpFraction": 0.05
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "plant",
      "armor",
      "leadership"
    ]
  },
  {
    "id": "monster.duplicate-demand",
    "label": "👻 Вимога другого примірника",
    "role": "trickster",
    "targetScopes": [
      "single-enemy"
    ],
    "cooldownOwnActions": 4,
    "powerBand": "strong",
    "parameters": {
      "copyLastDirectActionPotency": 0.65,
      "repeatLastActionPenalty": 0.15
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": true,
    "tags": [
      "ghost",
      "paperwork",
      "duplicate"
    ]
  },
  {
    "id": "monster.agenda-forty-two",
    "label": "👁 Порядок денний на 42 пункти",
    "role": "controller",
    "targetScopes": [
      "all-enemies"
    ],
    "cooldownOwnActions": 5,
    "powerBand": "ultimate",
    "parameters": {
      "accuracyAndEvasionPenaltyPp": 15,
      "durationTargetActivations": 2
    },
    "telegraphOneEnemyAction": true,
    "oncePerFight": false,
    "tags": [
      "gaze",
      "mind",
      "bureaucracy"
    ]
  },
  {
    "id": "monster.approved-dam",
    "label": "🦫 Погоджена дамба",
    "role": "defender",
    "targetScopes": [
      "all-allies"
    ],
    "cooldownOwnActions": 4,
    "powerBand": "strong",
    "parameters": {
      "shieldMaxHpFraction": 0.18,
      "damageReduction": 0.15,
      "durationOwnActivations": 1
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "water",
      "construct",
      "bureaucracy"
    ]
  },
  {
    "id": "monster.liquidity-drain",
    "label": "🧛 Висмоктати ліквідність",
    "role": "sustain",
    "targetScopes": [
      "single-enemy-and-self"
    ],
    "cooldownOwnActions": 4,
    "powerBand": "strong",
    "parameters": {
      "damageMultiplier": 0.9,
      "manaDrain": 2,
      "selfHealMaxHpFraction": 0.1
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "undead",
      "gold",
      "merchant"
    ]
  },
  {
    "id": "monster.vacation-without-return-date",
    "label": "🌿 Відпустка без дати повернення",
    "role": "trickster",
    "targetScopes": [
      "single-enemy"
    ],
    "cooldownOwnActions": 4,
    "powerBand": "strong",
    "parameters": {
      "fleeChancePenaltyPp": 25,
      "groupTargetConfusion": true,
      "durationTargetActivations": 2
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "folklore",
      "forest",
      "social"
    ]
  },
  {
    "id": "monster.third-reheat-resurrection",
    "label": "🔥 Третій підігрів",
    "role": "sustain",
    "targetScopes": [
      "self"
    ],
    "cooldownOwnActions": 5,
    "powerBand": "ultimate",
    "parameters": {
      "selfHealMaxHpFraction": 0.18,
      "cleanseNegativeEffects": 1
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": true,
    "tags": [
      "food",
      "fire",
      "bird"
    ]
  },
  {
    "id": "monster.no-vacancy-nightmare",
    "label": "🌙 Усі місця зайняті",
    "role": "controller",
    "targetScopes": [
      "all-enemies"
    ],
    "cooldownOwnActions": 5,
    "powerBand": "ultimate",
    "parameters": {
      "manaCostIncrease": 1,
      "extendLongestCooldownBy": 1,
      "durationTargetActivations": 2
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": true,
    "tags": [
      "cursed",
      "night",
      "mind"
    ]
  },
  {
    "id": "monster.classified-rustle",
    "label": "🌾 Засекречений шурхіт",
    "role": "defender",
    "targetScopes": [
      "all-allies"
    ],
    "cooldownOwnActions": 4,
    "powerBand": "strong",
    "parameters": {
      "evasionBonusPp": 20,
      "damageReduction": 0.15,
      "durationOwnActivations": 2
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "plant",
      "water",
      "royal"
    ]
  },
  {
    "id": "monster.false-note-treasure-guard",
    "label": "🎶 Фальшива нота охорони",
    "role": "defender",
    "targetScopes": [
      "self",
      "all-enemies"
    ],
    "cooldownOwnActions": 4,
    "powerBand": "strong",
    "parameters": {
      "damageMultiplier": 0.6,
      "accuracyPenaltyPp": 10,
      "shieldMaxHpFraction": 0.15
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "air",
      "sound",
      "treasure"
    ]
  },
  {
    "id": "monster.timesheet-maul",
    "label": "🐺 Табель нічної зміни",
    "role": "striker",
    "targetScopes": [
      "single-enemy"
    ],
    "cooldownOwnActions": 4,
    "powerBand": "strong",
    "parameters": {
      "damageMultiplier": 1.2,
      "bleedDamageMultiplier": 0.15,
      "bleedTicks": 2,
      "bonusDamageMultiplierBelowHalfHp": 0.25
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "cursed",
      "beast",
      "night"
    ]
  },
  {
    "id": "monster.mountain-on-installments",
    "label": "⛰ Гора в розстрочку",
    "role": "setup",
    "targetScopes": [
      "single-enemy",
      "self"
    ],
    "cooldownOwnActions": 4,
    "powerBand": "strong",
    "parameters": {
      "markIncomingDamageMultiplier": 1.15,
      "outgoingDamageMultiplier": 1.1,
      "durationTargetActivations": 3,
      "durationOwnActivations": 2
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "demon",
      "stone",
      "gold"
    ]
  },
  {
    "id": "monster.customs-scale-count",
    "label": "🐟 Декларація на кожну луску",
    "role": "controller",
    "targetScopes": [
      "single-enemy"
    ],
    "cooldownOwnActions": 4,
    "powerBand": "strong",
    "parameters": {
      "removePositiveEffects": 1,
      "manaDrain": 2
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "water",
      "bureaucracy",
      "merchant"
    ]
  },
  {
    "id": "monster.return-to-staff",
    "label": "🪦 Повернути в штат",
    "role": "sustain",
    "targetScopes": [
      "lowest-hp-ally"
    ],
    "cooldownOwnActions": 5,
    "powerBand": "ultimate",
    "parameters": {
      "healTargetMaxHpFraction": 0.16,
      "cleanseNegativeEffects": 1,
      "soloFallbackShieldMaxHpFraction": 0.18
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "unquiet",
      "magic",
      "bureaucracy"
    ]
  },
  {
    "id": "monster.documented-cold-storage",
    "label": "🦣 Холод за документами",
    "role": "controller",
    "targetScopes": [
      "all-enemies"
    ],
    "cooldownOwnActions": 4,
    "powerBand": "strong",
    "parameters": {
      "damageMultiplier": 0.45,
      "accuracyAndEvasionPenaltyPp": 12,
      "durationTargetActivations": 2
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "ice",
      "warehouse",
      "armor"
    ]
  },
  {
    "id": "monster.excise-sting",
    "label": "🐝 Акцизне жало",
    "role": "skirmisher",
    "targetScopes": [
      "single-enemy"
    ],
    "cooldownOwnActions": 3,
    "powerBand": "strong",
    "parameters": {
      "damageMultiplier": 0.95,
      "markIncomingDamageMultiplier": 1.15,
      "manaDrain": 1,
      "durationTargetActivations": 2
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "insect",
      "gold",
      "food"
    ]
  },
  {
    "id": "monster.noon-overtime",
    "label": "☀️ Понаднормове полудне",
    "role": "artillery",
    "targetScopes": [
      "all-enemies"
    ],
    "cooldownOwnActions": 5,
    "powerBand": "ultimate",
    "parameters": {
      "damageMultiplier": 0.95,
      "burnDamageMultiplier": 0.12,
      "burnTicks": 2
    },
    "telegraphOneEnemyAction": true,
    "oncePerFight": false,
    "tags": [
      "ghost",
      "folklore",
      "heat"
    ]
  },
  {
    "id": "monster.spoon-conscription",
    "label": "🥄 Мобілізація ложок",
    "role": "artillery",
    "targetScopes": [
      "all-enemies"
    ],
    "cooldownOwnActions": 4,
    "powerBand": "strong",
    "parameters": {
      "damageMultiplier": 0.7,
      "selfEvasionBonusPp": 15,
      "durationOwnActivations": 1
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "construct",
      "household",
      "swarm"
    ]
  },
  {
    "id": "monster.fire-safety-cycle",
    "label": "🐲 Вогонь, гасіння, акт",
    "role": "trickster",
    "targetScopes": [
      "all-enemies",
      "self"
    ],
    "cooldownOwnActions": 4,
    "powerBand": "ultimate",
    "parameters": {
      "riderByTurnCycle": [
        "fire-damage",
        "self-shield",
        "enemy-potency-down"
      ],
      "damageMultiplier": 0.75,
      "shieldMaxHpFraction": 0.18,
      "durationTargetActivations": 1
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "dragon",
      "fire",
      "water",
      "bureaucracy"
    ]
  },
  {
    "id": "monster.posthumous-audit",
    "label": "⚰️ Посмертна ревізія",
    "role": "controller",
    "targetScopes": [
      "single-enemy"
    ],
    "cooldownOwnActions": 5,
    "powerBand": "ultimate",
    "parameters": {
      "removePositiveEffects": 1,
      "reapplyLastExpiredNegativeEffect": true
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": true,
    "tags": [
      "undead",
      "audit",
      "paperwork"
    ]
  },
  {
    "id": "monster.acceptance-whale-dive",
    "label": "🐋 Занурення в акт приймання",
    "role": "artillery",
    "targetScopes": [
      "all-enemies",
      "self"
    ],
    "cooldownOwnActions": 5,
    "powerBand": "ultimate",
    "parameters": {
      "damageMultiplier": 0.9,
      "selfDamageReduction": 0.3,
      "durationOwnActivations": 1
    },
    "telegraphOneEnemyAction": true,
    "oncePerFight": false,
    "tags": [
      "water",
      "underground",
      "bureaucracy"
    ]
  },
  {
    "id": "monster.collateral-sit",
    "label": "🐻 Сісти на забезпечення",
    "role": "defender",
    "targetScopes": [
      "self-and-single-enemy"
    ],
    "cooldownOwnActions": 4,
    "powerBand": "strong",
    "parameters": {
      "shieldMaxHpFraction": 0.28,
      "markIncomingDamageMultiplier": 1.15,
      "durationTargetActivations": 2
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "beast",
      "gold",
      "armor"
    ]
  },
  {
    "id": "monster.doorless-invitation",
    "label": "🕯 Запрошення без дверей",
    "role": "trickster",
    "targetScopes": [
      "all-enemies"
    ],
    "cooldownOwnActions": 4,
    "powerBand": "strong",
    "parameters": {
      "groupTargetConfusion": true,
      "accuracyPenaltyPp": 15,
      "durationTargetActivations": 2
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "ghost",
      "household",
      "night"
    ]
  },
  {
    "id": "monster.spoon-sized-levy",
    "label": "🍯 Збір ложкою-човном",
    "role": "sustain",
    "targetScopes": [
      "all-enemies",
      "self"
    ],
    "cooldownOwnActions": 5,
    "powerBand": "ultimate",
    "parameters": {
      "damageMultiplier": 0.7,
      "selfHealMaxHpFraction": 0.1
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "food",
      "gold",
      "water"
    ]
  },
  {
    "id": "monster.heavy-note",
    "label": "🎵 Важка нота",
    "role": "artillery",
    "targetScopes": [
      "all-enemies"
    ],
    "cooldownOwnActions": 5,
    "powerBand": "ultimate",
    "parameters": {
      "damageMultiplier": 0.9,
      "accuracyPenaltyPp": 10,
      "durationTargetActivations": 1
    },
    "telegraphOneEnemyAction": true,
    "oncePerFight": false,
    "tags": [
      "stone",
      "sound",
      "air"
    ]
  },
  {
    "id": "monster.write-off-and-summon",
    "label": "📕 Списати й викликати назад",
    "role": "controller",
    "targetScopes": [
      "single-enemy"
    ],
    "cooldownOwnActions": 5,
    "powerBand": "ultimate",
    "parameters": {
      "removePositiveEffects": 2,
      "reapplyLastExpiredNegativeEffect": true
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": true,
    "tags": [
      "cursed",
      "magic",
      "paperwork"
    ]
  },
  {
    "id": "monster.constellation-charge",
    "label": "🌠 Таран за сузір’ям",
    "role": "skirmisher",
    "targetScopes": [
      "single-enemy",
      "self"
    ],
    "cooldownOwnActions": 4,
    "powerBand": "ultimate",
    "parameters": {
      "damageMultiplier": 1.45,
      "selfEvasionBonusPp": 25,
      "durationOwnActivations": 2
    },
    "telegraphOneEnemyAction": true,
    "oncePerFight": false,
    "tags": [
      "beast",
      "sky",
      "map"
    ]
  },
  {
    "id": "monster.last-place-in-queue",
    "label": "👑 Останнє місце в черзі",
    "role": "defender",
    "targetScopes": [
      "self-and-single-enemy"
    ],
    "cooldownOwnActions": 5,
    "powerBand": "ultimate",
    "parameters": {
      "shieldMaxHpFraction": 0.3,
      "lockAnyOneAbility": true,
      "durationTargetActivations": 1
    },
    "telegraphOneEnemyAction": false,
    "oncePerFight": false,
    "tags": [
      "dragon",
      "gatekeeper",
      "royal"
    ]
  },
  {
    "id": "monster.century-overdue-request",
    "label": "🩸 Довідка за минуле сторіччя",
    "role": "artillery",
    "targetScopes": [
      "all-enemies"
    ],
    "cooldownOwnActions": 5,
    "powerBand": "ultimate",
    "parameters": {
      "damageMultiplier": 1.1,
      "extendLongestCooldownBy": 1,
      "accuracyPenaltyPp": 10,
      "durationTargetActivations": 2
    },
    "telegraphOneEnemyAction": true,
    "oncePerFight": false,
    "tags": [
      "undead",
      "archive",
      "bureaucracy"
    ]
  }
] as const satisfies readonly MonsterAbilityDefinition[];

export const monsterAbilityCount = 132 as const;

export const monsterAbilityById: ReadonlyMap<string, MonsterAbilityDefinition> = new Map(
  monsterAbilities.map((ability) => [ability.id, ability])
);

export function findMonsterAbility(abilityId: string): MonsterAbilityDefinition | null {
  return monsterAbilityById.get(abilityId) ?? null;
}
