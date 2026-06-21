import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  CombatBalanceAbilityReportRow,
  CombatBalanceAnalyticsRepository,
  CombatBalanceBattleRecordInput,
  CombatBalanceBattleReportRow,
  CombatBalanceDataQuality,
  CombatBalanceReportFilters
} from "./combatBalanceAnalyticsRepository";

interface CountRow {
  count: number | bigint;
}

interface DataQualityRow {
  analytics_battles: number | bigint;
  terminal_solo_sessions: number | bigint;
  duplicate_write_attempts: number | bigint | null;
}

interface BattleRow {
  combat_id: string;
  combat_source: string;
  outcome: string;
  started_at: Date | string;
  finished_at: Date | string;
  balance_version: string;
  class_key: string;
  player_level: number | bigint;
  remort_count: number | bigint;
  player_max_hp: number | bigint;
  player_hp_at_end: number | bigint;
  mob_template_key: string;
  mob_type: string;
  mob_level: number | bigint;
  mob_difficulty_tier: string;
  mob_max_hp: number | bigint;
  mob_hp_at_end: number | bigint;
  rounds_count: number | bigint;
  player_actions_count: number | bigint;
  manual_player_actions_count: number | bigint;
  timeout_auto_actions_count: number | bigint;
  timeout_skip_actions_count: number | bigint;
  enemy_actions_count: number | bigint;
  damage_dealt: number | bigint;
  damage_taken: number | bigint;
  healing_done: number | bigint;
  critical_hits: number | bigint;
  misses: number | bigint;
  is_test_or_admin: boolean | number | bigint;
}

interface AbilityRow {
  combat_id: string;
  ability_key: string;
  action_origin: string;
  ability_rank: number | bigint;
  is_class_ability: boolean | number | bigint;
  uses_count: number | bigint;
  successful_uses_count: number | bigint;
  hit_count: number | bigint;
  crit_count: number | bigint;
  miss_count: number | bigint;
  total_damage: number | bigint;
  total_healing: number | bigint;
  resource_spent: number | bigint;
}

export class PrismaCombatBalanceAnalyticsRepository implements CombatBalanceAnalyticsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async recordBattle(input: CombatBalanceBattleRecordInput): Promise<"created" | "duplicate"> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.$queryRaw<CountRow[]>`
        SELECT COUNT(*) AS count
        FROM combat_balance_battles
        WHERE combat_id = ${input.combatId}
      `;

      if (toInt(before[0]?.count) > 0) {
        await tx.$executeRaw`
          UPDATE combat_balance_battles
          SET duplicate_write_attempts = duplicate_write_attempts + 1
          WHERE combat_id = ${input.combatId}
        `;
        return "duplicate";
      }

      const battleId = randomUUID();
      await tx.$executeRaw`
        INSERT INTO combat_balance_battles (
          id, combat_id, combat_source, outcome, started_at, finished_at,
          balance_version, combat_engine_version, analytics_schema_version,
          player_analysis_key, character_id, is_test_or_admin, class_key,
          player_level, remort_count, player_max_hp, player_hp_at_start,
          player_hp_at_end, player_mana_max, player_mana_at_start,
          player_stats_json, player_equipment_json, mob_template_key, mob_type,
          mob_level, mob_base_level, mob_difficulty_tier, mob_max_hp, mob_hp_at_end,
          rounds_count, player_actions_count, enemy_actions_count, damage_dealt,
          damage_taken, healing_done, manual_player_actions_count,
          timeout_auto_actions_count, timeout_skip_actions_count, critical_hits, misses
        ) VALUES (
          ${battleId}, ${input.combatId}, ${input.combatSource}, ${input.outcome},
          ${input.startedAt}, ${input.finishedAt}, ${input.balanceVersion},
          ${input.combatEngineVersion}, ${input.analyticsSchemaVersion},
          ${input.playerAnalysisKey}, ${input.characterId}, ${input.isTestOrAdmin ? 1 : 0},
          ${input.classKey}, ${input.playerLevel}, ${input.remortCount},
          ${input.playerMaxHp}, ${input.playerHpAtStart}, ${input.playerHpAtEnd},
          ${input.playerManaMax}, ${input.playerManaAtStart},
          ${JSON.stringify(input.playerStats)}, ${JSON.stringify(input.playerEquipment)},
          ${input.mobTemplateKey}, ${input.mobType}, ${input.mobLevel},
          ${input.mobBaseLevel ?? null}, ${input.mobDifficultyTier}, ${input.mobMaxHp},
          ${input.mobHpAtEnd}, ${input.roundsCount}, ${input.playerActionsCount},
          ${input.enemyActionsCount}, ${input.damageDealt}, ${input.damageTaken},
          ${input.healingDone}, ${input.manualPlayerActionsCount},
          ${input.timeoutAutoActionsCount}, ${input.timeoutSkipActionsCount}, ${input.criticalHits},
          ${input.misses}
        )
      `;

      for (const ability of input.abilities) {
        await tx.$executeRaw`
          INSERT OR IGNORE INTO combat_balance_ability_usages (
            id, battle_id, combat_id, ability_key, action_origin, ability_rank, is_class_ability,
            uses_count, successful_uses_count, hit_count, crit_count, miss_count,
            total_damage, total_healing, resource_spent
          ) VALUES (
            ${randomUUID()}, ${battleId}, ${input.combatId}, ${ability.abilityKey},
            ${ability.actionOrigin}, ${ability.abilityRank}, ${ability.isClassAbility ? 1 : 0}, ${ability.usesCount},
            ${ability.successfulUsesCount}, ${ability.hitCount}, ${ability.critCount},
            ${ability.missCount}, ${ability.totalDamage}, ${ability.totalHealing},
            ${ability.resourceSpent}
          )
        `;
      }

      return "created";
    });
  }

  async listBattles(filters: CombatBalanceReportFilters): Promise<CombatBalanceBattleReportRow[]> {
    const rows = await this.prisma.$queryRaw<BattleRow[]>(Prisma.sql`
      SELECT
        combat_id, combat_source, outcome, started_at, finished_at, balance_version,
        class_key, player_level, remort_count, player_max_hp, player_hp_at_end,
        mob_template_key, mob_type, mob_level, mob_difficulty_tier, mob_max_hp,
        mob_hp_at_end, rounds_count, player_actions_count, enemy_actions_count,
        manual_player_actions_count, timeout_auto_actions_count, timeout_skip_actions_count,
        damage_dealt, damage_taken, healing_done, critical_hits, misses, is_test_or_admin
      FROM combat_balance_battles
      ${buildWhere(filters)}
      ORDER BY finished_at DESC
      LIMIT ${Math.max(1, Math.min(filters.limit ?? 10_000, 50_000))}
    `);

    return rows.map(mapBattleRow);
  }

  async listAbilitiesForCombatIds(
    combatIds: string[],
    options: { actionOrigin?: CombatBalanceAbilityReportRow["actionOrigin"] | "all" } = { actionOrigin: "manual" }
  ): Promise<CombatBalanceAbilityReportRow[]> {
    if (combatIds.length === 0) {
      return [];
    }

    const rows = await this.prisma.$queryRaw<AbilityRow[]>(Prisma.sql`
      SELECT
        combat_id, ability_key, ability_rank, is_class_ability, uses_count,
        action_origin,
        successful_uses_count, hit_count, crit_count, miss_count, total_damage,
        total_healing, resource_spent
      FROM combat_balance_ability_usages
      WHERE combat_id IN (${Prisma.join(combatIds)})
        ${options.actionOrigin && options.actionOrigin !== "all"
          ? Prisma.sql`AND action_origin = ${options.actionOrigin}`
          : Prisma.empty}
      ORDER BY action_origin ASC, ability_key ASC
    `);

    return rows.map(mapAbilityRow);
  }

  async getDataQuality(filters: CombatBalanceReportFilters): Promise<CombatBalanceDataQuality> {
    const rows = await this.prisma.$queryRaw<DataQualityRow[]>(Prisma.sql`
      SELECT
        (SELECT COUNT(*) FROM combat_balance_battles ${buildWhere(filters)}) AS analytics_battles,
        (
          SELECT COUNT(*)
          FROM solo_combat_sessions
          WHERE status IN ('won', 'lost', 'fled', 'expired')
            ${filters.from ? Prisma.sql`AND updated_at >= ${filters.from}` : Prisma.empty}
            ${filters.to ? Prisma.sql`AND updated_at < ${filters.to}` : Prisma.empty}
        ) AS terminal_solo_sessions,
        COALESCE((SELECT SUM(duplicate_write_attempts) FROM combat_balance_battles ${buildWhere(filters)}), 0)
          AS duplicate_write_attempts
    `);
    const row = rows[0];

    return {
      analyticsBattles: toInt(row?.analytics_battles),
      terminalSoloSessions: toInt(row?.terminal_solo_sessions),
      duplicateWriteAttempts: toInt(row?.duplicate_write_attempts)
    };
  }
}

function buildWhere(filters: CombatBalanceReportFilters): Prisma.Sql {
  const clauses: Prisma.Sql[] = [];

  if (!filters.includeTest) {
    clauses.push(Prisma.sql`is_test_or_admin = 0`);
  }
  if (filters.from) {
    clauses.push(Prisma.sql`finished_at >= ${filters.from}`);
  }
  if (filters.to) {
    clauses.push(Prisma.sql`finished_at < ${filters.to}`);
  }
  if (filters.levels) {
    clauses.push(Prisma.sql`player_level BETWEEN ${filters.levels.min} AND ${filters.levels.max}`);
  }
  if (filters.remortCount !== undefined) {
    clauses.push(Prisma.sql`remort_count = ${filters.remortCount}`);
  }
  if (filters.classKey) {
    clauses.push(Prisma.sql`class_key = ${filters.classKey}`);
  }
  if (filters.source) {
    clauses.push(Prisma.sql`combat_source = ${filters.source}`);
  }
  if (filters.balanceVersion) {
    clauses.push(Prisma.sql`balance_version = ${filters.balanceVersion}`);
  }
  if (filters.mobTemplateKey) {
    clauses.push(Prisma.sql`mob_template_key = ${filters.mobTemplateKey}`);
  }

  return clauses.length === 0
    ? Prisma.empty
    : Prisma.sql`WHERE ${Prisma.join(clauses, " AND ")}`;
}

function mapBattleRow(row: BattleRow): CombatBalanceBattleReportRow {
  return {
    combatId: row.combat_id,
    combatSource: row.combat_source as CombatBalanceBattleReportRow["combatSource"],
    outcome: row.outcome as CombatBalanceBattleReportRow["outcome"],
    startedAt: toDate(row.started_at),
    finishedAt: toDate(row.finished_at),
    balanceVersion: row.balance_version,
    classKey: row.class_key,
    playerLevel: toInt(row.player_level),
    remortCount: toInt(row.remort_count),
    playerMaxHp: toInt(row.player_max_hp),
    playerHpAtEnd: toInt(row.player_hp_at_end),
    mobTemplateKey: row.mob_template_key,
    mobType: row.mob_type,
    mobLevel: toInt(row.mob_level),
    mobDifficultyTier: row.mob_difficulty_tier,
    mobMaxHp: toInt(row.mob_max_hp),
    mobHpAtEnd: toInt(row.mob_hp_at_end),
    roundsCount: toInt(row.rounds_count),
    playerActionsCount: toInt(row.player_actions_count),
    manualPlayerActionsCount: toInt(row.manual_player_actions_count),
    timeoutAutoActionsCount: toInt(row.timeout_auto_actions_count),
    timeoutSkipActionsCount: toInt(row.timeout_skip_actions_count),
    enemyActionsCount: toInt(row.enemy_actions_count),
    damageDealt: toInt(row.damage_dealt),
    damageTaken: toInt(row.damage_taken),
    healingDone: toInt(row.healing_done),
    criticalHits: toInt(row.critical_hits),
    misses: toInt(row.misses),
    isTestOrAdmin: toBoolean(row.is_test_or_admin)
  };
}

function mapAbilityRow(row: AbilityRow): CombatBalanceAbilityReportRow {
  return {
    combatId: row.combat_id,
    abilityKey: row.ability_key,
    actionOrigin: row.action_origin as CombatBalanceAbilityReportRow["actionOrigin"],
    abilityRank: toInt(row.ability_rank),
    isClassAbility: toBoolean(row.is_class_ability),
    usesCount: toInt(row.uses_count),
    successfulUsesCount: toInt(row.successful_uses_count),
    hitCount: toInt(row.hit_count),
    critCount: toInt(row.crit_count),
    missCount: toInt(row.miss_count),
    totalDamage: toInt(row.total_damage),
    totalHealing: toInt(row.total_healing),
    resourceSpent: toInt(row.resource_spent)
  };
}

function toInt(value: number | bigint | null | undefined): number {
  return typeof value === "bigint" ? Number(value) : value ?? 0;
}

function toBoolean(value: boolean | number | bigint): boolean {
  return value === true || value === 1 || value === 1n;
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}
