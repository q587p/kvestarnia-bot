import { describe, expect, it, vi } from "vitest";
import { HealthRecoveryNotificationService } from "../../src/services/healthRecoveryNotificationService";

describe("HealthRecoveryNotificationService", () => {
  it("reports only characters that become full through passive recovery sync", async () => {
    const now = new Date("2026-07-10T10:00:00.000Z");
    const characters = {
      listPassiveHealthRecoveryCandidates: vi.fn(() => Promise.resolve([
        {
          telegramUserId: 42n,
          hpCurrent: 1,
          hpMax: 20,
          hpRegenAt: new Date("2026-07-10T09:00:00.000Z")
        },
        {
          telegramUserId: 93n,
          hpCurrent: 12,
          hpMax: 20,
          hpRegenAt: new Date("2026-07-10T09:55:00.000Z")
        }
      ]))
    };
    const hero = {
      findByTelegramUserId: vi.fn((telegramUserId: bigint) =>
        Promise.resolve(
          telegramUserId === 42n
            ? {
                state: "existing-character" as const,
                recoveryNotice: {
                  type: "hp-full" as const,
                  hpCurrent: 40,
                  hpMax: 40
                }
              }
            : {
                state: "existing-character" as const
              }
        )
      )
    };

    const service = new HealthRecoveryNotificationService(characters, hero);
    const due = await service.listDueHpFullNotifications(now, { limit: 2 });

    expect(characters.listPassiveHealthRecoveryCandidates).toHaveBeenCalledWith(now, { limit: 2 });
    expect(hero.findByTelegramUserId).toHaveBeenCalledTimes(2);
    expect(due).toEqual([
      {
        telegramUserId: 42n,
        hpCurrent: 40,
        hpMax: 40
      }
    ]);
  });
});
