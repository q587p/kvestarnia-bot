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
  DueSoloCombatSessionRecord,
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
  applyMonsterContextToStats,
  buildCombatWorldContext,
  createCombatBarkState,
  getCombatSkillProfile,
  markCombatTurnTimeoutMode,
  resolveCombatTurn,
  resolveMonsterContext,
  startCombat,
  type CombatActionType,
  type CombatActorStats,
  type CombatBalanceSource,
  type CombatState,
  type MonsterCombatStats
} from "../domain/combat";
import { getItemDropChance, rollMonsterLoot } from "../domain/loot";
import {
  isWithinActivityMaxLevel,
  STARTER_ACTIVITY_MAX_LEVEL
} from "../domain/progression/activityGates";
import { buildStarterLevelTwoXpReward } from "../domain/progression/starterRewards";
import { createEmptyEquipmentEffectSummary } from "../domain/progression/effectiveStats";
import { CryptoRandomSource, type RandomSource } from "../shared/random";
import { systemClock, toIsoDate, type Clock } from "../shared/time";
import {
  summarizeAndSyncCharacterResources,
  type ResourceRecoveryNotice
} from "./characterResourceService";
import type { CombatBalanceAnalyticsService } from "./combatBalanceAnalyticsService";
import {
  normalizePresenceLocationId,
  PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1,
  PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
  PRESENCE_LOCATION_KORCHMA_RANGER_CORNER
} from "./presenceService";
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

interface RecoveryNoticeField {
  recoveryNotice?: ResourceRecoveryNotice;
}

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
export const PERSISTENT_FIGHT_TURN_SECONDS = 23;

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
  | ({ state: "level-retired"; character: CharacterSummary; maxLevel: number } & RecoveryNoticeField)
  | ({ state: "needs-rest"; character: CharacterSummary } & RecoveryNoticeField)
  | ({
      state: "persistent-not-issued";
      character: CharacterSummary;
      questProgress: ThirteenSmallProblemsProgress;
    } & RecoveryNoticeField)
  | ({
      state: "persistent-ready";
      character: CharacterSummary;
      questProgress: ThirteenSmallProblemsProgress;
    } & RecoveryNoticeField)
  | ({
      state: "monster-rest";
      character: CharacterSummary;
      questProgress: ThirteenSmallProblemsProgress;
      availableAt: Date;
      now: Date;
    } & RecoveryNoticeField)
  | ({
      state: "persistent-active";
      character: CharacterSummary;
      session: SoloCombatSessionRecord;
      monster: MonsterContent;
      questProgress: ThirteenSmallProblemsProgress;
      started?: boolean;
    } & RecoveryNoticeField)
  | ({
      state: "persistent-terminal";
      character: CharacterSummary;
      session: SoloCombatSessionRecord;
      monster: MonsterContent | null;
      questProgress: ThirteenSmallProblemsProgress;
      fightReward: PersistentFightReward | null;
    } & RecoveryNoticeField)
  | ({
      state: "training-active";
      character: CharacterSummary;
      session: SoloCombatSessionRecord;
      questProgress: ThirteenSmallProblemsProgress;
    } & RecoveryNoticeField)
  | ({ state: "ready"; character: CharacterSummary } & RecoveryNoticeField)
  | ({ state: "already-completed"; character: CharacterSummary; questAvailable: boolean } & RecoveryNoticeField);

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
      reason?: "not-enough-mana" | "skill-on-cooldown";
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

export type PersistentFightTimeoutResult =
  | { state: "skipped" }
  | {
      state: "updated";
      telegramUserId: bigint;
      character: CharacterSummary;
      session: SoloCombatSessionRecord;
      monster: MonsterContent;
      questProgress: ThirteenSmallProblemsProgress;
      fightReward: PersistentFightReward | null;
    }
  | {
      state: "terminal";
      telegramUserId: bigint;
      character: CharacterSummary;
      session: SoloCombatSessionRecord;
      monster: MonsterContent | null;
      questProgress: ThirteenSmallProblemsProgress;
      fightReward: PersistentFightReward | null;
    };

export interface CombatMessageReferenceInput {
  chatId: string;
  messageId: number;
}

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
  levelDelta: -5 | 0 | 2;
  xpFactorRange?: {
    min: number;
    max: number;
  };
  monsterLevelRangeOffset?: {
    min: number;
    max: number;
  };
  dropChanceMultiplier: number;
  lootPowerOffset: number;
}

export const PERSISTENT_FIGHT_DIFFICULTY_CONFIG = {
  easy: {
    id: "easy",
    interventionKind: "help",
    levelDelta: -5,
    xpFactorRange: {
      min: 0.5,
      max: 0.75
    },
    monsterLevelRangeOffset: {
      min: -5,
      max: -3
    },
    dropChanceMultiplier: 0.65,
    lootPowerOffset: -1
  },
  normal: {
    id: "normal",
    interventionKind: "none",
    levelDelta: 0,
    dropChanceMultiplier: 1,
    lootPowerOffset: 0
  },
  hard: {
    id: "hard",
    interventionKind: "hinder",
    levelDelta: 2,
    xpFactorRange: {
      min: 1.25,
      max: 1.5
    },
    dropChanceMultiplier: 1.35,
    lootPowerOffset: 1
  }
} as const satisfies Record<PersistentFightDifficultyId, PersistentFightDifficultyConfig>;

const ZERO_GOLD_ITEM_DROP_CHANCE = 0.93;

export interface PersistentFightStartOptions {
  source?: "normal" | "yeger" | "adventure";
  originLocationId?: string;
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
    private readonly equipment?: EquipmentRepository,
    private readonly combatAnalytics?: CombatBalanceAnalyticsService
  ) {}

  private async advanceExpiredPersistentTurn(
    telegramUserId: bigint,
    session: SoloCombatSessionRecord,
    character: CharacterSummary,
    monster: MonsterContent,
    mode: "auto-attack" | "skip" = "auto-attack"
  ): Promise<SoloCombatSessionRecord> {
    if (!this.combatSessions || session.status !== "active" || session.state?.status !== "active") {
      return session;
    }

    const now = this.clock();
    if (!session.state.turnExpiresAt) {
      const state = withNextTurnExpiry(session.state, now);
      const updated = await this.combatSessions.updateByIdIfActiveTurn(session.id, session.state.turn, {
        state,
        status: state.status,
        expiresAt: getSessionExpiry(now)
      });

      return updated ?? { ...session, state };
    }

    if (!isTurnExpired(session.state, now)) {
      return session;
    }

    const resolved = resolveCombatTurn({
      state: session.state,
      action: mode === "skip" ? "skip" : "attack",
      hero: buildHeroCombatStats(character),
      monster: buildPersistentMonsterCombatStats(monster, session.state),
      rng: this.rng
    });
    const resolvedState = resolved.ok
      ? markCombatTurnTimeoutMode(
          withNextTurnExpiry(stampCombatCompletedAt(resolved.state, now), now),
          mode
        )
      : null;

    if (!resolvedState) {
      return session;
    }
    const updated = await this.combatSessions.updateByIdIfActiveTurn(session.id, session.state.turn, {
      state: resolvedState,
      status: resolvedState.status,
      expiresAt: getSessionExpiry(now)
    });

    if (!updated) {
      return session;
    }

    if (updated.status !== "active") {
      await this.persistCharacterResourcesFromSession(telegramUserId, updated);
    }

    return updated;
  }

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
    const resourceAware = await this.summarizeCharacterWithEquipmentResult(telegramUserId, character, {
      syncResources: !activeSession
    });
    const characterSummary = resourceAware.character;
    const recoveryNotice = resourceAware.recoveryNotice;

    if (!activeSession) {
      if (!questProgress.issued) {
        return {
          state: "persistent-not-issued",
          character: characterSummary,
          questProgress,
          ...(recoveryNotice ? { recoveryNotice } : {})
        };
      }

      const rest = await this.getMonsterRestCooldown(telegramUserId, "normal");
      if (rest) {
        return {
          state: "monster-rest",
          character: characterSummary,
          questProgress,
          ...(recoveryNotice ? { recoveryNotice } : {}),
          ...rest
        };
      }

      return {
        state: "persistent-ready",
        character: characterSummary,
        questProgress,
        ...(recoveryNotice ? { recoveryNotice } : {})
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
      const expiredState = stampCombatCompletedAt(expireCombat(activeSession.state), this.clock());
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
      const expiredState = stampCombatCompletedAt(
        activeSession.state.status === "active" ? expireCombat(activeSession.state) : activeSession.state,
        this.clock()
      );
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

    const refreshedSession = await this.advanceExpiredPersistentTurn(
      telegramUserId,
      activeSession,
      characterSummary,
      monster,
      "skip"
    );
    if (refreshedSession.status !== "active" || refreshedSession.state?.status !== "active") {
      return {
        state: "persistent-terminal",
        character: characterSummary,
        session: refreshedSession,
        monster,
        questProgress,
        fightReward: await this.getOrRecoverPersistentFightReward(
          telegramUserId,
          refreshedSession,
          monster,
          characterSummary
        )
      };
    }

    return {
      state: "persistent-active",
      character: characterSummary,
      session: refreshedSession,
      monster,
      questProgress
    };
  }

  async listDuePersistentFightTurns(options: { limit?: number } = {}): Promise<DueSoloCombatSessionRecord[]> {
    if (!this.combatSessions?.listDueActiveSessions) {
      return [];
    }

    const due = await this.combatSessions.listDueActiveSessions(this.clock(), options);

    return due.filter((session) =>
      session.status === "active" &&
      session.state?.status === "active" &&
      !isTrainingDoppelgangerMonsterId(session.monsterId)
    );
  }

  async resolveDuePersistentFightTurn(
    due: DueSoloCombatSessionRecord
  ): Promise<PersistentFightTimeoutResult> {
    const character = await this.characters.findByTelegramUserId(due.telegramUserId);

    if (!character || !due.state || due.status !== "active" || due.state.status !== "active") {
      return { state: "skipped" };
    }

    const characterSummary = await this.summarizeCharacterWithEquipment(due.telegramUserId, character);
    const monster = findPersistentFightMonster(due);

    if (!monster) {
      return { state: "skipped" };
    }

    const questProgress = await this.getThirteenSmallProblemsProgress(due.telegramUserId);
    const refreshedSession = await this.advanceExpiredPersistentTurn(
      due.telegramUserId,
      due,
      characterSummary,
      monster
    );

    if (refreshedSession.id === due.id && refreshedSession.state?.turn === due.state.turn) {
      return { state: "skipped" };
    }

    if (refreshedSession.status !== "active" || refreshedSession.state?.status !== "active") {
      return {
        state: "terminal",
        telegramUserId: due.telegramUserId,
        character: characterSummary,
        session: refreshedSession,
        monster,
        questProgress,
        fightReward: await this.getOrRecoverPersistentFightReward(
          due.telegramUserId,
          refreshedSession,
          monster,
          characterSummary
        )
      };
    }

    return {
      state: "updated",
      telegramUserId: due.telegramUserId,
      character: characterSummary,
      session: refreshedSession,
      monster,
      questProgress,
      fightReward: null
    };
  }

  async recordPersistentFightMessageReference(
    telegramUserId: bigint,
    sessionId: string,
    reference: CombatMessageReferenceInput
  ): Promise<void> {
    if (!this.combatSessions) {
      return;
    }

    const session = await this.combatSessions.findByIdForTelegramUserId(telegramUserId, sessionId);

    if (session?.status !== "active" || session.state?.status !== "active") {
      return;
    }

    await this.combatSessions.updateByIdIfActiveTurn(session.id, session.state.turn, {
      state: {
        ...session.state,
        message: reference
      },
      status: session.state.status,
      expiresAt: session.expiresAt
    });
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
        const expiredState = stampCombatCompletedAt(expireCombat(activeSession.state), this.clock());
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
          const expiredState = stampCombatCompletedAt(expireCombat(activeSession.state), this.clock());
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

        const refreshedSession = await this.advanceExpiredPersistentTurn(
          telegramUserId,
          activeSession,
          characterSummary,
          monster
        );
        if (refreshedSession.status !== "active" || refreshedSession.state?.status !== "active") {
          return {
            state: "persistent-terminal",
            character: characterSummary,
            session: refreshedSession,
            monster,
            questProgress,
            fightReward: await this.getOrRecoverPersistentFightReward(
              telegramUserId,
              refreshedSession,
              monster,
              characterSummary
            )
          };
        }

        return {
          state: "persistent-active",
          character: characterSummary,
          session: refreshedSession,
          monster,
          questProgress
        };
      }
    }

    const resourceAware = await this.summarizeCharacterWithEquipmentResult(telegramUserId, character, {
      syncResources: true
    });
    const characterSummary = resourceAware.character;
    const recoveryNotice = resourceAware.recoveryNotice;

    if (characterSummary.hpCurrent <= 0) {
      return {
        state: "needs-rest",
        character: characterSummary,
        ...(recoveryNotice ? { recoveryNotice } : {})
      };
    }

    if (!questProgress.issued && options.source !== "adventure") {
      return {
        state: "persistent-not-issued",
        character: characterSummary,
        questProgress,
        ...(recoveryNotice ? { recoveryNotice } : {})
      };
    }

    const monsterRest = await this.getMonsterRestCooldown(telegramUserId, options.source ?? "normal");
    if (monsterRest) {
      return {
        state: "monster-rest",
        character: characterSummary,
        questProgress,
        ...(recoveryNotice ? { recoveryNotice } : {}),
        ...monsterRest
      };
    }

    const difficulty = options.target
      ? PERSISTENT_FIGHT_DIFFICULTY_CONFIG.normal
      : getPersistentFightDifficultyConfig(options.difficulty);
    const baseMonster = options.target
      ? selectTargetedSoloFightMonster(characterSummary, this.rng, options.target)
      : selectSoloFightMonster(characterSummary, this.rng, difficulty);
    const monster = applyPersistentFightDifficulty(baseMonster, characterSummary, difficulty);
    const sessionId = randomUUID();
    const now = this.clock();
    const worldContext = buildCombatWorldContext({
      now,
      partySize: 1,
      locationTags: buildPersistentFightLocationTags(options.source ?? "normal")
    });
    const monsterContext = resolveMonsterContext({ monster, world: worldContext });
    const monsterStats = applyMonsterContextToStats(
      deriveMonsterCombatStats(monster),
      monsterContext
    );
    const state = startCombat({
      id: sessionId,
      hero: buildHeroCombatStats(characterSummary),
      monster: monsterStats
    });
    state.turnExpiresAt = getTurnExpiry(now).toISOString();
    state.source = options.source ?? "normal";
    state.originLocationId = resolvePersistentFightOriginLocationId(options);
    if (monsterContext) {
      state.context = monsterContext;
    }
    state.barks = createCombatBarkState({ monsterId: monster.id, seed: sessionId, audience: "solo" });
    state.monster.debugTrace = {
      ...state.monster.debugTrace,
      ...buildPersistentFightInterventionTrace(baseMonster, monster, difficulty)
    };
    const analytics = this.combatAnalytics?.createInitialState({
      characterId: character.id,
      character: characterSummary,
      monster: monsterStats,
      combatSource: mapPersistentFightSourceToAnalyticsSource(options.source ?? "normal"),
      startedAt: now,
      monsterType: getLootExpansionSourceForMonster(monster),
      difficultyTier: difficulty.id,
      baseMonsterLevel: baseMonster.level,
      effectiveMonsterLevel: monster.level
    });
    if (analytics) {
      state.analytics = analytics;
    }
    const session = await this.combatSessions.createForTelegramUser(telegramUserId, {
      id: sessionId,
      monsterId: monster.id,
      state,
      expiresAt: getSessionExpiry(now)
    });

    if (!session) {
      return { state: "no-character" };
    }

    if (session.id !== sessionId) {
      if (isTrainingDoppelgangerMonsterId(session.monsterId)) {
        return {
          state: "training-active",
          character: characterSummary,
          session,
          questProgress
        };
      }

      const activeMonster = findPersistentFightMonster(session);

      if (!activeMonster || session.state?.status !== "active") {
        return this.getFightOverviewForTelegramUser(telegramUserId);
      }

      return {
        state: "persistent-active",
        character: characterSummary,
        session,
        monster: activeMonster,
        questProgress,
        ...(recoveryNotice ? { recoveryNotice } : {})
      };
    }

    return {
      state: "persistent-active",
      character: characterSummary,
      session,
      monster,
      questProgress,
      started: true,
      ...(recoveryNotice ? { recoveryNotice } : {})
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
    const baseReward = MIMIC_SHAWARMA_COMBAT_REWARDS[action];
    const reward = {
      ...baseReward,
      xp: buildStarterLevelTwoXpReward({ remortCount: characterSummary.remortCount ?? 0 })
    };
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

    if (claim.state === "insufficient-gold") {
      throw new Error("Mimic shawarma combat daily claim unexpectedly required gold.");
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
      const expiredState = stampCombatCompletedAt(expireCombat(session.state), this.clock());
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

    const deadlineSession = await this.advanceExpiredPersistentTurn(
      telegramUserId,
      session,
      characterSummary,
      monster
    );
    if (deadlineSession.id === session.id && deadlineSession.state?.turn !== session.state.turn) {
      if (deadlineSession.status === "active" && deadlineSession.state?.status === "active") {
        return {
          state: "stale-turn",
          character: characterSummary,
          session: deadlineSession,
          monster,
          questProgress
        };
      }

      return {
        state: "terminal",
        character: characterSummary,
        session: deadlineSession,
        monster,
        questProgress,
        fightReward: await this.getOrRecoverPersistentFightReward(
          telegramUserId,
          deadlineSession,
          monster,
          characterSummary
        )
      };
    }

    const currentSession = deadlineSession;

    if (!currentSession.state) {
      return {
        state: "terminal",
        character: characterSummary,
        session: currentSession,
        monster,
        questProgress,
        fightReward: await this.getOrRecoverPersistentFightReward(
          telegramUserId,
          currentSession,
          monster,
          characterSummary
        )
      };
    }

    if (currentSession.state.turn !== input.turn) {
      return {
        state: "stale-turn",
        character: characterSummary,
        session: currentSession,
        monster,
        questProgress
      };
    }

    const resolved = resolveCombatTurn({
      state: currentSession.state,
      action: input.action,
      hero: buildHeroCombatStats(characterSummary),
      monster: buildPersistentMonsterCombatStats(monster, currentSession.state),
      rng: this.rng
    });

    if (!resolved.ok && resolved.reason !== "not-enough-mana" && resolved.reason !== "skill-on-cooldown") {
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

    if (!resolved.ok) {
      return {
        state: "not-enough-mana",
        reason: resolved.reason === "skill-on-cooldown" ? "skill-on-cooldown" : "not-enough-mana",
        character: characterSummary,
        session: currentSession,
        monster,
        questProgress
      };
    }

    const resolvedState = withNextTurnExpiry(stampCombatCompletedAt(resolved.state, this.clock()), this.clock());
    const updated = await this.combatSessions.updateByIdIfActiveTurn(currentSession.id, input.turn, {
      state: resolvedState,
      status: resolvedState.status,
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

    if (claim.state === "insufficient-gold") {
      throw new Error("Problem quest daily claim unexpectedly required gold.");
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

    if (claim.state === "insufficient-gold") {
      throw new Error("Persistent fight reward claim unexpectedly required gold.");
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
    await this.combatAnalytics?.recordTerminalSession(session);
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
    const result = await this.summarizeCharacterWithEquipmentResult(telegramUserId, character, options);

    return result.character;
  }

  private async summarizeCharacterWithEquipmentResult(
    telegramUserId: bigint,
    character: CharacterRecord,
    options: { syncResources?: boolean } = {}
  ): Promise<{ character: CharacterSummary; recoveryNotice?: ResourceRecoveryNotice }> {
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

      return {
        character: resourceAware.character,
        ...(resourceAware.recoveryNotice
          ? { recoveryNotice: resourceAware.recoveryNotice }
          : {})
      };
    }

    return {
      character: summarizeCharacter(character, {
        equippedItems
      })
    };
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
    await this.combatAnalytics?.recordTerminalSession(session);
  }

  private async getMonsterRestCooldown(
    telegramUserId: bigint,
    source: NonNullable<PersistentFightStartOptions["source"]>
  ): Promise<{ availableAt: Date; now: Date } | null> {
    if (!this.combatSessions || source === "adventure") {
      return null;
    }

    const now = this.clock();
    const since = new Date(now.getTime() - MONSTER_REST_COOLDOWN_MS * MONSTER_REST_ELIGIBLE_FIGHT_COUNT);
    const recent = await this.combatSessions.listCompletedByTelegramUserIdSince(telegramUserId, since);
    const eligible = recent
      .filter((session) => isMonsterRestEligibleSession(session))
      .sort((left, right) => left.completedAt.getTime() - right.completedAt.getTime());

    if (eligible.length < MONSTER_REST_ELIGIBLE_FIGHT_COUNT) {
      return null;
    }

    const streak = eligible.slice(-MONSTER_REST_ELIGIBLE_FIGHT_COUNT);
    const third = streak.at(-1);

    if (!third) {
      return null;
    }

    const availableAt = new Date(third.completedAt.getTime() + MONSTER_REST_COOLDOWN_MS);

    return availableAt > now ? { availableAt, now } : null;
  }
}

function resolvePersistentFightOriginLocationId(options: PersistentFightStartOptions): string {
  if (options.originLocationId) {
    return normalizePresenceLocationId(options.originLocationId);
  }

  if (options.source === "adventure") {
    return PRESENCE_LOCATION_KORCHMA_QUEST_TABLE;
  }

  if (options.source === "yeger") {
    return PRESENCE_LOCATION_KORCHMA_RANGER_CORNER;
  }

  return PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1;
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
  const baseMonsterLevel = getPersistentFightSessionBaseMonsterLevel(
    session,
    getAuthoredMonsterLevel(monster)
  );
  const effectiveMonsterLevel = getPersistentFightSessionMonsterLevel(session, monster.level);
  const lootProfileLevel = Math.max(1, effectiveMonsterLevel + difficulty.lootPowerOffset);
  const gold = buildPersistentFightWinGold(character.level, rng);
  const loot = rollMonsterLoot({
    monsterId: monster.id,
    monsterLoot,
    items,
    luck: character.stats.luck,
    dropChanceMultiplier: buildGoldSensitiveDropChanceMultiplier({
      gold,
      characterLevel: character.level,
      luck: character.stats.luck,
      difficulty
    }),
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
    xp: buildPersistentFightWinXp({
      characterLevel: character.level,
      luck: character.stats.luck,
      baseMonsterLevel,
      effectiveMonsterLevel,
      difficulty,
      rng
    }),
    gold,
    itemGrants: loot.state === "dropped" ? [{ itemId: loot.item.id, quantity: 1 }] : []
  };
}

function buildPersistentFightWinXp(input: {
  characterLevel: number;
  luck: number;
  baseMonsterLevel: number;
  effectiveMonsterLevel: number;
  difficulty: PersistentFightDifficultyConfig;
  rng: RandomSource;
}): number {
  if (input.difficulty.xpFactorRange) {
    const baseReward = rollLevelFactorReward({
      level: input.characterLevel,
      range: input.difficulty.xpFactorRange,
      luck: input.luck,
      rng: input.rng
    });

    if (input.difficulty.id === "easy") {
      return Math.max(1, Math.floor(baseReward));
    }

    const floor = buildHardPersistentFightWinXpFloor({
      characterLevel: input.characterLevel,
      baseMonsterLevel: input.baseMonsterLevel
    });
    return Math.max(floor, Math.ceil(baseReward));
  }

  return buildBaselinePersistentFightWinXp({
    characterLevel: input.characterLevel,
    baseMonsterLevel: input.baseMonsterLevel,
    effectiveMonsterLevel: input.effectiveMonsterLevel
  });
}

export function buildCenterBaselinePersistentFightWinXp(input: {
  characterLevel: number;
  baseMonsterLevel: number;
}): number {
  return buildBaselinePersistentFightWinXp({
    ...input,
    effectiveMonsterLevel: input.baseMonsterLevel
  });
}

export function buildHardPersistentFightWinXpFloor(input: {
  characterLevel: number;
  baseMonsterLevel: number;
}): number {
  return buildCenterBaselinePersistentFightWinXp(input) + 1;
}

function buildBaselinePersistentFightWinXp(input: {
  characterLevel: number;
  baseMonsterLevel: number;
  effectiveMonsterLevel: number;
}): number {
  const antiFarmGap = input.characterLevel - input.baseMonsterLevel;

  if (antiFarmGap > 3) {
    return 2;
  }

  if (antiFarmGap > 2) {
    return 3;
  }

  return Math.min(14, Math.max(5, 3 + input.effectiveMonsterLevel * 2));
}

function buildPersistentFightWinGold(
  characterLevel: number,
  rng: RandomSource
): number {
  return rng.nextInt(0, Math.max(0, Math.floor(characterLevel)));
}

function buildGoldSensitiveDropChanceMultiplier(input: {
  gold: number;
  characterLevel: number;
  luck: number;
  difficulty: PersistentFightDifficultyConfig;
}): number {
  const currentBaseChance = getItemDropChance(input.luck);
  const desiredChance = getGoldSensitiveItemDropChance(input);

  return (
    Math.floor((desiredChance / currentBaseChance) * 1_000_000_000_000) /
    1_000_000_000_000
  );
}

export function getGoldSensitiveItemDropChance(input: {
  gold: number;
  characterLevel: number;
  luck: number;
  difficulty: Pick<PersistentFightDifficultyConfig, "dropChanceMultiplier">;
}): number {
  const configuredMaxGoldChance =
    getItemDropChance(input.luck) * input.difficulty.dropChanceMultiplier;
  const maxGold = Math.max(0, Math.floor(input.characterLevel));
  const boundedGold = Math.min(maxGold, Math.max(0, Math.floor(input.gold)));
  const goldRatio = maxGold > 0 ? boundedGold / maxGold : 0;

  return Math.min(
    1,
    Math.max(
      0,
      ZERO_GOLD_ITEM_DROP_CHANCE +
        (configuredMaxGoldChance - ZERO_GOLD_ITEM_DROP_CHANCE) * goldRatio
    )
  );
}

function rollLevelFactorReward(input: {
  level: number;
  range: { min: number; max: number };
  luck: number;
  rng: RandomSource;
}): number {
  const luckBias = Math.min(0.23, Math.max(0, Math.floor(input.luck)) * 0.015);
  const roll = Math.min(0.999_999, input.rng.nextFloat() + luckBias);
  const factor = input.range.min + (input.range.max - input.range.min) * roll;

  return input.level * factor;
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

function getTurnExpiry(now: Date): Date {
  return new Date(now.getTime() + PERSISTENT_FIGHT_TURN_SECONDS * 1000);
}

function isTurnExpired(state: CombatState | null | undefined, now: Date): boolean {
  return Boolean(state?.turnExpiresAt && Date.parse(state.turnExpiresAt) <= now.getTime());
}

function withNextTurnExpiry(state: CombatState, now: Date): CombatState {
  if (state.status !== "active") {
    const next = { ...state };
    delete next.turnExpiresAt;
    return next;
  }

  return {
    ...state,
    turnExpiresAt: getTurnExpiry(now).toISOString()
  };
}

function isExpired(session: SoloCombatSessionRecord, now: Date): boolean {
  return session.expiresAt.getTime() <= now.getTime();
}

function stampCombatCompletedAt(state: CombatState, now: Date): CombatState {
  if (state.status === "active" || state.completedAt) {
    return state;
  }

  return {
    ...state,
    completedAt: now.toISOString()
  };
}

function findMonster(monsterId: string): MonsterContent | null {
  return monsters.find((monster) => monster.id === monsterId) ?? null;
}

function getAuthoredMonsterLevel(monster: MonsterContent): number {
  return findMonster(monster.id)?.level ?? monster.level;
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

  if (difficulty.monsterLevelRangeOffset) {
    const minLevel = Math.max(1, input.characterLevel + difficulty.monsterLevelRangeOffset.min);
    const maxLevel = Math.max(minLevel, input.characterLevel + difficulty.monsterLevelRangeOffset.max);

    if (input.baseMonsterLevel >= minLevel && input.baseMonsterLevel <= maxLevel) {
      return Math.max(1, Math.floor(input.baseMonsterLevel));
    }
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

function buildPersistentFightLocationTags(source: NonNullable<PersistentFightStartOptions["source"]>): string[] {
  if (source === "yeger") {
    return ["hunt", "outside"];
  }

  if (source === "adventure") {
    return ["korchma", "adventure"];
  }

  return ["korchma", "nyz", "underground", "cellar"];
}

function mapPersistentFightSourceToAnalyticsSource(
  source: NonNullable<PersistentFightStartOptions["source"]>
): CombatBalanceSource {
  if (source === "adventure") {
    return "adventure";
  }

  if (source === "yeger") {
    return "yeger";
  }

  return "regular_mob";
}

function buildPersistentMonsterCombatStats(
  monster: MonsterContent,
  state?: CombatState | null
): MonsterCombatStats {
  const derived = deriveMonsterCombatStats(monster);
  const stored = state?.monster;

  if (!stored) {
    return derived;
  }

  return {
    ...derived,
    level: stored.level ?? derived.level,
    hpMax: stored.hpMax,
    attack: stored.attack ?? derived.attack,
    armor: stored.armor ?? derived.armor,
    resist: stored.resist ?? derived.resist,
    dexterity: stored.dexterity ?? derived.dexterity,
    ...(stored.spellPower !== undefined ? { spellPower: stored.spellPower } : {}),
    ...(stored.contextModifiers ? { contextModifiers: { ...stored.contextModifiers } } : {}),
    ...(stored.debugTrace ? { debugTrace: { ...stored.debugTrace } } : {})
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

function getPersistentFightSessionBaseMonsterLevel(
  session: Pick<SoloCombatSessionRecord, "state"> | undefined,
  fallbackLevel: number
): number {
  const storedLevel = session?.state?.monster.debugTrace?.baseMonsterLevel;

  return Math.max(1, Math.floor(storedLevel ?? fallbackLevel));
}

function selectSoloFightMonster(
  character: CharacterSummary,
  rng: RandomSource,
  difficulty: PersistentFightDifficultyConfig = PERSISTENT_FIGHT_DIFFICULTY_CONFIG.normal
): MonsterContent {
  const maxMonsterLevel = Math.max(3, character.level);
  const closeMonsterLevelFloor = Math.max(1, character.level - 2);
  const eligibleMonsters = monsters.filter((monster) => isSoloFightMonsterEligible(monster, maxMonsterLevel));
  const difficultyCandidates = selectDifficultyMonsterCandidates(
    eligibleMonsters,
    character,
    difficulty
  );

  if (difficultyCandidates.length > 0) {
    return difficultyCandidates[rng.nextInt(0, difficultyCandidates.length - 1)] ?? difficultyCandidates[0]!;
  }

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

function selectDifficultyMonsterCandidates(
  eligibleMonsters: MonsterContent[],
  character: CharacterSummary,
  difficulty: PersistentFightDifficultyConfig
): MonsterContent[] {
  if (!difficulty.monsterLevelRangeOffset) {
    return [];
  }

  const minLevel = Math.max(1, character.level + difficulty.monsterLevelRangeOffset.min);
  const maxLevel = Math.max(minLevel, character.level + difficulty.monsterLevelRangeOffset.max);
  const candidates = eligibleMonsters.filter(
    (monster) => monster.level >= minLevel && monster.level <= maxLevel
  );

  return candidates.length > 0 ? candidates : [];
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
  const display = getCombatSkillDisplay(skill.id);
  const label = `${display.icon} ${display.name}`;

  if (skill.manaCost === 0) {
    return label;
  }

  return `${label} · ${skill.manaCost} ${pluralize(skill.manaCost, "мана", "мани", "мани")}`;
}

export interface CombatSkillDisplay {
  icon: string;
  name: string;
}

export function getCombatSkillDisplay(skillId: string | undefined): CombatSkillDisplay {
  switch (skillId) {
    case "skill.forceful-strike":
      return { icon: "💪", name: "Силовий удар" };
    case "skill.hot-spell":
      return { icon: "🪄", name: "Гаряче закляття" };
    case "skill.form-thirteen-b":
      return { icon: "📎", name: "Форма 13-Б" };
    case "skill.dangerous-couplet":
      return { icon: "🎼", name: "Небезпечний куплет" };
    case "skill.trick-shot":
      return { icon: "🎯", name: "Хитрий постріл" };
    case "skill.strict-blessing":
      return { icon: "🙏", name: "Суворе благословення" };
    case "skill.steppe-side-eye":
      return { icon: "🧿", name: "Степовий погляд" };
    default:
      return { icon: "🪓", name: "Обережний удар" };
  }
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
