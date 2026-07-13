import type { CharacterRecord, CharacterRepository } from "../db/repositories/characterRepository";
import type { ClassNoncombatRepository } from "../db/repositories/classNoncombatRepository";
import type {
  DailyActionRecord,
  DailyActionRepository,
  RewardLevelChange
} from "../db/repositories/dailyActionRepository";
import type { DuelChallengeRecord } from "../db/repositories/duelChallengeRepository";
import type { SoloCombatSessionRecord } from "../db/repositories/soloCombatSessionRepository";
import { summarizeCharacter, type CharacterSummary } from "../domain/characters/characterSummary";
import { FIGHTING_CORNER_MIN_LEVEL } from "../domain/progression/activityGates";
import { TRAINING_DOPPELGANGER_MONSTER_ID } from "../domain/trainingDoppelganger";
import { getLevelStartXp, LEVEL_XP_THRESHOLDS } from "../domain/progression/level";
import {
  enrichRewardItemGrants,
  ISKROKAMIN_ITEM_ID,
  PINK_SOAP_OF_FIRST_RULE_ITEM_ID,
  starterEquipmentGrant,
  type RewardItemGrant
} from "./itemGrant";
import { systemClock, type Clock } from "../shared/time";
import {
  normalizePresenceLocationId,
  PRESENCE_LOCATION_KORCHMA_QUEST_TABLE
} from "./presenceService";

export const FIGHTING_CORNER_QUEST_ID = "fighting_corner_first_rule";
export const FIGHTING_CORNER_QUEST_TITLE = "Перше правило Бійцівського кутка";
export const FIGHTING_CORNER_QUEST_REQUIRED_LEVEL = FIGHTING_CORNER_MIN_LEVEL;

export const FIGHTING_CORNER_QUEST_KEYS = {
  accepted: "quest.fighting-corner.accepted",
  training: "quest.fighting-corner.training-completed",
  quickDuel: "quest.fighting-corner.quick-duel-completed",
  turnBasedDuel: "quest.fighting-corner.turn-based-duel-completed",
  completed: "quest.fighting-corner.completed"
} as const;

const ALL_KEYS = Object.values(FIGHTING_CORNER_QUEST_KEYS);

export interface FightingCornerQuestProgress {
  accepted: boolean;
  trainingCompleted: boolean;
  quickDuelCompleted: boolean;
  turnBasedDuelCompleted: boolean;
  completedObjectives: number;
  requiredObjectives: 3;
  readyToClaim: boolean;
  currentLocationId: string | null;
}

export interface FightingCornerQuestReward {
  xp: number;
  gold: number;
  itemGrants: RewardItemGrant[];
}

export type FightingCornerQuestLookupResult =
  | { state: "disabled" }
  | { state: "no-character" }
  | { state: "level-locked"; character: CharacterSummary; requiredLevel: number }
  | { state: "available"; character: CharacterSummary; progress: FightingCornerQuestProgress }
  | { state: "in-progress" | "turn-in-ready"; character: CharacterSummary; progress: FightingCornerQuestProgress }
  | {
      state: "completed";
      character: CharacterSummary;
      progress: FightingCornerQuestProgress;
      reward: FightingCornerQuestReward;
    };

export type FightingCornerQuestAcceptResult =
  | { state: "disabled" | "no-character" }
  | { state: "level-locked"; character: CharacterSummary; requiredLevel: number }
  | { state: "wrong-location"; character: CharacterSummary; progress: FightingCornerQuestProgress }
  | { state: "accepted" | "already-accepted"; character: CharacterSummary; progress: FightingCornerQuestProgress }
  | {
      state: "already-completed";
      character: CharacterSummary;
      progress: FightingCornerQuestProgress;
      reward: FightingCornerQuestReward;
    };

export type FightingCornerQuestClaimResult =
  | { state: "disabled" | "no-character" }
  | { state: "level-locked"; character: CharacterSummary; requiredLevel: number }
  | { state: "not-started" | "missing-progress" | "wrong-location"; character: CharacterSummary; progress: FightingCornerQuestProgress }
  | {
      state: "completed" | "already-completed";
      character: CharacterSummary;
      progress: FightingCornerQuestProgress;
      reward: FightingCornerQuestReward;
      levelChange: RewardLevelChange | null;
    };

export type FightingCornerQuestObjective = "training" | "quick-duel" | "turn-based-duel";

export interface FightingCornerQuestProgressUpdate {
  telegramUserId: bigint;
  objective: FightingCornerQuestObjective;
  progress: FightingCornerQuestProgress;
}

interface FightingCornerQuestContext {
  character: CharacterRecord;
  lifeToken: string;
  actions: Map<string, DailyActionRecord>;
  progress: FightingCornerQuestProgress;
}

export class FightingCornerQuestService {
  constructor(
    private readonly characters: CharacterRepository,
    private readonly dailyActions: DailyActionRepository,
    private readonly rogueRetaliations: Pick<ClassNoncombatRepository, "isRogueRetaliationDuelInviteToken">,
    private readonly options: { enabled: boolean; devHelpersEnabled: boolean },
    private readonly clock: Clock = systemClock
  ) {}

  isEnabled(): boolean {
    return this.options.enabled;
  }

  isDevHelperEnabled(): boolean {
    return this.options.devHelpersEnabled;
  }

  async getForTelegramUser(
    telegramUserId: bigint,
    options: { character?: CharacterRecord } = {}
  ): Promise<FightingCornerQuestLookupResult> {
    if (!this.options.enabled) {
      return { state: "disabled" };
    }

    const context = await this.getContext(telegramUserId, options.character);
    if (!context) {
      return { state: "no-character" };
    }

    const character = summarizeCharacter(context.character);
    if (context.actions.has(FIGHTING_CORNER_QUEST_KEYS.completed)) {
      return {
        state: "completed",
        character,
        progress: context.progress,
        reward: rewardFromStoredAction(context.actions.get(FIGHTING_CORNER_QUEST_KEYS.completed)!)
      };
    }

    if (character.level < FIGHTING_CORNER_QUEST_REQUIRED_LEVEL) {
      return { state: "level-locked", character, requiredLevel: FIGHTING_CORNER_QUEST_REQUIRED_LEVEL };
    }

    if (!context.progress.accepted) {
      return { state: "available", character, progress: context.progress };
    }

    return {
      state: context.progress.readyToClaim ? "turn-in-ready" : "in-progress",
      character,
      progress: context.progress
    };
  }

  async acceptForTelegramUser(telegramUserId: bigint): Promise<FightingCornerQuestAcceptResult> {
    if (!this.options.enabled) {
      return { state: "disabled" };
    }

    const context = await this.getContext(telegramUserId);
    if (!context) {
      return { state: "no-character" };
    }

    const character = summarizeCharacter(context.character);
    if (context.actions.has(FIGHTING_CORNER_QUEST_KEYS.completed)) {
      return {
        state: "already-completed",
        character,
        progress: context.progress,
        reward: rewardFromStoredAction(context.actions.get(FIGHTING_CORNER_QUEST_KEYS.completed)!)
      };
    }

    if (character.level < FIGHTING_CORNER_QUEST_REQUIRED_LEVEL) {
      return { state: "level-locked", character, requiredLevel: FIGHTING_CORNER_QUEST_REQUIRED_LEVEL };
    }

    if (context.progress.accepted) {
      return { state: "already-accepted", character, progress: context.progress };
    }

    if (context.progress.currentLocationId !== PRESENCE_LOCATION_KORCHMA_QUEST_TABLE) {
      return { state: "wrong-location", character, progress: context.progress };
    }

    const claim = await this.dailyActions.claimForTelegramUser(telegramUserId, {
      key: FIGHTING_CORNER_QUEST_KEYS.accepted,
      localDate: context.lifeToken,
      rewardXp: 0,
      rewardGold: 0,
      expectedLife: { remortCount: context.character.remortCount ?? 0 },
      resultJson: {
        kind: "fighting-corner-quest-accepted",
        version: 2,
        questId: FIGHTING_CORNER_QUEST_ID,
        acceptedAt: this.clock().toISOString()
      }
    });

    if (!claim) {
      return { state: "no-character" };
    }
    if (claim.state === "insufficient-gold") {
      throw new Error("Fighting Corner quest acceptance unexpectedly required gold.");
    }

    return {
      state: claim.state === "created" ? "accepted" : "already-accepted",
      character: summarizeCharacter(claim.character),
      progress: buildProgress(new Map([
        ...context.actions,
        [FIGHTING_CORNER_QUEST_KEYS.accepted, claim.action]
      ]), context.progress.currentLocationId)
    };
  }

  async claimForTelegramUser(telegramUserId: bigint): Promise<FightingCornerQuestClaimResult> {
    if (!this.options.enabled) {
      return { state: "disabled" };
    }

    const context = await this.getContext(telegramUserId);
    if (!context) {
      return { state: "no-character" };
    }

    const character = summarizeCharacter(context.character);
    if (character.level < FIGHTING_CORNER_QUEST_REQUIRED_LEVEL) {
      return { state: "level-locked", character, requiredLevel: FIGHTING_CORNER_QUEST_REQUIRED_LEVEL };
    }

    if (context.progress.currentLocationId !== PRESENCE_LOCATION_KORCHMA_QUEST_TABLE) {
      return { state: "wrong-location", character, progress: context.progress };
    }

    const completed = context.actions.get(FIGHTING_CORNER_QUEST_KEYS.completed);
    if (completed) {
      return {
        state: "already-completed",
        character,
        progress: context.progress,
        reward: rewardFromStoredAction(completed),
        levelChange: null
      };
    }

    if (!context.progress.accepted) {
      return { state: "not-started", character, progress: context.progress };
    }
    if (!context.progress.readyToClaim) {
      return { state: "missing-progress", character, progress: context.progress };
    }

    const rewardXp = getFightingCornerQuestRewardXp(context.character);
    const rewardGold = getFightingCornerQuestRewardGold(context.character.level);
    const claim = await this.dailyActions.claimForTelegramUser(telegramUserId, {
      key: FIGHTING_CORNER_QUEST_KEYS.completed,
      localDate: context.lifeToken,
      rewardXp,
      rewardGold,
      itemGrants: [
        starterEquipmentGrant(PINK_SOAP_OF_FIRST_RULE_ITEM_ID),
        { itemId: ISKROKAMIN_ITEM_ID, quantity: 1 }
      ],
      questIskrokaminBonus: true,
      expectedLife: { remortCount: context.character.remortCount ?? 0 },
      resultJson: {
        kind: "fighting-corner-quest-completed",
        version: 1,
        questId: FIGHTING_CORNER_QUEST_ID,
        reward: { xp: rewardXp, gold: rewardGold }
      }
    });

    if (!claim) {
      return { state: "no-character" };
    }
    if (claim.state === "insufficient-gold") {
      throw new Error("Fighting Corner quest completion unexpectedly required gold.");
    }

    return {
      state: claim.state === "created" ? "completed" : "already-completed",
      character: summarizeCharacter(claim.character),
      progress: { ...context.progress, readyToClaim: true },
      reward: claim.state === "created"
        ? {
            xp: claim.action.rewardXp,
            gold: claim.action.rewardGold,
            itemGrants: enrichRewardItemGrants(claim.itemGrants)
          }
        : rewardFromStoredAction(claim.action),
      levelChange: claim.state === "created" ? claim.levelChange : null
    };
  }

  async recordTrainingSessionSafely(
    telegramUserId: bigint,
    session: Pick<SoloCombatSessionRecord, "id" | "monsterId" | "status" | "state" | "updatedAt">
  ): Promise<FightingCornerQuestProgressUpdate[]> {
    const terminalStatus = session.state?.status ?? session.status;
    if (
      !this.options.enabled ||
      session.monsterId !== TRAINING_DOPPELGANGER_MONSTER_ID ||
      (terminalStatus !== "won" && terminalStatus !== "lost") ||
      session.state?.settlement?.status !== "completed"
    ) {
      return [];
    }

    const completedAt = parseStoredDate(session.state.completedAt) ?? session.updatedAt;
    const expectedRemortCount = session.state.life?.remortCount;

    return this.recordObjectiveSafely({
      telegramUserId,
      objective: "training",
      key: FIGHTING_CORNER_QUEST_KEYS.training,
      sourceId: session.id,
      occurredAt: completedAt,
      ...(expectedRemortCount === undefined ? {} : { expectedRemortCount })
    });
  }

  async recordResolvedDuelSafely(
    challenge: DuelChallengeRecord,
    options: { hasResolvedRound?: boolean } = {}
  ): Promise<FightingCornerQuestProgressUpdate[]> {
    if (
      !this.options.enabled ||
      challenge.status !== "resolved" ||
      !challenge.resolvedAt ||
      !challenge.target ||
      !challenge.result
    ) {
      return [];
    }

    if (challenge.mode === "quick") {
      try {
        if (
          !this.rogueRetaliations.isRogueRetaliationDuelInviteToken ||
          await this.rogueRetaliations.isRogueRetaliationDuelInviteToken(challenge.inviteToken)
        ) {
          return [];
        }
      } catch (error) {
        console.warn("Kvestarnia: Fighting Corner quest could not classify a quick duel.", error);
        return [];
      }
    } else if (options.hasResolvedRound !== true) {
      return [];
    }

    const objective = challenge.mode === "quick" ? "quick-duel" : "turn-based-duel";
    const key = challenge.mode === "quick"
      ? FIGHTING_CORNER_QUEST_KEYS.quickDuel
      : FIGHTING_CORNER_QUEST_KEYS.turnBasedDuel;
    const participants = [
      {
        telegramUserId: challenge.challenger.telegramUserId,
        expectedRemortCount: challenge.result.participants?.challenger.remortCount
          ?? challenge.challenger.remortCount
      },
      {
        telegramUserId: challenge.target.telegramUserId,
        expectedRemortCount: challenge.result.participants?.target.remortCount
          ?? challenge.target.remortCount
      }
    ];

    const updates = await Promise.all(participants.map((participant) => this.recordObjectiveSafely({
      telegramUserId: participant.telegramUserId,
      ...(participant.expectedRemortCount === undefined
        ? {}
        : { expectedRemortCount: participant.expectedRemortCount }),
      objective,
      key,
      sourceId: challenge.id,
      occurredAt: challenge.resolvedAt!
    })));

    return updates.flat();
  }

  async resetCurrentLifeForTelegramUser(
    telegramUserId: bigint
  ): Promise<"reset" | "no-character" | "disabled"> {
    if (!this.options.devHelpersEnabled || !this.dailyActions.deleteForTelegramUser) {
      return "disabled";
    }

    const character = await this.characters.findByTelegramUserId(telegramUserId);
    if (!character) {
      return "no-character";
    }

    const localDate = buildLifeToken(character.remortCount ?? 0);
    await Promise.all(ALL_KEYS.map((key) => this.dailyActions.deleteForTelegramUser!(telegramUserId, {
      key,
      localDate
    })));
    return "reset";
  }

  private async recordObjectiveSafely(input: {
    telegramUserId: bigint;
    objective: FightingCornerQuestObjective;
    key: string;
    sourceId: string;
    occurredAt: Date;
    expectedRemortCount?: number;
  }): Promise<FightingCornerQuestProgressUpdate[]> {
    try {
      const context = await this.getContext(input.telegramUserId);
      const accepted = context?.actions.get(FIGHTING_CORNER_QUEST_KEYS.accepted);
      const acceptedAt = accepted ? readAcceptedAt(accepted.resultJson) : null;
      if (
        !context ||
        !accepted ||
        !acceptedAt ||
        context.actions.has(FIGHTING_CORNER_QUEST_KEYS.completed) ||
        context.actions.has(input.key) ||
        input.occurredAt.getTime() <= acceptedAt.getTime() ||
        (input.expectedRemortCount !== undefined &&
          (context.character.remortCount ?? 0) !== input.expectedRemortCount)
      ) {
        return [];
      }

      const claim = await this.dailyActions.claimForTelegramUser(input.telegramUserId, {
        key: input.key,
        localDate: context.lifeToken,
        rewardXp: 0,
        rewardGold: 0,
        expectedLife: { remortCount: context.character.remortCount ?? 0 },
        resultJson: {
          kind: "fighting-corner-quest-progress",
          version: 1,
          questId: FIGHTING_CORNER_QUEST_ID,
          objective: input.objective,
          sourceId: input.sourceId,
          occurredAt: input.occurredAt.toISOString()
        }
      });

      if (!claim || claim.state !== "created") {
        return [];
      }

      return [{
        telegramUserId: input.telegramUserId,
        objective: input.objective,
        progress: buildProgress(new Map([...context.actions, [input.key, claim.action]]), context.progress.currentLocationId)
      }];
    } catch (error) {
      console.warn("Kvestarnia: Fighting Corner quest progress follow-up failed.", error);
      return [];
    }
  }

  private async getContext(
    telegramUserId: bigint,
    providedCharacter?: CharacterRecord
  ): Promise<FightingCornerQuestContext | null> {
    const character = providedCharacter ?? await this.characters.findByTelegramUserId(telegramUserId);
    if (!character) {
      return null;
    }

    if (!this.dailyActions.listForCharacterByKeys) {
      throw new Error("DailyActionRepository.listForCharacterByKeys is required for the Fighting Corner quest.");
    }

    const lifeToken = buildLifeToken(character.remortCount ?? 0);
    const rows = await this.dailyActions.listForCharacterByKeys(character.id, {
      keys: ALL_KEYS,
      localDate: lifeToken,
      take: ALL_KEYS.length
    });
    const actions = new Map(rows.map((row) => [row.key, row]));
    const currentLocationId = normalizePresenceLocationId(character.currentLocationId);

    return {
      character,
      lifeToken,
      actions,
      progress: buildProgress(actions, currentLocationId)
    };
  }
}

export function getFightingCornerQuestRewardXp(
  character: Pick<CharacterRecord, "level" | "remortCount">
): number {
  const remortCount = character.remortCount ?? 0;
  const maxLevel = LEVEL_XP_THRESHOLDS.length;
  const level = Math.max(1, Math.min(maxLevel, Math.floor(character.level)));
  const lowerLevel = level >= maxLevel ? maxLevel - 1 : level;
  const upperLevel = lowerLevel + 1;
  const bandWidth = Math.max(
    1,
    getLevelStartXp(upperLevel, { remortCount }) - getLevelStartXp(lowerLevel, { remortCount })
  );

  return Math.min(42, Math.max(5, Math.ceil(bandWidth * 0.42)));
}

export function getFightingCornerQuestRewardGold(level: number): number {
  return Math.min(93, 13 + Math.max(1, Math.floor(level)) * 6);
}

function buildProgress(
  actions: ReadonlyMap<string, DailyActionRecord>,
  currentLocationId: string | null
): FightingCornerQuestProgress {
  const trainingCompleted = actions.has(FIGHTING_CORNER_QUEST_KEYS.training);
  const quickDuelCompleted = actions.has(FIGHTING_CORNER_QUEST_KEYS.quickDuel);
  const turnBasedDuelCompleted = actions.has(FIGHTING_CORNER_QUEST_KEYS.turnBasedDuel);
  const completedObjectives = [trainingCompleted, quickDuelCompleted, turnBasedDuelCompleted]
    .filter(Boolean).length;

  return {
    accepted: actions.has(FIGHTING_CORNER_QUEST_KEYS.accepted),
    trainingCompleted,
    quickDuelCompleted,
    turnBasedDuelCompleted,
    completedObjectives,
    requiredObjectives: 3,
    readyToClaim: completedObjectives === 3,
    currentLocationId
  };
}

function rewardFromStoredAction(action: DailyActionRecord): FightingCornerQuestReward {
  return {
    xp: action.rewardXp,
    gold: action.rewardGold,
    itemGrants: enrichRewardItemGrants(readAppliedItemGrants(action.resultJson))
  };
}

function readAppliedItemGrants(value: unknown): Array<{ itemId: string; quantity: number }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  const reward = (value as { reward?: unknown }).reward;
  if (!reward || typeof reward !== "object" || Array.isArray(reward)) {
    return [];
  }

  const appliedItemGrants = (reward as { appliedItemGrants?: unknown }).appliedItemGrants;
  const grants = Array.isArray(appliedItemGrants)
    ? appliedItemGrants
    : (reward as { itemGrants?: unknown }).itemGrants;
  if (!Array.isArray(grants)) {
    return [];
  }

  return grants.flatMap((grant) => {
    if (!grant || typeof grant !== "object" || Array.isArray(grant)) {
      return [];
    }
    const itemId = (grant as { itemId?: unknown }).itemId;
    const quantity = (grant as { quantity?: unknown }).quantity;
    return typeof itemId === "string" && typeof quantity === "number"
      ? [{ itemId, quantity: Math.max(0, Math.floor(quantity)) }]
      : [];
  });
}

function parseStoredDate(value: unknown): Date | null {
  if (typeof value !== "string") {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function readAcceptedAt(value: unknown): Date | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return parseStoredDate((value as { acceptedAt?: unknown }).acceptedAt);
}

function buildLifeToken(remortCount: number): string {
  return `life:${Math.max(0, Math.floor(remortCount))}`;
}
