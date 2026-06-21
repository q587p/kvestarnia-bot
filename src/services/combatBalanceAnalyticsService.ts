import { createHash } from "node:crypto";
import type { CombatBalanceAnalyticsRepository } from "../db/repositories/combatBalanceAnalyticsRepository";
import type { SoloCombatSessionRecord } from "../db/repositories/soloCombatSessionRepository";
import type { CharacterSummary } from "../domain/characters/characterSummary";
import {
  createCombatAnalyticsState,
  mapCombatStateSourceToAnalyticsSource,
  mapCombatStatusToAnalyticsOutcome,
  type CombatBalanceSource,
  type MonsterCombatStats
} from "../domain/combat";

export interface CombatBalanceAnalyticsServiceOptions {
  enabled: boolean;
  isTestOrAdmin?: boolean;
}

export class CombatBalanceAnalyticsService {
  constructor(
    private readonly repository: CombatBalanceAnalyticsRepository,
    private readonly options: CombatBalanceAnalyticsServiceOptions
  ) {}

  isEnabled(): boolean {
    return this.options.enabled;
  }

  createInitialState(input: {
    characterId: string;
    character: CharacterSummary;
    monster: MonsterCombatStats;
    combatSource: CombatBalanceSource;
    startedAt: Date;
    monsterType?: string;
    difficultyTier?: string;
    baseMonsterLevel?: number;
    effectiveMonsterLevel?: number;
  }) {
    if (!this.options.enabled) {
      return undefined;
    }

    return createCombatAnalyticsState({
      ...input,
      playerAnalysisKey: buildPlayerAnalysisKey(input.characterId),
      isTestOrAdmin: this.options.isTestOrAdmin ?? false
    });
  }

  async recordTerminalSession(session: SoloCombatSessionRecord): Promise<void> {
    if (!this.options.enabled || !session.state) {
      return;
    }

    const state = session.state;
    const analytics = state.analytics;
    if (!analytics) {
      return;
    }
    const outcome = mapCombatStatusToAnalyticsOutcome(state.status);

    if (!outcome || state.status === "active") {
      return;
    }

    try {
      await this.repository.recordBattle({
        combatId: session.id,
        combatSource: analytics.combatSource ?? mapCombatStateSourceToAnalyticsSource(state.source),
        outcome,
        startedAt: parseDateOrFallback(analytics.startedAt, session.createdAt),
        finishedAt: parseDateOrFallback(state.completedAt, session.updatedAt),
        balanceVersion: analytics.balanceVersion,
        combatEngineVersion: analytics.combatEngineVersion,
        analyticsSchemaVersion: analytics.schemaVersion,
        playerAnalysisKey: analytics.playerAnalysisKey,
        characterId: analytics.characterId,
        isTestOrAdmin: analytics.isTestOrAdmin,
        classKey: analytics.player.classKey,
        playerLevel: analytics.player.level,
        remortCount: analytics.player.remortCount,
        playerMaxHp: analytics.player.hpMax,
        playerHpAtStart: analytics.player.hpAtStart,
        playerHpAtEnd: state.hero.hp,
        playerManaMax: analytics.player.manaMax,
        playerManaAtStart: analytics.player.manaAtStart,
        playerStats: analytics.player.stats,
        playerEquipment: analytics.player.equipment,
        mobTemplateKey: analytics.mob.templateKey,
        mobType: analytics.mob.type,
        mobLevel: analytics.mob.level,
        ...(analytics.mob.baseLevel !== undefined ? { mobBaseLevel: analytics.mob.baseLevel } : {}),
        mobDifficultyTier: analytics.mob.difficultyTier,
        mobMaxHp: analytics.mob.hpMax,
        mobHpAtEnd: state.monster.hp,
        roundsCount: Math.max(0, state.turn - 1),
        playerActionsCount: analytics.totals.playerActionsCount,
        manualPlayerActionsCount: analytics.totals.manualPlayerActionsCount,
        timeoutAutoActionsCount: analytics.totals.timeoutAutoActionsCount,
        timeoutSkipActionsCount: analytics.totals.timeoutSkipActionsCount,
        enemyActionsCount: analytics.totals.enemyActionsCount,
        damageDealt: analytics.totals.damageDealt,
        damageTaken: analytics.totals.damageTaken,
        healingDone: analytics.totals.healingDone,
        criticalHits: analytics.totals.criticalHits,
        misses: analytics.totals.misses,
        abilities: Object.values(analytics.abilities)
      });
    } catch (error) {
      console.warn("Квестарня: аналітика бою не записалася, бій не блокуємо.", error);
    }
  }
}

export function buildPlayerAnalysisKey(characterId: string): string {
  return createHash("sha256")
    .update(`kvestarnia:combat-balance:${characterId}`)
    .digest("hex")
    .slice(0, 32);
}

function parseDateOrFallback(value: string | undefined, fallback: Date): Date {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}
