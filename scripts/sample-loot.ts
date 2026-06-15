import { rollLootExpansionItem } from "../src/domain/loot";
import { SeededRandomSource } from "../src/shared/random";

interface CliOptions {
  levels: number[];
  runs: number;
  seed: string;
}

const defaultLevels = [1, 3, 6, 10, 14, 18];

const profiles = [
  {
    label: "generic",
    classId: "class.warrior",
    raceId: "race.human-ish",
    titleIds: []
  },
  {
    label: "kitchen/cook/lord_of_pan",
    classId: "class.varenyk-mancer",
    raceId: "race.human-ish",
    titleIds: ["lord_of_pan"]
  },
  {
    label: "bureaucrat/archive_rat",
    classId: "class.bureaucramancer",
    raceId: "race.domovyk",
    titleIds: ["archive_rat"]
  }
] as const;

const options = parseArgs(process.argv.slice(2));

for (const level of options.levels) {
  console.log(`\nLevel ${level} · ${options.runs} rolls`);

  for (const profile of profiles) {
    const rng = new SeededRandomSource(`${options.seed}:${level}:${profile.label}`);
    const counts = new Map<string, number>();
    const plusCounts = new Map<string, number>();

    for (let index = 0; index < options.runs; index += 1) {
      const item = rollLootExpansionItem({
        profile: {
          level,
          classId: profile.classId,
          raceId: profile.raceId,
          titleIds: profile.titleIds
        },
        sourceId: profile.label.startsWith("kitchen") ? "kitchen_dungeon" : "bureaucracy_wing",
        rng
      });

      if (!item) {
        continue;
      }

      counts.set(item.name, (counts.get(item.name) ?? 0) + 1);
      const plusMatch = item.name.match(/\+([1-5])$/)?.[1];
      const plus = plusMatch ? `+${plusMatch}` : "+0";
      plusCounts.set(plus, (plusCounts.get(plus) ?? 0) + 1);
    }

    const top = [...counts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "uk"))
      .slice(0, 5)
      .map(([name, count]) => `${name} (${count})`)
      .join("; ");
    const plusSummary = [...plusCounts.entries()]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([plus, count]) => `${plus}: ${count}`)
      .join(", ");

    console.log(`- ${profile.label}: ${plusSummary || "no rolls"}`);
    console.log(`  top: ${top || "no items"}`);
  }
}

function parseArgs(args: string[]): CliOptions {
  return {
    levels: parseLevels(readArg(args, "--levels") ?? defaultLevels.join(",")),
    runs: parsePositiveInt(readArg(args, "--runs") ?? "100", 100),
    seed: readArg(args, "--seed") ?? "kvestarnia-loot-v1"
  };
}

function readArg(args: string[], name: string): string | undefined {
  const exact = args.find((arg) => arg.startsWith(`${name}=`));

  if (exact) {
    return exact.slice(name.length + 1);
  }

  const index = args.indexOf(name);

  return index >= 0 ? args[index + 1] : undefined;
}

function parseLevels(value: string): number[] {
  if (value.includes("-")) {
    const [startRaw, endRaw] = value.split("-");
    const start = parsePositiveInt(startRaw ?? "", 1);
    const end = parsePositiveInt(endRaw ?? "", start);

    return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);
  }

  return value
    .split(",")
    .map((part) => parsePositiveInt(part, 0))
    .filter((level) => level > 0);
}

function parsePositiveInt(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
