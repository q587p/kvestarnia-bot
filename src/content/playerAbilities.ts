import type { StatKey } from "../domain/characters/starterStats";
import type {
  CombatAbilitySource,
  CombatDamageKind,
  CombatTargetScope,
  PlayerCombatActionType
} from "../domain/combat";

export type PlayerAbilityRecipeKind =
  | "direct-damage"
  | "all-enemies-damage"
  | "primary-plus-splash"
  | "self-heal"
  | "ally-heal"
  | "ally-guard"
  | "response-mitigation"
  | "counter";

export interface PlayerAbilityDefinition {
  id: string;
  source: Extract<CombatAbilitySource, "class" | "race">;
  classId?: string;
  raceId?: string;
  label: string;
  description: string;
  action: Extract<PlayerCombatActionType, "skill" | "race">;
  primaryTargetScope: CombatTargetScope;
  secondaryTargetScope?: CombatTargetScope;
  manaCost: number;
  cooldownOwnActions: number;
  damageKind?: CombatDamageKind;
  stat?: StatKey;
  baseDamage?: number;
  multiplier?: number;
  secondaryMultiplier?: number;
  accuracyBonus?: number;
  critBonus?: number;
  monsterDamageReduction?: number;
  healAmount?: number;
  guardReduction?: number;
  counterDamage?: number;
  legacyCooldownIds?: readonly string[];
  criticalFumbleLine: string;
  recipe: readonly PlayerAbilityRecipeKind[];
  tags: readonly string[];
}

export const classAbilities = [
  {
    id: "skill.forceful-strike",
    source: "class",
    classId: "class.warrior",
    label: "🪓 Силовий замах",
    description: "Воїн переконує одну проблему, що стояти перед сокирою — погана кар'єра.",
    action: "skill",
    primaryTargetScope: "single-enemy",
    manaCost: 0,
    cooldownOwnActions: 1,
    damageKind: "physical",
    stat: "strength",
    baseDamage: 5,
    multiplier: 1.25,
    accuracyBonus: 0.03,
    critBonus: 0.02,
    monsterDamageReduction: 0,
    criticalFumbleLine: "Замах переконав підлогу раніше, ніж проблему. Підлога не вражена, але пригодник так.",
    recipe: ["direct-damage"],
    tags: ["direct", "physical", "class"]
  },
  {
    id: "skill.hot-spell",
    source: "class",
    classId: "class.mage",
    label: "🔥 Гаряче закляття",
    description: "Усі живі вороги згадують, що техніка безпеки теж буває магічною.",
    action: "skill",
    primaryTargetScope: "all-enemies",
    manaCost: 5,
    cooldownOwnActions: 2,
    damageKind: "spell",
    stat: "intelligence",
    baseDamage: 3,
    multiplier: 0.92,
    accuracyBonus: 0.05,
    critBonus: 0.01,
    monsterDamageReduction: 0,
    criticalFumbleLine: "Закляття розвернулося в повітрі й чемно влучило туди, звідки його випустили.",
    recipe: ["all-enemies-damage"],
    tags: ["aoe", "spell", "class"]
  },
  {
    id: "skill.boiling-filling",
    source: "class",
    classId: "class.varenyk-mancer",
    label: "🥟 Кипляча начинка",
    description: "Начинка бризкає по ворогах, а пара трохи зцілює пригодника.",
    action: "skill",
    primaryTargetScope: "all-enemies",
    secondaryTargetScope: "single-ally-or-self",
    manaCost: 4,
    cooldownOwnActions: 2,
    damageKind: "spell",
    stat: "intelligence",
    baseDamage: 3,
    multiplier: 0.85,
    accuracyBonus: 0.05,
    critBonus: 0.01,
    healAmount: 3,
    legacyCooldownIds: ["skill.hot-spell"],
    criticalFumbleLine: "Начинка вирішила, що проблема виглядає голодною, і підгодувала не той бік бою.",
    recipe: ["all-enemies-damage", "self-heal"],
    tags: ["aoe", "spell", "support", "ally-scope", "class"]
  },
  {
    id: "skill.form-thirteen-b",
    source: "class",
    classId: "class.bureaucramancer",
    label: "📄 Форма 13-Б",
    description: "Кожен ворог отримує форму, де шкода тимчасово виглядає як помилка заповнення.",
    action: "skill",
    primaryTargetScope: "all-enemies",
    manaCost: 4,
    cooldownOwnActions: 3,
    damageKind: "social",
    stat: "intelligence",
    baseDamage: 2,
    multiplier: 0.62,
    accuracyBonus: 0.07,
    critBonus: 0,
    monsterDamageReduction: 2,
    criticalFumbleLine: "Форма 13-Б повернулася з печаткою «сам винен» і службово боляче клацнула по пригоднику.",
    recipe: ["all-enemies-damage", "response-mitigation"],
    tags: ["aoe", "control", "social", "class"]
  },
  {
    id: "skill.dangerous-couplet",
    source: "class",
    classId: "class.bard",
    label: "🎶 Небезпечний куплет",
    description: "Куплет чіпляє всіх ворогів і лишає союзникам моральний піджак на плечах.",
    action: "skill",
    primaryTargetScope: "all-enemies",
    secondaryTargetScope: "all-allies-including-self",
    manaCost: 4,
    cooldownOwnActions: 3,
    damageKind: "social",
    stat: "charisma",
    baseDamage: 2,
    multiplier: 0.7,
    accuracyBonus: 0.08,
    critBonus: 0.02,
    monsterDamageReduction: 1,
    guardReduction: 1,
    criticalFumbleLine: "Куплет надихнув не той бік сцени. Супротивник аж випростався від мистецтва.",
    recipe: ["all-enemies-damage", "ally-guard"],
    tags: ["aoe", "social", "support", "ally-scope", "class"]
  },
  {
    id: "skill.shadow-cut",
    source: "class",
    classId: "class.rogue",
    label: "🌘 Тіньовий розтин",
    description: "Один точний розріз і коротка тіньова пауза перед відповіддю.",
    action: "skill",
    primaryTargetScope: "single-enemy",
    manaCost: 0,
    cooldownOwnActions: 2,
    damageKind: "trick",
    stat: "dexterity",
    baseDamage: 4,
    multiplier: 1.15,
    accuracyBonus: 0.06,
    critBonus: 0.08,
    monsterDamageReduction: 1,
    legacyCooldownIds: ["skill.trick-shot"],
    criticalFumbleLine: "Тінь сховалась разом із планом, а лезо знайшло пригодника без зайвої драматургії.",
    recipe: ["direct-damage", "response-mitigation"],
    tags: ["direct", "trick", "class"]
  },
  {
    id: "skill.trick-shot",
    source: "class",
    classId: "class.ranger",
    label: "🏹 Рикошетний постріл",
    description: "Стріла знаходить головну ціль і нахабно чіпляє решту.",
    action: "skill",
    primaryTargetScope: "all-enemies",
    manaCost: 1,
    cooldownOwnActions: 2,
    damageKind: "trick",
    stat: "dexterity",
    baseDamage: 4,
    multiplier: 1,
    secondaryMultiplier: 0.45,
    accuracyBonus: 0.06,
    critBonus: 0.06,
    criticalFumbleLine: "Рикошет чесно знайшов тактичне коліно. На жаль, своє.",
    recipe: ["primary-plus-splash"],
    tags: ["aoe", "splash", "trick", "class"]
  },
  {
    id: "skill.strict-blessing",
    source: "class",
    classId: "class.priest",
    label: "✨ Суворе благословення",
    description: "Благословення лікує найпобитішого союзника, а зараз — самого пригодника.",
    action: "skill",
    primaryTargetScope: "lowest-hp-ally",
    secondaryTargetScope: "all-allies-including-self",
    manaCost: 4,
    cooldownOwnActions: 3,
    damageKind: "spell",
    stat: "charisma",
    baseDamage: 1,
    multiplier: 0.35,
    accuracyBonus: 0.05,
    critBonus: 0,
    monsterDamageReduction: 2,
    healAmount: 7,
    guardReduction: 1,
    criticalFumbleLine: "Благословення перечитало адресата й підлатало супротивника з неприємною щирістю.",
    recipe: ["ally-heal", "ally-guard", "response-mitigation"],
    tags: ["heal", "support", "ally-scope", "class"]
  },
  {
    id: "skill.steppe-side-eye",
    source: "class",
    classId: "class.kharakternyk",
    label: "👁 Степовий косий погляд",
    description: "Погляд проходить по всіх ворогах і стишує їхню певність.",
    action: "skill",
    primaryTargetScope: "all-enemies",
    manaCost: 2,
    cooldownOwnActions: 2,
    damageKind: "trick",
    stat: "luck",
    baseDamage: 3,
    multiplier: 0.82,
    accuracyBonus: 0.05,
    critBonus: 0.05,
    monsterDamageReduction: 1,
    criticalFumbleLine: "Косий погляд відбився від степової логіки назад. Логіка перемогла.",
    recipe: ["all-enemies-damage", "response-mitigation"],
    tags: ["aoe", "control", "trick", "class"]
  }
] as const satisfies readonly PlayerAbilityDefinition[];

export const fallbackClassAbility = {
  id: "skill.careful-strike",
  source: "class",
  label: "🧭 Обережний удар",
  description: "Безпечний запасний удар для старих або невідомих класів.",
  action: "skill",
  primaryTargetScope: "single-enemy",
  manaCost: 0,
  cooldownOwnActions: 1,
  damageKind: "physical",
  stat: "strength",
  baseDamage: 3,
  multiplier: 1.05,
  accuracyBonus: 0.04,
  critBonus: 0.02,
  monsterDamageReduction: 0,
  criticalFumbleLine: "Обережний удар був настільки обережний, що обійшов супротивника й знайшов пригодника.",
  recipe: ["direct-damage"],
  tags: ["direct", "physical", "fallback", "class"]
} as const satisfies PlayerAbilityDefinition;

export const raceAbilities = [
  {
    id: "ability.race.practical-improvisation",
    source: "race",
    raceId: "race.human-ish",
    label: "🧰 Практична імпровізація",
    description: "Людисько б'є тим, що було під рукою, і соромить інструкцію.",
    action: "race",
    primaryTargetScope: "single-enemy",
    manaCost: 0,
    cooldownOwnActions: 3,
    damageKind: "trick",
    stat: "dexterity",
    baseDamage: 3,
    multiplier: 0.92,
    accuracyBonus: 0.07,
    critBonus: 0.02,
    criticalFumbleLine: "Імпровізація знайшла під рукою не той кінець. Практично, але боляче.",
    recipe: ["direct-damage"],
    tags: ["direct", "race"]
  },
  {
    id: "ability.race.low-center-of-gravity",
    source: "race",
    raceId: "race.dwarf",
    label: "🪨 Низький центр ваги",
    description: "Гном тримає стійку так, ніби підлога винна йому гроші.",
    action: "race",
    primaryTargetScope: "all-allies-including-self",
    manaCost: 0,
    cooldownOwnActions: 4,
    monsterDamageReduction: 2,
    guardReduction: 2,
    criticalFumbleLine: "Центр ваги знайшов підлогу раніше за план. Супротивник використав паузу для самоповаги.",
    recipe: ["ally-guard", "response-mitigation"],
    tags: ["support", "ally-scope", "race"]
  },
  {
    id: "ability.race.offended-precision",
    source: "race",
    raceId: "race.elf",
    label: "🎯 Ображена точність",
    description: "Ельф влучає туди, де в монстра найменше смаку.",
    action: "race",
    primaryTargetScope: "single-enemy",
    manaCost: 0,
    cooldownOwnActions: 3,
    damageKind: "trick",
    stat: "dexterity",
    baseDamage: 3,
    multiplier: 0.9,
    accuracyBonus: 0.12,
    critBonus: 0.05,
    criticalFumbleLine: "Точність образилася й влучила в самооцінку. Самооцінка попросила броню.",
    recipe: ["direct-damage"],
    tags: ["direct", "precision", "race"]
  },
  {
    id: "ability.race.margin-note",
    source: "race",
    raceId: "race.bisyny",
    label: "📝 Правка на полях",
    description: "Бісини виправляють ворогів червоним чорнилом і дрібною шкодою.",
    action: "race",
    primaryTargetScope: "all-enemies",
    manaCost: 1,
    cooldownOwnActions: 4,
    damageKind: "social",
    stat: "intelligence",
    baseDamage: 2,
    multiplier: 0.58,
    accuracyBonus: 0.07,
    critBonus: 0,
    monsterDamageReduction: 1,
    criticalFumbleLine: "Правка на полях повернулася червоним по герою. Редактура буває сувора.",
    recipe: ["all-enemies-damage", "response-mitigation"],
    tags: ["aoe", "control", "race"]
  },
  {
    id: "ability.race.step-through-the-border",
    source: "race",
    raceId: "race.drantohor",
    label: "🌀 Крок крізь Межу",
    description: "Дрантогор виходить не звідти й лишає ворогу незручну географію.",
    action: "race",
    primaryTargetScope: "single-enemy",
    manaCost: 1,
    cooldownOwnActions: 4,
    damageKind: "trick",
    stat: "luck",
    baseDamage: 3,
    multiplier: 0.9,
    accuracyBonus: 0.05,
    critBonus: 0.04,
    monsterDamageReduction: 2,
    criticalFumbleLine: "Межа відкрилася не з того боку, і крок вийшов у власну незручність.",
    recipe: ["direct-damage", "response-mitigation"],
    tags: ["direct", "guard", "race"]
  },
  {
    id: "ability.race.under-stove-stash",
    source: "race",
    raceId: "race.domovyk",
    label: "🧦 Запас під піччю",
    description: "Домовик дістає з-під печі щось м'яке, корисне й краще не питати.",
    action: "race",
    primaryTargetScope: "lowest-hp-ally",
    manaCost: 0,
    cooldownOwnActions: 4,
    healAmount: 5,
    guardReduction: 1,
    criticalFumbleLine: "Запас під піччю виявився гостинцем для проблеми. Домовитість має межі.",
    recipe: ["ally-heal", "ally-guard"],
    tags: ["heal", "ally-scope", "race"]
  },
  {
    id: "ability.race.dry-tide",
    source: "race",
    raceId: "race.dryland-rusalka",
    label: "🌊 Сухий приплив",
    description: "Приплив приходить без води, але з претензіями до всіх ворогів.",
    action: "race",
    primaryTargetScope: "all-enemies",
    secondaryTargetScope: "self",
    manaCost: 2,
    cooldownOwnActions: 4,
    damageKind: "spell",
    stat: "intelligence",
    baseDamage: 2,
    multiplier: 0.65,
    accuracyBonus: 0.05,
    critBonus: 0.01,
    healAmount: 2,
    criticalFumbleLine: "Сухий приплив забув, що він сухий, і розлився під ногами пригодника.",
    recipe: ["all-enemies-damage", "self-heal"],
    tags: ["aoe", "self-heal", "race"]
  },
  {
    id: "ability.race.peer-reviewed-smash",
    source: "race",
    raceId: "race.intellectual-orc",
    label: "📚 Рецензований удар",
    description: "Орк-інтелігент завдає аргумент, який пройшов плечову рецензію.",
    action: "race",
    primaryTargetScope: "single-enemy",
    manaCost: 0,
    cooldownOwnActions: 4,
    damageKind: "physical",
    stat: "strength",
    baseDamage: 5,
    multiplier: 1.02,
    accuracyBonus: 0.02,
    critBonus: 0.01,
    criticalFumbleLine: "Рецензія схвалила удар, але не напрям. Аргумент повернувся авторові.",
    recipe: ["direct-damage"],
    tags: ["direct", "physical", "race"]
  },
  {
    id: "ability.race.fog-amulet",
    source: "race",
    raceId: "race.molfar-soul",
    label: "🧿 Туманний оберіг",
    description: "Оберіг ставить туман між союзниками й чужою самовпевненістю.",
    action: "race",
    primaryTargetScope: "all-allies-including-self",
    manaCost: 1,
    cooldownOwnActions: 4,
    monsterDamageReduction: 2,
    guardReduction: 1,
    counterDamage: 2,
    criticalFumbleLine: "Оберіг поставив туман між пригодником і здоровим глуздом. Супротивнику стало легше дихати.",
    recipe: ["ally-guard", "response-mitigation", "counter"],
    tags: ["support", "ally-scope", "counter", "race"]
  }
] as const satisfies readonly PlayerAbilityDefinition[];

export function findClassAbility(classId: string | undefined): PlayerAbilityDefinition {
  return classAbilities.find((ability) => ability.classId === classId) ?? fallbackClassAbility;
}

export function findRaceAbility(raceId: string | undefined): PlayerAbilityDefinition | null {
  return raceAbilities.find((ability) => ability.raceId === raceId) ?? null;
}

export function findPlayerAbility(abilityId: string | undefined): PlayerAbilityDefinition | null {
  if (!abilityId) {
    return null;
  }

  return [...classAbilities, fallbackClassAbility, ...raceAbilities].find((ability) => ability.id === abilityId) ?? null;
}
