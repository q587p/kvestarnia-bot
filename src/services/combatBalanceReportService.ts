import type {
  CombatBalanceAbilityReportRow,
  CombatBalanceAnalyticsRepository,
  CombatBalanceBattleReportRow,
  CombatBalanceReportFilters
} from "../db/repositories/combatBalanceAnalyticsRepository";

export type CombatBalanceReportView = "class" | "mob" | "ability" | "data-quality";
export type CombatBalanceReportFormat = "table" | "json" | "csv";

export interface CombatBalanceReportOptions {
  view: CombatBalanceReportView;
  filters: CombatBalanceReportFilters;
  minSample: number;
  format: CombatBalanceReportFormat;
  abilityActionScope?: "manual" | "all";
}

interface AggregateRow {
  key: string;
  battles: number;
  wins: number;
  losses: number;
  fled: number;
  timeout: number;
  winRate: number;
  wilsonLow: number;
  wilsonHigh: number;
  avgRounds: number;
  medianRounds: number;
  medianWinHpRatio: number;
  avgDamageDealt: number;
  avgDamageTaken: number;
  manualActions: number;
  timeoutAutoActions: number;
  timeoutSkipActions: number;
  insufficientSample: boolean;
}

interface AbilityAggregateRow {
  abilityKey: string;
  actionOrigin: string;
  battles: number;
  uses: number;
  usageRate: number;
  avgUsesPerBattle: number;
  winRateWith: number;
  winRateWithout: number;
  totalDamage: number;
  totalHealing: number;
  resourceSpent: number;
  insufficientSample: boolean;
}

export class CombatBalanceReportService {
  constructor(private readonly repository: CombatBalanceAnalyticsRepository) {}

  async render(options: CombatBalanceReportOptions): Promise<string> {
    if (options.view === "data-quality") {
      const quality = await this.repository.getDataQuality(options.filters);
      return renderRows([quality], options.format);
    }

    const battles = await this.repository.listBattles(options.filters);
    if (options.view === "ability") {
      const abilities = await this.repository.listAbilitiesForCombatIds(
        battles.map((battle) => battle.combatId),
        { actionOrigin: options.abilityActionScope === "all" ? "all" : "manual" }
      );
      return renderRows(buildAbilityRows(battles, abilities, options.minSample), options.format);
    }

    const keyOf = options.view === "mob"
      ? (battle: CombatBalanceBattleReportRow) => `${battle.mobTemplateKey}@${battle.mobLevel}`
      : (battle: CombatBalanceBattleReportRow) =>
          `${battle.classKey} L${battle.playerLevel} R${battle.remortCount}`;

    return renderRows(buildAggregateRows(battles, keyOf, options.minSample), options.format);
  }
}

function buildAggregateRows(
  battles: CombatBalanceBattleReportRow[],
  keyOf: (battle: CombatBalanceBattleReportRow) => string,
  minSample: number
): AggregateRow[] {
  const groups = groupBy(battles, keyOf);

  return [...groups.entries()]
    .map(([key, rows]) => {
      const wins = rows.filter((row) => row.outcome === "win").length;
      const losses = rows.filter((row) => row.outcome === "loss").length;
      const fled = rows.filter((row) => row.outcome === "fled").length;
      const timeout = rows.filter((row) => row.outcome === "timeout").length;
      const interval = wilsonInterval(wins, rows.length);
      const winRows = rows.filter((row) => row.outcome === "win");

      return {
        key,
        battles: rows.length,
        wins,
        losses,
        fled,
        timeout,
        winRate: ratio(wins, rows.length),
        wilsonLow: interval.low,
        wilsonHigh: interval.high,
        avgRounds: average(rows.map((row) => row.roundsCount)),
        medianRounds: median(rows.map((row) => row.roundsCount)),
        medianWinHpRatio: median(winRows.map((row) => ratio(row.playerHpAtEnd, row.playerMaxHp))),
        avgDamageDealt: average(rows.map((row) => row.damageDealt)),
        avgDamageTaken: average(rows.map((row) => row.damageTaken)),
        manualActions: sum(rows.map((row) => row.manualPlayerActionsCount)),
        timeoutAutoActions: sum(rows.map((row) => row.timeoutAutoActionsCount)),
        timeoutSkipActions: sum(rows.map((row) => row.timeoutSkipActionsCount)),
        insufficientSample: rows.length < minSample
      };
    })
    .sort((left, right) => right.battles - left.battles || left.key.localeCompare(right.key));
}

function buildAbilityRows(
  battles: CombatBalanceBattleReportRow[],
  abilities: CombatBalanceAbilityReportRow[],
  minSample: number
): AbilityAggregateRow[] {
  const battleById = new Map(battles.map((battle) => [battle.combatId, battle]));
  const groups = groupBy(abilities, (ability) => `${ability.actionOrigin}:${ability.abilityKey}`);

  return [...groups.entries()]
    .map(([, rows]) => {
      const first = rows[0];
      const abilityKey = first?.abilityKey ?? "";
      const actionOrigin = first?.actionOrigin ?? "manual";
      const combatIds = new Set(rows.map((row) => row.combatId));
      const withAbility = [...combatIds].flatMap((combatId) => {
        const battle = battleById.get(combatId);
        return battle ? [battle] : [];
      });
      const withoutAbility = battles.filter((battle) => !combatIds.has(battle.combatId));
      const winsWith = withAbility.filter((battle) => battle.outcome === "win").length;
      const winsWithout = withoutAbility.filter((battle) => battle.outcome === "win").length;
      const uses = sum(rows.map((row) => row.usesCount));

      return {
        abilityKey,
        actionOrigin,
        battles: withAbility.length,
        uses,
        usageRate: ratio(withAbility.length, battles.length),
        avgUsesPerBattle: ratio(uses, battles.length),
        winRateWith: ratio(winsWith, withAbility.length),
        winRateWithout: ratio(winsWithout, withoutAbility.length),
        totalDamage: sum(rows.map((row) => row.totalDamage)),
        totalHealing: sum(rows.map((row) => row.totalHealing)),
        resourceSpent: sum(rows.map((row) => row.resourceSpent)),
        insufficientSample: withAbility.length < minSample
      };
    })
    .sort((left, right) => right.uses - left.uses || left.abilityKey.localeCompare(right.abilityKey));
}

function renderRows(rows: unknown[], format: CombatBalanceReportFormat): string {
  if (format === "json") {
    return JSON.stringify(rows, null, 2);
  }

  if (rows.length === 0) {
    return "No rows.";
  }

  const records = rows as Array<Record<string, unknown>>;
  const headers = Object.keys(records[0] ?? {});

  if (format === "csv") {
    return [
      headers.join(","),
      ...records.map((row) => headers.map((header) => csvCell(row[header])).join(","))
    ].join("\n");
  }

  const widths = headers.map((header) =>
    Math.max(header.length, ...records.map((row) => formatCell(row[header]).length))
  );

  return [
    headers.map((header, index) => header.padEnd(widths[index] ?? header.length)).join(" | "),
    widths.map((width) => "-".repeat(width)).join("-|-"),
    ...records.map((row) =>
      headers.map((header, index) => formatCell(row[header]).padEnd(widths[index] ?? 0)).join(" | ")
    )
  ].join("\n");
}

function groupBy<T>(rows: T[], keyOf: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return groups;
}

function wilsonInterval(successes: number, total: number): { low: number; high: number } {
  if (total === 0) {
    return { low: 0, high: 0 };
  }

  const z = 1.96;
  const p = successes / total;
  const denominator = 1 + z ** 2 / total;
  const centre = p + z ** 2 / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p) + z ** 2 / (4 * total)) / total);

  return {
    low: roundRatio((centre - margin) / denominator),
    high: roundRatio((centre + margin) / denominator)
  };
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : roundNumber(sum(values) / values.length);
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? roundNumber(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2)
    : roundNumber(sorted[middle] ?? 0);
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function ratio(value: number, total: number): number {
  return total <= 0 ? 0 : roundRatio(value / total);
}

function roundRatio(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function roundNumber(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }

  return "";
}

function csvCell(value: unknown): string {
  const text = formatCell(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
