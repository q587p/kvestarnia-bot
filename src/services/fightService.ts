import { randomUUID } from "node:crypto";
import { items, monsterLoot } from "../content";
import { monsters } from "../content/monsters";
import type { MonsterContent } from "../content/schema";
import type { LootExpansionSourceId } from "../content/lootExpansionV1";
import type {
  CharacterRecord,
  CharacterRepository
} from "../db/repositories/characterRepository";
import type { DailyActionRepository, RewardLevelChange } from "../db/repositories/dailyActionRepository";
import type {
  SoloCombatSessionRecord,
  SoloCombatSessionRepository
} from "../db/repositories/soloCombatSessionRepository";
import type { EquipmentRepository } from "../db/repositories/equipmentRepository";
import { summarizeCharacter, type CharacterSummary } from "../domain/characters/characterSummary";
import {
  runCombatProbe,
  type CombatProbeAction,
  type CombatProbeResult
} from "../domain/combat/combatProbe";
import {
  deriveMonsterCombatStats,
  expireCombat,
  getCombatSkillProfile,
  resolveCombatTurn,
  startCombat,
  type CombatActionType,
  type CombatActorStats,
  type CombatState
} from "../domain/combat";
import { rollMonsterLoot } from "../domain/loot";
import {
  isWithinActivityMaxLevel,
  STARTER_ACTIVITY_MAX_LEVEL
} from "../domain/progression/activityGates";
import { createEmptyEquipmentEffectSummary } from "../domain/progression/effectiveStats";
import { CryptoRandomSource, type RandomSource } from "../shared/random";
import { systemClock, toIsoDate, type Clock } from "../shared/time";
import { summarizeAndSyncCharacterResources } from "./characterResourceService";
import {
  MIMIC_SHAWARMA_ADVENTURE_KEY,
  MIMIC_SHAWARMA_COMBAT_PROBE_KEY,
  PERSISTENT_SOLO_FIGHT_REWARD_KEY,
  PROBLEM_QUEST_13_ISSUED_KEY,
  PROBLEM_QUEST_13_REWARD_KEY,
  PROBLEM_QUEST_23_ISSUED_KEY,
  PROBLEM_QUEST_23_REWARD_KEY,
  PROBLEM_QUEST_42_ISSUED_KEY,
  PROBLEM_QUEST_42_REWARD_KEY,
  PROBLEM_QUEST_93_ISSUED_KEY,
  PROBLEM_QUEST_93_REWARD_KEY
} from "./dailyActionKeys";
import {
  isTrainingDoppelgangerMonsterId,
  TRAINING_DOPPELGANGER_MONSTER_ID
} from "../domain/trainingDoppelganger";
import {
  APOPHENIA_RECEIPT_OF_TWENTY_THREE_ITEM_ID,
  BADGE_OF_THIRTEEN_SMALL_PROBLEMS_ITEM_ID,
  enrichRewardItemGrants,
  PAN_OF_PERSUASION_ITEM_ID,
  POSTER_OF_NINETY_THREE_PROBLEM_WILLS_ITEM_ID,
  RECEIPT_OF_FORMAL_SUSPICION_ITEM_ID,
  starterEquipmentGrant,
  STAMP_OF_MINOR_AUTHORITY_ITEM_ID,
  SUSPICIOUS_SHAWARMA_WRAPPER_ITEM_ID,
  TOWEL_OF_FORTY_TWO_ANSWERS_ITEM_ID,
  type RewardItemGrant
} from "./itemGrant";
import { getEquippedItemContents } from "./equipmentService";

export { MIMIC_SHAWARMA_COMBAT_PROBE_KEY } from "./dailyActionKeys";
export { PERSISTENT_SOLO_FIGHT_REWARD_KEY } from "./dailyActionKeys";
export type FightAction = CombatProbeAction;

export const MIMIC_SHAWARMA_COMBAT_REWARDS = {
  attack: {
    xp: 9,
    gold: 3
  },
  receipt: {
    xp: 7,
    gold: 5
  },
  flee: {
    xp: 3,
    gold: 0
  }
} satisfies Record<FightAction, { xp: number; gold: number }>;

export const THIRTEEN_SMALL_PROBLEMS_QUEST_KEY = PROBLEM_QUEST_13_REWARD_KEY;
export const THIRTEEN_SMALL_PROBLEMS_QUEST_BUCKET = "once";
export const THIRTEEN_SMALL_PROBLEMS_TARGET_WINS = 13;
export const THIRTEEN_SMALL_PROBLEMS_REWARD = {
  xp: 35,
  gold: 10
};
export const MONSTER_REST_ELIGIBLE_FIGHT_COUNT = 3;
export const MONSTER_REST_COOLDOWN_MS = 3 * 60 * 1000;

export type ProblemQuestStageId = "13" | "23" | "42" | "93";

export interface ProblemQuestStage {
  id: ProblemQuestStageId;
  title: string;
  target: number;
  reward: {
    xp: number;
    gold: number;
    itemId: string;
  };
  issueKey: string;
  rewardKey: string;
  nextStageId: ProblemQuestStageId | null;
}

export const PROBLEM_QUEST_STAGES: ProblemQuestStage[] = [
  {
    id: "13",
    title: "Тринадцять дрібних проблем",
    target: THIRTEEN_SMALL_PROBLEMS_TARGET_WINS,
    reward: {
      ...THIRTEEN_SMALL_PROBLEMS_REWARD,
      itemId: BADGE_OF_THIRTEEN_SMALL_PROBLEMS_ITEM_ID
    },
    issueKey: PROBLEM_QUEST_13_ISSUED_KEY,
    rewardKey: PROBLEM_QUEST_13_REWARD_KEY,
    nextStageId: "23"
  },
  {
    id: "23",
    title: "Двадцять три підозрілі проблеми",
    target: 23,
    reward: {
      xp: 55,
      gold: 18,
      itemId: APOPHENIA_RECEIPT_OF_TWENTY_THREE_ITEM_ID
    },
    issueKey: PROBLEM_QUEST_23_ISSUED_KEY,
    rewardKey: PROBLEM_QUEST_23_REWARD_KEY,
    nextStageId: "42"
  },
  {
    id: "42",
    title: "Сорок дві відповіді на проблеми",
    target: 42,
    reward: {
      xp: 90,
      gold: 30,
      itemId: TOWEL_OF_FORTY_TWO_ANSWERS_ITEM_ID
    },
    issueKey: PROBLEM_QUEST_42_ISSUED_KEY,
    rewardKey: PROBLEM_QUEST_42_REWARD_KEY,
    nextStageId: "93"
  },
  {
    id: "93",
    title: "Девʼяносто три волі до проблем",
    target: 93,
    reward: {
      xp: 140,
      gold: 45,
      itemId: POSTER_OF_NINETY_THREE_PROBLEM_WILLS_ITEM_ID
    },
    issueKey: PROBLEM_QUEST_93_ISSUED_KEY,
    rewardKey: PROBLEM_QUEST_93_REWARD_KEY,
    nextStageId: null
  }
];

export const PROBLEM_QUEST_BUCKET = "once";

export interface ProblemQuestProgress {
  stageId: ProblemQuestStageId;
  title: string;
  wins: number;
  target: number;
  completed: boolean;
  rewardClaimed: boolean;
  issued: boolean;
  branchComplete: boolean;
}

export interface ProblemQuestTurnInResult {
  state: "claimed" | "already-claimed";
  stage: ProblemQuestStage;
  reward: FightReward;
  levelChange: RewardLevelChange | null;
  nextStage: ProblemQuestStage | null;
  nextStageAvailable: boolean;
  branchComplete: boolean;
}

export type ThirteenSmallProblemsProgress = ProblemQuestProgress;
export type ThirteenSmallProblemsReward = ProblemQuestTurnInResult;

export interface PersistentFightReward {
  state: "claimed" | "replayed" | "already-claimed";
  reward: FightReward;
  levelChange: RewardLevelChange | null;
  itemReplayUnavailable?: boolean;
}

export type ProblemQuestTurnInLookupResult =
  | { state: "no-character" }
  | { state: "not-ready"; character: CharacterSummary; progress: ProblemQuestProgress }
  | { state: "branch-complete"; character: CharacterSummary; progress: ProblemQuestProgress }
  | {
      state: "turned-in";
      character: CharacterSummary;
      progress: ProblemQuestProgress;
      result: ProblemQuestTurnInResult;
    };

export type ProblemQuestIssueNextLookupResult =
  | { state: "no-character" }
  | { state: "not-available"; character: CharacterSummary; progress: ProblemQuestProgress }
  | { state: "branch-complete"; character: CharacterSummary; progress: ProblemQuestProgress }
  | {
      state: "issued";
      character: CharacterSummary;
      progress: ProblemQuestProgress;
      stage: ProblemQuestStage;
      nextStage: ProblemQuestStage;
      issued: "created" | "already-issued";
    };

export type ProblemQuestProgressLookupResult =
  | { state: "no-character" }
  | {
      state: "ready";
      character: CharacterSummary;
      progress: ProblemQuestProgress;
      archive: ProblemQuestProgress[];
    };

export type FightLookupResult =
  | { state: "no-character" }
  | { state: "level-retired"; character: CharacterSummary; maxLevel: number }
  | { state: "needs-rest"; character: CharacterSummary }
  | {
      state: "persistent-not-issued";
      character: CharacterSummary;
      questProgress: ThirteenSmallProblemsProgress;
    }
  | {
      state: "persistent-ready";
      character: CharacterSummary;
      questProgress: ThirteenSmallProblemsProgress;
    }
  | {
      state: "monster-rest";
      character: CharacterSummary;
      questProgress: ThirteenSmallProblemsProgress;
      availableAt: Date;
      now: Date;
    }
  | {
      state: "persistent-active";
      character: CharacterSummary;
      session: SoloCombatSessionRecord;
      monster: MonsterContent;
      questProgress: ThirteenSmallProblemsProgress;
      started?: boolean;
    }
  | {
      state: "persistent-terminal";
      character: CharacterSummary;
      session: SoloCombatSessionRecord;
      monster: MonsterContent | null;
      questProgress: ThirteenSmallProblemsProgress;
      fightReward: PersistentFightReward | null;
    }
  | {
      state: "training-active";
      character: CharacterSummary;
      session: SoloCombatSessionRecord;
      questProgress: ThirteenSmallProblemsProgress;
    }
  | { state: "ready"; character: CharacterSummary }
  | { state: "already-completed"; character: CharacterSummary; questAvailable: boolean };

export type FightResult =
  | { state: "no-character" }
  | { state: "level-retired"; character: CharacterSummary; maxLevel: number }
  | {
      state: "completed";
      action: FightAction;
      character: CharacterSummary;
      combat: CombatProbeResult;
      reward: FightReward;
      levelChange: RewardLevelChange;
    }
  | {
      state: "already-completed";
      character: CharacterSummary;
      questAvailable: boolean;
    };

export type PersistentFightTurnResult =
  | { state: "no-character" }
  | { state: "not-found"; character: CharacterSummary }
  | {
      state: "stale-turn";
      character: CharacterSummary;
      session: SoloCombatSessionRecord;
      monster: MonsterContent | null;
      questProgress: ThirteenSmallProblemsProgress;
    }
  | {
      state: "not-enough-mana";
      character: CharacterSummary;
      session: SoloCombatSessionRecord;
      monster: MonsterContent;
      questProgress: ThirteenSmallProblemsProgress;
    }
  | {
      state: "updated";
      character: CharacterSummary;
      session: SoloCombatSessionRecord;
      monster: MonsterContent;
      questProgress: ThirteenSmallProblemsProgress;
      fightReward: PersistentFightReward | null;
    }
  | {
      state: "terminal";
      character: CharacterSummary;
      session: SoloCombatSessionRecord;
      monster: MonsterContent | null;
      questProgress: ThirteenSmallProblemsProgress;
      fightReward: PersistentFightReward | null;
    };

export interface FightReward {
  xp: number;
  gold: number;
  localDate: string;
  itemGrants: RewardItemGrant[];
}

export type PersistentFightDifficultyId = "easy" | "normal" | "hard";
export type BattleInterventionKind = "help" | "none" | "hinder";

export interface PersistentFightDifficultyConfig {
  id: PersistentFightDifficultyId;
  interventionKind: BattleInterventionKind;
  levelDelta: -3 | 0 | 2;
  xpMultiplier: number;
  goldMultiplier: number;
  dropChanceMultiplier: number;
  lootPowerOffset: number;
}

export const PERSISTENT_FIGHT_DIFFICULTY_CONFIG = {
  easy: {
    id: "easy",
    interventionKind: "help",
    levelDelta: -3,
    xpMultiplier: 0.75,
    goldMultiplier: 0.85,
    dropChanceMultiplier: 0.65,
    lootPowerOffset: -1
  },
  normal: {
    id: "normal",
    interventionKind: "none",
    levelDelta: 0,
    xpMultiplier: 1,
    goldMultiplier: 1,
    dropChanceMultiplier: 1,
    lootPowerOffset: 0
  },
  hard: {
    id: "hard",
    interventionKind: "hinder",
    levelDelta: 2,
    xpMultiplier: 1.2,
    goldMultiplier: 1.05,
    dropChanceMultiplier: 1.35,
    lootPowerOffset: 1
  }
} as const satisfies Record<PersistentFightDifficultyId, PersistentFightDifficultyConfig>;

export interface PersistentFightStartOptions {
  source?: "normal" | "yeger" | "adventure";
  difficulty?: PersistentFightDifficultyId;
  target?: {
    tagsAny?: string[];
    monsterIds?: string[];
  };
}

export class FightService {
  constructor(
    private readonly characters: CharacterRepository,
    private readonly dailyActions: DailyActionRepository,
    private readonly clock: Clock = systemClock,
    private readonly combatSessions?: SoloCombatSessionRepository,
    private readonly rng: RandomSource = new CryptoRandomSource(),
    private readonly equipment?: EquipmentRepository
  ) {}

  async getOrStartPersistentFightForTelegramUser(
    telegramUserId: bigint,
    options: PersistentFightStartOptions = {}
  ): Promise<FightLookupResult> {
    return this.getFightForTelegramUser(telegramUserId, options);
  }

  async getFightOverviewForTelegramUser(telegramUserId: bigint): Promise<FightLookupResult> {
    const character = await this.characters.findByTelegramUserId(telegramUserId);

    if (!character) {
      return { state: "no-character" };
    }

    const baseSummary = summarizeCharacter(character);

    if (isWithinActivityMaxLevel(baseSummary.level, STARTER_ACTIVITY_MAX_LEVEL)) {
      return this.getMimicShawarmaForTelegramUser(telegramUserId);
    }

    if (!this.combatSessions) {
      const characterSummary = await this.summarizeCharacterWithEquipment(telegramUserId, character);

      return {
        state: "level-retired",
        character: characterSummary,
        maxLevel: STARTER_ACTIVITY_MAX_LEVEL
      };
    }

    const questProgress = await this.getThirteenSmallProblemsProgress(telegramUserId);
    const activeSession = await this.combatSessions.findActiveByTelegramUserId(telegramUserId);
    const characterSummary = await this.summarizeCharacterWithEquipment(telegramUserId, character, {
      syncResources: !activeSession
    });

    if (!activeSession) {
      if (!questProgress.issued) {
        return {
          state: "persistent-not-issued",
          character: characterSummary,
          questProgress
        };
      }

      const rest = await this.getMonsterRestCooldown(telegramUserId, "normal");
      if (rest) {
        return {
          state: "monster-rest",
          character: characterSummary,
          questProgress,
          ...rest
        };
      }

      return {
        state: "persistent-ready",
        character: characterSummary,
        questProgress
      };
    }

    if (isTrainingDoppelgangerMonsterId(activeSession.monsterId)) {
      return {
        state: "training-active",
        character: characterSummary,
        session: activeSession,
        questProgress
      };
    }

    if (!activeSession.state) {
      const expiredSession = await this.combatSessions.markStatusById(activeSession.id, "expired");
      const fallbackSession = expiredSession ?? activeSession;
      const monster = findPersistentFightMonster(fallbackSession);

      return {
        state: "persistent-terminal",
        character: characterSummary,
        session: fallbackSession,
        monster,
        questProgress,
        fightReward: await this.getOrRecoverPersistentFightReward(
          telegramUserId,
          fallbackSession,
          monster,
          characterSummary
        )
      };
    }

    if (isExpired(activeSession, this.clock())) {
      const expiredState = expireCombat(activeSession.state);
      const expiredSession = await this.combatSessions.updateById(activeSession.id, {
        state: expiredState,
        status: expiredState.status
      });
      await this.persistCharacterResourcesFromSession(telegramUserId, expiredSession ?? activeSession);
      const fallbackSession = expiredSession ?? activeSession;
      const monster = findPersistentFightMonster(fallbackSession);

      return {
        state: "persistent-terminal",
        character: characterSummary,
        session: expiredSession ?? { ...activeSession, state: expiredState, status: "expired" },
        monster,
        questProgress,
        fightReward: await this.getOrRecoverPersistentFightReward(
          telegramUserId,
          fallbackSession,
          monster,
          characterSummary
        )
      };
    }

    const monster = findPersistentFightMonster(activeSession);

    if (!monster || activeSession.state.status !== "active") {
      const expiredState =
        activeSession.state.status === "active" ? expireCombat(activeSession.state) : activeSession.state;
      const expiredSession = await this.combatSessions.updateById(activeSession.id, {
        state: expiredState,
        status: expiredState.status
      });
      await this.persistCharacterResourcesFromSession(telegramUserId, expiredSession ?? activeSession);

      return {
        state: "persistent-terminal",
        character: characterSummary,
        session: expiredSession ?? { ...activeSession, state: expiredState, status: expiredState.status },
        monster,
        questProgress,
        fightReward: await this.getOrRecoverPersistentFightReward(
          telegramUserId,
          expiredSession ?? activeSession,
          monster,
          characterSummary
        )
      };
    }

    return {
      state: "persistent-active",
      character: characterSummary,
      session: activeSession,
      monster,
      questProgress
    };
  }

  async getProblemQuestProgressForTelegramUser(
    telegramUserId: bigint
  ): Promise<ProblemQuestProgressLookupResult> {
    const character = await this.characters.findByTelegramUserId(telegramUserId);

    if (!character) {
      return { state: "no-character" };
    }

    const progress = await this.getThirteenSmallProblemsProgress(telegramUserId);

    return {
      state: "ready",
      character: await this.summarizeCharacterWithEquipment(telegramUserId, character),
      progress,
      archive: await this.getProblemQuestArchiveProgress(telegramUserId, progress)
    };
  }

  async getFightForTelegramUser(
    telegramUserId: bigint,
    options: PersistentFightStartOptions = {}
  ): Promise<FightLookupResult> {
    const character = await this.characters.findByTelegramUserId(telegramUserId);

    if (!character) {
      return { state: "no-character" };
    }

    const baseSummary = summarizeCharacter(character);

    if (isWithinActivityMaxLevel(baseSummary.level, STARTER_ACTIVITY_MAX_LEVEL)) {
      return this.getMimicShawarmaForTelegramUser(telegramUserId);
    }

    if (!this.combatSessions) {
      const characterSummary = await this.summarizeCharacterWithEquipment(telegramUserId, character);

      return {
        state: "level-retired",
        character: characterSummary,
        maxLevel: STARTER_ACTIVITY_MAX_LEVEL
      };
    }

    const questProgress = await this.getThirteenSmallProblemsProgress(telegramUserId);
    const activeSession = await this.combatSessions.findActiveByTelegramUserId(telegramUserId);

    if (activeSession) {
      const characterSummary = await this.summarizeCharacterWithEquipment(telegramUserId, character, {
        syncResources: false
      });

      if (isTrainingDoppelgangerMonsterId(activeSession.monsterId)) {
        return {
          state: "training-active",
          character: characterSummary,
          session: activeSession,
          questProgress
        };
      }

      if (!activeSession.state) {
        await this.combatSessions.markStatusById(activeSession.id, "expired");
      } else if (isExpired(activeSession, this.clock())) {
        const expiredState = expireCombat(activeSession.state);
        const expiredSession = await this.combatSessions.updateById(activeSession.id, {
          state: expiredState,
          status: expiredState.status
        });
        await this.persistCharacterResourcesFromSession(telegramUserId, expiredSession ?? activeSession);
        const fallbackSession = expiredSession ?? activeSession;
        const monster = findPersistentFightMonster(fallbackSession);

        return {
          state: "persistent-terminal",
          character: characterSummary,
          session: expiredSession ?? { ...activeSession, state: expiredState, status: "expired" },
          monster,
          questProgress,
          fightReward: await this.getOrRecoverPersistentFightReward(
            telegramUserId,
            fallbackSession,
            monster,
            characterSummary
          )
        };
      } else {
        const monster = findPersistentFightMonster(activeSession);

        if (!monster) {
          const expiredState = expireCombat(activeSession.state);
          const expiredSession = await this.combatSessions.updateById(activeSession.id, {
            state: expiredState,
            status: expiredState.status
          });
          await this.persistCharacterResourcesFromSession(telegramUserId, expiredSession ?? activeSession);

          return {
            state: "persistent-terminal",
            character: characterSummary,
            session: expiredSession ?? { ...activeSession, state: expiredState, status: "expired" },
            monster: null,
            questProgress,
            fightReward: await this.getOrRecoverPersistentFightReward(
              telegramUserId,
              expiredSession ?? activeSession,
              null,
              characterSummary
            )
          };
        }

        if (activeSession.state.status !== "active") {
          return {
            state: "persistent-terminal",
            character: characterSummary,
            session: activeSession,
            monster,
            questProgress,
            fightReward: await this.getOrRecoverPersistentFightReward(
              telegramUserId,
              activeSession,
              monster,
              characterSummary
            )
          };
        }

        return {
          state: "persistent-active",
          character: characterSummary,
          session: activeSession,
          monster,
          questProgress
        };
      }
    }

    const characterSummary = await this.summarizeCharacterWithEquipment(telegramUserId, character, {
      syncResources: true
    });

    if (characterSummary.hpCurrent <= 0) {
      return {
        state: "needs-rest",
        character: characterSummary
      };
    }

    if (!questProgress.issued && options.source !== "adventure") {
      return {
        state: "persistent-not-issued",
        character: characterSummary,
        questProgress
      };
    }

    const monsterRest = await this.getMonsterRestCooldown(telegramUserId, options.source ?? "normal");
    if (monsterRest) {
      return {
        state: "monster-rest",
        character: characterSummary,
        questProgress,
        ...monsterRest
      };
    }

    const difficulty = options.target
      ? PERSISTENT_FIGHT_DIFFICULTY_CONFIG.normal
      : getPersistentFightDifficultyConfig(options.difficulty);
    const baseMonster = options.target
      ? selectTargetedSoloFightMonster(characterSummary, this.rng, options.target)
      : selectSoloFightMonster(characterSummary, this.rng);
    const monster = applyPersistentFightDifficulty(baseMonster, characterSummary, difficulty);
    const sessionId = randomUUID();
    const state = startCombat({
      id: sessionId,
      hero: buildHeroCombatStats(characterSummary),
      monster: deriveMonsterCombatStats(monster)
    });
    state.source = options.source ?? "normal";
    state.monster.debugTrace = buildPersistentFightInterventionTrace(
      baseMonster,
      monster,
      difficulty
    );
    const session = await this.combatSessions.createForTelegramUser(telegramUserId, {
      id: sessionId,
      monsterId: monster.id,
      state,
      expiresAt: getSessionExpiry(this.clock())
    });

    if (!session) {
      return { state: "no-character" };
    }

    return {
      state: "persistent-active",
      character: characterSummary,
      session,
      monster,
      questProgress,
      started: true
    };
  }

  async getMimicShawarmaForTelegramUser(telegramUserId: bigint): Promise<FightLookupResult> {
    const localDate = toIsoDate(this.clock());
    const character = await this.characters.findByTelegramUserId(telegramUserId);

    if (!character) {
      return { state: "no-character" };
    }

    const characterSummary = await this.summarizeCharacterWithEquipment(telegramUserId, character);

    if (!isWithinActivityMaxLevel(characterSummary.level, STARTER_ACTIVITY_MAX_LEVEL)) {
      return {
        state: "level-retired",
        character: characterSummary,
        maxLevel: STARTER_ACTIVITY_MAX_LEVEL
      };
    }

    const existingFight = await this.dailyActions.findForTelegramUser(telegramUserId, {
      key: MIMIC_SHAWARMA_COMBAT_PROBE_KEY,
      localDate
    });

    if (existingFight) {
      const existingAdventure = await this.dailyActions.findForTelegramUser(telegramUserId, {
        key: MIMIC_SHAWARMA_ADVENTURE_KEY,
        localDate
      });

      return {
        state: "already-completed",
        character: characterSummary,
        questAvailable: !existingAdventure
      };
    }

    return {
      state: "ready",
      character: characterSummary
    };
  }

  async completeMimicShawarma(
    telegramUserId: bigint,
    action: FightAction
  ): Promise<FightResult> {
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

    const combat = runCombatProbe({
      heroLevel: characterSummary.level,
      heroStats: characterSummary.stats,
      heroHpCurrent: characterSummary.hpCurrent,
      heroHpMax: characterSummary.hpMax,
      action
    });
    const localDate = toIsoDate(this.clock());
    const reward = MIMIC_SHAWARMA_COMBAT_REWARDS[action];
    const claim = await this.dailyActions.claimForTelegramUser(telegramUserId, {
      key: MIMIC_SHAWARMA_COMBAT_PROBE_KEY,
      localDate,
      rewardXp: reward.xp,
      rewardGold: reward.gold,
      itemGrants: buildFightItemGrants(action)
    });

    if (!claim) {
      return { state: "no-character" };
    }

    if (claim.state === "existing") {
      const existingAdventure = await this.dailyActions.findForTelegramUser(telegramUserId, {
        key: MIMIC_SHAWARMA_ADVENTURE_KEY,
        localDate
      });

      return {
        state: "already-completed",
        character: summarizeCharacter(claim.character),
        questAvailable: !existingAdventure
      };
    }

    return {
      state: "completed",
      action,
      character: summarizeCharacter(claim.character),
      combat,
      reward: {
        ...reward,
        localDate,
        itemGrants: enrichRewardItemGrants(claim.itemGrants)
      },
      levelChange: claim.levelChange
    };
  }

  async resolvePersistentFightTurn(
    telegramUserId: bigint,
    input: { sessionId: string; turn: number; action: CombatActionType }
  ): Promise<PersistentFightTurnResult> {
    const character = await this.characters.findByTelegramUserId(telegramUserId);

    if (!character) {
      return { state: "no-character" };
    }

    const characterSummary = await this.summarizeCharacterWithEquipment(telegramUserId, character);

    if (!this.combatSessions) {
      return {
        state: "not-found",
        character: characterSummary
      };
    }

    const questProgress = await this.getThirteenSmallProblemsProgress(telegramUserId);
    const session = await this.combatSessions.findByIdForTelegramUserId(
      telegramUserId,
      input.sessionId
    );

    if (!session) {
      return {
        state: "not-found",
        character: characterSummary
      };
    }

    if (isTrainingDoppelgangerMonsterId(session.monsterId)) {
      return {
        state: "not-found",
        character: characterSummary
      };
    }

    if (session.status === "active") {
      const activeSession = await this.combatSessions.findActiveByTelegramUserId(telegramUserId);

      if (activeSession && activeSession.id !== session.id) {
        return {
          state: "stale-turn",
          character: characterSummary,
          session: activeSession,
          monster: findPersistentFightMonster(activeSession),
          questProgress
        };
      }
    }

    if (session.status !== "active") {
      const monster = findPersistentFightMonster(session);

      return {
        state: "terminal",
        character: characterSummary,
        session,
        monster,
        questProgress,
        fightReward: await this.getOrRecoverPersistentFightReward(
          telegramUserId,
          session,
          monster,
          characterSummary
        )
      };
    }

    if (!session.state) {
      await this.combatSessions.markStatusById(session.id, "expired");
      return {
        state: "terminal",
        character: characterSummary,
        session: { ...session, status: "expired" },
        monster: findPersistentFightMonster(session),
        questProgress,
        fightReward: null
      };
    }

    const monster = findPersistentFightMonster(session);

    if (isExpired(session, this.clock())) {
      const expiredState = expireCombat(session.state);
      const updated = await this.combatSessions.updateById(session.id, {
        state: expiredState,
        status: expiredState.status
      });
      await this.persistCharacterResourcesFromSession(telegramUserId, updated ?? session);

      return {
        state: "terminal",
        character: characterSummary,
        session: updated ?? { ...session, state: expiredState, status: "expired" },
        monster,
        questProgress,
        fightReward: await this.getOrRecoverPersistentFightReward(
          telegramUserId,
          updated ?? session,
          monster,
          characterSummary
        )
      };
    }

    if (!monster || session.state.status !== "active") {
      return {
        state: "terminal",
        character: characterSummary,
        session,
        monster,
        questProgress,
        fightReward: await this.getOrRecoverPersistentFightReward(
          telegramUserId,
          session,
          monster,
          characterSummary
        )
      };
    }

    if (session.state.turn !== input.turn) {
      return {
        state: "stale-turn",
        character: characterSummary,
        session,
        monster,
        questProgress
      };
    }

    const resolved = resolveCombatTurn({
      state: session.state,
      action: input.action,
      hero: buildHeroCombatStats(characterSummary),
      monster: deriveMonsterCombatStats(monster),
      rng: this.rng
    });

    if (!resolved.ok) {
      return {
        state: "terminal",
        character: characterSummary,
        session,
        monster,
        questProgress,
        fightReward: await this.getOrRecoverPersistentFightReward(
          telegramUserId,
          session,
          monster,
          characterSummary
        )
      };
    }

    const updated = await this.combatSessions.updateByIdIfActiveTurn(session.id, input.turn, {
      state: resolved.state,
      status: resolved.state.status,
      expiresAt: getSessionExpiry(this.clock())
    });

    if (!updated) {
      const currentSession = await this.combatSessions.findByIdForTelegramUserId(
        telegramUserId,
        input.sessionId
      );
      const fallbackSession = currentSession ?? session;

      if (fallbackSession.status === "active" && fallbackSession.state?.status === "active") {
        return {
          state: "stale-turn",
          character: characterSummary,
          session: fallbackSession,
          monster: findPersistentFightMonster(fallbackSession),
          questProgress
        };
      }
      const fallbackMonster = findPersistentFightMonster(fallbackSession);

      return {
        state: "terminal",
        character: characterSummary,
        session: fallbackSession,
        monster: fallbackMonster,
        questProgress,
        fightReward: await this.getOrRecoverPersistentFightReward(
          telegramUserId,
          fallbackSession,
          fallbackMonster,
          characterSummary
        )
      };
    }

    const fightReward =
      updated.status === "won" || updated.status === "lost"
        ? await this.claimPersistentFightReward(telegramUserId, updated, monster, characterSummary)
        : null;
    if (updated.status !== "active") {
      await this.persistCharacterResourcesFromSession(telegramUserId, updated);
    }

    const refreshedQuestProgress = await this.getThirteenSmallProblemsProgress(telegramUserId);

    return {
      state: "updated",
      character: characterSummary,
      session: updated,
      monster,
      questProgress: refreshedQuestProgress,
      fightReward
    };
  }

  async turnInProblemQuestForTelegramUser(
    telegramUserId: bigint
  ): Promise<ProblemQuestTurnInLookupResult> {
    const character = await this.characters.findByTelegramUserId(telegramUserId);

    if (!character) {
      return { state: "no-character" };
    }

    const characterSummary = await this.summarizeCharacterWithEquipment(telegramUserId, character);
    const progress = await this.getThirteenSmallProblemsProgress(telegramUserId);

    if (progress.branchComplete) {
      return { state: "branch-complete", character: characterSummary, progress };
    }

    if (!progress.issued) {
      return { state: "not-ready", character: characterSummary, progress };
    }

    if (!progress.completed) {
      return { state: "not-ready", character: characterSummary, progress };
    }

    const stage = getProblemQuestStage(progress.stageId);
    const claim = await this.dailyActions.claimForTelegramUser(telegramUserId, {
      key: stage.rewardKey,
      localDate: PROBLEM_QUEST_BUCKET,
      rewardXp: stage.reward.xp,
      rewardGold: stage.reward.gold,
      itemGrants: [
        {
          itemId: stage.reward.itemId,
          quantity: 1,
          maxOwnedQuantity: 1
        }
      ]
    });

    if (!claim) {
      return { state: "no-character" };
    }

    const nextStage = stage.nextStageId ? getProblemQuestStage(stage.nextStageId) : null;

    return {
      state: "turned-in",
      character: summarizeCharacter(claim.character),
      progress: await this.getThirteenSmallProblemsProgress(telegramUserId),
      result: {
        state: claim.state === "created" ? "claimed" : "already-claimed",
        stage,
        reward: {
          xp: claim.action.rewardXp,
          gold: claim.action.rewardGold,
          localDate: claim.action.localDate,
          itemGrants: claim.state === "created" ? enrichRewardItemGrants(claim.itemGrants) : []
        },
        levelChange: claim.levelChange,
        nextStage,
        nextStageAvailable: nextStage !== null,
        branchComplete: nextStage === null
      }
    };
  }

  async issueNextProblemQuestForTelegramUser(
    telegramUserId: bigint
  ): Promise<ProblemQuestIssueNextLookupResult> {
    const character = await this.characters.findByTelegramUserId(telegramUserId);

    if (!character) {
      return { state: "no-character" };
    }

    const characterSummary = await this.summarizeCharacterWithEquipment(telegramUserId, character);
    const progress = await this.getThirteenSmallProblemsProgress(telegramUserId);

    if (progress.branchComplete) {
      return { state: "branch-complete", character: characterSummary, progress };
    }

    if (!progress.issued) {
      const stage = getProblemQuestStage(progress.stageId);
      const issued = await this.dailyActions.claimForTelegramUser(telegramUserId, {
        key: stage.issueKey,
        localDate: PROBLEM_QUEST_BUCKET,
        rewardXp: 0,
        rewardGold: 0,
        itemGrants: []
      });

      if (!issued) {
        return { state: "no-character" };
      }

      return {
        state: "issued",
        character: summarizeCharacter(issued.character),
        progress: await this.getThirteenSmallProblemsProgress(telegramUserId),
        stage,
        nextStage: stage,
        issued: issued.state === "created" ? "created" : "already-issued"
      };
    }

    if (!progress.rewardClaimed) {
      return { state: "not-available", character: characterSummary, progress };
    }

    const stage = getProblemQuestStage(progress.stageId);
    const nextStage = stage.nextStageId ? getProblemQuestStage(stage.nextStageId) : null;

    if (!nextStage) {
      return { state: "branch-complete", character: characterSummary, progress };
    }

    const issued = await this.dailyActions.claimForTelegramUser(telegramUserId, {
      key: nextStage.issueKey,
      localDate: PROBLEM_QUEST_BUCKET,
      rewardXp: 0,
      rewardGold: 0,
      itemGrants: []
    });

    if (!issued) {
      return { state: "no-character" };
    }

    return {
      state: "issued",
      character: summarizeCharacter(issued.character),
      progress: await this.getThirteenSmallProblemsProgress(telegramUserId),
      stage,
      nextStage,
      issued: issued.state === "created" ? "created" : "already-issued"
    };
  }

  private async claimPersistentFightReward(
    telegramUserId: bigint,
    session: SoloCombatSessionRecord,
    monster: MonsterContent,
    character: CharacterSummary
  ): Promise<PersistentFightReward | null> {
    const replay = buildPersistentFightRewardReplay(session);

    if (replay) {
      return replay;
    }

    const reward = buildPersistentFightReward(
      monster,
      character,
      this.rng,
      session.state?.status ?? session.status,
      session
    );
    const claim = await this.dailyActions.claimForTelegramUser(telegramUserId, {
      key: PERSISTENT_SOLO_FIGHT_REWARD_KEY,
      localDate: session.id,
      rewardXp: reward.xp,
      rewardGold: reward.gold,
      itemGrants: reward.itemGrants
    });

    if (!claim) {
      return null;
    }

    if (claim.state === "existing") {
      return {
        state: "already-claimed",
        reward: {
          xp: claim.action.rewardXp,
          gold: claim.action.rewardGold,
          localDate: claim.action.localDate,
          itemGrants: []
        },
        levelChange: null,
        itemReplayUnavailable: true
      };
    }

    const stored =
      await this.combatSessions?.recordRewardById(session.id, {
        rewardXp: claim.action.rewardXp,
        rewardGold: claim.action.rewardGold,
        itemGrants: claim.itemGrants,
        claimedAt: this.clock()
      });

    return {
      state: "claimed",
      reward: {
        xp: claim.action.rewardXp,
        gold: claim.action.rewardGold,
        localDate: claim.action.localDate,
        itemGrants: enrichRewardItemGrants(claim.itemGrants)
      },
      levelChange: claim.levelChange,
      ...(stored ? {} : { itemReplayUnavailable: claim.itemGrants.length > 0 })
    };
  }

  private async getThirteenSmallProblemsProgress(
    telegramUserId: bigint
  ): Promise<ThirteenSmallProblemsProgress> {
    const stageState = await this.getCurrentProblemQuestStage(telegramUserId);

    if (stageState.branchComplete) {
      const finalStage = getProblemQuestStage("93");

      return {
        stageId: finalStage.id,
        title: finalStage.title,
        wins: finalStage.target,
        target: finalStage.target,
        completed: true,
        rewardClaimed: true,
        issued: true,
        branchComplete: true
      };
    }

    const countSinceIssue = stageState.stage.id !== "13";
    const wins = this.combatSessions
      ? await this.combatSessions.countWonByTelegramUserId(telegramUserId, {
          excludeMonsterIds: [TRAINING_DOPPELGANGER_MONSTER_ID],
          ...(countSinceIssue && stageState.issuedAt ? { since: stageState.issuedAt } : {})
        })
      : 0;
    const rewardClaim = await this.dailyActions.findForTelegramUser(telegramUserId, {
      key: stageState.stage.rewardKey,
      localDate: PROBLEM_QUEST_BUCKET
    });

    return {
      stageId: stageState.stage.id,
      title: stageState.stage.title,
      wins,
      target: stageState.stage.target,
      completed: rewardClaim !== null || wins >= stageState.stage.target,
      rewardClaimed: rewardClaim !== null,
      issued: stageState.issuedAt !== null || rewardClaim !== null,
      branchComplete: false
    };
  }

  private async getProblemQuestArchiveProgress(
    telegramUserId: bigint,
    currentProgress: ProblemQuestProgress
  ): Promise<ProblemQuestProgress[]> {
    const rows: ProblemQuestProgress[] = [];

    for (const stage of PROBLEM_QUEST_STAGES) {
      const rewardClaim = await this.dailyActions.findForTelegramUser(telegramUserId, {
        key: stage.rewardKey,
        localDate: PROBLEM_QUEST_BUCKET
      });

      if (!rewardClaim) {
        continue;
      }

      if (currentProgress.stageId === stage.id) {
        rows.push(currentProgress);
        continue;
      }

      rows.push({
        stageId: stage.id,
        title: stage.title,
        wins: stage.target,
        target: stage.target,
        completed: true,
        rewardClaimed: true,
        issued: true,
        branchComplete: false
      });
    }

    if (
      currentProgress.completed &&
      !rows.some((row) => row.stageId === currentProgress.stageId)
    ) {
      rows.push(currentProgress);
    }

    return rows;
  }

  private async getOrRecoverPersistentFightReward(
    telegramUserId: bigint,
    session: SoloCombatSessionRecord,
    monster: MonsterContent | null,
    character: CharacterSummary
  ): Promise<PersistentFightReward | null> {
    const replay = buildPersistentFightRewardReplay(session);

    if (replay) {
      return replay;
    }

    const terminalStatus = session.state?.status ?? session.status;

    if (terminalStatus !== "won" && terminalStatus !== "lost") {
      return null;
    }

    const action = await this.dailyActions.findForTelegramUser(telegramUserId, {
      key: PERSISTENT_SOLO_FIGHT_REWARD_KEY,
      localDate: session.id
    });

    if (!action) {
      return monster
        ? this.claimPersistentFightReward(telegramUserId, session, monster, character)
        : null;
    }

    return {
      state: "already-claimed",
      reward: {
        xp: action.rewardXp,
        gold: action.rewardGold,
        localDate: session.id,
        itemGrants: []
      },
      levelChange: null,
      itemReplayUnavailable: true
    };
  }

  private async getCurrentProblemQuestStage(telegramUserId: bigint): Promise<
    | { branchComplete: true }
    | { branchComplete: false; stage: ProblemQuestStage; issuedAt: Date | null }
  > {
    const stageRecords: Array<{
      stage: ProblemQuestStage;
      issuedAt: Date | null;
      rewarded: boolean;
    }> = [];

    for (const stage of PROBLEM_QUEST_STAGES) {
      const issued = await this.dailyActions.findForTelegramUser(telegramUserId, {
        key: stage.issueKey,
        localDate: PROBLEM_QUEST_BUCKET
      });
      const reward = await this.dailyActions.findForTelegramUser(telegramUserId, {
        key: stage.rewardKey,
        localDate: PROBLEM_QUEST_BUCKET
      });

      stageRecords.push({
        stage,
        issuedAt: issued?.createdAt ?? null,
        rewarded: reward !== null
      });
    }

    if (stageRecords.at(-1)?.rewarded) {
      return { branchComplete: true };
    }

    const activeStage = stageRecords.find(({ issuedAt, rewarded }) => issuedAt && !rewarded);

    if (activeStage) {
      return {
        branchComplete: false,
        stage: activeStage.stage,
        issuedAt: activeStage.issuedAt
      };
    }

    for (let index = stageRecords.length - 1; index >= 0; index -= 1) {
      const record = stageRecords[index];
      if (!record?.rewarded || !record.stage.nextStageId) {
        continue;
      }

      const nextRecord = stageRecords.find(
        (candidate) => candidate.stage.id === record.stage.nextStageId
      );

      if (!nextRecord?.issuedAt) {
        return {
          branchComplete: false,
          stage: record.stage,
          issuedAt: record.issuedAt
        };
      }
    }

    return { branchComplete: false, stage: getProblemQuestStage("13"), issuedAt: null };
  }

  private async summarizeCharacterWithEquipment(
    telegramUserId: bigint,
    character: CharacterRecord,
    options: { syncResources?: boolean } = {}
  ): Promise<CharacterSummary> {
    const equipmentSnapshot = await this.equipment?.listByTelegramUserId(telegramUserId);
    const equippedItems = equipmentSnapshot ? getEquippedItemContents(equipmentSnapshot.equipment) : [];

    if (options.syncResources) {
      const resourceAware = await summarizeAndSyncCharacterResources({
        characters: this.characters,
        telegramUserId,
        character,
        equippedItems,
        now: this.clock()
      });

      return resourceAware.character;
    }

    return summarizeCharacter(character, {
      equippedItems
    });
  }

  private async persistCharacterResourcesFromSession(
    telegramUserId: bigint,
    session: SoloCombatSessionRecord
  ): Promise<void> {
    if (!session.state) {
      return;
    }

    await this.characters.updateResourcesForTelegramUser?.(telegramUserId, {
      hpCurrent: session.state.hero.hp,
      manaCurrent: session.state.hero.mana,
      hpRegenAt: this.clock(),
      manaRegenAt: this.clock()
    });
  }

  private async getMonsterRestCooldown(
    telegramUserId: bigint,
    source: NonNullable<PersistentFightStartOptions["source"]>
  ): Promise<{ availableAt: Date; now: Date } | null> {
    if (!this.combatSessions || source === "adventure") {
      return null;
    }

    const now = this.clock();
    const since = new Date(now.getTime() - MONSTER_REST_COOLDOWN_MS);
    const recent = await this.combatSessions.listByTelegramUserIdSince(telegramUserId, since);
    const eligible = recent
      .filter((session) => isMonsterRestEligibleSession(session))
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());

    if (eligible.length < MONSTER_REST_ELIGIBLE_FIGHT_COUNT) {
      return null;
    }

    const streak = eligible.slice(-MONSTER_REST_ELIGIBLE_FIGHT_COUNT);
    const first = streak[0];

    if (!first) {
      return null;
    }

    const availableAt = new Date(first.createdAt.getTime() + MONSTER_REST_COOLDOWN_MS);

    return availableAt > now ? { availableAt, now } : null;
  }
}

function isMonsterRestEligibleSession(
  session: Pick<SoloCombatSessionRecord, "monsterId" | "status" | "createdAt" | "state">
): boolean {
  if (
    session.status === "active" ||
    session.state?.source !== "normal" ||
    isTrainingDoppelgangerMonsterId(session.monsterId)
  ) {
    return false;
  }

  const monster = findMonster(session.monsterId);

  return monster ? isSoloFightMonsterEligible(monster, Number.POSITIVE_INFINITY) : false;
}

function buildPersistentFightReward(
  monster: MonsterContent,
  character: CharacterSummary,
  rng: RandomSource,
  status: SoloCombatSessionRecord["status"] = "won",
  session?: SoloCombatSessionRecord
): { xp: number; gold: number; itemGrants: Array<{ itemId: string; quantity: number }> } {
  if (status === "lost") {
    return {
      xp: 1,
      gold: 0,
      itemGrants: []
    };
  }

  const difficulty = getPersistentFightSessionDifficulty(session);
  const effectiveMonsterLevel = getPersistentFightSessionMonsterLevel(session, monster.level);
  const lootProfileLevel = Math.max(1, character.level + difficulty.lootPowerOffset);
  const loot = rollMonsterLoot({
    monsterId: monster.id,
    monsterLoot,
    items,
    luck: character.stats.luck,
    dropChanceMultiplier: difficulty.dropChanceMultiplier,
    rng,
    character: {
      level: lootProfileLevel,
      classId: character.classId,
      raceId: character.raceId,
      title: character.title
    },
    sourceId: getLootExpansionSourceForMonster(monster),
    sourceTags: monster.tags
  });

  return {
    xp: buildPersistentFightWinXp(character.level, effectiveMonsterLevel, difficulty),
    gold: buildPersistentFightWinGold(effectiveMonsterLevel, difficulty),
    itemGrants: loot.state === "dropped" ? [{ itemId: loot.item.id, quantity: 1 }] : []
  };
}

function buildPersistentFightWinXp(
  characterLevel: number,
  monsterLevel: number,
  difficulty: PersistentFightDifficultyConfig = PERSISTENT_FIGHT_DIFFICULTY_CONFIG.normal
): number {
  const levelGap = characterLevel - monsterLevel;

  if (levelGap > 3) {
    return Math.max(1, Math.round(2 * difficulty.xpMultiplier));
  }

  if (levelGap > 2) {
    return Math.max(1, Math.round(3 * difficulty.xpMultiplier));
  }

  const overlevel = Math.max(0, monsterLevel - characterLevel);
  const overlevelMultiplier = clamp(1 + overlevel * 0.06, 1, 1.36);
  const baseXp = Math.min(14, Math.max(5, 3 + monsterLevel * 2));

  return Math.max(1, Math.round(baseXp * difficulty.xpMultiplier * overlevelMultiplier));
}

function buildPersistentFightWinGold(
  monsterLevel: number,
  difficulty: PersistentFightDifficultyConfig = PERSISTENT_FIGHT_DIFFICULTY_CONFIG.normal
): number {
  const baseGold = Math.min(7, Math.max(1, 1 + Math.floor(monsterLevel / 2)));

  return Math.max(1, Math.round(baseGold * difficulty.goldMultiplier));
}

function getLootExpansionSourceForMonster(monster: MonsterContent): LootExpansionSourceId {
  const tags = new Set(monster.tags);

  if (["food", "kitchen", "pan", "cheese"].some((tag) => tags.has(tag))) {
    return "kitchen_dungeon";
  }

  if (
    ["bureaucracy", "paper", "queue", "tax", "audit", "deadline", "calendar"].some((tag) =>
      tags.has(tag)
    )
  ) {
    return "bureaucracy_wing";
  }

  if (["forest", "garden", "druid", "frog"].some((tag) => tags.has(tag))) {
    return "forest_sidequest";
  }

  if (monster.level >= 10) {
    return "elite_mob";
  }

  return "trash_mob";
}

function buildPersistentFightRewardReplay(
  session: SoloCombatSessionRecord
): PersistentFightReward | null {
  if (!session.reward) {
    return null;
  }

  return {
    state: "replayed",
    reward: {
      xp: session.reward.xp,
      gold: session.reward.gold,
      localDate: session.id,
      itemGrants: enrichRewardItemGrants(session.reward.itemGrants)
    },
    levelChange: null
  };
}

function getProblemQuestStage(stageId: ProblemQuestStageId): ProblemQuestStage {
  const stage = PROBLEM_QUEST_STAGES.find((candidate) => candidate.id === stageId);

  if (!stage) {
    throw new Error(`Unknown problem quest stage: ${stageId}`);
  }

  return stage;
}

function buildFightItemGrants(action: FightAction): Array<{ itemId: string; quantity: number }> {
  if (action === "attack") {
    return [
      starterEquipmentGrant(PAN_OF_PERSUASION_ITEM_ID),
      {
        itemId: SUSPICIOUS_SHAWARMA_WRAPPER_ITEM_ID,
        quantity: 1
      }
    ];
  }

  if (action === "receipt") {
    return [
      starterEquipmentGrant(STAMP_OF_MINOR_AUTHORITY_ITEM_ID),
      {
        itemId: RECEIPT_OF_FORMAL_SUSPICION_ITEM_ID,
        quantity: 1
      }
    ];
  }

  return [];
}

function buildHeroCombatStats(
  character: CharacterSummary
): CombatActorStats & { hpCurrent: number; manaCurrent: number } {
  const equipment = character.equipmentEffects ?? createEmptyEquipmentEffectSummary();

  return {
    level: character.level,
    hpMax: character.hpMax,
    manaMax: character.manaMax,
    hpCurrent: character.hpCurrent,
    manaCurrent: character.manaCurrent,
    classId: character.classId,
    ...character.stats,
    armor: equipment.armor,
    resist: equipment.resist,
    weaponDamage: equipment.weaponDamage,
    spellPower: equipment.spellPower
  };
}

function getSessionExpiry(now: Date): Date {
  return new Date(now.getTime() + 30 * 60 * 1000);
}

function isExpired(session: SoloCombatSessionRecord, now: Date): boolean {
  return session.expiresAt.getTime() <= now.getTime();
}

function findMonster(monsterId: string): MonsterContent | null {
  return monsters.find((monster) => monster.id === monsterId) ?? null;
}

function findPersistentFightMonster(
  session: Pick<SoloCombatSessionRecord, "monsterId" | "state">
): MonsterContent | null {
  const monster = findMonster(session.monsterId);

  if (!monster) {
    return null;
  }

  const effectiveLevel = getPersistentFightSessionMonsterLevel(session, monster.level);

  return effectiveLevel === monster.level ? monster : { ...monster, level: effectiveLevel };
}

export function getPersistentFightDifficultyConfig(
  difficulty: PersistentFightDifficultyId = "normal"
): PersistentFightDifficultyConfig {
  return PERSISTENT_FIGHT_DIFFICULTY_CONFIG[difficulty] ?? PERSISTENT_FIGHT_DIFFICULTY_CONFIG.normal;
}

export function selectPersistentFightMonsterLevel(input: {
  characterLevel: number;
  baseMonsterLevel: number;
  difficulty?: PersistentFightDifficultyId;
}): number {
  const difficulty = getPersistentFightDifficultyConfig(input.difficulty);

  if (difficulty.id === "normal") {
    return Math.max(1, Math.floor(input.baseMonsterLevel));
  }

  return Math.max(1, Math.floor(input.characterLevel + difficulty.levelDelta));
}

function applyPersistentFightDifficulty(
  baseMonster: MonsterContent,
  character: CharacterSummary,
  difficulty: PersistentFightDifficultyConfig
): MonsterContent {
  const level = selectPersistentFightMonsterLevel({
    characterLevel: character.level,
    baseMonsterLevel: baseMonster.level,
    difficulty: difficulty.id
  });

  return level === baseMonster.level ? baseMonster : { ...baseMonster, level };
}

function buildPersistentFightInterventionTrace(
  baseMonster: MonsterContent,
  monster: MonsterContent,
  difficulty: PersistentFightDifficultyConfig
): NonNullable<CombatState["monster"]["debugTrace"]> {
  return {
    interventionKind: difficulty.interventionKind,
    interventionSourceKey: "prypichnyk",
    baseMonsterLevel: baseMonster.level,
    effectiveMonsterLevel: monster.level
  };
}

function getPersistentFightSessionDifficulty(
  session?: Pick<SoloCombatSessionRecord, "state">
): PersistentFightDifficultyConfig {
  const interventionKind = session?.state?.monster.debugTrace?.interventionKind;

  if (interventionKind === "help") {
    return PERSISTENT_FIGHT_DIFFICULTY_CONFIG.easy;
  }

  if (interventionKind === "hinder") {
    return PERSISTENT_FIGHT_DIFFICULTY_CONFIG.hard;
  }

  return PERSISTENT_FIGHT_DIFFICULTY_CONFIG.normal;
}

function getPersistentFightSessionMonsterLevel(
  session: Pick<SoloCombatSessionRecord, "state"> | undefined,
  fallbackLevel: number
): number {
  const storedLevel =
    session?.state?.monster.debugTrace?.effectiveMonsterLevel ?? session?.state?.monster.level;

  return Math.max(1, Math.floor(storedLevel ?? fallbackLevel));
}

function selectSoloFightMonster(
  character: CharacterSummary,
  rng: RandomSource
): MonsterContent {
  const maxMonsterLevel = Math.max(3, character.level);
  const closeMonsterLevelFloor = Math.max(1, character.level - 2);
  const eligibleMonsters = monsters.filter((monster) => isSoloFightMonsterEligible(monster, maxMonsterLevel));
  const closeCandidates = eligibleMonsters.filter(
    (monster) => monster.level >= closeMonsterLevelFloor
  );
  const candidates =
    closeCandidates.length > 0 ? closeCandidates : selectHighestAvailableMonsterLevel(eligibleMonsters);
  const fallback = monsters.find((monster) => monster.id === "monster.deadline-spider");

  if (!fallback) {
    throw new Error("Квестарня: немає монстра для solo fight fallback.");
  }

  if (candidates.length === 0) {
    return fallback;
  }

  return candidates[rng.nextInt(0, candidates.length - 1)] ?? candidates[0] ?? fallback;
}

function selectTargetedSoloFightMonster(
  character: CharacterSummary,
  rng: RandomSource,
  target: NonNullable<PersistentFightStartOptions["target"]>
): MonsterContent {
  const maxMonsterLevel = Math.max(3, character.level);
  const closeMonsterLevelFloor = Math.max(1, character.level - 2);
  const targetMonsterIds = new Set(target.monsterIds ?? []);
  const targetTags = new Set(target.tagsAny ?? []);
  const eligibleMonsters = monsters.filter(
    (monster) =>
      isSoloFightMonsterEligible(monster, maxMonsterLevel) &&
      (targetMonsterIds.has(monster.id) || monster.tags.some((tag) => targetTags.has(tag)))
  );
  const closeCandidates = eligibleMonsters.filter(
    (monster) => monster.level >= closeMonsterLevelFloor
  );
  const candidates =
    closeCandidates.length > 0
      ? selectHighestAvailableMonsterLevel(closeCandidates)
      : selectHighestAvailableMonsterLevel(eligibleMonsters);

  if (candidates.length > 0) {
    return candidates[rng.nextInt(0, candidates.length - 1)] ?? candidates[0] ?? selectSoloFightMonster(character, rng);
  }

  return selectSoloFightMonster(character, rng);
}

function isSoloFightMonsterEligible(monster: MonsterContent, maxMonsterLevel: number): boolean {
  const tags = new Set(monster.tags);

  return (
    monster.id !== "monster.mimic-shawarma" &&
    !tags.has("starter") &&
    !tags.has("boss") &&
    monster.level <= maxMonsterLevel
  );
}

function selectHighestAvailableMonsterLevel(monstersByLevel: MonsterContent[]): MonsterContent[] {
  const highestLevel = monstersByLevel.reduce(
    (currentHighest, monster) => Math.max(currentHighest, monster.level),
    0
  );

  return monstersByLevel.filter((monster) => monster.level === highestLevel);
}

export function getPersistentFightSkillLabel(character: CharacterSummary): string {
  const skill = getCombatSkillProfile(character.classId);
  const label = (() => {
    switch (skill.id) {
      case "skill.forceful-strike":
        return "🗡️ Силовий удар";
      case "skill.hot-spell":
        return "🔥 Гаряче закляття";
      case "skill.form-thirteen-b":
        return "📎 Форма 13-Б";
      case "skill.dangerous-couplet":
        return "🎵 Небезпечний куплет";
      case "skill.trick-shot":
        return "🎯 Хитрий постріл";
      case "skill.strict-blessing":
        return "🕯️ Суворе благословення";
      case "skill.steppe-side-eye":
        return "🌾 Степовий погляд";
      default:
        return "🗡️ Обережний удар";
    }
  })();

  if (skill.manaCost === 0) {
    return label;
  }

  return `${label} · ${skill.manaCost} ${pluralize(skill.manaCost, "мана", "мани", "мани")}`;
}

function pluralize(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return one;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return few;
  }

  return many;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
