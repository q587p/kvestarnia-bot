import { classes } from "./classes";
import { activeRaces } from "./races";
import type { StatKey } from "../domain/characters/starterStats";

export type QuestMethodSource = "scene" | "race" | "class" | "signature";

export type QuestTechniqueId =
  | "force"
  | "finesse"
  | "arcana"
  | "investigation"
  | "persuasion"
  | "deception"
  | "sneak"
  | "authority"
  | "performance"
  | "tracking"
  | "traps"
  | "ritual"
  | "craft"
  | "domesticity"
  | "bribery"
  | "improvisation";

export type QuestIntent =
  | "fight"
  | "negotiate"
  | "deceive"
  | "bribe"
  | "investigate"
  | "ritual"
  | "craft"
  | "sneak";

export type QuestResolutionGrade =
  | "strong-success"
  | "success"
  | "mixed-success"
  | "complication";

export type QuestConsequenceKind =
  | "full-reward"
  | "reduced-reward"
  | "xp-only"
  | "gold-cost-success"
  | "fight-handoff"
  | "cosmetic-mess";

export type QuestRewardProfile = "modest" | "standard" | "generous";

export interface QuestMethodOutcomeText {
  headline: string;
  body: readonly string[];
  biographyLine?: string;
}

export interface QuestMethodDefinition {
  id: string;
  source: QuestMethodSource;
  label: string;
  hint: string;
  intent: QuestIntent;
  techniques: readonly QuestTechniqueId[];
  primaryStat: StatKey;
  secondaryStat?: StatKey;
  baseChance: number;
  rewardProfile: QuestRewardProfile;
  goldCost?: number;
  combatSkillId?: string;
  consequenceByGrade: Record<QuestResolutionGrade, QuestConsequenceKind>;
  outcomeText: Record<QuestResolutionGrade, QuestMethodOutcomeText>;
  legacyAction?: string;
  itemIntent?: string;
}

export interface QuestResolutionScene {
  sceneId: string;
  sceneTitle: string;
  sceneObject: string;
  methods: readonly QuestMethodDefinition[];
}

export interface QuestTechniqueProfile {
  label: string;
  methodPrefix: string;
  techniques: readonly QuestTechniqueId[];
  primaryStat: StatKey;
  secondaryStat?: StatKey;
  combatSkillId?: string;
}

export const QUEST_REWARD_PROFILES = {
  modest: { xp: 4, gold: 2 },
  standard: { xp: 7, gold: 4 },
  generous: { xp: 10, gold: 7 }
} as const satisfies Record<QuestRewardProfile, { xp: number; gold: number }>;

export const QUEST_GRADE_ORDER: readonly QuestResolutionGrade[] = [
  "strong-success",
  "success",
  "mixed-success",
  "complication"
];

export const raceTechniqueProfiles: Record<string, QuestTechniqueProfile> = {
  "race.human-ish": {
    label: "практична анкета",
    methodPrefix: "Звірити справу з тим, що реально працює",
    techniques: ["investigation", "persuasion", "craft"],
    primaryStat: "charisma",
    secondaryStat: "intelligence"
  },
  "race.dwarf": {
    label: "гномська конструкція",
    methodPrefix: "Простукати справу, ніби підозрілу жилу",
    techniques: ["force", "craft", "investigation"],
    primaryStat: "strength",
    secondaryStat: "intelligence"
  },
  "race.elf": {
    label: "ельфійська точність",
    methodPrefix: "Виправити неестетичну частину справи",
    techniques: ["finesse", "investigation", "performance"],
    primaryStat: "dexterity",
    secondaryStat: "intelligence"
  },
  "race.bisyny": {
    label: "бісівська правка",
    methodPrefix: "Оскаржити назву справи до першого заперечення",
    techniques: ["deception", "authority", "persuasion"],
    primaryStat: "charisma",
    secondaryStat: "dexterity"
  },
  "race.drantohor": {
    label: "межова карта",
    methodPrefix: "Піти за неправильною картою, доки вона не стане корисною",
    techniques: ["improvisation", "tracking", "deception"],
    primaryStat: "luck",
    secondaryStat: "dexterity"
  },
  "race.domovyk": {
    label: "хатня юрисдикція",
    methodPrefix: "Оголосити справу хатньою територією",
    techniques: ["domesticity", "craft", "persuasion"],
    primaryStat: "luck",
    secondaryStat: "charisma"
  },
  "race.dryland-rusalka": {
    label: "чайниковий приплив",
    methodPrefix: "Підняти сухий приплив довкола справи",
    techniques: ["arcana", "performance", "improvisation"],
    primaryStat: "intelligence",
    secondaryStat: "charisma"
  },
  "race.intellectual-orc": {
    label: "етична рецензія",
    methodPrefix: "Провести рецензію аргументу, не ламаючи автора",
    techniques: ["investigation", "authority", "force"],
    primaryStat: "intelligence",
    secondaryStat: "strength"
  },
  "race.molfar-soul": {
    label: "обереговий туман",
    methodPrefix: "Дати оберегам понюхати справу",
    techniques: ["ritual", "improvisation", "investigation"],
    primaryStat: "luck",
    secondaryStat: "intelligence"
  }
};

export const classTechniqueProfiles: Record<string, QuestTechniqueProfile> = {
  "class.warrior": {
    label: "чесний тиск",
    methodPrefix: "Притиснути справу до чесної відповіді",
    techniques: ["force", "authority"],
    primaryStat: "strength",
    secondaryStat: "charisma",
    combatSkillId: "skill.forceful-strike"
  },
  "class.mage": {
    label: "гаряче закляття",
    methodPrefix: "Підігріти саме той шар, де ховається закляття",
    techniques: ["arcana", "investigation"],
    primaryStat: "intelligence",
    secondaryStat: "luck",
    combatSkillId: "skill.hot-spell"
  },
  "class.bard": {
    label: "небезпечний куплет",
    methodPrefix: "Переспівати справу, доки вона не зібʼється з ритму",
    techniques: ["performance", "persuasion", "deception"],
    primaryStat: "charisma",
    secondaryStat: "luck",
    combatSkillId: "skill.dangerous-couplet"
  },
  "class.rogue": {
    label: "трюк із тінню",
    methodPrefix: "Непомітно витягти зі справи доказ",
    techniques: ["finesse", "deception", "sneak"],
    primaryStat: "dexterity",
    secondaryStat: "charisma",
    combatSkillId: "skill.trick-shot"
  },
  "class.priest": {
    label: "суворе благословення",
    methodPrefix: "Благословити справу на правдивість",
    techniques: ["ritual", "authority"],
    primaryStat: "charisma",
    secondaryStat: "intelligence",
    combatSkillId: "skill.strict-blessing"
  },
  "class.varenyk-mancer": {
    label: "тістологічна експертиза",
    methodPrefix: "Запечатати проблему начинкою здорового глузду",
    techniques: ["arcana", "craft"],
    primaryStat: "intelligence",
    secondaryStat: "charisma",
    combatSkillId: "skill.hot-spell"
  },
  "class.bureaucramancer": {
    label: "форма 13-Б",
    methodPrefix: "Оформити форму 13-Б на самовільну поведінку",
    techniques: ["authority", "investigation"],
    primaryStat: "intelligence",
    secondaryStat: "charisma",
    combatSkillId: "skill.form-thirteen-b"
  },
  "class.ranger": {
    label: "слід і пастка",
    methodPrefix: "Прочитати слід і поставити пастку на справжній стежці",
    techniques: ["tracking", "traps", "finesse"],
    primaryStat: "dexterity",
    secondaryStat: "intelligence",
    combatSkillId: "skill.trick-shot"
  },
  "class.kharakternyk": {
    label: "характерний погляд",
    methodPrefix: "Подивитися так, щоб справа сама знайшла вихід",
    techniques: ["improvisation", "authority", "force"],
    primaryStat: "luck",
    secondaryStat: "charisma",
    combatSkillId: "skill.steppe-side-eye"
  }
};

export function getCompactRaceKey(raceId: string): string {
  const index = activeRaces.findIndex((race) => race.id === raceId);
  return index >= 0 ? index.toString(36) : "x";
}

export function getCompactClassKey(classId: string): string {
  const index = classes.findIndex((characterClass) => characterClass.id === classId);
  return index >= 0 ? index.toString(36) : "x";
}

export function isKnownQuestMethodId(value: string | undefined): value is string {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,20}$/.test(value);
}
