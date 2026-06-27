import "dotenv/config";

import { PrismaClient } from "@prisma/client";
import {
  repairOverMaxCharacterResources,
  type OverMaxCharacterResourceRow,
  type RepairCharacterResourceStore,
  type RepairCharacterResourceSummary
} from "../src/services/repairCharacterResourceService";

class PrismaCharacterResourceRepairStore implements RepairCharacterResourceStore {
  constructor(private readonly prisma: PrismaClient) {}

  async listOverMaxCharacters(): Promise<OverMaxCharacterResourceRow[]> {
    return this.prisma.$queryRaw<OverMaxCharacterResourceRow[]>`
      SELECT
        "id",
        "name",
        "hp_current" AS "hpCurrent",
        "hp_max" AS "hpMax",
        "mana_current" AS "manaCurrent",
        "mana_max" AS "manaMax"
      FROM "characters"
      WHERE "hp_current" > "hp_max" OR "mana_current" > "mana_max"
      ORDER BY "name" COLLATE NOCASE, "id"
    `;
  }

  async repairCharacterResources(
    characterId: string,
    input: { hpCurrent: number; manaCurrent: number }
  ): Promise<void> {
    await this.prisma.character.update({
      where: {
        id: characterId
      },
      data: {
        hpCurrent: input.hpCurrent,
        manaCurrent: input.manaCurrent
      }
    });
  }
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const prisma = new PrismaClient();

  try {
    const summary = await repairOverMaxCharacterResources({
      store: new PrismaCharacterResourceRepairStore(prisma),
      apply
    });

    printSummary(summary);
  } finally {
    await prisma.$disconnect();
  }
}

function printSummary(summary: RepairCharacterResourceSummary): void {
  console.log(summary.dryRun ? "Dry run: over-max character resource repair" : "Applied: over-max character resource repair");
  console.log(`Characters scanned: ${summary.charactersScanned}`);
  console.log(`Characters affected: ${summary.charactersAffected}`);
  console.log(`Repairs applied: ${summary.repairsApplied}`);

  if (summary.entries.length === 0) {
    console.log("Entries: none");
    return;
  }

  console.log("Entries:");

  for (const entry of summary.entries) {
    console.log(
      `- ${entry.name} (${entry.characterId}): HP ${entry.hpBefore}/${entry.hpMax} -> ${entry.hpAfter}/${entry.hpMax}, mana ${entry.manaBefore}/${entry.manaMax} -> ${entry.manaAfter}/${entry.manaMax}`
    );
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
