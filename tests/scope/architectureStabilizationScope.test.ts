import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("0.2.2 architecture stabilization scope", () => {
  it("keeps createBot as an orchestration shell", () => {
    const source = read("src/bot/createBot.ts");
    const expectedRegistrars = [
      "registerCoreBotModule",
      "registerCharacterBotModule",
      "registerInventoryBotModule",
      "registerTavernBotModule",
      "registerQuestBotModule",
      "registerCombatBotModule",
      "registerSocialBotModule"
    ];

    expect(source).toContain("installMessageFreshnessTracking(bot)");
    expect(source).toContain("registerCombatLockMiddleware(bot, services)");
    expect(source).toContain("registerPresenceMiddleware(bot, services.presence)");
    expect(source).not.toMatch(/\.\/(?:callbacks|commands|keyboards|presenters)\//);

    for (const registrar of expectedRegistrars) {
      expect(countMatches(source, new RegExp(`${registrar}\\(bot, \\{ services, options \\}\\)`, "g"))).toBe(1);
    }
  });

  it("keeps src/bot.ts delegated to application factories", () => {
    const source = read("src/bot.ts");

    expect(source).toContain("createRepositories(prisma)");
    expect(source).toContain("createServices(repositories, config)");
    expect(source).toContain("createRuntime({");
    expect(source).not.toMatch(/db\/repositories|services\//);
    expect(source).not.toMatch(/new Prisma|new \w+Service/);
  });

  it("registers each callback namespace in exactly one place", () => {
    const source = read("src/bot/featureRegistrars.ts");
    const matches = [...source.matchAll(/bot\.callbackQuery\(\s*(\/\^[^/]+\/)/g)].map((match) => match[1]);
    const expected = [
      "/^v1:menu:/",
      "/^v1:news:/",
      "/^v1:onb:/",
      "/^v1:bst:/",
      "/^v1:devreset:/",
      "/^v1:restart:/",
      "/^v1:rm:/",
      "/^v1:equip:/",
      "/^v1:item:/",
      "/^v1:chest:/",
      "/^v1:lvlx:/",
      "/^v1:sh:/",
      "/^v1:tavern:/",
      "/^v1:place:/",
      "/^v1:mem:/",
      "/^v[12]:cellar:/",
      "/^v[12]:adv:/",
      "/^v1:quest:/",
      "/^v1:hunt:/",
      "/^v1:ygr:/",
      "/^v1:spar:/",
      "/^v1:fight:/",
      "/^v1:gift:/",
      "/^v1:duel:/",
      "/^v1:nd:/"
    ];

    expect(matches).toEqual(expected);
    expect(new Set(matches).size).toBe(matches.length);
  });
});

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function countMatches(source: string, pattern: RegExp): number {
  return [...source.matchAll(pattern)].length;
}
