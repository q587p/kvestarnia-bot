import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaCombatBalanceAnalyticsRepository } from "../../src/db/repositories/prismaCombatBalanceAnalyticsRepository";

describe("PrismaCombatBalanceAnalyticsRepository", () => {
  let dir: string;
  let prisma: PrismaClient;
  let repository: PrismaCombatBalanceAnalyticsRepository;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "kvestarnia-combat-analytics-"));
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: `file:${join(dir, "test.db").replace(/\\/g, "/")}`
        }
      }
    });
    await createSchema(prisma);
    repository = new PrismaCombatBalanceAnalyticsRepository(prisma);
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await rm(dir, { recursive: true, force: true });
  });

  it("stores one idempotent battle row and one row per distinct ability", async () => {
    const input = makeInput();

    await expect(repository.recordBattle(input)).resolves.toBe("created");
    await expect(repository.recordBattle(input)).resolves.toBe("duplicate");

    const battles = await repository.listBattles({ levels: { min: 10, max: 15 } });
    const abilities = await repository.listAbilitiesForCombatIds(["combat-db-1"]);
    const quality = await repository.getDataQuality({ levels: { min: 10, max: 15 } });

    expect(battles).toHaveLength(1);
    expect(battles[0]).toMatchObject({
      combatId: "combat-db-1",
      outcome: "win",
      classKey: "class.warrior",
      playerLevel: 12,
      remortCount: 2
    });
    expect(abilities).toHaveLength(1);
    expect(abilities[0]).toMatchObject({
      combatId: "combat-db-1",
      abilityKey: "ability.basic.attack",
      usesCount: 2,
      totalDamage: 12
    });
    expect(quality).toMatchObject({
      analyticsBattles: 1,
      duplicateWriteAttempts: 1
    });
  });
});

async function createSchema(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`CREATE TABLE characters (id TEXT NOT NULL PRIMARY KEY)`);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE solo_combat_sessions (
      id TEXT NOT NULL PRIMARY KEY,
      status TEXT NOT NULL,
      updated_at DATETIME NOT NULL
    )
  `);
  const migration = readFileSync(
    join(
      process.cwd(),
      "prisma",
      "migrations",
      "20260621100000_add_combat_balance_analytics",
      "migration.sql"
    ),
    "utf8"
  );

  for (const statement of migration.split(";").map((entry) => entry.trim()).filter(Boolean)) {
    await prisma.$executeRawUnsafe(statement);
  }
  await prisma.$executeRawUnsafe(`INSERT INTO characters (id) VALUES ('character-1')`);
}

function makeInput() {
  return {
    combatId: "combat-db-1",
    combatSource: "regular_mob" as const,
    outcome: "win" as const,
    startedAt: new Date("2026-06-21T10:00:00.000Z"),
    finishedAt: new Date("2026-06-21T10:00:23.000Z"),
    balanceVersion: "combat-balance-0.1.21",
    combatEngineVersion: "solo-combat-v1",
    analyticsSchemaVersion: 1,
    playerAnalysisKey: "analysis-key",
    characterId: "character-1",
    isTestOrAdmin: false,
    classKey: "class.warrior",
    playerLevel: 12,
    remortCount: 2,
    playerMaxHp: 40,
    playerHpAtStart: 40,
    playerHpAtEnd: 30,
    playerManaMax: 10,
    playerManaAtStart: 10,
    playerStats: {
      strength: 10,
      dexterity: 7,
      intelligence: 5,
      charisma: 6,
      luck: 4
    },
    playerEquipment: {
      armor: 1,
      resist: 0,
      weaponDamage: 2,
      spellPower: 0
    },
    mobTemplateKey: "monster.rat",
    mobType: "regular_mob",
    mobLevel: 10,
    mobBaseLevel: 10,
    mobDifficultyTier: "normal",
    mobMaxHp: 20,
    mobHpAtEnd: 0,
    roundsCount: 2,
    playerActionsCount: 2,
    enemyActionsCount: 1,
    damageDealt: 12,
    damageTaken: 5,
    healingDone: 0,
    shieldOrDamagePrevented: 0,
    criticalHits: 0,
    misses: 0,
    abilities: [{
      abilityKey: "ability.basic.attack",
      abilityRank: 0,
      isClassAbility: false,
      usesCount: 2,
      successfulUsesCount: 2,
      hitCount: 2,
      critCount: 0,
      missCount: 0,
      totalDamage: 12,
      totalHealing: 0,
      totalShieldOrPrevented: 0,
      resourceSpent: 0
    }]
  };
}
