// Generated from the monster abilities proposal package, then validated by tests.
import type { MonsterAbilityDefinition } from "./monsterAbilities";

export type MonsterAiProfile = "boss" | "brute" | "controller" | "defender" | "skirmisher" | "trickster";

export interface MonsterUpgradeAbility {
  readonly abilityId: MonsterAbilityDefinition['id'];
  readonly minEffectiveLevel: number;
}

export interface MonsterCombatProfile {
  readonly monsterId: string;
  readonly name: string;
  readonly authoredLevel: number;
  readonly aiProfile: MonsterAiProfile;
  readonly abilityIds: readonly MonsterAbilityDefinition['id'][];
  readonly upgradeAbilityIds?: readonly MonsterUpgradeAbility[];
}

export const monsterCombatProfiles = [
  {
    "monsterId": "monster.mimic-shawarma",
    "name": "Мімік-шаурма",
    "authoredLevel": 1,
    "aiProfile": "trickster",
    "abilityIds": [
      "monster.sauce-spit"
    ]
  },
  {
    "monsterId": "monster.basement-mouse-with-title",
    "name": "Льохова Миша з Титулом",
    "authoredLevel": 1,
    "aiProfile": "controller",
    "abilityIds": [
      "monster.title-tax",
      "monster.royal-scurry"
    ]
  },
  {
    "monsterId": "monster.stamp-doorkeeper-skeleton",
    "name": "Скелет-вахтер печаток",
    "authoredLevel": 2,
    "aiProfile": "controller",
    "abilityIds": [
      "monster.stamp-denied"
    ]
  },
  {
    "monsterId": "monster.spreadsheet-goblin",
    "name": "Гоблін з Електронною Табличкою",
    "authoredLevel": 2,
    "aiProfile": "controller",
    "abilityIds": [
      "monster.audit-formula"
    ]
  },
  {
    "monsterId": "monster.deadline-spider",
    "name": "Павук дедлайнів",
    "authoredLevel": 2,
    "aiProfile": "controller",
    "abilityIds": [
      "monster.deadline-web"
    ]
  },
  {
    "monsterId": "monster.preapproval-dragonling",
    "name": "Дракончик попереднього погодження",
    "authoredLevel": 3,
    "aiProfile": "boss",
    "abilityIds": [
      "monster.smoke-without-approval",
      "monster.preapproved-bite"
    ]
  },
  {
    "monsterId": "monster.unread-rules-ghost",
    "name": "Привид непрочитаних правил",
    "authoredLevel": 2,
    "aiProfile": "controller",
    "abilityIds": [
      "monster.unread-clause"
    ]
  },
  {
    "monsterId": "monster.anxious-slippers-swarm",
    "name": "Зграя капців тривожної мобільности",
    "authoredLevel": 1,
    "aiProfile": "skirmisher",
    "abilityIds": [
      "monster.slipper-scatter"
    ]
  },
  {
    "monsterId": "monster.borshch-slime",
    "name": "Борщовий слизень правильної температури",
    "authoredLevel": 2,
    "aiProfile": "controller",
    "abilityIds": [
      "monster.temperature-offense"
    ]
  },
  {
    "monsterId": "monster.conditionally-sliced-loaf-bandit",
    "name": "Буханець-бандит умовної нарізки",
    "authoredLevel": 2,
    "aiProfile": "brute",
    "abilityIds": [
      "monster.conditional-knife"
    ]
  },
  {
    "monsterId": "monster.queue-counter-gargoyle",
    "name": "Ґарґулья лічильника черги",
    "authoredLevel": 3,
    "aiProfile": "defender",
    "abilityIds": [
      "monster.queue-number"
    ]
  },
  {
    "monsterId": "monster.audit-mosquito",
    "name": "Комар-ревізор дрібних витрат",
    "authoredLevel": 1,
    "aiProfile": "skirmisher",
    "abilityIds": [
      "monster.small-expense-audit"
    ]
  },
  {
    "monsterId": "monster.archival-knysh-eater",
    "name": "Архівний книшоїд",
    "authoredLevel": 2,
    "aiProfile": "trickster",
    "abilityIds": [
      "monster.archive-chew"
    ]
  },
  {
    "monsterId": "monster.final-comment-troll",
    "name": "Троль останнього коментаря",
    "authoredLevel": 3,
    "aiProfile": "controller",
    "abilityIds": [
      "monster.final-comment"
    ]
  },
  {
    "monsterId": "monster.report-jellyfish",
    "name": "Медузка звітности",
    "authoredLevel": 2,
    "aiProfile": "defender",
    "abilityIds": [
      "monster.transparent-report"
    ]
  },
  {
    "monsterId": "monster.no-change-merchantling",
    "name": "Крамарик без здачі",
    "authoredLevel": 2,
    "aiProfile": "trickster",
    "abilityIds": [
      "monster.no-change"
    ]
  },
  {
    "monsterId": "monster.self-critique-mirror",
    "name": "Дзеркальце зайвої самокритики",
    "authoredLevel": 3,
    "aiProfile": "trickster",
    "abilityIds": [
      "monster.mirror-doubt"
    ]
  },
  {
    "monsterId": "monster.dry-sea-teapot",
    "name": "Чайник сухого моря",
    "authoredLevel": 2,
    "aiProfile": "controller",
    "abilityIds": [
      "monster.dry-whistle"
    ]
  },
  {
    "monsterId": "monster.cabbage-knight-on-break",
    "name": "Капустяний лицар на перерві",
    "authoredLevel": 2,
    "aiProfile": "defender",
    "abilityIds": [
      "monster.cabbage-plate"
    ]
  },
  {
    "monsterId": "monster.zero-declaration-tax-dragon",
    "name": "Податковий дракон нульової декларації",
    "authoredLevel": 5,
    "aiProfile": "controller",
    "abilityIds": [
      "monster.tax-breath",
      "monster.asset-freeze"
    ],
    "upgradeAbilityIds": [
      {
        "abilityId": "monster.compound-interest",
        "minEffectiveLevel": 7
      }
    ]
  },
  {
    "monsterId": "monster.complaint-lantern",
    "name": "Скаргова лампа",
    "authoredLevel": 4,
    "aiProfile": "controller",
    "abilityIds": [
      "monster.complaint-glare",
      "monster.complaint-echo"
    ]
  },
  {
    "monsterId": "monster.ledger-boar",
    "name": "Кабан прибутково-видаткової книги",
    "authoredLevel": 5,
    "aiProfile": "brute",
    "abilityIds": [
      "monster.ledger-charge",
      "monster.ledger-audit"
    ]
  },
  {
    "monsterId": "monster.salted-oath-pretzel",
    "name": "Крендель солоної обіцянки",
    "authoredLevel": 6,
    "aiProfile": "defender",
    "abilityIds": [
      "monster.salted-oath",
      "monster.crumb-ambush"
    ]
  },
  {
    "monsterId": "monster.unclosed-closure-act",
    "name": "Акт закриття, який не закрився",
    "authoredLevel": 6,
    "aiProfile": "controller",
    "abilityIds": [
      "monster.reopen-case",
      "monster.denied-closure"
    ]
  },
  {
    "monsterId": "monster.liar-corridor-map",
    "name": "Мапа коридору, яка бреше",
    "authoredLevel": 7,
    "aiProfile": "trickster",
    "abilityIds": [
      "monster.false-exit",
      "monster.corridor-redraw"
    ]
  },
  {
    "monsterId": "monster.foam-auditor-boots",
    "name": "Пінний ревізор у чоботях",
    "authoredLevel": 8,
    "aiProfile": "controller",
    "abilityIds": [
      "monster.foam-inspection",
      "monster.queue-audit"
    ]
  },
  {
    "monsterId": "monster.three-signature-chimera",
    "name": "Химера трьох підписів",
    "authoredLevel": 9,
    "aiProfile": "boss",
    "abilityIds": [
      "monster.chimera-bite",
      "monster.chimera-veto",
      "monster.chimera-minority-report"
    ]
  },
  {
    "monsterId": "monster.cheese-vault-warden",
    "name": "Наглядач сирного сховку",
    "authoredLevel": 10,
    "aiProfile": "defender",
    "abilityIds": [
      "monster.vault-lock",
      "monster.cold-rind",
      "monster.napkin-denial"
    ]
  },
  {
    "monsterId": "monster.calendar-hydra",
    "name": "Гідра календарних переносів",
    "authoredLevel": 11,
    "aiProfile": "boss",
    "abilityIds": [
      "monster.reschedule",
      "monster.hydra-monday",
      "monster.deadline-flood"
    ]
  },
  {
    "monsterId": "monster.inventory-prophet",
    "name": "Пророк інвентарної недостачі",
    "authoredLevel": 12,
    "aiProfile": "controller",
    "abilityIds": [
      "monster.inventory-prophecy",
      "monster.shortage",
      "monster.missing-line"
    ]
  },
  {
    "monsterId": "monster.quiet-catastrophe-clerk",
    "name": "Писар тихої катастрофи",
    "authoredLevel": 13,
    "aiProfile": "boss",
    "abilityIds": [
      "monster.quiet-catastrophe",
      "monster.internal-memo",
      "monster.soft-collapse"
    ]
  },
  {
    "monsterId": "monster.collective-liability-cauldron",
    "name": "Баняк колективної відповідальности",
    "authoredLevel": 4,
    "aiProfile": "defender",
    "abilityIds": [
      "monster.pass-the-blame-lid",
      "monster.common-stone-guard"
    ]
  },
  {
    "monsterId": "monster.bypass-sheet-fox",
    "name": "Лис обхідного листа",
    "authoredLevel": 4,
    "aiProfile": "trickster",
    "abilityIds": [
      "monster.bypass-sheet-loop",
      "monster.common-forest-feint"
    ]
  },
  {
    "monsterId": "monster.sourdough-kvas-golem",
    "name": "Квасний голем на заквасці",
    "authoredLevel": 5,
    "aiProfile": "defender",
    "abilityIds": [
      "monster.fermentation-rise",
      "monster.common-hungry-mend"
    ]
  },
  {
    "monsterId": "monster.tender-committee-frog",
    "name": "Жаба тендерного комітету",
    "authoredLevel": 5,
    "aiProfile": "controller",
    "abilityIds": [
      "monster.quorum-croak",
      "monster.common-muddy-grip"
    ]
  },
  {
    "monsterId": "monster.safety-intern-chuhaister",
    "name": "Чугайстер-практикант із техніки безпеки",
    "authoredLevel": 6,
    "aiProfile": "skirmisher",
    "abilityIds": [
      "monster.emergency-dance",
      "monster.common-evasive-step"
    ]
  },
  {
    "monsterId": "monster.bulk-discount-zlydni",
    "name": "Злидні гуртової знижки",
    "authoredLevel": 6,
    "aiProfile": "trickster",
    "abilityIds": [
      "monster.bulk-misfortune",
      "monster.common-swarm-overrun"
    ]
  },
  {
    "monsterId": "monster.fourth-grind-rumor-mill",
    "name": "Млинок чуток четвертого помелу",
    "authoredLevel": 6,
    "aiProfile": "controller",
    "abilityIds": [
      "monster.fourth-grind-rumor",
      "monster.common-echo-wave"
    ]
  },
  {
    "monsterId": "monster.improper-parking-boar",
    "name": "Вепр неналежного паркування",
    "authoredLevel": 7,
    "aiProfile": "brute",
    "abilityIds": [
      "monster.hoof-tow-away",
      "monster.common-heavy-charge"
    ]
  },
  {
    "monsterId": "monster.three-correct-roads-blud",
    "name": "Блуд із трьома правильними дорогами",
    "authoredLevel": 7,
    "aiProfile": "trickster",
    "abilityIds": [
      "monster.three-right-turns",
      "monster.common-forest-feint"
    ]
  },
  {
    "monsterId": "monster.wet-coal-salamander",
    "name": "Саламандра мокрого вугілля",
    "authoredLevel": 7,
    "aiProfile": "controller",
    "abilityIds": [
      "monster.wet-ember",
      "monster.common-fire-burst"
    ]
  },
  {
    "monsterId": "monster.service-key-monkey",
    "name": "Мавпочка службового ключа",
    "authoredLevel": 7,
    "aiProfile": "skirmisher",
    "abilityIds": [
      "monster.master-key-theft",
      "monster.common-evasive-step"
    ]
  },
  {
    "monsterId": "monster.hr-pesyholovets",
    "name": "Песиголовець із відділу кадрів",
    "authoredLevel": 8,
    "aiProfile": "controller",
    "abilityIds": [
      "monster.hr-bite-interview",
      "monster.common-biting-retort"
    ]
  },
  {
    "monsterId": "monster.licensed-shine-magpie",
    "name": "Сорока ліцензійного блиску",
    "authoredLevel": 8,
    "aiProfile": "trickster",
    "abilityIds": [
      "monster.licensed-theft",
      "monster.common-treasure-shield"
    ]
  },
  {
    "monsterId": "monster.diet-menu-sausage-basilisk",
    "name": "Ковбасний василіск дієтичного меню",
    "authoredLevel": 8,
    "aiProfile": "controller",
    "abilityIds": [
      "monster.dietary-gaze",
      "monster.common-ominous-gaze"
    ]
  },
  {
    "monsterId": "monster.dry-fountain-vodyanyk",
    "name": "Водяник сухого фонтану",
    "authoredLevel": 8,
    "aiProfile": "controller",
    "abilityIds": [
      "monster.dry-water-fee",
      "monster.common-muddy-grip"
    ]
  },
  {
    "monsterId": "monster.curfew-stove-lion",
    "name": "Пічний лев комендантської години",
    "authoredLevel": 9,
    "aiProfile": "defender",
    "abilityIds": [
      "monster.curfew-roar",
      "monster.common-stone-guard"
    ]
  },
  {
    "monsterId": "monster.three-instance-duck",
    "name": "Качка трьох інстанцій",
    "authoredLevel": 9,
    "aiProfile": "controller",
    "abilityIds": [
      "monster.return-to-first-instance",
      "monster.common-rule-lock"
    ]
  },
  {
    "monsterId": "monster.promo-perelesnyk",
    "name": "Перелесник рекламної акції",
    "authoredLevel": 9,
    "aiProfile": "trickster",
    "abilityIds": [
      "monster.promo-fine-print-flare",
      "monster.common-fire-burst"
    ]
  },
  {
    "monsterId": "monster.basement-pipe-stone-catfish",
    "name": "Кам’яний сом підвального водогону",
    "authoredLevel": 9,
    "aiProfile": "defender",
    "abilityIds": [
      "monster.pipe-blockade",
      "monster.common-cold-snap"
    ]
  },
  {
    "monsterId": "monster.final-approval-raven",
    "name": "Ворон остаточного погодження",
    "authoredLevel": 10,
    "aiProfile": "controller",
    "abilityIds": [
      "monster.final-approval-caw",
      "monster.common-ominous-gaze",
      "monster.common-rule-lock"
    ]
  },
  {
    "monsterId": "monster.quarterly-report-pan-kotsky",
    "name": "Пан Коцький квартального звіту",
    "authoredLevel": 10,
    "aiProfile": "trickster",
    "abilityIds": [
      "monster.unverified-reputation",
      "monster.common-evasive-step",
      "monster.common-biting-retort"
    ]
  },
  {
    "monsterId": "monster.small-business-didko",
    "name": "Дідько малого бізнесу",
    "authoredLevel": 10,
    "aiProfile": "trickster",
    "abilityIds": [
      "monster.horn-signed-contract",
      "monster.common-treasure-shield",
      "monster.common-mana-leak"
    ]
  },
  {
    "monsterId": "monster.deep-estimate-sawfish",
    "name": "Риба-пилка кошторисної глибини",
    "authoredLevel": 10,
    "aiProfile": "brute",
    "abilityIds": [
      "monster.budget-saw",
      "monster.common-armor-break",
      "monster.common-muddy-grip"
    ]
  },
  {
    "monsterId": "monster.treasure-ventilation-copper-snake",
    "name": "Мідний полоз скарбової вентиляції",
    "authoredLevel": 11,
    "aiProfile": "skirmisher",
    "abilityIds": [
      "monster.copper-coil-draft",
      "monster.common-evasive-step",
      "monster.common-mana-leak"
    ]
  },
  {
    "monsterId": "monster.strategic-reserve-potato",
    "name": "Бараболя стратегічного резерву",
    "authoredLevel": 11,
    "aiProfile": "defender",
    "abilityIds": [
      "monster.black-day-reserve",
      "monster.common-stone-guard",
      "monster.common-hungry-mend"
    ]
  },
  {
    "monsterId": "monster.forest-loss-aurochs",
    "name": "Тур обліку лісових збитків",
    "authoredLevel": 11,
    "aiProfile": "brute",
    "abilityIds": [
      "monster.horn-accounting",
      "monster.common-heavy-charge",
      "monster.common-armor-break"
    ]
  },
  {
    "monsterId": "monster.service-path-lisovyk",
    "name": "Лісовик службової стежки",
    "authoredLevel": 12,
    "aiProfile": "trickster",
    "abilityIds": [
      "monster.shortcut-with-interview",
      "monster.common-forest-feint",
      "monster.common-paper-snare"
    ]
  },
  {
    "monsterId": "monster.siege-iron-varenyk",
    "name": "Залізний вареник облоги",
    "authoredLevel": 12,
    "aiProfile": "defender",
    "abilityIds": [
      "monster.armored-filling",
      "monster.common-stone-guard",
      "monster.common-hungry-mend"
    ]
  },
  {
    "monsterId": "monster.thirteen-address-dragon-courier",
    "name": "Змій-кур’єр тринадцяти адрес",
    "authoredLevel": 12,
    "aiProfile": "skirmisher",
    "abilityIds": [
      "monster.wrong-address-delivery",
      "monster.common-fire-burst",
      "monster.common-evasive-step"
    ]
  },
  {
    "monsterId": "monster.tide-accountant-vodyanyk",
    "name": "Водяний бухгалтер припливів",
    "authoredLevel": 13,
    "aiProfile": "controller",
    "abilityIds": [
      "monster.balance-the-tide",
      "monster.common-muddy-grip",
      "monster.common-mana-leak"
    ]
  },
  {
    "monsterId": "monster.failed-tender-pea-giant",
    "name": "Гороховий велетень невиграного тендеру",
    "authoredLevel": 13,
    "aiProfile": "brute",
    "abilityIds": [
      "monster.pea-scope-creep",
      "monster.common-heavy-charge",
      "monster.common-group-rally"
    ]
  },
  {
    "monsterId": "monster.archive-ventilation-dragon",
    "name": "Дракон архівної вентиляції",
    "authoredLevel": 13,
    "aiProfile": "boss",
    "abilityIds": [
      "monster.reactivate-archive",
      "monster.common-fire-burst",
      "monster.common-paper-snare"
    ]
  },
  {
    "monsterId": "monster.seven-draft-chuhaister",
    "name": "Чугайстер семи протягів",
    "authoredLevel": 14,
    "aiProfile": "skirmisher",
    "abilityIds": [
      "monster.seven-drafts-dance",
      "monster.common-evasive-step",
      "monster.common-echo-wave"
    ]
  },
  {
    "monsterId": "monster.seasonal-defense-pumpkin-hetman",
    "name": "Гарбузовий гетьман сезонної оборони",
    "authoredLevel": 14,
    "aiProfile": "defender",
    "abilityIds": [
      "monster.strategic-puree",
      "monster.common-stone-guard",
      "monster.common-group-rally"
    ]
  },
  {
    "monsterId": "monster.second-copy-ghost",
    "name": "Привид другого примірника",
    "authoredLevel": 14,
    "aiProfile": "trickster",
    "abilityIds": [
      "monster.duplicate-demand",
      "monster.common-paper-snare",
      "monster.common-arcane-static"
    ]
  },
  {
    "monsterId": "monster.six-hour-meeting-viy",
    "name": "Вій шестигодинної наради",
    "authoredLevel": 15,
    "aiProfile": "controller",
    "abilityIds": [
      "monster.agenda-forty-two",
      "monster.common-ominous-gaze",
      "monster.common-rule-lock"
    ]
  },
  {
    "monsterId": "monster.state-sluice-beaver",
    "name": "Бобер державного шлюзу",
    "authoredLevel": 15,
    "aiProfile": "defender",
    "abilityIds": [
      "monster.approved-dam",
      "monster.common-stone-guard",
      "monster.common-group-rally"
    ]
  },
  {
    "monsterId": "monster.cash-gap-upyr",
    "name": "Упир касового розриву",
    "authoredLevel": 15,
    "aiProfile": "controller",
    "abilityIds": [
      "monster.liquidity-drain",
      "monster.common-mana-leak",
      "monster.common-hungry-mend"
    ]
  },
  {
    "monsterId": "monster.late-vacation-mavka",
    "name": "Мавка невчасної відпустки",
    "authoredLevel": 16,
    "aiProfile": "trickster",
    "abilityIds": [
      "monster.vacation-without-return-date",
      "monster.common-forest-feint",
      "monster.common-ominous-gaze"
    ]
  },
  {
    "monsterId": "monster.third-reheat-kulish-phoenix",
    "name": "Кулішний фенікс третього підігріву",
    "authoredLevel": 16,
    "aiProfile": "boss",
    "abilityIds": [
      "monster.third-reheat-resurrection",
      "monster.common-fire-burst",
      "monster.common-hungry-mend"
    ]
  },
  {
    "monsterId": "monster.night-reservation-mara",
    "name": "Мара нічного резервування",
    "authoredLevel": 16,
    "aiProfile": "controller",
    "abilityIds": [
      "monster.no-vacancy-nightmare",
      "monster.common-arcane-static",
      "monster.common-rule-lock"
    ]
  },
  {
    "monsterId": "monster.storage-silence-reed-king",
    "name": "Очеретяний цар комірної тиші",
    "authoredLevel": 17,
    "aiProfile": "defender",
    "abilityIds": [
      "monster.classified-rustle",
      "monster.common-muddy-grip",
      "monster.common-group-rally"
    ]
  },
  {
    "monsterId": "monster.false-note-bandura-griffin",
    "name": "Бандурний грифон фальшивої ноти",
    "authoredLevel": 17,
    "aiProfile": "controller",
    "abilityIds": [
      "monster.false-note-treasure-guard",
      "monster.common-echo-wave",
      "monster.common-treasure-shield"
    ]
  },
  {
    "monsterId": "monster.last-shift-vovkulaka",
    "name": "Вовкулака останньої зміни",
    "authoredLevel": 17,
    "aiProfile": "brute",
    "abilityIds": [
      "monster.timesheet-maul",
      "monster.common-biting-retort",
      "monster.common-heavy-charge"
    ]
  },
  {
    "monsterId": "monster.mountain-leasing-aridnyk",
    "name": "Арідник гірського лізингу",
    "authoredLevel": 18,
    "aiProfile": "trickster",
    "abilityIds": [
      "monster.mountain-on-installments",
      "monster.common-treasure-shield",
      "monster.common-armor-break"
    ]
  },
  {
    "monsterId": "monster.customs-three-whisker-carp",
    "name": "Триусий короп митного ставу",
    "authoredLevel": 18,
    "aiProfile": "controller",
    "abilityIds": [
      "monster.customs-scale-count",
      "monster.common-muddy-grip",
      "monster.common-mana-leak"
    ]
  },
  {
    "monsterId": "monster.hr-intern-necromancer",
    "name": "Некромант-стажер відділу кадрів",
    "authoredLevel": 18,
    "aiProfile": "controller",
    "abilityIds": [
      "monster.return-to-staff",
      "monster.common-arcane-static",
      "monster.common-group-rally"
    ]
  },
  {
    "monsterId": "monster.cold-storage-state-mammoth",
    "name": "Казенний мамонт холодного складу",
    "authoredLevel": 19,
    "aiProfile": "defender",
    "abilityIds": [
      "monster.documented-cold-storage",
      "monster.common-cold-snap",
      "monster.common-stone-guard"
    ]
  },
  {
    "monsterId": "monster.excise-honey-giant-bee",
    "name": "Велетенська бджола акцизного меду",
    "authoredLevel": 19,
    "aiProfile": "skirmisher",
    "abilityIds": [
      "monster.excise-sting",
      "monster.common-swarm-overrun",
      "monster.common-evasive-step"
    ]
  },
  {
    "monsterId": "monster.overtime-heat-poludnytsia",
    "name": "Полудниця понаднормової спеки",
    "authoredLevel": 19,
    "aiProfile": "controller",
    "abilityIds": [
      "monster.noon-overtime",
      "monster.common-fire-burst",
      "monster.common-ominous-gaze"
    ]
  },
  {
    "monsterId": "monster.spoon-mobilization-iron-raven",
    "name": "Залізний крук мобілізації ложок",
    "authoredLevel": 20,
    "aiProfile": "skirmisher",
    "abilityIds": [
      "monster.spoon-conscription",
      "monster.common-swarm-overrun",
      "monster.common-echo-wave"
    ]
  },
  {
    "monsterId": "monster.fire-safety-three-headed-serpent",
    "name": "Триголовий змій пожежної безпеки",
    "authoredLevel": 20,
    "aiProfile": "boss",
    "abilityIds": [
      "monster.fire-safety-cycle",
      "monster.common-fire-burst",
      "monster.common-rule-lock"
    ]
  },
  {
    "monsterId": "monster.last-will-dead-auditor",
    "name": "Мрець-ревізор останньої волі",
    "authoredLevel": 20,
    "aiProfile": "controller",
    "abilityIds": [
      "monster.posthumous-audit",
      "monster.common-paper-snare",
      "monster.common-mana-leak"
    ]
  },
  {
    "monsterId": "monster.underground-sea-acceptance-whale",
    "name": "Кит підземного моря з актом приймання",
    "authoredLevel": 21,
    "aiProfile": "boss",
    "abilityIds": [
      "monster.acceptance-whale-dive",
      "monster.common-muddy-grip",
      "monster.common-stone-guard"
    ]
  },
  {
    "monsterId": "monster.collateral-grey-bear",
    "name": "Сивий ведмідь заставного майна",
    "authoredLevel": 21,
    "aiProfile": "brute",
    "abilityIds": [
      "monster.collateral-sit",
      "monster.common-treasure-shield",
      "monster.common-heavy-charge"
    ]
  },
  {
    "monsterId": "monster.empty-chamber-lady",
    "name": "Панночка порожньої світлиці",
    "authoredLevel": 21,
    "aiProfile": "trickster",
    "abilityIds": [
      "monster.doorless-invitation",
      "monster.common-ominous-gaze",
      "monster.common-forest-feint"
    ]
  },
  {
    "monsterId": "monster.fair-tax-honey-leviathan",
    "name": "Медовий левіятан ярмаркового збору",
    "authoredLevel": 22,
    "aiProfile": "boss",
    "abilityIds": [
      "monster.spoon-sized-levy",
      "monster.common-hungry-mend",
      "monster.common-treasure-shield"
    ]
  },
  {
    "monsterId": "monster.siege-song-stone-skylark",
    "name": "Кам’яний жайвір облогової пісні",
    "authoredLevel": 22,
    "aiProfile": "controller",
    "abilityIds": [
      "monster.heavy-note",
      "monster.common-echo-wave",
      "monster.common-stone-guard"
    ]
  },
  {
    "monsterId": "monster.written-off-assets-black-booker",
    "name": "Чорнокнижник списаного майна",
    "authoredLevel": 22,
    "aiProfile": "controller",
    "abilityIds": [
      "monster.write-off-and-summon",
      "monster.common-arcane-static",
      "monster.common-paper-snare"
    ]
  },
  {
    "monsterId": "monster.last-route-star-boar",
    "name": "Зоряний вепр останнього маршруту",
    "authoredLevel": 23,
    "aiProfile": "skirmisher",
    "abilityIds": [
      "monster.constellation-charge",
      "monster.common-heavy-charge",
      "monster.common-evasive-step"
    ]
  },
  {
    "monsterId": "monster.queue-dragon-prince",
    "name": "Князь драконячої черги",
    "authoredLevel": 23,
    "aiProfile": "boss",
    "abilityIds": [
      "monster.last-place-in-queue",
      "monster.common-rule-lock",
      "monster.common-stone-guard"
    ]
  },
  {
    "monsterId": "monster.expired-archive-upyr-king",
    "name": "Король упирів простроченого архіву",
    "authoredLevel": 23,
    "aiProfile": "boss",
    "abilityIds": [
      "monster.century-overdue-request",
      "monster.common-arcane-static",
      "monster.common-ominous-gaze"
    ]
  }
] as const satisfies readonly MonsterCombatProfile[];

export const monsterCombatProfileCount = 93 as const;

export const monsterCombatProfileByMonsterId: ReadonlyMap<string, MonsterCombatProfile> = new Map(
  monsterCombatProfiles.map((profile) => [profile.monsterId, profile])
);

export function findMonsterCombatProfile(monsterId: string): MonsterCombatProfile | null {
  return monsterCombatProfileByMonsterId.get(monsterId) ?? null;
}
