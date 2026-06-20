import { classes } from "../content/classes";
import { races } from "../content/races";
import { monsters } from "../content/monsters";
import type { CharacterPath } from "../domain/characters/path";
import { buildStarterStats } from "../domain/characters/starterStats";
import { buildEffectiveCharacterStats } from "../domain/progression/effectiveStats";
import {
  deriveMonsterCombatStats,
  expireCombat,
  getActorCombatActionAvailability,
  getCombatSkillProfile,
  resolveCombatTurn,
  startCombat,
  type CombatActorStats,
  type CombatState,
  type CombatStatus,
  type MonsterCombatStats
} from "../domain/combat";
import type { MonsterContent } from "../content/schema";
import type { RandomSource } from "../shared/random";

export type CombatSimulationPolicy = "aggressive" | "cautious";

export interface CombatSimulationOptions {
  levels: readonly number[];
  monsterLevels: readonly number[] | "same";
  runsPerMatchup: number;
  seed: string;
  classIds: readonly string[];
  raceId: string;
  path: CharacterPath;
  policy: CombatSimulationPolicy;
  maxTurns: number;
}

export interface CombatSimulationReport {
  seed: string;
  policy: CombatSimulationPolicy;
  raceId: string;
  raceName: string;
  path: CharacterPath;
  levels: readonly number[];
  monsterLevels: readonly number[] | "same";
  runsPerMatchup: number;
  maxTurns: number;
  rows: CombatSimulationRow[];
  warnings: string[];
}

export interface CombatSimulationRow {
  heroLevel: number;
  monsterLevel: number;
  classId: string;
  className: string;
  raceId: string;
  raceName: string;
  monsterId: string;
  monsterName: string;
  summary: CombatOutcomeSummary;
  warnings: string[];
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
}

export interface CombatSimulationRunResult {
  outcome: CombatStatus;
  turns: number;
  endingHp: number;
  manaSpent: number;
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
      const monsterTemplate = selectMonsterTemplate(monsterLevel);
      const monster = materializeMonsterAtLevel(monsterTemplate, monsterLevel);
      const monsterStats = deriveMonsterCombatStats(monster);

      for (const classId of normalized.classIds) {
        const classContent = getClassContent(classId);
        const raceId = resolveRaceForClass(classContent.id, normalized.raceId);
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
            policy: normalized.policy,
            maxTurns: normalized.maxTurns,
            seed: `${normalized.seed}:${heroLevel}:${monsterLevel}:${classId}:${runIndex}`
          })
        );
        const summary = summarizeCombatRuns(runResults);

        rows.push({
          heroLevel,
          monsterLevel,
          classId,
          className: classContent.name,
          raceId,
          raceName: raceContent.name,
          monsterId: monster.id,
          monsterName: monster.name,
          summary,
          warnings: buildSummaryWarnings(summary, {
            sameLevelOrdinaryFight: heroLevel === monsterLevel,
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
    path: normalized.path,
    levels: normalized.levels,
    monsterLevels: normalized.monsterLevels,
    runsPerMatchup: normalized.runsPerMatchup,
    maxTurns: normalized.maxTurns,
    rows: rowsWithWarnings,
    warnings: warnings.map((warning) => warning.message)
  };
}

export function formatCombatSimulationReport(report: CombatSimulationReport): string {
  const lines: string[] = [];

  lines.push("Combat simulation report");
  lines.push(
    `seed: ${report.seed} | policy: ${report.policy} | race: ${report.raceName} (${report.raceId})`
  );
  lines.push(
    `levels: ${formatLevelList(report.levels)} | monster levels: ${formatMonsterLevelSpec(
      report.monsterLevels
    )} | runs: ${report.runsPerMatchup} | max turns: ${report.maxTurns}`
  );
  lines.push(`rows: ${report.rows.length}`);
  lines.push("");

  for (const row of report.rows) {
    lines.push(
      `Lv ${row.heroLevel} vs monster Lv ${row.monsterLevel} — ${row.className} (${row.classId}) vs ${row.monsterName} (${row.monsterId})`
    );
    lines.push(
      `  win ${formatPercent(row.summary.winRate)} | loss ${formatPercent(row.summary.lossRate)} | flee ${formatPercent(row.summary.fleeRate)} | expired ${formatPercent(row.summary.expiredRate)} | turns ${formatNumber(row.summary.averageTurns)} | ending HP ${formatNumber(row.summary.averageEndingHp)} | mana spent ${formatNumber(row.summary.averageManaSpent)}`
    );

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
    averageManaSpent: totalRuns === 0 ? 0 : totalManaSpent / totalRuns
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
  policy: CombatSimulationPolicy;
  maxTurns: number;
  seed: string;
}): CombatSimulationRunResult {
  const rng = createSeededRandomSource(input.seed);
  const profile = getCombatSkillProfile(input.hero.classId);
  let state = startCombat({ hero: input.hero, monster: input.monster });
  let manaSpent = 0;
  let turns = 0;

  while (state.status === "active" && turns < input.maxTurns) {
    const action = chooseAction(state, input.hero, profile, input.policy);
    const result = resolveCombatTurn({
      state,
      action,
      hero: input.hero,
      monster: input.monster,
      rng
    });

    state = result.state;
    manaSpent += result.summary.manaSpent;
    turns += 1;
  }

  if (state.status === "active") {
    state = expireCombat(state);
  }

  return {
    outcome: state.status,
    turns: Math.max(0, state.turn - 1),
    endingHp: state.hero.hp,
    manaSpent
  };
}

function chooseAction(
  state: CombatState,
  hero: CombatSimulationHero,
  profile: ReturnType<typeof getCombatSkillProfile>,
  policy: CombatSimulationPolicy
): "attack" | "skill" | "flee" {
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
    classId: input.classId
  };
}

function normalizeOptions(options: Partial<CombatSimulationOptions>): CombatSimulationOptions {
  const defaultLevels = Array.from({ length: 13 }, (_, index) => index + 1);
  const levels = normalizeNumberList(options.levels ?? defaultLevels, defaultLevels);
  const classIds = normalizeClassIds(options.classIds ?? classes.map((characterClass) => characterClass.id));
  const raceId = resolveDefaultRaceId(options.raceId);
  const path = normalizePath(options.path);

  return {
    levels,
    monsterLevels: options.monsterLevels ?? "same",
    runsPerMatchup: normalizePositiveInteger(options.runsPerMatchup ?? 100),
    seed: String(options.seed ?? "12345"),
    classIds,
    raceId,
    path,
    policy: options.policy ?? DEFAULT_POLICY,
    maxTurns: normalizePositiveInteger(options.maxTurns ?? DEFAULT_MAX_TURNS)
  };
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

function resolveDefaultRaceId(raceId: string | undefined): string {
  if (!raceId) {
    return "race.human-ish";
  }

  return races.some((race) => race.id === raceId) ? raceId : "race.human-ish";
}

function resolveRaceForClass(classId: string, requestedRaceId: string): string {
  const characterClass = getClassContent(classId);

  if (characterClass.allowedRaces?.includes(requestedRaceId)) {
    return requestedRaceId;
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

function selectMonsterTemplate(level: number): MonsterContent {
  const ordinaryMonsters = monsters.filter(
    (monster) =>
      !monster.tags.includes("boss") &&
      !monster.tags.includes("mini-boss") &&
      !monster.tags.includes("tiny-boss")
  );

  if (ordinaryMonsters.length === 0) {
    throw new Error("No ordinary monsters are available for simulation.");
  }

  const exactMatch = ordinaryMonsters.filter((monster) => monster.level === level);

  if (exactMatch.length > 0) {
    return exactMatch[0]!;
  }

  return [...ordinaryMonsters].sort((left, right) => {
    const delta = Math.abs(left.level - level) - Math.abs(right.level - level);

    if (delta !== 0) {
      return delta;
    }

    return left.level - right.level || left.id.localeCompare(right.id);
  })[0]!;
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
    const key = `${row.heroLevel}:${row.monsterLevel}`;
    const existing = grouped.get(key) ?? [];
    existing.push(row);
    grouped.set(key, existing);
  }

  return grouped;
}

function buildRowKey(row: CombatSimulationRow): string {
  return `${row.heroLevel}:${row.monsterLevel}:${row.classId}`;
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
