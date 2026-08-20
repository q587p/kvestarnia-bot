import { describe, expect, it, vi } from "vitest";
import type { Bot } from "grammy";
import { createReferralScheduler } from "../../src/bot/referralScheduler";
import type { CharacterRepository } from "../../src/db/repositories/characterRepository";
import type { ReferralRepository } from "../../src/db/repositories/referralRepository";
import { ReferralService } from "../../src/services/referralService";

const NOW = new Date("2026-08-19T13:00:00.000Z");

describe("ReferralService recovery", () => {
  it("projects the current title and live guild into every share variant", async () => {
    const getDashboard = vi.fn().mockResolvedValue({
      token: "abCD_123-xyZ7890",
      inviterName: "Архівне імʼя",
      inviterIdentity: {
        name: "Shannar de Kassal",
        activeCosmeticTitleGrantId: "cosmetic-title.first-problem-clerk",
        guildCrest: "🐉",
        guildName: "Лускаті рахівники"
      },
      hasCharacter: true,
      arrivedTotal: 0,
      grantedStageTotal: 0,
      pendingStageTotal: 0,
      earnedByMilestone: { LEVEL_3: 0, LEVEL_5: 0, LEVEL_8: 0, LEVEL_13: 0 }
    });
    const repository = referralRepository({
      getDashboard
    });
    const service = makeService(repository, { foundationEnabled: true, payoutsEnabled: true });

    const result = await service.getDashboard(42n);

    expect(result).toMatchObject({
      state: "ready",
      inviterIdentity: {
        name: "Shannar de Kassal",
        activeCosmeticTitle: "Перший писар",
        guildCrest: "🐉",
        guildName: "Лускаті рахівники"
      }
    });
    if (result.state !== "ready") throw new Error("Expected ready referral dashboard.");
    expect(result.shareTexts).toHaveLength(13);
    expect(result.shareTexts.every((text) =>
      text.includes("Титул: «Перший писар»") &&
      text.includes("Ґільдія: 🐉 Лускаті рахівники")
    )).toBe(true);
    expect(getDashboard).toHaveBeenCalledWith(42n, NOW);
  });

  it("isolates and reschedules one unexpected due reward failure without starving the batch", async () => {
    const grantPendingReward = vi.fn()
      .mockRejectedValueOnce(new Error("unexpected row failure"))
      .mockResolvedValueOnce({ state: "already-granted" });
    const reschedulePendingReward = vi.fn().mockRejectedValue(new Error("reschedule also failed"));
    const repository = referralRepository({
      listDueRewardIds: vi.fn().mockResolvedValue(["reward-bad", "reward-later"]),
      grantPendingReward,
      reschedulePendingReward
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const service = makeService(repository, { foundationEnabled: true, payoutsEnabled: true });

    await expect(service.reconcileDue(13)).resolves.toEqual({ due: 2, granted: 0 });
    expect(grantPendingReward).toHaveBeenNthCalledWith(1, "reward-bad", NOW);
    expect(grantPendingReward).toHaveBeenNthCalledWith(2, "reward-later", NOW);
    expect(reschedulePendingReward).toHaveBeenCalledWith("reward-bad", NOW);
  });

  it("keeps committed Chronicle and join recovery active while both cold-start flags are off", async () => {
    const claimDueNotification = vi.fn().mockResolvedValue(null);
    const listUnrecordedArrivalChronicles = vi.fn().mockResolvedValue([]);
    const listDueRewardIds = vi.fn();
    const repository = referralRepository({
      listUnrecordedArrivalChronicles,
      claimDueNotification,
      listDueRewardIds
    });
    const service = makeService(repository, { foundationEnabled: false, payoutsEnabled: false }, {
      recordReferralArrivedSafely: vi.fn()
    });

    const scheduler = createReferralScheduler(
      service,
      { api: { sendMessage: vi.fn() } } as unknown as Bot
    );
    await expect(scheduler.tick()).resolves.toEqual({
      dueArrivalChronicles: 0,
      recordedArrivalChronicles: 0,
      dueRewards: 0,
      grantedRewards: 0,
      claimedNotifications: 0,
      sentNotifications: 0,
      retriedNotifications: 0
    });

    expect(listDueRewardIds).not.toHaveBeenCalled();
    expect(listUnrecordedArrivalChronicles).toHaveBeenCalledWith(13);
    expect(claimDueNotification).toHaveBeenCalledWith(
      NOW,
      expect.any(String),
      new Date(NOW.getTime() + 42_000),
      false
    );
  });
});

function makeService(
  repository: ReferralRepository,
  flags: { foundationEnabled: boolean; payoutsEnabled: boolean },
  publisher?: { recordReferralArrivedSafely: ReturnType<typeof vi.fn> }
): ReferralService {
  return new ReferralService(
    repository,
    {} as CharacterRepository,
    { ...flags, devHelpersEnabled: false },
    undefined,
    publisher as never,
    () => NOW
  );
}

function referralRepository(overrides: Partial<ReferralRepository>): ReferralRepository {
  return {
    ...overrides
  } as ReferralRepository;
}
