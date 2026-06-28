import { classes } from "../content/classes";
import { races } from "../content/races";
import { monsters } from "../content/monsters";
import type { CharacterPath } from "../domain/characters/path";
import { buildStarterStats } from "../domain/characters/starterStats";
import { buildEffectiveCharacterStats } from "../domain/progression/effectiveStats";
import {
  deriveMonsterCombatStats,
  expireCombat,
  applyThreatBackupEnemyCombatStats,
  getActorCombatActionAvailability,
  getCombatRaceAbilityProfile,
  getCombatSkillProfile,
  resolveCombatTurn,
  startCombat,
  type CombatActorStats,
  type CombatEnemyTurnSummary,
  type CombatState,
  type CombatStatus,
  type CombatTurnSummary,
  type MonsterCombatStats
} from "../domain/combat";
import type { MonsterContent } from "../content/schema";
import type { RandomSource } from "../shared/random";

export type CombatSimulationPolicy = "aggressive" | "cautious";
export type CombatSimulationEncounterMode = "one-enemy" | "two-enemy-threat";

export interface CombatSimulationOptions {
  levels: readonly number[];
  monsterLevels: readonly number[] | "same";
  runsPerMatchup: number;
  seed: string;
  classIds: readonly string[];
  raceId: string;
  raceIds: readonly string[];
  path: CharacterPath;
  policy: CombatSimulationPolicy;
  maxTurns: number;
  encounterMode: CombatSimulationEncounterMode;
  threatSecondEnemyLevelBonus: number;
}

export interface CombatSimulationReport {
  seed: string;
  policy: CombatSimulationPolicy;
  raceId: string;
  raceName: string;
  raceIds: readonly string[];
  raceNames: readonly string[];
  path: CharacterPath;
  levels: readonly number[];
  monsterLevels: readonly number[] | "same";
  runsPerMatchup: number;
  maxTurns: number;
  encounterMode: CombatSimulationEncounterMode;
  threatSecondEnemyLevelBonus: number;
  rows: CombatSimulationRow[];
  aggregates: CombatSimulationAggregateRow[];
  warnings: string[];
}

export interface CombatSimulationRow {
  encounterMode: CombatSimulationEncounterMode;
  enemyCount: number;
  heroLevel: number;
  monsterLevel: number;
  classId: string;
  className: string;
  raceId: string;
  raceName: string;
  monsterId: string;
  monsterName: string;
  enemies: readonly CombatSimulationEnemyRow[];
  summary: CombatOutcomeSummary;
  warnings: string[];
}

export interface CombatSimulationEnemyRow {
  monsterId: string;
  monsterName: string;
  monsterLevel: number;
}

export type CombatSimulationAggregateDimension = "level" | "class" | "race";

export interface CombatSimulationAggregateRow {
  dimension: CombatSimulationAggregateDimension;
  key: string;
  label: string;
  totalRows: number;
  totalRuns: number;
  wins: number;
  losses: number;
  flees: number;
  expired: number;
  winRate: number;
  lossRate: number;
  averageTurns: number;
  averageEndingHp: number;
  averageManaSpent: number;
}

export interface CombatOutcomeSummary {
  totalRuns: number;
  wins: number;
  losses: number;
  flees: number;
  expired: number;
  winRate: number;
  lossRate: number;
  fleeRate: number;
  expiredRate: number;
  averageTurns: number;
  averageEndingHp: number;
  averageManaSpent: number;
  basicAttackShare: number;
  defendShare: number;
  abilityShare: number;
  telegraphCount: number;
  shieldUses: number;
  healingUses: number;
  abilityUsage: Record<string, number>;
  classAbilityUsage: Record<string, number>;
  raceAbilityUsage: Record<string, number>;
  fumbleCount: number;
  aoeEnemyHits: number;
  allySupportUses: number;
}

export interface CombatSimulationRunResult {
  outcome: CombatStatus;
  turns: number;
  endingHp: number;
  manaSpent: number;
  monsterBasicAttacks: number;
  monsterDefends: number;
  monsterAbilities: number;
  monsterTelegraphs: number;
  shieldUses: number;
  healingUses: number;
  abilityUsage: Record<string, number>;
  classAbilityUsage: Record<string, number>;
  raceAbilityUsage: Record<string, number>;
  fumbleCount: number;
  aoeEnemyHits: number;
  allySupportUses: number;
}

export type CombatSimulationHero = CombatActorStats & {
  hpCurrent: number;
  manaCurrent: number;
};

const DEFAULT_MAX_TURNS = 20;
const DEFAULT_POLICY: CombatSimulationPolicy = "aggressive";

export function runCombatSimulation(options: Partial<CombatSimulationOptions> = {}): CombatSimulationReport {
  const normalized = normalizeOptions(options);
  const rows: CombatSimulationRow[] = [];

  for (const heroLevel of normalized.levels) {
    const monsterLevelTargets =
      normalized.monsterLevels === "same" ? [heroLevel] : normalized.monsterLevels;

    for (const monsterLevel of monsterLevelTargets) {
      const monsterTemplates = selectMonsterTemplates(monsterLevel);

      for (const monsterTemplate of monsterTemplates) {
        const monster = materializeMonsterAtLevel(monsterTemplate, monsterLevel);
        const monsterStats = deriveMonsterCombatStats(monster);
        const enemyStats = buildEncounterEnemies({
          mode: normalized.encounterMode,
          primary: monster,
          monsterLevel,
          secondEnemyLevelBonus: normalized.threatSecondEnemyLevelBonus,
          seed: normalized.seed
        });

        for (const classId of normalized.classIds) {
          const classContent = getClassContent(classId);
          for (const requestedRaceId of normalized.raceIds) {
            const raceId = resolveRaceForClass(classContent.id, requestedRaceId, normalized.raceIds.length > 1);
            if (!raceId) {
              continue;
            }

            const raceContent = getRaceContent(raceId);
            const hero = buildSimulationHero({
              raceId,
              path: normalized.path,
              classId,
              level: heroLevel
            });
            const runResults = Array.from({ length: normalized.runsPerMatchup }, (_, runIndex) =>
              simulateSingleFight({
                hero,
                monster: monsterStats,
                enemies: enemyStats,
                policy: normalized.policy,
                maxTurns: normalized.maxTurns,
                seed: `${normalized.seed}:${normalized.encounterMode}:${heroLevel}:${monsterLevel}:${monster.id}:${classId}:${raceId}:${runIndex}`
              })
            );
            const summary = summarizeCombatRuns(runResults);

            rows.push({
              encounterMode: normalized.encounterMode,
              enemyCount: enemyStats.length,
              heroLevel,
              monsterLevel,
              classId,
              className: classContent.name,
              raceId,
              raceName: raceContent.name,
              monsterId: monster.id,
              monsterName: monster.name,
              enemies: enemyStats.map((enemy) => ({
                monsterId: enemy.monsterId,
                monsterName: enemy.name ?? enemy.monsterId,
                monsterLevel: enemy.level
              })),
              summary,
              warnings: buildSummaryWarnings(summary, {
                sameLevelOrdinaryFight: heroLevel === monsterLevel && isOrdinaryBalanceMonster(monster),
                heroLevel,
                monsterLevel,
                classId,
                className: classContent.name,
                monsterLabel: `${monster.name} (${monster.id})`
              })
            });
          }
        }
      }
    }
  }

  const warnings = buildOutlierWarnings(rows);
  const warningMap = new Map<string, string[]>();

  for (const warning of warnings) {
    const rowKey = warning.rowKey;
    const existing = warningMap.get(rowKey) ?? [];
    existing.push(warning.message);
    warningMap.set(rowKey, existing);
  }

  const rowsWithWarnings = rows.map((row) => ({
    ...row,
    warnings: [...row.warnings, ...(warningMap.get(buildRowKey(row)) ?? [])]
  }));

  return {
    seed: normalized.seed,
    policy: normalized.policy,
    raceId: normalized.raceId,
    raceName: getRaceContent(normalized.raceId).name,
    raceIds: normalized.raceIds,
    raceNames: normalized.raceIds.map((raceId) => getRaceContent(raceId).name),
    path: normalized.path,
    levels: normalized.levels,
    monsterLevels: normalized.monsterLevels,
    runsPerMatchup: normalized.runsPerMatchup,
    maxTurns: normalized.maxTurns,
    encounterMode: normalized.encounterMode,
    threatSecondEnemyLevelBonus: normalized.threatSecondEnemyLevelBonus,
    rows: rowsWithWarnings,
    aggregates: aggregateCombatSimulationRows(rowsWithWarnings),
    warnings: warnings.map((warning) => warning.message)
  };
}

export function formatCombatSimulationReport(report: CombatSimulationReport): string {
  const lines: string[] = [];

  lines.push("Combat simulation report");
  lines.push(
    `seed: ${report.seed} | policy: ${report.policy} | encounter: ${report.encounterMode} | races: ${formatRaceSpec(report)}`
  );
  lines.push(
    `levels: ${formatLevelList(report.levels)} | monster levels: ${formatMonsterLevelSpec(
      report.monsterLevels
    )} | runs: ${report.runsPerMatchup} | max turns: ${report.maxTurns} | threat second enemy bonus: ${report.threatSecondEnemyLevelBonus}`
  );
  lines.push(`rows: ${report.rows.length}`);
  lines.push("");
  lines.push("Aggregate summary");
  const aggregates = report.aggregates ?? aggregateCombatSimulationRows(report.rows);
  for (const dimension of ["level", "class", "race"] satisfies CombatSimulationAggregateDimension[]) {
    const dimensionRows = aggregates
      .filter((aggregate) => aggregate.dimension === dimension)
      .sort(compareAggregateRows)
      .slice(0, 13);

    if (dimensionRows.length === 0) {
      continue;
    }

    lines.push(`  by ${dimension}:`);
    for (const aggregate of dimensionRows) {
      lines.push(
        `    ${aggregate.label}: win ${formatPercent(aggregate.winRate)} | loss ${formatPercent(
          aggregate.lossRate
        )} | turns ${formatNumber(aggregate.averageTurns)} | runs ${aggregate.totalRuns}`
      );
    }
  }
  lines.push("");

  for (const row of report.rows) {
    const enemies = row.enemies ?? [{
      monsterId: row.monsterId,
      monsterName: row.monsterName,
      monsterLevel: row.monsterLevel
    }];
    lines.push(
      `Lv ${row.heroLevel} vs monster Lv ${row.monsterLevel} - ${row.className} (${row.classId}) vs ${row.monsterName} (${row.monsterId})`
    );
    lines.push(
      `  race ${row.raceName} (${row.raceId}) | enemies ${enemies
        .map((enemy) => `${enemy.monsterName} (${enemy.monsterId}, Lv ${enemy.monsterLevel})`)
        .join(" + ")}`
    );
    lines.push(
      `  win ${formatPercent(row.summary.winRate)} | loss ${formatPercent(row.summary.lossRate)} | flee ${formatPercent(row.summary.fleeRate)} | expired ${formatPercent(row.summary.expiredRate)} | turns ${formatNumber(row.summary.averageTurns)} | ending HP ${formatNumber(row.summary.averageEndingHp)} | mana spent ${formatNumber(row.summary.averageManaSpent)}`
    );
    lines.push(
      `  monster mix basic ${formatPercent(row.summary.basicAttackShare)} | defend ${formatPercent(row.summary.defendShare)} | ability ${formatPercent(row.summary.abilityShare)} | telegraphs ${row.summary.telegraphCount} | shields ${row.summary.shieldUses} | heals ${row.summary.healingUses}`
    );
    const abilityUsage = formatAbilityUsage(row.summary.abilityUsage);
    if (abilityUsage) {
      lines.push(`  abilities ${abilityUsage}`);
    }
    const classAbilityUsage = formatAbilityUsage(row.summary.classAbilityUsage);
    const raceAbilityUsage = formatAbilityUsage(row.summary.raceAbilityUsage);
    if (
      classAbilityUsage ||
      raceAbilityUsage ||
      row.summary.fumbleCount > 0 ||
      row.summary.aoeEnemyHits > 0 ||
      row.summary.allySupportUses > 0
    ) {
      lines.push(
        `  player abilities class ${classAbilityUsage || "none"} | race ${raceAbilityUsage || "none"} | fumbles ${row.summary.fumbleCount} | AoE hits ${row.summary.aoeEnemyHits} | ally support ${row.summary.allySupportUses}`
      );
    }

    if (row.warnings.length > 0) {
      for (const warning of row.warnings) {
        lines.push(`  ! ${warning}`);
      }
    }

    lines.push("");
  }

  if (report.warnings.length > 0) {
    lines.push("Warnings summary");
    for (const warning of report.warnings) {
      lines.push(`- ${warning}`);
    }
  } else {
    lines.push("Warnings summary");
    lines.push("- none");
  }

  return lines.join("\n");
}

export function aggregateCombatSimulationRows(
  rows: readonly CombatSimulationRow[]
): CombatSimulationAggregateRow[] {
  const groups = new Map<
    string,
    {
      dimension: CombatSimulationAggregateDimension;
      key: string;
      label: string;
      rows: CombatSimulationRow[];
    }
  >();

  for (const row of rows) {
    const groupSpecs = [
      { dimension: "level" as const, key: String(row.heroLevel), label: `Lv ${row.heroLevel}` },
      { dimension: "class" as const, key: row.classId, label: `${row.className} (${row.classId})` },
      { dimension: "race" as const, key: row.raceId, label: `${row.raceName} (${row.raceId})` }
    ];

    for (const spec of groupSpecs) {
      const groupKey = `${spec.dimension}:${spec.key}`;
      const group = groups.get(groupKey) ?? { ...spec, rows: [] };
      group.rows.push(row);
      groups.set(groupKey, group);
    }
  }

  return [...groups.values()].map((group) => {
    const totalRuns = group.rows.reduce((sum, row) => sum + row.summary.totalRuns, 0);
    const wins = group.rows.reduce((sum, row) => sum + row.summary.wins, 0);
    const losses = group.rows.reduce((sum, row) => sum + row.summary.losses, 0);
    const flees = group.rows.reduce((sum, row) => sum + row.summary.flees, 0);
    const expired = group.rows.reduce((sum, row) => sum + row.summary.expired, 0);

    return {
      dimension: group.dimension,
      key: group.key,
      label: group.label,
      totalRows: group.rows.length,
      totalRuns,
      wins,
      losses,
      flees,
      expired,
      winRate: totalRuns === 0 ? 0 : wins / totalRuns,
      lossRate: totalRuns === 0 ? 0 : losses / totalRuns,
      averageTurns: weightedAverage(group.rows, (row) => row.summary.averageTurns),
      averageEndingHp: weightedAverage(group.rows, (row) => row.summary.averageEndingHp),
      averageManaSpent: weightedAverage(group.rows, (row) => row.summary.averageManaSpent)
    };
  });
}

export function summarizeCombatRuns(
  runs: readonly CombatSimulationRunResult[]
): CombatOutcomeSummary {
  const totalRuns = runs.length;
  const wins = runs.filter((run) => run.outcome === "won").length;
  const losses = runs.filter((run) => run.outcome === "lost").length;
  const flees = runs.filter((run) => run.outcome === "fled").length;
  const expired = runs.filter((run) => run.outcome === "expired").length;
  const totalTurns = runs.reduce((sum, run) => sum + run.turns, 0);
  const totalEndingHp = runs.reduce((sum, run) => sum + run.endingHp, 0);
  const totalManaSpent = runs.reduce((sum, run) => sum + run.manaSpent, 0);
  const monsterBasicAttacks = runs.reduce((sum, run) => sum + (run.monsterBasicAttacks ?? 0), 0);
  const monsterDefends = runs.reduce((sum, run) => sum + (run.monsterDefends ?? 0), 0);
  const monsterAbilities = runs.reduce((sum, run) => sum + (run.monsterAbilities ?? 0), 0);
  const monsterTelegraphs = runs.reduce((sum, run) => sum + (run.monsterTelegraphs ?? 0), 0);
  const totalMonsterActions = monsterBasicAttacks + monsterDefends + monsterAbilities + monsterTelegraphs;
  const abilityUsage = mergeAbilityUsage(runs);
  const classAbilityUsage = mergeAbilityUsage(runs, "classAbilityUsage");
  const raceAbilityUsage = mergeAbilityUsage(runs, "raceAbilityUsage");

  return {
    totalRuns,
    wins,
    losses,
    flees,
    expired,
    winRate: totalRuns === 0 ? 0 : wins / totalRuns,
    lossRate: totalRuns === 0 ? 0 : losses / totalRuns,
    fleeRate: totalRuns === 0 ? 0 : flees / totalRuns,
    expiredRate: totalRuns === 0 ? 0 : expired / totalRuns,
    averageTurns: totalRuns === 0 ? 0 : totalTurns / totalRuns,
    averageEndingHp: totalRuns === 0 ? 0 : totalEndingHp / totalRuns,
    averageManaSpent: totalRuns === 0 ? 0 : totalManaSpent / totalRuns,
    basicAttackShare: totalMonsterActions === 0 ? 0 : monsterBasicAttacks / totalMonsterActions,
    defendShare: totalMonsterActions === 0 ? 0 : monsterDefends / totalMonsterActions,
    abilityShare: totalMonsterActions === 0 ? 0 : monsterAbilities / totalMonsterActions,
    telegraphCount: monsterTelegraphs,
    shieldUses: runs.reduce((sum, run) => sum + (run.shieldUses ?? 0), 0),
    healingUses: runs.reduce((sum, run) => sum + (run.healingUses ?? 0), 0),
    abilityUsage,
    classAbilityUsage,
    raceAbilityUsage,
    fumbleCount: runs.reduce((sum, run) => sum + (run.fumbleCount ?? 0), 0),
    aoeEnemyHits: runs.reduce((sum, run) => sum + (run.aoeEnemyHits ?? 0), 0),
    allySupportUses: runs.reduce((sum, run) => sum + (run.allySupportUses ?? 0), 0)
  };
}

export function buildSummaryWarnings(
  summary: CombatOutcomeSummary,
  context: {
    sameLevelOrdinaryFight: boolean;
    heroLevel: number;
    monsterLevel: number;
    classId: string;
    className: string;
    monsterLabel: string;
  }
): string[] {
  const warnings: string[] = [];

  if (!context.sameLevelOrdinaryFight) {
    return warnings;
  }

  if (summary.winRate < 0.75) {
    warnings.push(
      `${context.className} (${context.classId}) at hero Lv ${context.heroLevel} vs monster Lv ${context.monsterLevel}: win rate ${formatPercent(
        summary.winRate
      )} is below the 75% floor for ordinary same-level fights.`
    );
  }

  if (summary.winRate > 0.9) {
    warnings.push(
      `${context.className} (${context.classId}) at hero Lv ${context.heroLevel} vs monster Lv ${context.monsterLevel}: win rate ${formatPercent(
        summary.winRate
      )} is above the 90% ceiling for ordinary same-level fights.`
    );
  }

  if (summary.averageTurns < 2) {
    warnings.push(
      `${context.className} (${context.classId}) at hero Lv ${context.heroLevel} vs monster Lv ${context.monsterLevel}: average turns ${formatNumber(
        summary.averageTurns
      )} is too short for ordinary same-level fights.`
    );
  }

  if (summary.averageTurns > 5) {
    warnings.push(
      `${context.className} (${context.classId}) at hero Lv ${context.heroLevel} vs monster Lv ${context.monsterLevel}: average turns ${formatNumber(
        summary.averageTurns
      )} is too long for ordinary same-level fights.`
    );
  }

  if (summary.expiredRate > 0.05) {
    warnings.push(
      `${context.className} (${context.classId}) at hero Lv ${context.heroLevel} vs monster Lv ${context.monsterLevel}: ${formatPercent(
        summary.expiredRate
      )} expired rate suggests the max-turn cutoff is too low.`
    );
  }

  return warnings;
}

export function buildOutlierWarnings(rows: readonly CombatSimulationRow[]): Array<{
  rowKey: string;
  message: string;
}> {
  const warnings: Array<{ rowKey: string; message: string }> = [];
  const groupedRows = groupRows(rows);

  for (const groupRows of groupedRows.values()) {
    if (groupRows.length < 3) {
      continue;
    }

    const averageWinRate =
      groupRows.reduce((sum, row) => sum + row.summary.winRate, 0) / groupRows.length;

    for (const row of groupRows) {
      const delta = row.summary.winRate - averageWinRate;

      if (Math.abs(delta) < 0.12) {
        continue;
      }

      warnings.push({
        rowKey: buildRowKey(row),
        message: `${row.className} (${row.classId}) looks like a strong outlier at hero Lv ${row.heroLevel} vs monster Lv ${row.monsterLevel}: ${formatPercent(
          row.summary.winRate
        )} vs group average ${formatPercent(averageWinRate)}.`
      });
    }
  }

  return warnings;
}

function simulateSingleFight(input: {
  hero: CombatSimulationHero;
  monster: MonsterCombatStats;
  enemies: MonsterCombatStats[];
  policy: CombatSimulationPolicy;
  maxTurns: number;
  seed: string;
}): CombatSimulationRunResult {
  const rng = createSeededRandomSource(input.seed);
  const profile = getCombatSkillProfile(input.hero.classId);
  let state = startCombat({ hero: input.hero, monster: input.monster, enemies: input.enemies.slice(1) });
  let manaSpent = 0;
  let turns = 0;
  let monsterBasicAttacks = 0;
  let monsterDefends = 0;
  let monsterAbilities = 0;
  let monsterTelegraphs = 0;
  let shieldUses = 0;
  let healingUses = 0;
  let aoeEnemyHits = 0;
  let allySupportUses = 0;
  let fumbleCount = 0;
  const abilityUsage: Record<string, number> = {};
  const classAbilityUsage: Record<string, number> = {};
  const raceAbilityUsage: Record<string, number> = {};

  while (state.status === "active" && turns < input.maxTurns) {
    const action = chooseAction(state, input.hero, profile, input.policy);
    const result = resolveCombatTurn({
      state,
      action,
      hero: input.hero,
      monster: input.monster,
      enemies: [...input.enemies],
      rng
    });

    state = result.state;
    manaSpent += result.summary.manaSpent;
    const monsterActions = extractMonsterActions(result.summary);
    for (const monsterAction of monsterActions) {
      if (monsterAction.monsterAction === "attack") {
        monsterBasicAttacks += 1;
      } else if (monsterAction.monsterAction === "defend") {
        monsterDefends += 1;
      } else if (monsterAction.monsterAction === "skill") {
        monsterAbilities += 1;
      } else if (monsterAction.monsterAction === "telegraph") {
        monsterTelegraphs += 1;
      }
      if (monsterAction.monsterSkillId) {
        abilityUsage[monsterAction.monsterSkillId] = (abilityUsage[monsterAction.monsterSkillId] ?? 0) + 1;
      }
      if (monsterAction.monsterTelegraphAbilityId) {
        abilityUsage[monsterAction.monsterTelegraphAbilityId] =
          (abilityUsage[monsterAction.monsterTelegraphAbilityId] ?? 0) + 1;
      }
      if (monsterAction.monsterEffectText?.includes("щит")) {
        shieldUses += 1;
      }
      if (monsterAction.monsterEffectText?.includes("відновив")) {
        healingUses += 1;
      }
    }
    if (result.summary.skillId && result.summary.abilitySource === "class") {
      classAbilityUsage[result.summary.skillId] = (classAbilityUsage[result.summary.skillId] ?? 0) + 1;
    }
    if (result.summary.skillId && result.summary.abilitySource === "race") {
      raceAbilityUsage[result.summary.skillId] = (raceAbilityUsage[result.summary.skillId] ?? 0) + 1;
    }
    if (result.summary.heroOutcome === "critical-fumble") {
      fumbleCount += 1;
    }
    if ((result.summary.enemyResults?.length ?? 0) > 1) {
      aoeEnemyHits += result.summary.enemyResults?.length ?? 0;
    }
    if ((result.summary.allyResults?.length ?? 0) > 0) {
      allySupportUses += result.summary.allyResults?.length ?? 0;
    }
    turns += 1;
  }

  if (state.status === "active") {
    state = expireCombat(state);
  }

  return {
    outcome: state.status,
    turns: Math.max(0, state.turn - 1),
    endingHp: state.hero.hp,
    manaSpent,
    monsterBasicAttacks,
    monsterDefends,
    monsterAbilities,
    monsterTelegraphs,
    shieldUses,
    healingUses,
    abilityUsage,
    classAbilityUsage,
    raceAbilityUsage,
    fumbleCount,
    aoeEnemyHits,
    allySupportUses
  };
}

function chooseAction(
  state: CombatState,
  hero: CombatSimulationHero,
  profile: ReturnType<typeof getCombatSkillProfile>,
  policy: CombatSimulationPolicy
): "attack" | "skill" | "race" | "flee" {
  if (policy === "cautious") {
    const fleeThreshold = Math.max(1, Math.floor(hero.hpMax * 0.25));

    if (state.hero.hp <= fleeThreshold && state.turn > 1) {
      return "flee";
    }
  }

  const availability = getActorCombatActionAvailability({
    ...state.hero,
    cooldowns: state.cooldowns
  }, hero);

  if (state.hero.mana >= profile.manaCost && availability.skill.available) {
    return "skill";
  }

  const raceProfile = getCombatRaceAbilityProfile(hero.raceId);
  if (raceProfile && state.hero.mana >= raceProfile.manaCost && availability.race.available) {
    return "race";
  }

  return "attack";
}

function buildSimulationHero(input: {
  raceId: string;
  path: CharacterPath;
  classId: string;
  level: number;
}): CombatSimulationHero {
  const starter = buildStarterStats(input.raceId, input.classId);
  const effective = buildEffectiveCharacterStats({
    level: input.level,
    classId: input.classId,
    raceId: input.raceId,
    path: input.path,
    hpCurrent: starter.hpCurrent,
    hpMax: starter.hpMax,
    manaCurrent: starter.manaCurrent,
    manaMax: starter.manaMax,
    stats: starter.stats
  });

  return {
    level: input.level,
    hpMax: effective.hpMax,
    manaMax: effective.manaMax,
    hpCurrent: effective.hpMax,
    manaCurrent: effective.manaMax,
    ...effective.stats,
    classId: input.classId,
    raceId: input.raceId
  };
}

function normalizeOptions(options: Partial<CombatSimulationOptions>): CombatSimulationOptions {
  const defaultLevels = Array.from({ length: 23 }, (_, index) => index + 1);
  const levels = normalizeNumberList(options.levels ?? defaultLevels, defaultLevels);
  const classIds = normalizeClassIds(options.classIds ?? classes.map((characterClass) => characterClass.id));
  const raceId = resolveDefaultRaceId(options.raceId);
  const raceIds = normalizeRaceIds(options.raceIds ?? [raceId]);
  const path = normalizePath(options.path);

  return {
    levels,
    monsterLevels: options.monsterLevels ?? "same",
    runsPerMatchup: normalizePositiveInteger(options.runsPerMatchup ?? 100),
    seed: String(options.seed ?? "12345"),
    classIds,
    raceId,
    raceIds,
    path,
    policy: options.policy ?? DEFAULT_POLICY,
    maxTurns: normalizePositiveInteger(options.maxTurns ?? DEFAULT_MAX_TURNS),
    encounterMode: options.encounterMode ?? "one-enemy",
    threatSecondEnemyLevelBonus: normalizeNonNegativeInteger(options.threatSecondEnemyLevelBonus ?? 0)
  };
}

function mergeAbilityUsage(
  runs: readonly CombatSimulationRunResult[],
  field: "abilityUsage" | "classAbilityUsage" | "raceAbilityUsage" = "abilityUsage"
): Record<string, number> {
  const usage: Record<string, number> = {};

  for (const run of runs) {
    for (const [abilityId, count] of Object.entries(run[field] ?? {})) {
      usage[abilityId] = (usage[abilityId] ?? 0) + count;
    }
  }

  return usage;
}

function extractMonsterActions(summary: CombatTurnSummary): Array<
  Pick<
    CombatEnemyTurnSummary,
    "monsterAction" | "monsterSkillId" | "monsterTelegraphAbilityId" | "monsterEffectText"
  >
> {
  if (summary.enemyActions && summary.enemyActions.length > 0) {
    return summary.enemyActions;
  }

  return summary.monsterAction
    ? [{
        monsterAction: summary.monsterAction,
        ...(summary.monsterSkillId ? { monsterSkillId: summary.monsterSkillId } : {}),
        ...(summary.monsterTelegraphAbilityId
          ? { monsterTelegraphAbilityId: summary.monsterTelegraphAbilityId }
          : {}),
        ...(summary.monsterEffectText ? { monsterEffectText: summary.monsterEffectText } : {})
      }]
    : [];
}

function formatAbilityUsage(usage: Record<string, number>): string {
  return Object.entries(usage)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 6)
    .map(([abilityId, count]) => `${abilityId}:${count}`)
    .join(", ");
}

function normalizePath(path: CharacterPath | undefined): CharacterPath {
  if (path === "sun" || path === "moon" || path === "boundary") {
    return path;
  }

  return "boundary";
}

function normalizePositiveInteger(value: number): number {
  return Math.max(1, Math.floor(value));
}

function weightedAverage(
  rows: readonly CombatSimulationRow[],
  selector: (row: CombatSimulationRow) => number
): number {
  const totalRuns = rows.reduce((sum, row) => sum + row.summary.totalRuns, 0);

  if (totalRuns === 0) {
    return 0;
  }

  return rows.reduce((sum, row) => sum + selector(row) * row.summary.totalRuns, 0) / totalRuns;
}

function compareAggregateRows(left: CombatSimulationAggregateRow, right: CombatSimulationAggregateRow): number {
  if (left.dimension === "level" && right.dimension === "level") {
    return Number(left.key) - Number(right.key);
  }

  return left.winRate - right.winRate || left.label.localeCompare(right.label);
}

function formatRaceSpec(report: CombatSimulationReport): string {
  const raceIds = report.raceIds ?? [report.raceId];
  const raceNames = report.raceNames ?? [report.raceName];

  if (raceIds.length === 1) {
    return `${report.raceName} (${report.raceId})`;
  }

  return raceIds
    .map((raceId, index) => `${raceNames[index] ?? raceId} (${raceId})`)
    .join(", ");
}

function normalizeNonNegativeInteger(value: number): number {
  return Math.max(0, Math.floor(value));
}

function normalizeNumberList(values: readonly number[], fallback: readonly number[]): number[] {
  const normalized = [...new Set(values.map((value) => Math.max(1, Math.floor(value))))].sort(
    (left, right) => left - right
  );

  return normalized.length > 0 ? normalized : [...fallback];
}

function normalizeClassIds(classIds: readonly string[]): string[] {
  const validIds = new Set(classes.map((characterClass) => characterClass.id));
  const normalized = [...new Set(classIds.filter((classId) => validIds.has(classId)))];

  return normalized.length > 0 ? normalized : classes.map((characterClass) => characterClass.id);
}

function normalizeRaceIds(raceIds: readonly string[]): string[] {
  const validIds = new Set(races.map((race) => race.id));
  const normalized = [...new Set(raceIds.filter((raceId) => validIds.has(raceId)))];

  return normalized.length > 0 ? normalized : ["race.human-ish"];
}

function resolveDefaultRaceId(raceId: string | undefined): string {
  if (!raceId) {
    return "race.human-ish";
  }

  return races.some((race) => race.id === raceId) ? raceId : "race.human-ish";
}

function resolveRaceForClass(
  classId: string,
  requestedRaceId: string,
  strictAllowedRace: boolean
): string | null {
  const characterClass = getClassContent(classId);

  if (characterClass.allowedRaces?.includes(requestedRaceId)) {
    return requestedRaceId;
  }

  if (strictAllowedRace) {
    return null;
  }

  return characterClass.allowedRaces?.[0] ?? requestedRaceId;
}

function getClassContent(classId: string) {
  const characterClass = classes.find((candidate) => candidate.id === classId);

  if (!characterClass) {
    throw new Error(`Unknown class id: ${classId}`);
  }

  return characterClass;
}

function getRaceContent(raceId: string) {
  const race = races.find((candidate) => candidate.id === raceId);

  if (!race) {
    throw new Error(`Unknown race id: ${raceId}`);
  }

  return race;
}

function buildEncounterEnemies(input: {
  mode: CombatSimulationEncounterMode;
  primary: MonsterContent;
  monsterLevel: number;
  secondEnemyLevelBonus: number;
  seed: string;
}): MonsterCombatStats[] {
  const primaryStats = deriveMonsterCombatStats(input.primary);

  if (input.mode === "one-enemy") {
    return [primaryStats];
  }

  const secondLevel = Math.min(23, input.monsterLevel + input.secondEnemyLevelBonus);
  const secondTemplate = selectThreatSecondMonsterTemplate(input.primary, secondLevel, input.seed);
  const second = materializeMonsterAtLevel(secondTemplate, secondLevel);

  return [primaryStats, applyThreatBackupEnemyCombatStats(deriveMonsterCombatStats(second))];
}

function selectMonsterTemplates(level: number): MonsterContent[] {
  if (monsters.length === 0) {
    throw new Error("No monsters are available for simulation.");
  }

  const exactMatches = monsters
    .filter((monster) => monster.level === level)
    .sort((left, right) => left.id.localeCompare(right.id));

  if (exactMatches.length > 0) {
    return exactMatches;
  }

  return [[...monsters].sort((left, right) => {
    const delta = Math.abs(left.level - level) - Math.abs(right.level - level);

    if (delta !== 0) {
      return delta;
    }

    return left.level - right.level || left.id.localeCompare(right.id);
  })[0]!];
}

function selectThreatSecondMonsterTemplate(
  primary: MonsterContent,
  level: number,
  seed: string
): MonsterContent {
  const templates = selectMonsterTemplates(level).filter((candidate) => candidate.id !== primary.id);
  const candidates = templates.length > 0
    ? templates
    : monsters.filter((candidate) => candidate.id !== primary.id);

  if (candidates.length === 0) {
    return primary;
  }

  const sorted = [...candidates].sort((left, right) => {
    const levelDelta = Math.abs(left.level - level) - Math.abs(right.level - level);

    if (levelDelta !== 0) {
      return levelDelta;
    }

    return left.id.localeCompare(right.id);
  });
  const index = hashSeed(`${seed}:threat-second:${primary.id}:${level}`) % sorted.length;

  return sorted[index]!;
}

function isOrdinaryBalanceMonster(monster: MonsterContent): boolean {
  return !monster.tags.includes("boss") &&
    !monster.tags.includes("mini-boss") &&
    !monster.tags.includes("tiny-boss");
}

function materializeMonsterAtLevel(monster: MonsterContent, level: number): MonsterContent {
  return {
    ...monster,
    level
  };
}

function groupRows(rows: readonly CombatSimulationRow[]): Map<string, CombatSimulationRow[]> {
  const grouped = new Map<string, CombatSimulationRow[]>();

  for (const row of rows) {
    const key = `${row.encounterMode}:${row.heroLevel}:${row.monsterLevel}:${row.raceId}`;
    const existing = grouped.get(key) ?? [];
    existing.push(row);
    grouped.set(key, existing);
  }

  return grouped;
}

function buildRowKey(row: CombatSimulationRow): string {
  return `${row.encounterMode}:${row.heroLevel}:${row.monsterLevel}:${row.monsterId}:${row.classId}:${row.raceId}`;
}

function createSeededRandomSource(seed: string): RandomSource {
  return new SeededRandomSource(seed);
}

class SeededRandomSource implements RandomSource {
  private state: number;

  constructor(seed: string) {
    this.state = hashSeed(seed) || 0x6d2b79f5;
  }

  nextFloat(): number {
    return this.nextUint32() / 0x1_0000_0000;
  }

  nextInt(minInclusive: number, maxInclusive: number): number {
    if (!Number.isInteger(minInclusive) || !Number.isInteger(maxInclusive)) {
      throw new Error("Random integer bounds must be integers.");
    }

    if (maxInclusive < minInclusive) {
      throw new Error("maxInclusive must be greater than or equal to minInclusive.");
    }

    const span = maxInclusive - minInclusive + 1;
    return minInclusive + Math.floor(this.nextFloat() * span);
  }

  private nextUint32(): number {
    let x = this.state | 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x | 0;
    return x >>> 0;
  }
}

function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

function formatLevelList(levels: readonly number[]): string {
  if (levels.length === 0) {
    return "none";
  }

  if (levels.length === 1) {
    return String(levels[0]);
  }

  return `${levels[0]}-${levels[levels.length - 1]}`;
}

function formatMonsterLevelSpec(spec: readonly number[] | "same"): string {
  if (spec === "same") {
    return "same";
  }

  return formatLevelList(spec);
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatNumber(value: number): string {
  return value.toFixed(1);
}
