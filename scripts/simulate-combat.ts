import {
  formatCombatSimulationReport,
  runCombatSimulation,
  type CombatSimulationOptions,
  type CombatSimulationEncounterMode,
  type CombatSimulationPolicy
} from "../src/tooling/combatSimulation";

function main(): void {
  try {
    const options = parseArguments(process.argv.slice(2));
    const report = runCombatSimulation(options);

    console.log(formatCombatSimulationReport(report));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Combat simulation failed: ${message}`);
    process.exitCode = 1;
  }
}

function parseArguments(argv: string[]): Partial<CombatSimulationOptions> {
  const options: Partial<CombatSimulationOptions> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === undefined) {
      continue;
    }

    if (!arg.startsWith("--")) {
      continue;
    }

    const [flag, inlineValue] = arg.split("=", 2);
    const nextValue = argv[index + 1];
    const value = inlineValue ?? nextValue;

    if (inlineValue === undefined && nextValue && !nextValue.startsWith("--")) {
      index += 1;
    }

    switch (flag) {
      case "--levels":
        if (!value || value.startsWith("--")) {
          throw new Error("Missing value for --levels.");
        }
        options.levels = parseNumberList(value);
        break;
      case "--monster-levels":
        if (!value || value.startsWith("--")) {
          throw new Error("Missing value for --monster-levels.");
        }
        options.monsterLevels = value === "same" ? "same" : parseNumberList(value);
        break;
      case "--runs":
        options.runsPerMatchup = parsePositiveInteger(value, "--runs");
        break;
      case "--seed":
        if (!value || value.startsWith("--")) {
          throw new Error("Missing value for --seed.");
        }
        options.seed = value;
        break;
      case "--classes":
        if (!value || value.startsWith("--")) {
          throw new Error("Missing value for --classes.");
        }
        if (value !== "all") {
          options.classIds = value
            .split(",")
            .map((classId) => classId.trim())
            .filter(Boolean);
        }
        break;
      case "--race":
        if (!value || value.startsWith("--")) {
          throw new Error("Missing value for --race.");
        }
        options.raceId = value;
        options.raceIds = [value];
        break;
      case "--races":
        if (!value || value.startsWith("--")) {
          throw new Error("Missing value for --races.");
        }
        options.raceIds = value === "all"
          ? [
              "race.human-ish",
              "race.dwarf",
              "race.elf",
              "race.bisyny",
              "race.drantohor",
              "race.domovyk",
              "race.dryland-rusalka",
              "race.intellectual-orc",
              "race.molfar-soul"
            ]
          : value
              .split(",")
              .map((raceId) => raceId.trim())
              .filter(Boolean);
        break;
      case "--policy":
        if (!value || value.startsWith("--")) {
          throw new Error("Missing value for --policy.");
        }
        options.policy = parsePolicy(value);
        break;
      case "--encounter":
        if (!value || value.startsWith("--")) {
          throw new Error("Missing value for --encounter.");
        }
        options.encounterMode = parseEncounterMode(value);
        break;
      case "--threat-bonus":
        options.threatSecondEnemyLevelBonus = parseNonNegativeInteger(value, "--threat-bonus");
        break;
      case "--max-turns":
        options.maxTurns = parsePositiveInteger(value, "--max-turns");
        break;
      case "--help":
        printUsage();
        process.exit(0);
      default:
        throw new Error(`Unknown flag: ${flag}`);
    }
  }

  return options;
}

function parsePolicy(value: string | undefined): CombatSimulationPolicy {
  if (value !== "aggressive" && value !== "cautious") {
    throw new Error("Policy must be aggressive or cautious.");
  }

  return value;
}

function parseEncounterMode(value: string | undefined): CombatSimulationEncounterMode {
  if (value !== "one-enemy" && value !== "two-enemy-threat") {
    throw new Error("Encounter must be one-enemy or two-enemy-threat.");
  }

  return value;
}

function parsePositiveInteger(value: string | undefined, flag: string): number {
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}.`);
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer.`);
  }

  return parsed;
}

function parseNonNegativeInteger(value: string | undefined, flag: string): number {
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}.`);
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${flag} must be a non-negative integer.`);
  }

  return parsed;
}

function parseNumberList(value: string): number[] {
  const levels = value
    .split(",")
    .flatMap((part) => {
      const trimmed = part.trim();

      if (!trimmed) {
        return [];
      }

      const rangeMatch = trimmed.match(/^(\d+)-(\d+)$/);

      if (rangeMatch) {
        const start = Number(rangeMatch[1]);
        const end = Number(rangeMatch[2]);

        if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) {
          throw new Error(`Invalid range: ${trimmed}`);
        }

        return Array.from({ length: end - start + 1 }, (_, index) => start + index);
      }

      const parsed = Number(trimmed);

      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`Invalid numeric value: ${trimmed}`);
      }

      return [parsed];
    });

  if (levels.length === 0) {
    throw new Error("At least one numeric value is required.");
  }

  return levels;
}

function printUsage(): void {
  console.log(
    [
      "Usage: npm run simulate:combat -- -- [options]",
      "",
      "Options:",
      "  --levels 1-23         Hero levels to simulate.",
      "  --monster-levels same  Monster levels to simulate, or a range like 1-3.",
      "  --runs 1000           Runs per matchup.",
      "  --seed 123            Base seed for deterministic output.",
      "  --classes all          Comma-separated class ids or 'all'.",
      "  --race race.human-ish  Race id to use when available.",
      "  --races all            Comma-separated race ids or 'all'.",
      "  --encounter one-enemy  Encounter mode: one-enemy or two-enemy-threat.",
      "  --threat-bonus 0       Effective-level bonus for the second threat enemy.",
      "  --policy aggressive    Combat policy: aggressive or cautious.",
      "  --max-turns 20        Safety cutoff per fight.",
      "  --help                Show this help."
    ].join("\n")
  );
}

main();
