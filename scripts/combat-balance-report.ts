import "dotenv/config";

import { PrismaCombatBalanceAnalyticsRepository } from "../src/db/repositories/prismaCombatBalanceAnalyticsRepository";
import { prisma } from "../src/db/prisma";
import {
  CombatBalanceReportService,
  type CombatBalanceReportFormat,
  type CombatBalanceReportView
} from "../src/services/combatBalanceReportService";
import type {
  CombatBalanceReportFilters
} from "../src/db/repositories/combatBalanceAnalyticsRepository";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const service = new CombatBalanceReportService(
    new PrismaCombatBalanceAnalyticsRepository(prisma)
  );

  console.log(await service.render({
    view: args.view,
    format: args.format,
    minSample: args.minSample,
    abilityActionScope: args.abilityActionScope,
    filters: args.filters
  }));
}

interface ParsedArgs {
  view: CombatBalanceReportView;
  format: CombatBalanceReportFormat;
  abilityActionScope: "manual" | "all";
  minSample: number;
  filters: CombatBalanceReportFilters;
}

function parseArgs(args: string[]): ParsedArgs {
  const values = new Map<string, string | true>();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      continue;
    }
    const key = arg.slice(2);
    const next = args[index + 1];
    if (!next || next.startsWith("--")) {
      values.set(key, true);
      continue;
    }
    values.set(key, next);
    index += 1;
  }

  return {
    view: parseChoice(values.get("view"), ["class", "mob", "ability", "data-quality"], "class"),
    format: parseChoice(values.get("format"), ["table", "json", "csv"], "table"),
    abilityActionScope: parseChoice(values.get("ability-actions"), ["manual", "all"], "manual"),
    minSample: parseIntOption(values.get("min-sample"), 30),
    filters: {
      from: parseDate(values.get("from")),
      to: parseDate(values.get("to")),
      levels: parseLevelRange(values.get("levels")) ?? { min: 10, max: 15 },
      remortCount: parseOptionalInt(values.get("remort")),
      classKey: parseString(values.get("class")),
      source: parseString(values.get("source")) as CombatBalanceReportFilters["source"],
      balanceVersion: parseString(values.get("balance-version")),
      mobTemplateKey: parseString(values.get("mob")),
      includeTest: values.get("include-test") === true,
      limit: parseIntOption(values.get("limit"), 10_000)
    }
  };
}

function parseChoice<T extends string>(
  value: string | true | undefined,
  allowed: readonly T[],
  fallback: T
): T {
  return typeof value === "string" && allowed.includes(value as T) ? (value as T) : fallback;
}

function parseString(value: string | true | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseDate(value: string | true | undefined): Date | undefined {
  const text = parseString(value);
  if (!text) {
    return undefined;
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function parseLevelRange(value: string | true | undefined): { min: number; max: number } | undefined {
  const text = parseString(value);
  if (!text) {
    return undefined;
  }
  const match = /^(\d+)(?:-(\d+))?$/.exec(text);
  if (!match) {
    return undefined;
  }
  const min = Number(match[1]);
  const max = Number(match[2] ?? match[1]);
  return { min: Math.min(min, max), max: Math.max(min, max) };
}

function parseOptionalInt(value: string | true | undefined): number | undefined {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    return undefined;
  }
  return Number(value);
}

function parseIntOption(value: string | true | undefined, fallback: number): number {
  return parseOptionalInt(value) ?? fallback;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
