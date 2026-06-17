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
  type CombatActorStats
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
  PERSISTENT_SOLO_FIGHT_REWARD_KEY
} from "./dailyActionKeys";
import {
  isTrainingDoppelgangerMonsterId,
  TRAINING_DOPPELGANGER_MONSTER_ID
} from "../domain/trainingDoppelganger";
import {
  APHOPHENIA_RECEIPT_OF_TWENTY_THREE_ITEM_ID,
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

export const THIRTEEN_SMALL_PROBLEMS_QUEST_KEY = "quest.thirteen-small-problems";
export const THIRTEEN_SMALL_PROBLEMS_QUEST_BUCKET = "once";
export const THIRTEEN_SMALL_PROBLEMS_TARGET_WINS = 13;
export const THIRTEEN_SMALL_PROBLEMS_REWARD = {
  xp: 35,
  gold: 10
};

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
    issueKey: "quest.problem-chain.13.issued",
    rewardKey: THIRTEEN_SMALL_PROBLEMS_QUEST_KEY,
    nextStageId: "23"
  },
  {
    id: "23",
    title: "Двадцять три підозрілі проблеми",
    target: 23,
    reward: {
      xp: 55,
      gold: 18,
      itemId: APHOPHENIA_RECEIPT_OF_TWENTY_THREE_ITEM_ID
    },
    issueKey: "quest.problem-chain.23.issued",
    rewardKey: "quest.problem-chain.23.reward",
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
    issueKey: "quest.problem-chain.42.issued",
    rewardKey: "quest.problem-chain.42.reward",
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
    issueKey: "quest.problem-chain.93.issued",
    rewardKey: "quest.problem-chain.93.reward",
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
  nextStageIssued: boolean;
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

export type FightLookupResult =
  | { state: "no-character" }
  | { state: "level-retired"; character: CharacterSummary; maxLevel: number }
  | { state: "needs-rest"; character: CharacterSummary }
  | {
      state: "persistent-ready";
      character: CharacterSummary;
      questProgress: ThirteenSmallProblemsProgress;
    }
  | {
      state: "persistent-active";
      character: CharacterSummary;
      session: SoloCombatSessionRecord;
      monster: MonsterContent;
      questProgress: ThirteenSmallProblemsProgress;
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

export interface PersistentFightStartOptions {
  source?: "normal" | "yeger";
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

      return {
        state: "persistent-terminal",
        character: characterSummary,
        session: expiredSession ?? { ...activeSession, status: "expired" },
        monster: findMonster(activeSession.monsterId),
        questProgress,
        fightReward: await this.getOrRecoverPersistentFightReward(
          telegramUserId,
          expiredSession ?? activeSession,
          findMonster(activeSession.monsterId),
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

      return {
        state: "persistent-terminal",
        character: characterSummary,
        session: expiredSession ?? { ...activeSession, state: expiredState, status: "expired" },
        monster: findMonster(activeSession.monsterId),
        questProgress,
        fightReward: await this.getOrRecoverPersistentFightReward(
          telegramUserId,
          expiredSession ?? activeSession,
          findMonster(activeSession.monsterId),
          characterSummary
        )
      };
    }

    const monster = findMonster(activeSession.monsterId);

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

        return {
          state: "persistent-terminal",
          character: characterSummary,
          session: expiredSession ?? { ...activeSession, state: expiredState, status: "expired" },
          monster: findMonster(activeSession.monsterId),
          questProgress,
          fightReward: await this.getOrRecoverPersistentFightReward(
            telegramUserId,
            expiredSession ?? activeSession,
            findMonster(activeSession.monsterId),
            characterSummary
          )
        };
      } else {
        const monster = findMonster(activeSession.monsterId);

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

    const monster = options.target
      ? selectTargetedSoloFightMonster(characterSummary, this.rng, options.target)
      : selectSoloFightMonster(characterSummary, this.rng);
    const sessionId = randomUUID();
    const state = startCombat({
      id: sessionId,
      hero: buildHeroCombatStats(characterSummary),
      monster: deriveMonsterCombatStats(monster)
    });
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
      questProgress
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
          monster: findMonster(activeSession.monsterId),
          questProgress
        };
      }
    }

    if (session.status !== "active") {
      return {
        state: "terminal",
        character: characterSummary,
        session,
        monster: findMonster(session.monsterId),
        questProgress,
        fightReward: await this.getOrRecoverPersistentFightReward(
          telegramUserId,
          session,
          findMonster(session.monsterId),
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
        monster: findMonster(session.monsterId),
        questProgress,
        fightReward: null
      };
    }

    const monster = findMonster(session.monsterId);

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

    if (!resolved.ok && resolved.reason === "not-enough-mana") {
      return {
        state: "not-enough-mana",
        character: characterSummary,
        session,
        monster,
        questProgress
      };
    }

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
          monster: findMonster(fallbackSession.monsterId),
          questProgress
        };
      }

      return {
        state: "terminal",
        character: characterSummary,
        session: fallbackSession,
        monster: findMonster(fallbackSession.monsterId),
        questProgress,
        fightReward: await this.getOrRecoverPersistentFightReward(
          telegramUserId,
          fallbackSession,
          findMonster(fallbackSession.monsterId),
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
    let nextStageIssued = false;

    if (nextStage) {
      const issued = await this.dailyActions.claimForTelegramUser(telegramUserId, {
        key: nextStage.issueKey,
        localDate: PROBLEM_QUEST_BUCKET,
        rewardXp: 0,
        rewardGold: 0,
        itemGrants: []
      });
      nextStageIssued = issued?.state === "created";
    }

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
        nextStageIssued,
        branchComplete: nextStage === null
      }
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
      session.state?.status ?? session.status
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

    const wins = this.combatSessions
      ? await this.combatSessions.countWonByTelegramUserId(telegramUserId, {
          excludeMonsterIds: [TRAINING_DOPPELGANGER_MONSTER_ID],
          ...(stageState.issuedAt ? { since: stageState.issuedAt } : {})
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
      issued: stageState.stage.id === "13" || stageState.issuedAt !== null,
      branchComplete: false
    };
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
      const issued =
        stage.id === "13"
          ? null
          : await this.dailyActions.findForTelegramUser(telegramUserId, {
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

    const activeStage = stageRecords.find(
      ({ stage, issuedAt, rewarded }) => stage.id !== "13" && issuedAt && !rewarded
    );

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
}

function buildPersistentFightReward(
  monster: MonsterContent,
  character: CharacterSummary,
  rng: RandomSource,
  status: SoloCombatSessionRecord["status"] = "won"
): { xp: number; gold: number; itemGrants: Array<{ itemId: string; quantity: number }> } {
  if (status === "lost") {
    return {
      xp: 1,
      gold: 0,
      itemGrants: []
    };
  }

  const loot = rollMonsterLoot({
    monsterId: monster.id,
    monsterLoot,
    items,
    luck: character.stats.luck,
    rng,
    character: {
      level: character.level,
      classId: character.classId,
      raceId: character.raceId,
      title: character.title
    },
    sourceId: getLootExpansionSourceForMonster(monster),
    sourceTags: monster.tags
  });

  return {
    xp: buildPersistentFightWinXp(character.level, monster.level),
    gold: Math.min(7, Math.max(1, 1 + Math.floor(monster.level / 2))),
    itemGrants: loot.state === "dropped" ? [{ itemId: loot.item.id, quantity: 1 }] : []
  };
}

function buildPersistentFightWinXp(characterLevel: number, monsterLevel: number): number {
  const levelGap = characterLevel - monsterLevel;

  if (levelGap > 3) {
    return 2;
  }

  if (levelGap > 2) {
    return 3;
  }

  return Math.min(14, Math.max(5, 3 + monsterLevel * 2));
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
