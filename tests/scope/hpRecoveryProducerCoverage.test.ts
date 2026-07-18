import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

describe("HP recovery producer coverage", () => {
  it.each([
    ["level barter", "src/db/repositories/prismaLevelBarterRepository.ts"],
    ["item upgrade", "src/db/repositories/prismaItemUpgradeRepository.ts"],
    ["cellar grownup reward", "src/db/repositories/prismaCellarGrownupQuestRepository.ts"],
    ["turn-based duel reward", "src/db/repositories/prismaDuelChallengeRepository.ts"],
    ["Shynok settlement and activation", "src/db/repositories/prismaShynokRepository.ts"]
  ])("keeps %s authoritative writes transactionally connected to the shared producer", async (_name, path) => {
    const source = await readFile(path, "utf8");

    expect(source).toContain("HpRecoveryNotificationProducer");
    expect(source).toMatch(/hpRecoveryProducer\.record\(tx,/);
  });

  it("checks party-boss terminal resources canonically after rewards instead of using combat hpMax", async () => {
    const source = await readFile("src/db/repositories/prismaPartyBossRepository.ts", "utf8");

    expect(source).not.toContain("participant.resources.hp >= participant.resources.hpMax");
    expect(source.match(/hpRecoveryProducer\.record\(/g)).toHaveLength(3);
  });

  it("injects the one rollout-gated producer into every effective-HP mutation repository", async () => {
    const source = await readFile("src/app/createRepositories.ts", "utf8");

    for (const repository of [
      "PrismaLevelBarterRepository",
      "PrismaItemUpgradeRepository",
      "PrismaCellarGrownupQuestRepository",
      "PrismaDuelChallengeRepository",
      "PrismaShynokRepository"
    ]) {
      expect(source).toContain(`new ${repository}(prisma, hpRecoveryProducer)`);
    }
  });

  it("keeps delayed-notice initiation out of hero, fight, and ordinary callback handlers", async () => {
    const botFiles = await listTypeScriptFiles("src/bot");
    const references: string[] = [];
    for (const path of botFiles) {
      const source = await readFile(path, "utf8");
      if (/healthRecoveryNotifications|prepareDueForTelegramUser/.test(source)) {
        references.push(relative("src/bot", path).replace(/\\/g, "/"));
      }
    }

    expect(references.sort()).toEqual([
      "botServices.ts",
      "commands/devHpRecoveryCommand.ts",
      "modules/character.ts",
      "modules/core.ts",
      "modules/mainMenu.ts"
    ]);

    for (const path of ["src/bot/modules/core.ts", "src/bot/modules/mainMenu.ts"]) {
      const source = await readFile(path, "utf8");
      expect(source).toContain("healthRecoveryNotifications?.areDevHelpersEnabled()");
      expect(source).not.toContain("prepareDueForTelegramUser");
      expect(source).not.toContain("healthRecoveryNotifications?.runBatch");
    }
  });
});

async function listTypeScriptFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listTypeScriptFiles(path));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(path);
    }
  }
  return files;
}
