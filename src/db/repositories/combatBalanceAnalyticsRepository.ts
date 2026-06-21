import type {
  CombatAnalyticsAbilityAccumulatorV1,
  CombatBalanceOutcome,
  CombatBalanceSource
} from "../../domain/combat";
import type { CharacterStats } from "../../domain/characters/starterStats";

export interface CombatBalanceBattleRecordInput {
  combatId: string;
  combatSource: CombatBalanceSource;
  outcome: CombatBalanceOutcome;
  startedAt: Date;
  finishedAt: Date;
  balanceVersion: string;
  combatEngineVersion: string;
  analyticsSchemaVersion: number;
  playerAnalysisKey: string;
  characterId: string;
  isTestOrAdmin: boolean;
  classKey: string;
  playerLevel: number;
  remortCount: number;
  playerMaxHp: number;
  playerHpAtStart: number;
  playerHpAtEnd: number;
  playerManaMax: number;
  playerManaAtStart: number;
  playerStats: CharacterStats;
  playerEquipment: {
    armor: number;
    resist: number;
    weaponDamage: number;
    spellPower: number;
  };
  mobTemplateKey: string;
  mobType: string;
  mobLevel: number;
  mobBaseLevel?: number;
  mobDifficultyTier: string;
  mobMaxHp: number;
  mobHpAtEnd: number;
  roundsCount: number;
  playerActionsCount: number;
  enemyActionsCount: number;
  damageDealt: number;
  damageTaken: number;
  healingDone: number;
  shieldOrDamagePrevented: number;
  criticalHits: number;
  misses: number;
  abilities: CombatAnalyticsAbilityAccumulatorV1[];
}

export interface CombatBalanceBattleReportRow {
  combatId: string;
  combatSource: CombatBalanceSource;
  outcome: CombatBalanceOutcome;
  startedAt: Date;
  finishedAt: Date;
  balanceVersion: string;
  classKey: string;
  playerLevel: number;
  remortCount: number;
  playerMaxHp: number;
  playerHpAtEnd: number;
  mobTemplateKey: string;
  mobType: string;
  mobLevel: number;
  mobDifficultyTier: string;
  mobMaxHp: number;
  mobHpAtEnd: number;
  roundsCount: number;
  playerActionsCount: number;
  enemyActionsCount: number;
  damageDealt: number;
  damageTaken: number;
  healingDone: number;
  shieldOrDamagePrevented: number;
  criticalHits: number;
  misses: number;
  isTestOrAdmin: boolean;
}

export interface CombatBalanceAbilityReportRow {
  combatId: string;
  abilityKey: string;
  abilityRank: number;
  isClassAbility: boolean;
  usesCount: number;
  successfulUsesCount: number;
  hitCount: number;
  critCount: number;
  missCount: number;
  totalDamage: number;
  totalHealing: number;
  totalShieldOrPrevented: number;
  resourceSpent: number;
}

export interface CombatBalanceReportFilters {
  from?: Date;
  to?: Date;
  levels?: {
    min: number;
    max: number;
  };
  remortCount?: number;
  classKey?: string;
  source?: CombatBalanceSource;
  balanceVersion?: string;
  mobTemplateKey?: string;
  includeTest?: boolean;
  limit?: number;
}

export interface CombatBalanceDataQuality {
  analyticsBattles: number;
  terminalSoloSessions: number;
  duplicateWriteAttempts: number;
  writeErrorCount: number;
}

export interface CombatBalanceAnalyticsRepository {
  recordBattle(input: CombatBalanceBattleRecordInput): Promise<"created" | "duplicate">;
  listBattles(filters: CombatBalanceReportFilters): Promise<CombatBalanceBattleReportRow[]>;
  listAbilitiesForCombatIds(combatIds: string[]): Promise<CombatBalanceAbilityReportRow[]>;
  getDataQuality(filters: CombatBalanceReportFilters): Promise<CombatBalanceDataQuality>;
}
