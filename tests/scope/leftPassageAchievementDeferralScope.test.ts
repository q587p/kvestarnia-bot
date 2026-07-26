import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const deferredTokens = [
  "achievement.left-passage.party-attack.first",
  "left-passage.party-attack.completed",
  "achievementEffect",
  "achievement_effect",
  "listPendingAchievementEffects",
  "markAchievementEffectProjected",
  "projectPendingAchievements"
];

describe("0.4.2 left-passage achievement deferral", () => {
  it("leaves no effect fields, selectors, projectors, catalog row or migration columns", () => {
    const implementation = [
      "prisma/schema.prisma",
      "prisma/migrations/20260724233000_left_passage_party_attack/migration.sql",
      "src/content/achievements.ts",
      "src/db/repositories/groupCombatRepository.ts",
      "src/db/repositories/prismaGroupCombatRepository.ts",
      "src/services/groupCombatService.ts",
      "src/bot/groupCombatTimeoutScheduler.ts",
      "src/app/createServices.ts",
      "docs/design/achievements-catalog.md"
    ].map(read).join("\n");

    for (const token of deferredTokens) {
      expect(implementation).not.toContain(token);
    }
  });
});

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}
