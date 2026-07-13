import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("durable HP recovery notification scope", () => {
  it("keeps the worker independent from HeroService and presentation repositories", () => {
    const service = read("src/services/healthRecoveryNotificationService.ts");
    const repository = read("src/db/repositories/prismaHpRecoveryNotificationRepository.ts");

    expect(service).not.toContain("HeroService");
    expect(service).not.toContain("InventoryRepository");
    expect(service).not.toContain("AchievementService");
    expect(repository).not.toContain("characterItem");
    expect(repository).not.toContain("characterAchievement");
    expect(repository).not.toContain("characterCosmeticTitleGrant");
  });

  it("does not initiate delayed notices from hero, fight, or ordinary callback routes", () => {
    for (const file of [
      "src/bot/commands/heroCommand.ts",
      "src/bot/commands/fightCommand.ts",
      "src/bot/modules/core.ts",
      "src/bot/modules/combat.ts"
    ]) {
      const source = read(file);
      expect(source).not.toContain("presentHealthRecoveryNotification");
      expect(source).not.toContain("prepareDueForTelegramUser");
      expect(source).not.toContain("runBatch");
    }
  });

  it("wires authoritative damage, heal, equipment, settlement, and remort producers", () => {
    for (const file of [
      "src/db/repositories/prismaCharacterRepository.ts",
      "src/db/repositories/prismaDailyActionRepository.ts",
      "src/db/repositories/prismaCooldownRepository.ts",
      "src/db/repositories/prismaClassNoncombatRepository.ts",
      "src/db/repositories/prismaItemUseRepository.ts",
      "src/db/repositories/prismaEquipmentRepository.ts",
      "src/db/repositories/prismaSoloCombatSessionRepository.ts",
      "src/db/repositories/prismaPartyBossRepository.ts",
      "src/db/repositories/prismaRemortRepository.ts"
    ]) {
      expect(read(file)).toContain("hpRecoveryProducer.record");
    }
  });
});

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}
