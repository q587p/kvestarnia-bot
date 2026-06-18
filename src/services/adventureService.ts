import type { CharacterRepository } from "../db/repositories/characterRepository";
import { classes } from "../content/classes";
import { classIdToKey, getKnownComboTitleValues, raceIdToKey } from "../content/characterOptions";
import { activeRaces } from "../content/races";
import type {
  DailyActionRepository,
  RewardLevelChange
} from "../db/repositories/dailyActionRepository";
import type {
  SoloCombatSessionRecord,
  SoloCombatSessionRepository
} from "../db/repositories/soloCombatSessionRepository";
import { summarizeCharacter, type CharacterSummary } from "../domain/characters/characterSummary";
import {
  FIGHTING_CORNER_MIN_LEVEL,
  isWithinActivityMaxLevel,
  meetsActivityLevel,
  STARTER_ACTIVITY_MAX_LEVEL
} from "../domain/progression/activityGates";
import { SeededRandomSource } from "../shared/random";
import { systemClock, toIsoDate, type Clock } from "../shared/time";
import {
  ADVENTURE_CHOICE_KEY,
  ADVENTURE_CHOICE_REROLL_KEY,
  MIMIC_SHAWARMA_ADVENTURE_KEY,
  MIMIC_SHAWARMA_COMBAT_PROBE_KEY
} from "./dailyActionKeys";
import {
  enrichRewardItemGrants,
  RECEIPT_OF_FORMAL_SUSPICION_ITEM_ID,
  SUSPICIOUS_SHAWARMA_WRAPPER_ITEM_ID,
  type RewardItemGrant
} from "./itemGrant";

export { ADVENTURE_CHOICE_KEY } from "./dailyActionKeys";
export { ADVENTURE_CHOICE_REROLL_KEY } from "./dailyActionKeys";
export { MIMIC_SHAWARMA_ADVENTURE_KEY } from "./dailyActionKeys";

export const ADVENTURE_CHOICE_MIN_LEVEL = FIGHTING_CORNER_MIN_LEVEL;
export const ADVENTURE_CHOICE_COUNT = 3;
export const ADVENTURE_CHOICE_PERIOD_MINUTES = 93;

export type AdventureApproach = "safe" | "flair" | "risky";
export type MimicShawarmaAction = "poke" | "receipt" | "flee";
const GENERAL_ADVENTURE_PROBLEM_IDS = [
  "stew",
  "barrel",
  "helmet",
  "calendar",
  "receipt",
  "bench",
  "cloak",
  "spoon",
  "mirror",
  "boots",
  "chimney",
  "candle",
  "chair",
  "broom",
  "door",
  "map",
  "teapot",
  "menu",
  "sign",
  "portrait",
  "key",
  "ledger",
  "rug",
  "bell"
] as const;
type GeneralAdventureProblemId = (typeof GENERAL_ADVENTURE_PROBLEM_IDS)[number];
export type AdventureProblemId = string;

export interface AdventureChoice {
  id: AdventureProblemId;
  title: string;
  hook: string;
  client: string;
}

export interface AdventureProblem extends AdventureChoice {
  audience?: {
    raceId?: string;
    classId?: string;
    title?: string;
  };
}

export interface AdventureOfferProfile {
  id: string;
  raceId?: string;
  classId?: string;
  title?: string;
}

export interface AdventureOffer {
  localDate: string;
  periodToken: string;
  expiresAt: Date;
  choices: AdventureChoice[];
}

export interface AdventureApproachOption {
  id: AdventureApproach;
  label: string;
  hint: string;
  reward: {
    xp: number;
    gold: number;
  };
  complicationChance: number;
}

export interface AdventureReward {
  xp: number;
  gold: number;
  localDate: string;
  itemGrants: RewardItemGrant[];
}

export const MIMIC_SHAWARMA_REWARDS = {
  poke: {
    xp: 8,
    gold: 4
  },
  receipt: {
    xp: 6,
    gold: 6
  },
  flee: {
    xp: 2,
    gold: 0
  }
} satisfies Record<MimicShawarmaAction, { xp: number; gold: number }>;

export type AdventureLookupResult =
  | { state: "no-character" }
  | { state: "level-locked"; character: CharacterSummary; requiredLevel: number }
  | { state: "active-fight"; character: CharacterSummary; session: SoloCombatSessionRecord }
  | { state: "ready"; character: CharacterSummary; offer: AdventureOffer }
  | { state: "already-completed"; character: CharacterSummary };

export type MimicShawarmaLookupResult =
  | { state: "no-character" }
  | { state: "level-retired"; character: CharacterSummary; maxLevel: number }
  | { state: "ready"; character: CharacterSummary }
  | { state: "already-completed"; character: CharacterSummary; fightAvailable: boolean };

export type AdventureProblemResult =
  | { state: "no-character" }
  | { state: "level-locked"; character: CharacterSummary; requiredLevel: number }
  | { state: "active-fight"; character: CharacterSummary; session: SoloCombatSessionRecord }
  | { state: "stale"; character: CharacterSummary; offer: AdventureOffer }
  | { state: "already-completed"; character: CharacterSummary }
  | {
      state: "selected";
      character: CharacterSummary;
      offer: AdventureOffer;
      choice: AdventureChoice;
      approaches: AdventureApproachOption[];
    };

export type AdventureResult =
  | { state: "no-character" }
  | { state: "level-locked"; character: CharacterSummary; requiredLevel: number }
  | { state: "active-fight"; character: CharacterSummary; session: SoloCombatSessionRecord }
  | { state: "stale"; character: CharacterSummary; offer: AdventureOffer }
  | { state: "already-completed"; character: CharacterSummary }
  | {
      state: "completed";
      character: CharacterSummary;
      choice: AdventureChoice;
      approach: AdventureApproachOption;
      reward: AdventureReward;
      levelChange: RewardLevelChange;
      complication: boolean;
    };

export type MimicShawarmaResult =
  | { state: "no-character" }
  | { state: "level-retired"; character: CharacterSummary; maxLevel: number }
  | {
      state: "completed";
      action: MimicShawarmaAction;
      character: CharacterSummary;
      reward: AdventureReward;
      levelChange: RewardLevelChange;
    }
  | {
      state: "already-completed";
      character: CharacterSummary;
    };

export type AdventureResetResult =
  | { state: "reset"; periodToken: string }
  | { state: "rerolled"; periodToken: string }
  | { state: "no-character" }
  | { state: "unavailable" };

export type AdventureClaimRollbackResult =
  | "deleted"
  | "missing"
  | "no-character"
  | "unavailable";

export class AdventureService {
  constructor(
    private readonly characters: CharacterRepository,
    private readonly dailyActions: DailyActionRepository,
    private readonly clock: Clock = systemClock,
    private readonly combatSessions?: Pick<SoloCombatSessionRepository, "findActiveByTelegramUserId">
  ) {}

  async getAdventureOfferForTelegramUser(telegramUserId: bigint): Promise<AdventureLookupResult> {
    const context = await this.getAdventureContext(telegramUserId);

    if (context.state !== "ready") {
      return context;
    }

    return {
      state: "ready",
      character: context.character,
      offer: context.offer
    };
  }

  async selectAdventureProblem(
    telegramUserId: bigint,
    input: { periodToken: string; problemId: AdventureProblemId }
  ): Promise<AdventureProblemResult> {
    const context = await this.getAdventureContext(telegramUserId);

    if (context.state !== "ready") {
      return context;
    }

    if (input.periodToken !== context.offer.periodToken) {
      return {
        state: "stale",
        character: context.character,
        offer: context.offer
      };
    }

    const choice = context.offer.choices.find((candidate) => candidate.id === input.problemId);

    if (!choice) {
      return {
        state: "stale",
        character: context.character,
        offer: context.offer
      };
    }

    return {
      state: "selected",
      character: context.character,
      offer: context.offer,
      choice,
      approaches: buildApproachOptions(context.character)
    };
  }

  async completeAdventureApproach(
    telegramUserId: bigint,
    input: {
      periodToken: string;
      problemId: AdventureProblemId;
      approach: AdventureApproach;
    }
  ): Promise<AdventureResult> {
    const character = await this.characters.findByTelegramUserId(telegramUserId);

    if (!character) {
      return { state: "no-character" };
    }

    const characterSummary = summarizeCharacter(character);

    if (!meetsActivityLevel(characterSummary.level, ADVENTURE_CHOICE_MIN_LEVEL)) {
      return {
        state: "level-locked",
        character: characterSummary,
        requiredLevel: ADVENTURE_CHOICE_MIN_LEVEL
      };
    }

    const activeFight = await this.findLiveActiveFight(telegramUserId);

    if (activeFight) {
      return {
        state: "active-fight",
        character: characterSummary,
        session: activeFight
      };
    }

    const period = buildAdventurePeriod(this.clock());
    const existing = await this.dailyActions.findForTelegramUser(telegramUserId, {
      key: ADVENTURE_CHOICE_KEY,
      localDate: period.storageKey
    });

    if (existing) {
      return {
        state: "already-completed",
        character: characterSummary
      };
    }

    const rerollIndex = await this.getAdventureRerollIndex(telegramUserId, period);
    const offer = buildAdventureOffer(toAdventureOfferProfile(character.id, characterSummary), period, {
      rerollIndex
    });

    if (input.periodToken !== offer.periodToken) {
      return {
        state: "stale",
        character: characterSummary,
        offer
      };
    }

    const choice = offer.choices.find((candidate) => candidate.id === input.problemId);

    if (!choice) {
      return {
        state: "stale",
        character: characterSummary,
        offer
      };
    }

    const approach = buildApproachOptions(characterSummary).find(
      (candidate) => candidate.id === input.approach
    );

    if (!approach) {
      return {
        state: "stale",
        character: characterSummary,
        offer
      };
    }

    const complication = hasComplication({
      characterId: character.id,
      localDate: period.storageKey,
      problemId: choice.id,
      approach: approach.id,
      chance: approach.complicationChance
    });
    const reward = complication ? { xp: 0, gold: 0 } : approach.reward;
    const claim = await this.dailyActions.claimForTelegramUser(telegramUserId, {
      key: ADVENTURE_CHOICE_KEY,
      localDate: period.storageKey,
      rewardXp: reward.xp,
      rewardGold: reward.gold,
      itemGrants: []
    });

    if (!claim) {
      return { state: "no-character" };
    }

    if (claim.state === "existing") {
      return {
        state: "already-completed",
        character: summarizeCharacter(claim.character)
      };
    }

    return {
      state: "completed",
      character: summarizeCharacter(claim.character),
      choice,
      approach,
      reward: {
        ...reward,
        localDate: period.storageKey,
        itemGrants: enrichRewardItemGrants(claim.itemGrants)
      },
      levelChange: claim.levelChange,
      complication
    };
  }

  async getMimicShawarmaForTelegramUser(
    telegramUserId: bigint
  ): Promise<MimicShawarmaLookupResult> {
    const localDate = toIsoDate(this.clock());
    const character = await this.characters.findByTelegramUserId(telegramUserId);

    if (!character) {
      return { state: "no-character" };
    }

    const characterSummary = summarizeCharacter(character);

    if (!isWithinActivityMaxLevel(characterSummary.level, STARTER_ACTIVITY_MAX_LEVEL)) {
      return {
        state: "level-retired",
        character: characterSummary,
        maxLevel: STARTER_ACTIVITY_MAX_LEVEL
      };
    }

    const existingAdventure = await this.dailyActions.findForTelegramUser(telegramUserId, {
      key: MIMIC_SHAWARMA_ADVENTURE_KEY,
      localDate
    });

    if (existingAdventure) {
      const existingFight = await this.dailyActions.findForTelegramUser(telegramUserId, {
        key: MIMIC_SHAWARMA_COMBAT_PROBE_KEY,
        localDate
      });

      return {
        state: "already-completed",
        character: characterSummary,
        fightAvailable: !existingFight
      };
    }

    return {
      state: "ready",
      character: characterSummary
    };
  }

  async completeMimicShawarma(
    telegramUserId: bigint,
    action: MimicShawarmaAction
  ): Promise<MimicShawarmaResult> {
    const localDate = toIsoDate(this.clock());
    const character = await this.characters.findByTelegramUserId(telegramUserId);

    if (!character) {
      return { state: "no-character" };
    }

    const characterSummary = summarizeCharacter(character);

    if (!isWithinActivityMaxLevel(characterSummary.level, STARTER_ACTIVITY_MAX_LEVEL)) {
      return {
        state: "level-retired",
        character: characterSummary,
        maxLevel: STARTER_ACTIVITY_MAX_LEVEL
      };
    }

    const reward = MIMIC_SHAWARMA_REWARDS[action];
    const claim = await this.dailyActions.claimForTelegramUser(telegramUserId, {
      key: MIMIC_SHAWARMA_ADVENTURE_KEY,
      localDate,
      rewardXp: reward.xp,
      rewardGold: reward.gold,
      itemGrants: buildMimicShawarmaItemGrants(action)
    });

    if (!claim) {
      return { state: "no-character" };
    }

    if (claim.state === "existing") {
      return {
        state: "already-completed",
        character: summarizeCharacter(claim.character)
      };
    }

    return {
      state: "completed",
      action,
      character: summarizeCharacter(claim.character),
      reward: {
        ...reward,
        localDate,
        itemGrants: enrichRewardItemGrants(claim.itemGrants)
      },
      levelChange: claim.levelChange
    };
  }

  async resetCurrentPeriodForTelegramUser(
    telegramUserId: bigint
  ): Promise<AdventureResetResult> {
    if (!this.dailyActions.deleteForTelegramUser) {
      return { state: "unavailable" };
    }

    const period = buildAdventurePeriod(this.clock());
    const result = await this.dailyActions.deleteForTelegramUser(telegramUserId, {
      key: ADVENTURE_CHOICE_KEY,
      localDate: period.storageKey
    });

    if (result === "no-character") {
      return { state: "no-character" };
    }

    const rerollIndex = await this.recordAdventureReroll(telegramUserId, period);

    if (rerollIndex === null) {
      return { state: "no-character" };
    }

    return {
      state: result === "deleted" ? "reset" : "rerolled",
      periodToken: buildAdventureOfferToken(period.token, rerollIndex)
    };
  }

  async rollbackCurrentAdventureClaimForTelegramUser(
    telegramUserId: bigint
  ): Promise<AdventureClaimRollbackResult> {
    if (!this.dailyActions.deleteForTelegramUser) {
      return "unavailable";
    }

    const period = buildAdventurePeriod(this.clock());

    return this.dailyActions.deleteForTelegramUser(telegramUserId, {
      key: ADVENTURE_CHOICE_KEY,
      localDate: period.storageKey
    });
  }

  private async getAdventureContext(telegramUserId: bigint): Promise<AdventureLookupResult> {
    const period = buildAdventurePeriod(this.clock());
    const character = await this.characters.findByTelegramUserId(telegramUserId);

    if (!character) {
      return { state: "no-character" };
    }

    const characterSummary = summarizeCharacter(character);

    if (!meetsActivityLevel(characterSummary.level, ADVENTURE_CHOICE_MIN_LEVEL)) {
      return {
        state: "level-locked",
        character: characterSummary,
        requiredLevel: ADVENTURE_CHOICE_MIN_LEVEL
      };
    }

    const activeFight = await this.findLiveActiveFight(telegramUserId);

    if (activeFight) {
      return {
        state: "active-fight",
        character: characterSummary,
        session: activeFight
      };
    }

    const existing = await this.dailyActions.findForTelegramUser(telegramUserId, {
      key: ADVENTURE_CHOICE_KEY,
      localDate: period.storageKey
    });

    if (existing) {
      return {
        state: "already-completed",
        character: characterSummary
      };
    }

    return {
      state: "ready",
      character: characterSummary,
      offer: buildAdventureOffer(toAdventureOfferProfile(character.id, characterSummary), period, {
        rerollIndex: await this.getAdventureRerollIndex(telegramUserId, period)
      })
    };
  }

  private async findLiveActiveFight(
    telegramUserId: bigint
  ): Promise<SoloCombatSessionRecord | null> {
    const session = await this.combatSessions?.findActiveByTelegramUserId(telegramUserId);

    if (!session || session.expiresAt.getTime() <= this.clock().getTime()) {
      return null;
    }

    return session;
  }

  private async getAdventureRerollIndex(
    telegramUserId: bigint,
    period: AdventurePeriod
  ): Promise<number> {
    const count = await this.dailyActions.countForTelegramUser?.(telegramUserId, {
      key: ADVENTURE_CHOICE_REROLL_KEY,
      localDatePrefix: getAdventureRerollStoragePrefix(period)
    });

    return count ?? 0;
  }

  private async recordAdventureReroll(
    telegramUserId: bigint,
    period: AdventurePeriod
  ): Promise<number | null> {
    const currentIndex = await this.getAdventureRerollIndex(telegramUserId, period);
    const nextIndex = currentIndex + 1;
    const claim = await this.dailyActions.claimForTelegramUser(telegramUserId, {
      key: ADVENTURE_CHOICE_REROLL_KEY,
      localDate: buildAdventureRerollStorageKey(period, nextIndex),
      rewardXp: 0,
      rewardGold: 0,
      itemGrants: []
    });

    if (!claim) {
      return null;
    }

    return nextIndex;
  }
}

function buildMimicShawarmaItemGrants(
  action: MimicShawarmaAction
): Array<{ itemId: string; quantity: number }> {
  if (action === "poke") {
    return [
      {
        itemId: SUSPICIOUS_SHAWARMA_WRAPPER_ITEM_ID,
        quantity: 1
      }
    ];
  }

  if (action === "receipt") {
    return [
      {
        itemId: RECEIPT_OF_FORMAL_SUSPICION_ITEM_ID,
        quantity: 1
      }
    ];
  }

  return [];
}

export interface AdventurePeriod {
  token: string;
  storageKey: string;
  localDate: string;
  expiresAt: Date;
}

export function buildAdventurePeriod(now: Date): AdventurePeriod {
  const periodMs = ADVENTURE_CHOICE_PERIOD_MINUTES * 60_000;
  const index = Math.floor(now.getTime() / periodMs);

  return {
    token: index.toString(36),
    storageKey: `p93:${index.toString(36)}`,
    localDate: toIsoDate(now),
    expiresAt: new Date((index + 1) * periodMs)
  };
}

export function buildAdventureOffer(
  character: string | AdventureOfferProfile,
  period: AdventurePeriod | string,
  options: { rerollIndex?: number } = {}
): AdventureOffer {
  const normalized =
    typeof period === "string"
      ? {
          token: period,
          storageKey: period,
          localDate: period,
          expiresAt: new Date(0)
        }
      : period;
  const profile = normalizeAdventureOfferProfile(character);
  const periodToken = buildAdventureOfferToken(normalized.token, options.rerollIndex ?? 0);
  const rng = new SeededRandomSource(`adventure-choice:${profile.id}:${periodToken}`);
  const pool = getAdventureProblemPoolForProfile(profile);
  const personalizedPool = pool.filter((problem) => Boolean(problem.audience));
  const choices: AdventureChoice[] = [];

  if (personalizedPool.length > 0) {
    const index = rng.nextInt(0, personalizedPool.length - 1);
    const choice = personalizedPool[index];

    if (choice) {
      choices.push(choice);
      pool.splice(pool.findIndex((candidate) => candidate.id === choice.id), 1);
    }
  }

  while (choices.length < ADVENTURE_CHOICE_COUNT && pool.length > 0) {
    const index = rng.nextInt(0, pool.length - 1);
    const [choice] = pool.splice(index, 1);

    if (choice) {
      choices.push(choice);
    }
  }

  shuffleAdventureChoices(choices, rng);

  return {
    localDate: normalized.localDate,
    periodToken,
    expiresAt: normalized.expiresAt,
    choices
  };
}

function buildAdventureOfferToken(periodToken: string, rerollIndex: number): string {
  if (rerollIndex <= 0) {
    return periodToken;
  }

  const suffix = `r${rerollIndex.toString(36)}`;
  const maxBaseLength = Math.max(1, 10 - suffix.length);

  return `${periodToken.slice(0, maxBaseLength)}${suffix}`;
}

function getAdventureRerollStoragePrefix(period: AdventurePeriod): string {
  return `${period.storageKey}:reroll:`;
}

function buildAdventureRerollStorageKey(period: AdventurePeriod, rerollIndex: number): string {
  return `${getAdventureRerollStoragePrefix(period)}${rerollIndex.toString(36)}`;
}

export function getAdventureProblemPoolForProfile(
  profile?: Pick<AdventureOfferProfile, "raceId" | "classId" | "title">
): AdventureProblem[] {
  return ADVENTURE_PROBLEMS.filter((problem) => matchesAdventureProblemAudience(problem, profile));
}

export function getAdventureProblemIcon(problemId: AdventureProblemId): string {
  if (problemId.startsWith("race-")) {
    return "🧬";
  }

  if (problemId.startsWith("class-")) {
    return "🎭";
  }

  if (problemId.startsWith("title-")) {
    return "🏷️";
  }

  if (GENERAL_ADVENTURE_PROBLEM_IDS.includes(problemId as GeneralAdventureProblemId)) {
    return ADVENTURE_PROBLEM_ICONS[problemId as GeneralAdventureProblemId];
  }

  return "🪧";
}

function normalizeAdventureOfferProfile(character: string | AdventureOfferProfile): AdventureOfferProfile {
  return typeof character === "string" ? { id: character } : character;
}

function toAdventureOfferProfile(
  characterId: string,
  character: CharacterSummary
): AdventureOfferProfile {
  return {
    id: characterId,
    raceId: character.raceId,
    classId: character.classId,
    title: character.title
  };
}

function matchesAdventureProblemAudience(
  problem: AdventureProblem,
  profile?: Pick<AdventureOfferProfile, "raceId" | "classId" | "title">
): boolean {
  if (!problem.audience) {
    return true;
  }

  if (problem.audience.raceId && profile?.raceId !== problem.audience.raceId) {
    return false;
  }

  if (problem.audience.classId && profile?.classId !== problem.audience.classId) {
    return false;
  }

  if (problem.audience.title && profile?.title !== problem.audience.title) {
    return false;
  }

  return true;
}

function shuffleAdventureChoices(choices: AdventureChoice[], rng: SeededRandomSource): void {
  for (let index = choices.length - 1; index > 0; index -= 1) {
    const swapIndex = rng.nextInt(0, index);
    const current = choices[index];
    const swap = choices[swapIndex];

    if (current && swap) {
      choices[index] = swap;
      choices[swapIndex] = current;
    }
  }
}

export function buildApproachOptions(character: CharacterSummary): AdventureApproachOption[] {
  return [
    {
      id: "safe",
      label: "🛡️ Обережно розібратись",
      hint: "менше винагороди, майже без драматичних зубів.",
      reward: {
        xp: 4,
        gold: 2
      },
      complicationChance: 13
    },
    {
      id: "flair",
      label: getFlairApproachLabel(character),
      hint: "середня винагорода, шанс ускладнення теж вивчив середину.",
      reward: {
        xp: 7,
        gold: 4
      },
      complicationChance: 23
    },
    {
      id: "risky",
      label: "🔥 Зробити красиво й небезпечно",
      hint: "більша винагорода, але проблема може образитись у відповідь.",
      reward: {
        xp: 10,
        gold: 7
      },
      complicationChance: 42
    }
  ];
}

function hasComplication(input: {
  characterId: string;
  localDate: string;
  problemId: AdventureProblemId;
  approach: AdventureApproach;
  chance: number;
}): boolean {
  const rng = new SeededRandomSource(
    `adventure-complication:${input.characterId}:${input.localDate}:${input.problemId}:${input.approach}`
  );

  return rng.nextInt(1, 100) <= input.chance;
}

function getFlairApproachLabel(character: CharacterSummary): string {
  switch (character.classId) {
    case "class.bureaucramancer":
      return "📋 Оформити форму 23-Б";
    case "class.mage":
      return "✨ Пояснити це мітологією";
    case "class.bard":
      return "🎵 Переспівати проблему";
    case "class.rogue":
      return "🗝️ Домовитись із тінню";
    case "class.priest":
      return "🕯️ Суворо благословити";
    case "class.varenyk-mancer":
      return "🥟 Замісити аргумент";
    case "class.ranger":
      return "🏹 Взяти слід із підлоги";
    case "class.kharakternyk":
      return "🌾 Подивитись характерно";
    default:
      return "🧠 Знайти хитрий кут";
  }
}

const ADVENTURE_PROBLEM_ICONS = {
  stew: "🍲",
  barrel: "🛢️",
  helmet: "🪖",
  calendar: "🗓️",
  receipt: "🧾",
  bench: "🪑",
  cloak: "🧥",
  spoon: "🥄",
  mirror: "🪞",
  boots: "🥾",
  chimney: "🏚️",
  candle: "🕯️",
  chair: "💺",
  broom: "🧹",
  door: "🚪",
  map: "🗺️",
  teapot: "🫖",
  menu: "📜",
  sign: "🪧",
  portrait: "🖼️",
  key: "🗝️",
  ledger: "📒",
  rug: "🧶",
  bell: "🔔"
} satisfies Record<GeneralAdventureProblemId, string>;

const GENERAL_ADVENTURE_PROBLEMS = [
  {
    id: "stew",
    title: "Казанок репетирує оперу",
    hook: "Юшка на кухні взяла високу ноту й відмовляється бути першою стравою без райдера.",
    client: "Кухар із ложкою, яка вже бачила забагато"
  },
  {
    id: "barrel",
    title: "Бочка вимагає орендну угоду",
    hook: "На бочці зʼявився папірець: «Тут живе поважна порожнеча». Корчмар нервово рахує кухлі.",
    client: "Корчмар, який не довіряє меблям із амбіціями"
  },
  {
    id: "helmet",
    title: "Шолом памʼятає чужу славу",
    hook: "Старий шолом сам став на стіл і просить овацій за подвиги, яких ніхто не замовляв.",
    client: "Зброяр, що присягався: «він учора мовчав»"
  },
  {
    id: "calendar",
    title: "Календар загубив четвер",
    hook: "Настінний календар показує одразу три пʼятниці й одну дуже підозрілу середу.",
    client: "Писар із синцем від дедлайну"
  },
  {
    id: "receipt",
    title: "Чек відкрив малий портал",
    hook: "Зі складеного чека тягне протягом, дрібним золотом і голосом «підпишіть тут».",
    client: "Бюрокромант-практикант без права на паніку"
  },
  {
    id: "bench",
    title: "Лава пророкує незручно",
    hook: "Кожен, хто сідає, чує пророцтво про власну поставу й дуже конкретні шкарпетки.",
    client: "Троє відвідувачів, які тепер стоять принципово"
  },
  {
    id: "cloak",
    title: "Плащ став у чергу замість власника",
    hook: "Плащ тримає місце біля шинку, чемно штовхається й просить називати його паном.",
    client: "Власник плаща, тимчасово без драматичного виходу"
  },
  {
    id: "spoon",
    title: "Ложка скликає малу раду",
    hook: "Столові прибори обрали спікера й хочуть затвердити порядок денний до вечері.",
    client: "Домовикова полиця, яка не підписувалась на політику"
  },
  {
    id: "mirror",
    title: "Дзеркало вимагає контраргумент",
    hook: "Дзеркало показує кожному відвідувачу не відбиття, а його найгіршу позу для геройського портрета.",
    client: "Бард, який побачив себе без драматичного світла"
  },
  {
    id: "boots",
    title: "Чоботи пішли без власника",
    hook: "Пара чобіт крокує корчмою й дуже впевнено просить записати її на експедицію.",
    client: "Пригодник у шкарпетках і з пораненою гідністю"
  },
  {
    id: "chimney",
    title: "Комин видає службові довідки",
    hook: "З комина падає сажа з печатками, підписами й підозрою, що дим теж проходив стажування.",
    client: "Кухар, який не замовляв бюрократію у вентиляції"
  },
  {
    id: "candle",
    title: "Свічка відмовляється світити без контракту",
    hook: "Свічка горить тільки тоді, коли їй аплодують. У темряві вже формується профспілка тіней.",
    client: "Корчмар із запасом сірників і нестачею терпіння"
  },
  {
    id: "chair",
    title: "Стілець оголосив себе троном",
    hook: "Стілець не дає нікому сісти без церемонії, титулу й короткої присяги не скрипіти.",
    client: "Відвідувач, який уже вклонявся меблям і хоче забути"
  },
  {
    id: "broom",
    title: "Мітла прибирає докази",
    hook: "Мітла замітає під килим не пил, а свідчення, рахунки й одну дуже нервову варену картоплю.",
    client: "Домовик, який визнає тільки чесний безлад"
  },
  {
    id: "door",
    title: "Двері беруть плату за вихід",
    hook: "Двері відчиняються всередину, назовні й у бік філософського диспуту, але тільки після чайових.",
    client: "Троє гостей, що формально вже пішли"
  },
  {
    id: "map",
    title: "Мапа малює корчму як континент",
    hook: "На мапі зʼявилися гори з тарілок, море підливи й позначка «тут герой послизнувся».",
    client: "Єгер, який не визнає географію столу"
  },
  {
    id: "teapot",
    title: "Чайник шепоче стратегічні поради",
    hook: "Чайник свистить так, ніби знає план облоги, але кожна порада закінчується словом «кипʼятити».",
    client: "Маг, якого переграв посуд"
  },
  {
    id: "menu",
    title: "Меню переписало ціни на емоції",
    hook: "У меню зʼявилися позиції «легка тривога», «середня слава» і «компот із наслідками».",
    client: "Печатник, що клянеться: шрифт був невинний"
  },
  {
    id: "sign",
    title: "Вивіска просить вихідний",
    hook: "Вивіска «Корчма» нахилилась і тепер читається як «Кормча». Риба вже ставить питання.",
    client: "Корчмар, який не хоче міняти бізнес-модель"
  },
  {
    id: "portrait",
    title: "Портрет підморгує не тим людям",
    hook: "Портрет попереднього героя підморгує гостям, а потім робить вигляд, що це історична реконструкція.",
    client: "Історик, який просить менше живої історії"
  },
  {
    id: "key",
    title: "Ключ забув, що він відкриває",
    hook: "Ключ підходить до всіх замків, окрім потрібного, і дуже пишається широтою інтересів.",
    client: "Комірник із зачиненою коміркою й відкритими питаннями"
  },
  {
    id: "ledger",
    title: "Журнал образився на арифметику",
    hook: "Журнал рахує борги у римах, а підсумок щоразу виходить «корчмар правий».",
    client: "Писар, якому потрібна тиша й менше літератури"
  },
  {
    id: "rug",
    title: "Килим проковтнув важливий слід",
    hook: "Килим лежить надто рівно для предмета, який щойно зʼїв слід, монету й чужу впевненість.",
    client: "Єгер, що не любить текстильних алібі"
  },
  {
    id: "bell",
    title: "Дзвінок викликає не того",
    hook: "Кожен дзвінок кличе або офіціянта, або дрібну проблему з блокнотом. Відрізнити важко.",
    client: "Офіціянт, який просить не дзвонити в реальність"
  }
] as const satisfies AdventureProblem[];

interface AdventureNameForms {
  genitive: string;
}

const ADVENTURE_RACE_GENITIVE_NAMES: Record<string, string> = {
  "race.human-ish": "Людиська",
  "race.dwarf": "Гнома",
  "race.elf": "Ельфа",
  "race.bisyny": "Бісин",
  "race.drantohor": "Дрантогора",
  "race.domovyk": "Домовика",
  "race.dryland-rusalka": "Русалки сухопутної",
  "race.intellectual-orc": "Орка-інтелігента",
  "race.molfar-soul": "Мольфарської душі"
};

const ADVENTURE_CLASS_GENITIVE_NAMES: Record<string, string> = {
  "class.warrior": "Воїна",
  "class.mage": "Мага",
  "class.bard": "Барда",
  "class.rogue": "Злодія",
  "class.priest": "Жерця",
  "class.varenyk-mancer": "Вареник-манта",
  "class.bureaucramancer": "Бюрокроманта",
  "class.ranger": "Єгеря",
  "class.kharakternyk": "Козака-характерника"
};

const RACE_ADVENTURE_TEMPLATES = [
  {
    suffix: "survey",
    title: (race: AdventureNameForms) => `Анкета раси «${race.genitive}» втекла з графи`,
    hook: (race: AdventureNameForms) =>
      `У реєстрі біля «${race.genitive}» зʼявився підпис: «не вмістилось, пішло думати». Корчмар просить повернути папір, поки він не отримав громадянство.`,
    client: "Писар, який тримає чорнило обома руками"
  },
  {
    suffix: "mug",
    title: (race: AdventureNameForms) => `Кухоль для «${race.genitive}» не проходить інструктаж`,
    hook: (race: AdventureNameForms) =>
      `Особливий кухоль для гостей раси «${race.genitive}» вимагає окремого звертання, підставку й маленьку церемонію наливу.`,
    client: "Корчмар, який уже шкодує про персоналізацію"
  },
  {
    suffix: "portrait",
    title: (race: AdventureNameForms) => `Портрет раси «${race.genitive}» сперечається з рамою`,
    hook: (race: AdventureNameForms) =>
      `Портрет у кутку наполягає, що «${race.genitive}» треба малювати героїчніше, а рама каже, що в неї теж є межі.`,
    client: "Маляр із пензлем і дипломатичною втомою"
  }
] as const;

const CLASS_ADVENTURE_TEMPLATES = [
  {
    suffix: "manual",
    title: (characterClass: AdventureNameForms) => `Підручник для «${characterClass.genitive}» почав практику`,
    hook: (characterClass: AdventureNameForms) =>
      `Підручник для «${characterClass.genitive}» відкрився сам і тепер оцінює відвідувачів за шкалою від «ще живий» до «потребує додатку».`,
    client: "Учень, який хотів лише закладку"
  },
  {
    suffix: "uniform",
    title: (characterClass: AdventureNameForms) => `Форма для «${characterClass.genitive}» не влазить у клітинку`,
    hook: (characterClass: AdventureNameForms) =>
      `У бланку професій для «${characterClass.genitive}» лишилася надто мала клітинка. Клітинка вже подала скаргу на розширення обовʼязків.`,
    client: "Канцелярія персонажів із лінійкою напереваги"
  },
  {
    suffix: "exam",
    title: (characterClass: AdventureNameForms) => `Іспит для «${characterClass.genitive}» здає викладача`,
    hook: (characterClass: AdventureNameForms) =>
      `Тест для «${characterClass.genitive}» так довго чекав героя, що сам почав ставити питання викладачеві й вимагати перездачу.`,
    client: "Наставник, який не готувався до взаємності"
  }
] as const;

function buildRaceAdventureProblems(): AdventureProblem[] {
  return activeRaces.flatMap((race) =>
    RACE_ADVENTURE_TEMPLATES.map((template) => ({
      id: `race-${raceIdToKey(race.id)}-${template.suffix}`,
      title: template.title(getAdventureRaceNameForms(race.id, race.name)),
      hook: template.hook(getAdventureRaceNameForms(race.id, race.name)),
      client: template.client,
      audience: {
        raceId: race.id
      }
    }))
  );
}

function buildClassAdventureProblems(): AdventureProblem[] {
  return classes.flatMap((characterClass) =>
    CLASS_ADVENTURE_TEMPLATES.map((template) => ({
      id: `class-${classIdToKey(characterClass.id)}-${template.suffix}`,
      title: template.title(getAdventureClassNameForms(characterClass.id, characterClass.name)),
      hook: template.hook(getAdventureClassNameForms(characterClass.id, characterClass.name)),
      client: template.client,
      audience: {
        classId: characterClass.id
      }
    }))
  );
}

function buildTitleAdventureProblems(): AdventureProblem[] {
  return getKnownComboTitleValues().map((title, index) => ({
    id: `title-${index.toString(36)}`,
    title: "Титул просить окрему чергу",
    hook: `Ваш титул «${title}» записали у журнал дрібних справ. Журнал тепер ходить корчмою й питає, чи слава має печатку.`,
    client: "Сусідній стіл, якому заважає чужа репутація",
    audience: {
      title
    }
  }));
}

function getAdventureRaceNameForms(raceId: string, raceName: string): AdventureNameForms {
  return {
    genitive: ADVENTURE_RACE_GENITIVE_NAMES[raceId] ?? raceName
  };
}

function getAdventureClassNameForms(classId: string, className: string): AdventureNameForms {
  return {
    genitive: ADVENTURE_CLASS_GENITIVE_NAMES[classId] ?? className
  };
}

const ADVENTURE_PROBLEMS = [
  ...GENERAL_ADVENTURE_PROBLEMS,
  ...buildRaceAdventureProblems(),
  ...buildClassAdventureProblems(),
  ...buildTitleAdventureProblems()
] satisfies AdventureProblem[];

export const ADVENTURE_PROBLEM_IDS = ADVENTURE_PROBLEMS.map((problem) => problem.id);
