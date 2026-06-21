export const MONSTER_CONTEXT_RULES_VERSION = "monster-context-v1";

export type MonsterContextTraitId =
  | "context.cold-start"
  | "context.crowd-performer"
  | "context.dusk-rumor"
  | "context.home-ground"
  | "context.meal-rush"
  | "context.month-end-panic"
  | "context.night-shift"
  | "context.office-hours"
  | "context.seasonal-body"
  | "context.strange-number-day"
  | "context.sun-fed"
  | "context.weekend-market";

export type MonsterContextBranchTone =
  | "advantage"
  | "disadvantage"
  | "behavior-shift"
  | "shape-shift"
  | "novelty-advantage";

export interface MonsterContextEffects {
  outgoingDamageMultiplier?: number;
  incomingDamageMultiplier?: number;
  accuracyDeltaPp?: number;
  evasionDeltaPp?: number;
  abilityWeightDelta?: number;
  signatureCooldownDelta?: number;
  flatArmorDelta?: number;
  flatResistDelta?: number;
  flatDexterityDelta?: number;
}

export interface MonsterContextWhen {
  dayPhase?: Array<"morning" | "day" | "evening" | "night">;
  weekKind?: Array<"weekday" | "weekend">;
  mealWindow?: Array<"lunch" | "dinner" | "none">;
  monthEdge?: Array<"first-three-days" | "last-three-days" | "middle">;
  calendarDay?: number[];
  season?: Array<"winter" | "spring" | "summer" | "autumn">;
  partySizeBand?: Array<"solo" | "duo" | "group">;
}

export interface MonsterContextBranch {
  id: string;
  tone: MonsterContextBranchTone;
  when?: MonsterContextWhen;
  whenAny?: MonsterContextWhen[];
  whenProfileSeasonMatches?: true;
  whenProfileOppositeSeasonMatches?: true;
  whenProfileLocationMatches?: true;
  whenLocationKnownAndNoProfileMatch?: true;
  effects: MonsterContextEffects;
  cue: string;
}

export interface MonsterContextTrait {
  id: MonsterContextTraitId;
  branches: MonsterContextBranch[];
}

export interface MonsterContextProfile {
  monsterId: string;
  contextTraitIds: readonly MonsterContextTraitId[];
  mechanicalScale: 0 | 0.5 | 0.75 | 1;
  contextConfig?: {
    favoredSeason?: "winter" | "spring" | "summer" | "autumn";
    oppositeSeason?: "winter" | "spring" | "summer" | "autumn";
    strangeCalendarDays?: readonly number[];
    preferredLocationTags?: readonly string[];
  };
}

export const monsterContextTraits = [
  {
    id: "context.cold-start",
    branches: [
      {
        id: "cold-shell",
        tone: "shape-shift",
        whenAny: [{ season: ["winter"] }, { dayPhase: ["morning"] }],
        effects: { flatArmorDelta: 1, flatResistDelta: 1, flatDexterityDelta: -1 },
        cue: "Холодний запуск: корпус міцніший, зате рухається з переконливим скрипом."
      },
      {
        id: "warm-gears",
        tone: "shape-shift",
        when: { season: ["summer"], dayPhase: ["day"] },
        effects: { flatArmorDelta: -1, flatDexterityDelta: 1, evasionDeltaPp: 2 },
        cue: "Тепло розігнало шарніри: монстр рухливіший, але корпус трохи м’якший."
      }
    ]
  },
  {
    id: "context.crowd-performer",
    branches: [
      {
        id: "party-show",
        tone: "behavior-shift",
        when: { partySizeBand: ["duo", "group"] },
        effects: { abilityWeightDelta: 12 },
        cue: "Публіка більша — монстр переходить на показові трюки."
      },
      {
        id: "solo-spotlight",
        tone: "behavior-shift",
        when: { partySizeBand: ["solo"] },
        effects: { outgoingDamageMultiplier: 1.04 },
        cue: "Один герой отримує всю сценічну увагу монстра."
      }
    ]
  },
  {
    id: "context.dusk-rumor",
    branches: [
      {
        id: "evening-noise",
        tone: "advantage",
        when: { dayPhase: ["evening"] },
        effects: { abilityWeightDelta: 12, accuracyDeltaPp: 1 },
        cue: "Вечірнє відлуння підсилює кожну погрозу й кожну погану ноту."
      },
      {
        id: "quiet-morning",
        tone: "disadvantage",
        when: { dayPhase: ["morning"] },
        effects: { abilityWeightDelta: -8, accuracyDeltaPp: -2 },
        cue: "Ранок надто тихий; монстрові бракує відлуння для повної переконливости."
      }
    ]
  },
  {
    id: "context.meal-rush",
    branches: [
      {
        id: "meal-time",
        tone: "advantage",
        when: { mealWindow: ["lunch", "dinner"] },
        effects: { abilityWeightDelta: 10, incomingDamageMultiplier: 0.96 },
        cue: "Час їсти. Їстівний монстр почувається підозріло доречно."
      },
      {
        id: "empty-kitchen",
        tone: "disadvantage",
        when: { dayPhase: ["night"], mealWindow: ["none"] },
        effects: { abilityWeightDelta: -7, incomingDamageMultiplier: 1.04 },
        cue: "Кухня давно закрилась. Монстр тримається на крихтах і принципі."
      }
    ]
  },
  {
    id: "context.month-end-panic",
    branches: [
      {
        id: "month-end",
        tone: "advantage",
        when: { monthEdge: ["last-three-days"] },
        effects: { abilityWeightDelta: 18, signatureCooldownDelta: -1, accuracyDeltaPp: 2 },
        cue: "Кінець місяця. Монстр б’ється так, ніби звіт треба здати до опівночі."
      },
      {
        id: "fresh-ledger",
        tone: "disadvantage",
        when: { monthEdge: ["first-three-days"] },
        effects: { abilityWeightDelta: -8, accuracyDeltaPp: -1 },
        cue: "Новий місяць: таблиці ще чисті, паніка не встигла набрати сили."
      }
    ]
  },
  {
    id: "context.night-shift",
    branches: [
      {
        id: "night",
        tone: "advantage",
        when: { dayPhase: ["night"] },
        effects: { outgoingDamageMultiplier: 1.06, evasionDeltaPp: 3, abilityWeightDelta: 8 },
        cue: "Ніч на боці монстра: рухи тихіші, наміри помітно гірші."
      },
      {
        id: "daylight",
        tone: "disadvantage",
        when: { dayPhase: ["day"] },
        effects: { outgoingDamageMultiplier: 0.95, accuracyDeltaPp: -2, abilityWeightDelta: -6 },
        cue: "Денне світло робить монстра менш переконливим і трохи прозорішим."
      }
    ]
  },
  {
    id: "context.office-hours",
    branches: [
      {
        id: "working",
        tone: "advantage",
        when: { weekKind: ["weekday"], dayPhase: ["morning", "day"] },
        effects: { abilityWeightDelta: 12, accuracyDeltaPp: 2 },
        cue: "Робочі години: печатки гостріші, а заперечення коротші."
      },
      {
        id: "weekend",
        tone: "disadvantage",
        when: { weekKind: ["weekend"] },
        effects: { abilityWeightDelta: -10, accuracyDeltaPp: -2 },
        cue: "Вихідний. Канцелярська міць тримається на черговому й холодному чаї."
      }
    ]
  },
  {
    id: "context.seasonal-body",
    branches: [
      {
        id: "favored-season",
        tone: "advantage",
        whenProfileSeasonMatches: true,
        effects: { incomingDamageMultiplier: 0.95, abilityWeightDelta: 6 },
        cue: "Сезон сприяє монстрові: броня, листя або крига саме в належній формі."
      },
      {
        id: "opposite-season",
        tone: "disadvantage",
        whenProfileOppositeSeasonMatches: true,
        effects: { outgoingDamageMultiplier: 0.95, evasionDeltaPp: -2, abilityWeightDelta: -5 },
        cue: "Пора року не та: монстр трохи в’яне, тане або пересихає."
      }
    ]
  },
  {
    id: "context.strange-number-day",
    branches: [
      {
        id: "thirteen-or-twenty-three",
        tone: "novelty-advantage",
        when: { calendarDay: [13, 23] },
        effects: { abilityWeightDelta: 23, signatureCooldownDelta: -1 },
        cue: "Сьогодні підозріле число. Монстр сприйняв це як письмовий дозвіл на дивацтва."
      }
    ]
  },
  {
    id: "context.sun-fed",
    branches: [
      {
        id: "bright",
        tone: "advantage",
        when: { dayPhase: ["day"] },
        effects: { outgoingDamageMultiplier: 1.07, accuracyDeltaPp: 2, abilityWeightDelta: 6 },
        cue: "Денне світло роздмухує жар і самовпевненість монстра."
      },
      {
        id: "cooled",
        tone: "disadvantage",
        when: { dayPhase: ["night"] },
        effects: { outgoingDamageMultiplier: 0.94, abilityWeightDelta: -6 },
        cue: "Ніч пригасила частину жару. Характер, на жаль, лишився."
      }
    ]
  },
  {
    id: "context.weekend-market",
    branches: [
      {
        id: "busy-market",
        tone: "advantage",
        whenAny: [{ weekKind: ["weekend"] }, { dayPhase: ["evening"] }],
        effects: { abilityWeightDelta: 12, evasionDeltaPp: 3 },
        cue: "Ярмарковий час. У монстра більше клієнтів, нахабства й запасних цінників."
      },
      {
        id: "quiet-counter",
        tone: "disadvantage",
        when: { weekKind: ["weekday"], dayPhase: ["morning"] },
        effects: { abilityWeightDelta: -8, evasionDeltaPp: -2 },
        cue: "Ранній будень. Торгівля ще не прокинулась, а монстр уже мусить битися."
      }
    ]
  }
,
  {
    id: "context.home-ground",
    branches: [
      {
        id: "home",
        tone: "advantage",
        whenProfileLocationMatches: true,
        effects: { incomingDamageMultiplier: 0.94, accuracyDeltaPp: 2, flatResistDelta: 1 },
        cue: "?? ???? ?????????. ?????? ????? ??? ??????, ?? ???? ??????."
      },
      {
        id: "away",
        tone: "disadvantage",
        whenLocationKnownAndNoProfileMatch: true,
        effects: { accuracyDeltaPp: -2, flatArmorDelta: -1 },
        cue: "?????? ?? ?? ????? ????????? ? ??? ??? ???? ????? ???????? ???."
      }
    ]
  }
] satisfies MonsterContextTrait[];

export const monsterContextProfiles = [
  {
    "monsterId": "monster.mimic-shawarma",
    "contextTraitIds": [
      "context.meal-rush"
    ],
    "mechanicalScale": 0
  },
  {
    "monsterId": "monster.basement-mouse-with-title",
    "contextTraitIds": [
      "context.dusk-rumor"
    ],
    "mechanicalScale": 0.5
  },
  {
    "monsterId": "monster.stamp-doorkeeper-skeleton",
    "contextTraitIds": [
      "context.night-shift"
    ],
    "mechanicalScale": 0.5
  },
  {
    "monsterId": "monster.spreadsheet-goblin",
    "contextTraitIds": [
      "context.office-hours",
      "context.strange-number-day"
    ],
    "mechanicalScale": 0.5,
    "contextConfig": {
      "strangeCalendarDays": [
        13,
        23
      ]
    }
  },
  {
    "monsterId": "monster.deadline-spider",
    "contextTraitIds": [
      "context.month-end-panic"
    ],
    "mechanicalScale": 0.5
  },
  {
    "monsterId": "monster.preapproval-dragonling",
    "contextTraitIds": [
      "context.sun-fed"
    ],
    "mechanicalScale": 0.75
  },
  {
    "monsterId": "monster.unread-rules-ghost",
    "contextTraitIds": [
      "context.night-shift"
    ],
    "mechanicalScale": 0.5
  },
  {
    "monsterId": "monster.anxious-slippers-swarm",
    "contextTraitIds": [
      "context.crowd-performer"
    ],
    "mechanicalScale": 0.5
  },
  {
    "monsterId": "monster.borshch-slime",
    "contextTraitIds": [
      "context.meal-rush"
    ],
    "mechanicalScale": 0.5
  },
  {
    "monsterId": "monster.conditionally-sliced-loaf-bandit",
    "contextTraitIds": [
      "context.meal-rush"
    ],
    "mechanicalScale": 0.5
  },
  {
    "monsterId": "monster.queue-counter-gargoyle",
    "contextTraitIds": [
      "context.cold-start"
    ],
    "mechanicalScale": 0.75
  },
  {
    "monsterId": "monster.audit-mosquito",
    "contextTraitIds": [
      "context.weekend-market"
    ],
    "mechanicalScale": 0.5
  },
  {
    "monsterId": "monster.archival-knysh-eater",
    "contextTraitIds": [
      "context.meal-rush"
    ],
    "mechanicalScale": 0.5
  },
  {
    "monsterId": "monster.final-comment-troll",
    "contextTraitIds": [
      "context.dusk-rumor"
    ],
    "mechanicalScale": 0.75
  },
  {
    "monsterId": "monster.report-jellyfish",
    "contextTraitIds": [
      "context.office-hours"
    ],
    "mechanicalScale": 0.5
  },
  {
    "monsterId": "monster.no-change-merchantling",
    "contextTraitIds": [
      "context.weekend-market"
    ],
    "mechanicalScale": 0.5
  },
  {
    "monsterId": "monster.self-critique-mirror",
    "contextTraitIds": [
      "context.night-shift"
    ],
    "mechanicalScale": 0.75
  },
  {
    "monsterId": "monster.dry-sea-teapot",
    "contextTraitIds": [
      "context.meal-rush"
    ],
    "mechanicalScale": 0.5
  },
  {
    "monsterId": "monster.cabbage-knight-on-break",
    "contextTraitIds": [
      "context.seasonal-body"
    ],
    "mechanicalScale": 0.5,
    "contextConfig": {
      "favoredSeason": "spring",
      "oppositeSeason": "winter"
    }
  },
  {
    "monsterId": "monster.zero-declaration-tax-dragon",
    "contextTraitIds": [
      "context.weekend-market",
      "context.strange-number-day"
    ],
    "mechanicalScale": 0.75,
    "contextConfig": {
      "strangeCalendarDays": [
        13,
        23
      ]
    }
  },
  {
    "monsterId": "monster.complaint-lantern",
    "contextTraitIds": [
      "context.month-end-panic"
    ],
    "mechanicalScale": 0.75
  },
  {
    "monsterId": "monster.ledger-boar",
    "contextTraitIds": [
      "context.office-hours"
    ],
    "mechanicalScale": 0.75
  },
  {
    "monsterId": "monster.salted-oath-pretzel",
    "contextTraitIds": [
      "context.meal-rush"
    ],
    "mechanicalScale": 0.75
  },
  {
    "monsterId": "monster.unclosed-closure-act",
    "contextTraitIds": [
      "context.office-hours"
    ],
    "mechanicalScale": 0.75
  },
  {
    "monsterId": "monster.liar-corridor-map",
    "contextTraitIds": [
      "context.crowd-performer"
    ],
    "mechanicalScale": 1
  },
  {
    "monsterId": "monster.foam-auditor-boots",
    "contextTraitIds": [
      "context.office-hours"
    ],
    "mechanicalScale": 1
  },
  {
    "monsterId": "monster.three-signature-chimera",
    "contextTraitIds": [
      "context.strange-number-day",
      "context.office-hours"
    ],
    "mechanicalScale": 1,
    "contextConfig": {
      "strangeCalendarDays": [
        13,
        23
      ]
    }
  },
  {
    "monsterId": "monster.cheese-vault-warden",
    "contextTraitIds": [
      "context.meal-rush",
      "context.office-hours"
    ],
    "mechanicalScale": 1
  },
  {
    "monsterId": "monster.calendar-hydra",
    "contextTraitIds": [
      "context.month-end-panic",
      "context.office-hours"
    ],
    "mechanicalScale": 1
  },
  {
    "monsterId": "monster.inventory-prophet",
    "contextTraitIds": [
      "context.month-end-panic",
      "context.office-hours"
    ],
    "mechanicalScale": 1
  },
  {
    "monsterId": "monster.quiet-catastrophe-clerk",
    "contextTraitIds": [
      "context.month-end-panic",
      "context.office-hours"
    ],
    "mechanicalScale": 1
  },
  {
    "monsterId": "monster.collective-liability-cauldron",
    "contextTraitIds": [
      "context.meal-rush"
    ],
    "mechanicalScale": 0.75
  },
  {
    "monsterId": "monster.bypass-sheet-fox",
    "contextTraitIds": [
      "context.home-ground"
    ],
    "mechanicalScale": 0.75,
    "contextConfig": {
      "preferredLocationTags": [
        "forest"
      ]
    }
  },
  {
    "monsterId": "monster.sourdough-kvas-golem",
    "contextTraitIds": [
      "context.meal-rush"
    ],
    "mechanicalScale": 0.75
  },
  {
    "monsterId": "monster.tender-committee-frog",
    "contextTraitIds": [
      "context.home-ground"
    ],
    "mechanicalScale": 0.75,
    "contextConfig": {
      "preferredLocationTags": [
        "water"
      ]
    }
  },
  {
    "monsterId": "monster.safety-intern-chuhaister",
    "contextTraitIds": [
      "context.home-ground"
    ],
    "mechanicalScale": 0.75,
    "contextConfig": {
      "preferredLocationTags": [
        "forest"
      ]
    }
  },
  {
    "monsterId": "monster.bulk-discount-zlydni",
    "contextTraitIds": [
      "context.weekend-market"
    ],
    "mechanicalScale": 0.75
  },
  {
    "monsterId": "monster.fourth-grind-rumor-mill",
    "contextTraitIds": [
      "context.dusk-rumor"
    ],
    "mechanicalScale": 0.75
  },
  {
    "monsterId": "monster.improper-parking-boar",
    "contextTraitIds": [
      "context.home-ground"
    ],
    "mechanicalScale": 1,
    "contextConfig": {
      "preferredLocationTags": [
        "road"
      ]
    }
  },
  {
    "monsterId": "monster.three-correct-roads-blud",
    "contextTraitIds": [
      "context.home-ground"
    ],
    "mechanicalScale": 1,
    "contextConfig": {
      "preferredLocationTags": [
        "forest"
      ]
    }
  },
  {
    "monsterId": "monster.wet-coal-salamander",
    "contextTraitIds": [
      "context.seasonal-body"
    ],
    "mechanicalScale": 1,
    "contextConfig": {
      "favoredSeason": "winter",
      "oppositeSeason": "summer"
    }
  },
  {
    "monsterId": "monster.service-key-monkey",
    "contextTraitIds": [
      "context.home-ground"
    ],
    "mechanicalScale": 1,
    "contextConfig": {
      "preferredLocationTags": [
        "archive"
      ]
    }
  },
  {
    "monsterId": "monster.hr-pesyholovets",
    "contextTraitIds": [
      "context.office-hours"
    ],
    "mechanicalScale": 1
  },
  {
    "monsterId": "monster.licensed-shine-magpie",
    "contextTraitIds": [
      "context.weekend-market"
    ],
    "mechanicalScale": 1
  },
  {
    "monsterId": "monster.diet-menu-sausage-basilisk",
    "contextTraitIds": [
      "context.meal-rush"
    ],
    "mechanicalScale": 1
  },
  {
    "monsterId": "monster.dry-fountain-vodyanyk",
    "contextTraitIds": [
      "context.home-ground",
      "context.office-hours"
    ],
    "mechanicalScale": 1,
    "contextConfig": {
      "preferredLocationTags": [
        "water"
      ]
    }
  },
  {
    "monsterId": "monster.curfew-stove-lion",
    "contextTraitIds": [
      "context.night-shift",
      "context.office-hours"
    ],
    "mechanicalScale": 1
  },
  {
    "monsterId": "monster.three-instance-duck",
    "contextTraitIds": [
      "context.dusk-rumor",
      "context.office-hours"
    ],
    "mechanicalScale": 1
  },
  {
    "monsterId": "monster.promo-perelesnyk",
    "contextTraitIds": [
      "context.dusk-rumor"
    ],
    "mechanicalScale": 1
  },
  {
    "monsterId": "monster.basement-pipe-stone-catfish",
    "contextTraitIds": [
      "context.home-ground"
    ],
    "mechanicalScale": 1,
    "contextConfig": {
      "preferredLocationTags": [
        "cellar",
        "water"
      ]
    }
  },
  {
    "monsterId": "monster.final-approval-raven",
    "contextTraitIds": [
      "context.office-hours"
    ],
    "mechanicalScale": 1
  },
  {
    "monsterId": "monster.quarterly-report-pan-kotsky",
    "contextTraitIds": [
      "context.dusk-rumor"
    ],
    "mechanicalScale": 1
  },
  {
    "monsterId": "monster.small-business-didko",
    "contextTraitIds": [
      "context.weekend-market"
    ],
    "mechanicalScale": 1
  },
  {
    "monsterId": "monster.deep-estimate-sawfish",
    "contextTraitIds": [
      "context.home-ground",
      "context.office-hours"
    ],
    "mechanicalScale": 1,
    "contextConfig": {
      "preferredLocationTags": [
        "water"
      ]
    }
  },
  {
    "monsterId": "monster.treasure-ventilation-copper-snake",
    "contextTraitIds": [
      "context.weekend-market"
    ],
    "mechanicalScale": 1
  },
  {
    "monsterId": "monster.strategic-reserve-potato",
    "contextTraitIds": [
      "context.meal-rush"
    ],
    "mechanicalScale": 1
  },
  {
    "monsterId": "monster.forest-loss-aurochs",
    "contextTraitIds": [
      "context.home-ground",
      "context.office-hours"
    ],
    "mechanicalScale": 1,
    "contextConfig": {
      "preferredLocationTags": [
        "forest"
      ]
    }
  },
  {
    "monsterId": "monster.service-path-lisovyk",
    "contextTraitIds": [
      "context.home-ground",
      "context.office-hours"
    ],
    "mechanicalScale": 1,
    "contextConfig": {
      "preferredLocationTags": [
        "forest"
      ]
    }
  },
  {
    "monsterId": "monster.siege-iron-varenyk",
    "contextTraitIds": [
      "context.meal-rush"
    ],
    "mechanicalScale": 1
  },
  {
    "monsterId": "monster.thirteen-address-dragon-courier",
    "contextTraitIds": [
      "context.strange-number-day"
    ],
    "mechanicalScale": 1,
    "contextConfig": {
      "strangeCalendarDays": [
        13,
        23
      ]
    }
  },
  {
    "monsterId": "monster.tide-accountant-vodyanyk",
    "contextTraitIds": [
      "context.month-end-panic",
      "context.office-hours"
    ],
    "mechanicalScale": 1
  },
  {
    "monsterId": "monster.failed-tender-pea-giant",
    "contextTraitIds": [
      "context.seasonal-body",
      "context.office-hours"
    ],
    "mechanicalScale": 1,
    "contextConfig": {
      "favoredSeason": "spring",
      "oppositeSeason": "winter"
    }
  },
  {
    "monsterId": "monster.archive-ventilation-dragon",
    "contextTraitIds": [
      "context.home-ground"
    ],
    "mechanicalScale": 1,
    "contextConfig": {
      "preferredLocationTags": [
        "archive"
      ]
    }
  },
  {
    "monsterId": "monster.seven-draft-chuhaister",
    "contextTraitIds": [
      "context.home-ground"
    ],
    "mechanicalScale": 1,
    "contextConfig": {
      "preferredLocationTags": [
        "forest"
      ]
    }
  },
  {
    "monsterId": "monster.seasonal-defense-pumpkin-hetman",
    "contextTraitIds": [
      "context.seasonal-body"
    ],
    "mechanicalScale": 1,
    "contextConfig": {
      "favoredSeason": "autumn",
      "oppositeSeason": "spring"
    }
  },
  {
    "monsterId": "monster.second-copy-ghost",
    "contextTraitIds": [
      "context.night-shift",
      "context.office-hours"
    ],
    "mechanicalScale": 1
  },
  {
    "monsterId": "monster.six-hour-meeting-viy",
    "contextTraitIds": [
      "context.strange-number-day",
      "context.office-hours"
    ],
    "mechanicalScale": 1,
    "contextConfig": {
      "strangeCalendarDays": [
        13,
        23
      ]
    }
  },
  {
    "monsterId": "monster.state-sluice-beaver",
    "contextTraitIds": [
      "context.home-ground",
      "context.office-hours"
    ],
    "mechanicalScale": 1,
    "contextConfig": {
      "preferredLocationTags": [
        "water"
      ]
    }
  },
  {
    "monsterId": "monster.cash-gap-upyr",
    "contextTraitIds": [
      "context.night-shift"
    ],
    "mechanicalScale": 1
  },
  {
    "monsterId": "monster.late-vacation-mavka",
    "contextTraitIds": [
      "context.dusk-rumor"
    ],
    "mechanicalScale": 1
  },
  {
    "monsterId": "monster.third-reheat-kulish-phoenix",
    "contextTraitIds": [
      "context.meal-rush"
    ],
    "mechanicalScale": 1
  },
  {
    "monsterId": "monster.night-reservation-mara",
    "contextTraitIds": [
      "context.night-shift"
    ],
    "mechanicalScale": 1
  },
  {
    "monsterId": "monster.storage-silence-reed-king",
    "contextTraitIds": [
      "context.seasonal-body"
    ],
    "mechanicalScale": 1,
    "contextConfig": {
      "favoredSeason": "summer",
      "oppositeSeason": "winter"
    }
  },
  {
    "monsterId": "monster.false-note-bandura-griffin",
    "contextTraitIds": [
      "context.weekend-market"
    ],
    "mechanicalScale": 1
  },
  {
    "monsterId": "monster.last-shift-vovkulaka",
    "contextTraitIds": [
      "context.night-shift"
    ],
    "mechanicalScale": 1
  },
  {
    "monsterId": "monster.mountain-leasing-aridnyk",
    "contextTraitIds": [
      "context.weekend-market"
    ],
    "mechanicalScale": 1
  },
  {
    "monsterId": "monster.customs-three-whisker-carp",
    "contextTraitIds": [
      "context.weekend-market",
      "context.office-hours"
    ],
    "mechanicalScale": 1
  },
  {
    "monsterId": "monster.hr-intern-necromancer",
    "contextTraitIds": [
      "context.office-hours",
      "context.night-shift"
    ],
    "mechanicalScale": 1
  },
  {
    "monsterId": "monster.cold-storage-state-mammoth",
    "contextTraitIds": [
      "context.seasonal-body"
    ],
    "mechanicalScale": 1,
    "contextConfig": {
      "favoredSeason": "winter",
      "oppositeSeason": "summer"
    }
  },
  {
    "monsterId": "monster.excise-honey-giant-bee",
    "contextTraitIds": [
      "context.weekend-market"
    ],
    "mechanicalScale": 1
  },
  {
    "monsterId": "monster.overtime-heat-poludnytsia",
    "contextTraitIds": [
      "context.sun-fed"
    ],
    "mechanicalScale": 1
  },
  {
    "monsterId": "monster.spoon-mobilization-iron-raven",
    "contextTraitIds": [
      "context.cold-start"
    ],
    "mechanicalScale": 1
  },
  {
    "monsterId": "monster.fire-safety-three-headed-serpent",
    "contextTraitIds": [
      "context.office-hours",
      "context.crowd-performer"
    ],
    "mechanicalScale": 1
  },
  {
    "monsterId": "monster.last-will-dead-auditor",
    "contextTraitIds": [
      "context.night-shift",
      "context.office-hours"
    ],
    "mechanicalScale": 1
  },
  {
    "monsterId": "monster.underground-sea-acceptance-whale",
    "contextTraitIds": [
      "context.home-ground",
      "context.office-hours"
    ],
    "mechanicalScale": 1,
    "contextConfig": {
      "preferredLocationTags": [
        "water",
        "underground"
      ]
    }
  },
  {
    "monsterId": "monster.collateral-grey-bear",
    "contextTraitIds": [
      "context.weekend-market"
    ],
    "mechanicalScale": 1
  },
  {
    "monsterId": "monster.empty-chamber-lady",
    "contextTraitIds": [
      "context.night-shift"
    ],
    "mechanicalScale": 1
  },
  {
    "monsterId": "monster.fair-tax-honey-leviathan",
    "contextTraitIds": [
      "context.weekend-market"
    ],
    "mechanicalScale": 1
  },
  {
    "monsterId": "monster.siege-song-stone-skylark",
    "contextTraitIds": [
      "context.dusk-rumor"
    ],
    "mechanicalScale": 1
  },
  {
    "monsterId": "monster.written-off-assets-black-booker",
    "contextTraitIds": [
      "context.night-shift",
      "context.office-hours"
    ],
    "mechanicalScale": 1
  },
  {
    "monsterId": "monster.last-route-star-boar",
    "contextTraitIds": [
      "context.crowd-performer"
    ],
    "mechanicalScale": 1
  },
  {
    "monsterId": "monster.queue-dragon-prince",
    "contextTraitIds": [
      "context.crowd-performer",
      "context.office-hours"
    ],
    "mechanicalScale": 1
  },
  {
    "monsterId": "monster.expired-archive-upyr-king",
    "contextTraitIds": [
      "context.night-shift",
      "context.office-hours"
    ],
    "mechanicalScale": 1
  }
] satisfies MonsterContextProfile[];
