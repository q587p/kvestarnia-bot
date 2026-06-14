import { randomUUID } from "node:crypto";
import { monsters } from "../content/monsters";
import type { MonsterContent } from "../content/schema";
import type { CharacterRepository } from "../db/repositories/characterRepository";
import type { DailyActionRepository, RewardLevelChange } from "../db/repositories/dailyActionRepository";
import type {
  SoloCombatSessionRecord,
  SoloCombatSessionRepository
} from "../db/repositories/soloCombatSessionRepository";
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
import {
  isWithinActivityMaxLevel,
  STARTER_ACTIVITY_MAX_LEVEL
} from "../domain/progression/activityGates";
import { CryptoRandomSource, type RandomSource } from "../shared/random";
import { systemClock, toIsoDate, type Clock } from "../shared/time";
import {
  MIMIC_SHAWARMA_ADVENTURE_KEY,
  MIMIC_SHAWARMA_COMBAT_PROBE_KEY
} from "./dailyActionKeys";
import {
  BADGE_OF_THIRTEEN_SMALL_PROBLEMS_ITEM_ID,
  enrichRewardItemGrants,
  PAN_OF_PERSUASION_ITEM_ID,
  RECEIPT_OF_FORMAL_SUSPICION_ITEM_ID,
  starterEquipmentGrant,
  STAMP_OF_MINOR_AUTHORITY_ITEM_ID,
  SUSPICIOUS_SHAWARMA_WRAPPER_ITEM_ID,
  type RewardItemGrant
} from "./itemGrant";

export { MIMIC_SHAWARMA_COMBAT_PROBE_KEY } from "./dailyActionKeys";
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

export interface ThirteenSmallProblemsProgress {
  title: "Тринадцять дрібних проблем";
  wins: number;
  target: number;
  completed: boolean;
  rewardClaimed: boolean;
}

export interface ThirteenSmallProblemsReward {
  state: "claimed" | "already-claimed";
  reward: FightReward;
  levelChange: RewardLevelChange | null;
}

export type FightLookupResult =
  | { state: "no-character" }
  | { state: "level-retired"; character: CharacterSummary; maxLevel: number }
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
      questReward: ThirteenSmallProblemsReward | null;
    }
  | {
      state: "terminal";
      character: CharacterSummary;
      session: SoloCombatSessionRecord;
      monster: MonsterContent | null;
      questProgress: ThirteenSmallProblemsProgress;
    };

export interface FightReward {
  xp: number;
  gold: number;
  localDate: string;
  itemGrants: RewardItemGrant[];
}

export class FightService {
  constructor(
    private readonly characters: CharacterRepository,
    private readonly dailyActions: DailyActionRepository,
    private readonly clock: Clock = systemClock,
    private readonly combatSessions?: SoloCombatSessionRepository,
    private readonly rng: RandomSource = new CryptoRandomSource()
  ) {}

  async getFightOverviewForTelegramUser(telegramUserId: bigint): Promise<FightLookupResult> {
    const character = await this.characters.findByTelegramUserId(telegramUserId);

    if (!character) {
      return { state: "no-character" };
    }

    const characterSummary = summarizeCharacter(character);

    if (isWithinActivityMaxLevel(characterSummary.level, STARTER_ACTIVITY_MAX_LEVEL)) {
      return this.getMimicShawarmaForTelegramUser(telegramUserId);
    }

    if (!this.combatSessions) {
      return {
        state: "level-retired",
        character: characterSummary,
        maxLevel: STARTER_ACTIVITY_MAX_LEVEL
      };
    }

    const questProgress = await this.getThirteenSmallProblemsProgress(telegramUserId);
    const activeSession = await this.combatSessions.findActiveByTelegramUserId(telegramUserId);

    if (!activeSession) {
      return {
        state: "persistent-ready",
        character: characterSummary,
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
        questProgress
      };
    }

    if (isExpired(activeSession, this.clock())) {
      const expiredState = expireCombat(activeSession.state);
      const expiredSession = await this.combatSessions.updateById(activeSession.id, {
        state: expiredState,
        status: expiredState.status
      });

      return {
        state: "persistent-terminal",
        character: characterSummary,
        session: expiredSession ?? { ...activeSession, state: expiredState, status: "expired" },
        monster: findMonster(activeSession.monsterId),
        questProgress
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

      return {
        state: "persistent-terminal",
        character: characterSummary,
        session: expiredSession ?? { ...activeSession, state: expiredState, status: expiredState.status },
        monster,
        questProgress
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

  async getFightForTelegramUser(telegramUserId: bigint): Promise<FightLookupResult> {
    const character = await this.characters.findByTelegramUserId(telegramUserId);

    if (!character) {
      return { state: "no-character" };
    }

    const characterSummary = summarizeCharacter(character);

    if (isWithinActivityMaxLevel(characterSummary.level, STARTER_ACTIVITY_MAX_LEVEL)) {
      return this.getMimicShawarmaForTelegramUser(telegramUserId);
    }

    if (!this.combatSessions) {
      return {
        state: "level-retired",
        character: characterSummary,
        maxLevel: STARTER_ACTIVITY_MAX_LEVEL
      };
    }

    const questProgress = await this.getThirteenSmallProblemsProgress(telegramUserId);
    const activeSession = await this.combatSessions.findActiveByTelegramUserId(telegramUserId);

    if (activeSession) {
      if (!activeSession.state) {
        await this.combatSessions.markStatusById(activeSession.id, "expired");
      } else if (isExpired(activeSession, this.clock())) {
        const expiredState = expireCombat(activeSession.state);
        const expiredSession = await this.combatSessions.updateById(activeSession.id, {
          state: expiredState,
          status: expiredState.status
        });

        return {
          state: "persistent-terminal",
          character: characterSummary,
          session: expiredSession ?? { ...activeSession, state: expiredState, status: "expired" },
          monster: findMonster(activeSession.monsterId),
          questProgress
        };
      } else {
        const monster = findMonster(activeSession.monsterId);

        if (!monster) {
          const expiredState = expireCombat(activeSession.state);
          const expiredSession = await this.combatSessions.updateById(activeSession.id, {
            state: expiredState,
            status: expiredState.status
          });

          return {
            state: "persistent-terminal",
            character: characterSummary,
            session: expiredSession ?? { ...activeSession, state: expiredState, status: "expired" },
            monster: null,
            questProgress
          };
        }

        return {
          state: activeSession.state.status === "active" ? "persistent-active" : "persistent-terminal",
          character: characterSummary,
          session: activeSession,
          monster,
          questProgress
        };
      }
    }

    const monster = selectSoloFightMonster(characterSummary, this.rng);
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

    const characterSummary = summarizeCharacter(character);

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

    const characterSummary = summarizeCharacter(character);

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
        questProgress
      };
    }

    if (!session.state) {
      await this.combatSessions.markStatusById(session.id, "expired");
      return {
        state: "terminal",
        character: characterSummary,
        session: { ...session, status: "expired" },
        monster: findMonster(session.monsterId),
        questProgress
      };
    }

    const monster = findMonster(session.monsterId);

    if (isExpired(session, this.clock())) {
      const expiredState = expireCombat(session.state);
      const updated = await this.combatSessions.updateById(session.id, {
        state: expiredState,
        status: expiredState.status
      });

      return {
        state: "terminal",
        character: characterSummary,
        session: updated ?? { ...session, state: expiredState, status: "expired" },
        monster,
        questProgress
      };
    }

    if (!monster || session.state.status !== "active") {
      return {
        state: "terminal",
        character: characterSummary,
        session,
        monster,
        questProgress
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
        questProgress
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

      return {
        state: fallbackSession.status === "active" && fallbackSession.state?.status === "active"
          ? "stale-turn"
          : "terminal",
        character: characterSummary,
        session: fallbackSession,
        monster: findMonster(fallbackSession.monsterId),
        questProgress
      };
    }

    const questReward =
      updated.status === "won"
        ? await this.claimThirteenSmallProblemsRewardIfComplete(telegramUserId)
        : null;

    return {
      state: "updated",
      character: characterSummary,
      session: updated,
      monster,
      questProgress: await this.getThirteenSmallProblemsProgress(telegramUserId),
      questReward
    };
  }

  private async getThirteenSmallProblemsProgress(
    telegramUserId: bigint
  ): Promise<ThirteenSmallProblemsProgress> {
    const wins = this.combatSessions
      ? await this.combatSessions.countWonByTelegramUserId(telegramUserId)
      : 0;
    const rewardClaim = await this.dailyActions.findForTelegramUser(telegramUserId, {
      key: THIRTEEN_SMALL_PROBLEMS_QUEST_KEY,
      localDate: THIRTEEN_SMALL_PROBLEMS_QUEST_BUCKET
    });

    return {
      title: "Тринадцять дрібних проблем",
      wins: Math.min(wins, THIRTEEN_SMALL_PROBLEMS_TARGET_WINS),
      target: THIRTEEN_SMALL_PROBLEMS_TARGET_WINS,
      completed: wins >= THIRTEEN_SMALL_PROBLEMS_TARGET_WINS,
      rewardClaimed: rewardClaim !== null
    };
  }

  private async claimThirteenSmallProblemsRewardIfComplete(
    telegramUserId: bigint
  ): Promise<ThirteenSmallProblemsReward | null> {
    const wins = this.combatSessions
      ? await this.combatSessions.countWonByTelegramUserId(telegramUserId)
      : 0;

    if (wins < THIRTEEN_SMALL_PROBLEMS_TARGET_WINS) {
      return null;
    }

    const claim = await this.dailyActions.claimForTelegramUser(telegramUserId, {
      key: THIRTEEN_SMALL_PROBLEMS_QUEST_KEY,
      localDate: THIRTEEN_SMALL_PROBLEMS_QUEST_BUCKET,
      rewardXp: THIRTEEN_SMALL_PROBLEMS_REWARD.xp,
      rewardGold: THIRTEEN_SMALL_PROBLEMS_REWARD.gold,
      itemGrants: [
        {
          itemId: BADGE_OF_THIRTEEN_SMALL_PROBLEMS_ITEM_ID,
          quantity: 1,
          maxOwnedQuantity: 1
        }
      ]
    });

    if (!claim) {
      return null;
    }

    return {
      state: claim.state === "created" ? "claimed" : "already-claimed",
      reward: {
        xp: claim.action.rewardXp,
        gold: claim.action.rewardGold,
        localDate: claim.action.localDate,
        itemGrants: claim.state === "created" ? enrichRewardItemGrants(claim.itemGrants) : []
      },
      levelChange: claim.levelChange
    };
  }
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

function buildHeroCombatStats(character: CharacterSummary): CombatActorStats {
  return {
    level: character.level,
    hpMax: character.hpMax,
    manaMax: character.manaMax,
    classId: character.classId,
    ...character.stats
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
  const candidates = monsters.filter((monster) => {
    const tags = new Set(monster.tags);

    return (
      monster.id !== "monster.mimic-shawarma" &&
      !tags.has("starter") &&
      !tags.has("boss") &&
      monster.level <= Math.max(3, character.level)
    );
  });
  const fallback = monsters.find((monster) => monster.id === "monster.deadline-spider");

  if (!fallback) {
    throw new Error("Квестарня: немає монстра для solo fight fallback.");
  }

  if (candidates.length === 0) {
    return fallback;
  }

  return candidates[rng.nextInt(0, candidates.length - 1)] ?? candidates[0] ?? fallback;
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
