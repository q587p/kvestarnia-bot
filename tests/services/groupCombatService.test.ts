import { describe, expect, it, vi } from "vitest";
import type { GroupCombatRepository } from "../../src/db/repositories/groupCombatRepository";
import { GroupCombatService } from "../../src/services/groupCombatService";
import type { AchievementService } from "../../src/services/achievementService";

describe("GroupCombatService", () => {
  it("cannot start or mutate while the production-safe gate is closed", async () => {
    const { repository, startProof, startDueProof, submitAction } = repositoryFixture();
    const service = new GroupCombatService(repository, { enabled: false, devHelpersEnabled: false });

    await expect(service.startProof(42n, "proof-token")).resolves.toEqual({ state: "disabled" });
    await expect(service.startDueProof("proof-token")).resolves.toEqual({ state: "disabled" });
    await expect(service.submitAction({
      telegramUserId: 42n,
      partyInviteToken: "proof-token",
      turn: 1,
      action: "guard",
      targetKind: "self",
      targetId: "character-1"
    })).resolves.toEqual({ state: "disabled" });
    expect(startProof).not.toHaveBeenCalled();
    expect(startDueProof).not.toHaveBeenCalled();
    expect(submitAction).not.toHaveBeenCalled();
  });

  it("uses the same canonical clock for manual, due, and action deadlines", async () => {
    const { repository, startProof, startDueProof, submitAction } = repositoryFixture();
    startProof.mockResolvedValue({ state: "not-found" });
    startDueProof.mockResolvedValue({ state: "not-found" });
    submitAction.mockResolvedValue({ state: "not-found" });
    const now = new Date("2026-07-22T10:00:00.000Z");
    const service = new GroupCombatService(
      repository,
      { enabled: true, devHelpersEnabled: true },
      () => now
    );

    await service.startProof(42n, "proof-token");
    await service.startDueProof("proof-token");
    await service.submitAction({
      telegramUserId: 42n,
      partyInviteToken: "proof-token",
      turn: 1,
      action: "guard",
      targetKind: "self",
      targetId: "character-1"
    });
    expect(startProof).toHaveBeenCalledWith(expect.objectContaining({
      now,
      turnExpiresAt: new Date(now.getTime() + 23_000)
    }));
    expect(startDueProof).toHaveBeenCalledWith({
      partyInviteToken: "proof-token",
      now,
      turnExpiresAt: new Date(now.getTime() + 23_000)
    });
    expect(submitAction).toHaveBeenCalledWith(expect.objectContaining({
      now,
      nextTurnExpiresAt: new Date(now.getTime() + 23_000)
    }));
  });

  it("keeps servicing active combats while the default-off left-passage entry gate blocks new invitations and starts", async () => {
    const { repository, createLeftPassage, startLeftPassage } = repositoryFixture();
    const service = new GroupCombatService(repository, {
      enabled: true,
      devHelpersEnabled: false,
      leftPassagePartyAttackEnabled: false
    });
    expect(service.isEnabled()).toBe(true);
    expect(service.isLeftPassageEntryEnabled()).toBe(false);
    await expect(service.createLeftPassageParty({
      telegramUserId: 42n,
      encounterToken: "preview-token-13"
    })).resolves.toEqual({ state: "disabled" });
    await expect(service.startLeftPassage(42n, "party-token-23")).resolves.toEqual({ state: "disabled" });
    expect(createLeftPassage).not.toHaveBeenCalled();
    expect(startLeftPassage).not.toHaveBeenCalled();
  });

  it("starts a left-passage attack early through the all-ready repository gate", async () => {
    const { repository, startReadyLeftPassage } = repositoryFixture();
    startReadyLeftPassage.mockResolvedValue({ state: "not-found" });
    const now = new Date("2026-07-27T18:23:00.000Z");
    const service = new GroupCombatService(
      repository,
      {
        enabled: true,
        devHelpersEnabled: false,
        leftPassagePartyAttackEnabled: true
      },
      () => now
    );

    await expect(service.startReadyLeftPassage("party-token-23")).resolves.toEqual({
      state: "not-found"
    });
    expect(startReadyLeftPassage).toHaveBeenCalledWith({
      partyInviteToken: "party-token-23",
      now,
      turnExpiresAt: new Date(now.getTime() + 23_000)
    });
  });

  it("does not rescan a recently attempted card delivery before the retry window", async () => {
    const {
      repository,
      listPendingDeliverySessionIds
    } = repositoryFixture();
    const now = new Date("2026-08-04T19:23:00.000Z");
    listPendingDeliverySessionIds.mockResolvedValue([]);
    const service = new GroupCombatService(
      repository,
      { enabled: true, devHelpersEnabled: false },
      () => now
    );

    await expect(service.listPendingDelivery(13)).resolves.toEqual([]);
    expect(listPendingDeliverySessionIds).toHaveBeenCalledWith(
      13,
      new Date(now.getTime() - 13_000)
    );
  });

  it("settles participants without an achievement projector", async () => {
    const { repository, settleParticipant } = repositoryFixture();
    const receipt = leftPassageReceipt();
    settleParticipant.mockResolvedValue({ state: "settled", receipt });
    const now = new Date("2026-07-26T10:00:00.000Z");
    const service = new GroupCombatService(
      repository,
      { enabled: true, devHelpersEnabled: false },
      () => now
    );

    await expect(service.settleParticipant("left-session", 42n)).resolves.toEqual({
      state: "settled",
      receipt
    });
    expect(settleParticipant).toHaveBeenCalledWith({
      sessionId: "left-session",
      telegramUserId: 42n,
      now
    });
    expect("projectPendingAchievements" in service).toBe(false);
  });

  it("keeps the timeout QA helper non-mutating when dev helpers are disabled", async () => {
    const { repository, findByPartyInviteToken, resolveTimedOutSession } = repositoryFixture();
    const service = new GroupCombatService(repository, {
      enabled: true,
      devHelpersEnabled: false,
      leftPassagePartyAttackEnabled: true
    });

    await expect(service.resolveDevTimeout("party-token-23")).resolves.toEqual({ state: "disabled" });
    expect(findByPartyInviteToken).not.toHaveBeenCalled();
    expect(resolveTimedOutSession).not.toHaveBeenCalled();
  });

  it("tracks ordinary level, item, and combat achievements only after a manual settlement commits", async () => {
    const { repository, settleParticipant, findById } = repositoryFixture();
    const receipt = {
      ...leftPassageReceipt(),
      rewards: {
        xp: 13,
        gold: 2,
        items: [{ itemId: "item.responsible-panic-bandage", quantity: 1 }]
      }
    };
    settleParticipant.mockResolvedValue({
      state: "settled",
      receipt,
      levelChange: { oldLevel: 3, newLevel: 4, leveledUp: true }
    });
    findById.mockResolvedValue({
      state: { status: "won" }
    } as Awaited<ReturnType<GroupCombatRepository["findById"]>>);
    const trackEventSafely = vi.fn<AchievementService["trackEventSafely"]>()
      .mockResolvedValueOnce([{ id: "level", title: "Рівень", cosmeticTitleGrantId: null, unlockedAt: new Date() }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "combat", title: "Перемога", cosmeticTitleGrantId: null, unlockedAt: new Date() }]);
    const service = new GroupCombatService(
      repository,
      { enabled: true, devHelpersEnabled: false },
      () => new Date("2026-07-27T08:00:00.000Z"),
      { trackEventSafely } as unknown as AchievementService
    );

    const result = await service.settleParticipant("left-session", 42n);

    expect(trackEventSafely.mock.calls.map(([event]) => event.type)).toEqual([
      "level.reached",
      "item.received",
      "combat.finished"
    ]);
    expect(result).toMatchObject({
      state: "settled",
      achievementUnlocks: [{ id: "level" }, { id: "combat" }]
    });
  });

  it("does not progress ordinary achievements for a timeout-only settlement", async () => {
    const { repository, settleParticipant } = repositoryFixture();
    settleParticipant.mockResolvedValue({
      state: "settled",
      receipt: { ...leftPassageReceipt(), manualParticipation: false }
    });
    const trackEventSafely = vi.fn();
    const service = new GroupCombatService(
      repository,
      { enabled: true, devHelpersEnabled: false },
      undefined,
      { trackEventSafely } as unknown as AchievementService
    );

    await service.settleParticipant("left-session", 42n);

    expect(trackEventSafely).not.toHaveBeenCalled();
  });

  it("does not duplicate ordinary achievement progress when a completed settlement replays", async () => {
    const { repository, settleParticipant } = repositoryFixture();
    settleParticipant.mockResolvedValue({
      state: "replayed",
      receipt: leftPassageReceipt()
    });
    const trackEventSafely = vi.fn();
    const service = new GroupCombatService(
      repository,
      { enabled: true, devHelpersEnabled: false },
      undefined,
      { trackEventSafely } as unknown as AchievementService
    );

    await service.settleParticipant("left-session", 42n);

    expect(trackEventSafely).not.toHaveBeenCalled();
  });

  it("returns one standard notice when a pending participant retry settles", async () => {
    const {
      repository,
      listPendingSettlementParticipants,
      settleParticipant,
      findById
    } = repositoryFixture();
    listPendingSettlementParticipants.mockResolvedValue([{
      sessionId: "left-session",
      telegramUserId: 42n
    }]);
    settleParticipant.mockResolvedValue({
      state: "settled",
      receipt: leftPassageReceipt(),
      levelChange: { oldLevel: 3, newLevel: 4, leveledUp: true }
    });
    findById.mockResolvedValue({
      participants: [{
        telegramUserId: 42n,
        characterId: "character-1",
        name: "Лідерка"
      }],
      state: {
        participants: [{
          characterId: "character-1",
          classId: "class.priest",
          raceId: "race.human-ish"
        }]
      }
    } as Awaited<ReturnType<GroupCombatRepository["findById"]>>);
    const service = new GroupCombatService(repository, {
      enabled: true,
      devHelpersEnabled: false
    });

    await expect(service.settlePendingWithNotices(13)).resolves.toEqual({
      settled: 1,
      settlementNotices: [{
        telegramUserId: 42n,
        characterId: "character-1",
        characterName: "Лідерка",
        classId: "class.priest",
        raceId: "race.human-ish",
        levelChange: { oldLevel: 3, newLevel: 4, leveledUp: true },
        achievementUnlocks: []
      }]
    });
  });
});

function repositoryFixture() {
  const startProof = vi.fn<GroupCombatRepository["startProofForTelegramUser"]>();
  const startDueProof = vi.fn<GroupCombatRepository["startDueProof"]>();
  const submitAction = vi.fn<GroupCombatRepository["submitActionForTelegramUser"]>();
  const createLeftPassage = vi.fn<GroupCombatRepository["createLeftPassagePartyForTelegramUser"]>();
  const startLeftPassage = vi.fn<GroupCombatRepository["startLeftPassageForTelegramUser"]>();
  const startReadyLeftPassage = vi.fn<GroupCombatRepository["startReadyLeftPassage"]>();
  const findByPartyInviteToken = vi.fn<GroupCombatRepository["findByPartyInviteToken"]>();
  const resolveTimedOutSession = vi.fn<GroupCombatRepository["resolveTimedOutSession"]>();
  const settleParticipant = vi.fn<GroupCombatRepository["settleParticipant"]>();
  const findById = vi.fn<GroupCombatRepository["findById"]>();
  const listPendingSettlementParticipants =
    vi.fn<GroupCombatRepository["listPendingSettlementParticipants"]>();
  const listPendingDeliverySessionIds =
    vi.fn<GroupCombatRepository["listPendingDeliverySessionIds"]>();
  const repository: GroupCombatRepository = {
    createLeftPassagePartyForTelegramUser: createLeftPassage,
    startProofForTelegramUser: startProof,
    startDueProof,
    startLeftPassageForTelegramUser: startLeftPassage,
    startDueLeftPassage: vi.fn(),
    startReadyLeftPassage,
    submitActionForTelegramUser: submitAction,
    resolveTimedOutSession,
    findByPartyInviteToken,
    findById,
    findActiveByTelegramUserId: vi.fn(),
    inspectOperatorRepair: vi.fn(),
    listDueSessionIds: vi.fn(),
    listPendingDeliverySessionIds,
    listPendingSettlementParticipants,
    repairInvalidOrOrphaned: vi.fn(),
    settleParticipant,
    compareAndSetParticipantCard: vi.fn(),
    releaseParticipantCard: vi.fn(),
    markParticipantCardDelivered: vi.fn(),
    finalizeDeliveryAttempt: vi.fn()
  };
  return {
    repository,
    startProof,
    startDueProof,
    submitAction,
    createLeftPassage,
    startLeftPassage,
    startReadyLeftPassage,
    findByPartyInviteToken,
    resolveTimedOutSession,
    settleParticipant,
    findById,
    listPendingDeliverySessionIds,
    listPendingSettlementParticipants
  };
}

function leftPassageReceipt() {
  return {
    version: 1 as const,
    policy: "left-passage-party" as const,
    sessionId: "left-session",
    characterId: "character-1",
    remortCount: 0,
    manualParticipation: true,
    resources: { hp: 13, mana: 7 },
    rewards: { xp: 0, gold: 0, items: [] },
    effects: {
      resourcesKey: "resources",
      xpKey: "xp",
      goldKey: "gold",
      itemKey: null,
      activityKey: null
    }
  };
}
