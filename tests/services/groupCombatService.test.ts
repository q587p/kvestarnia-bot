import { describe, expect, it, vi } from "vitest";
import type { GroupCombatRepository } from "../../src/db/repositories/groupCombatRepository";
import { GroupCombatService } from "../../src/services/groupCombatService";

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

  it("projects only durable manual-participation achievement effects", async () => {
    const {
      repository,
      settleParticipant,
      listPendingAchievementEffects,
      markAchievementEffectProjected
    } = repositoryFixture();
    const trackEvent = vi.fn().mockResolvedValue([]);
    const service = new GroupCombatService(
      repository,
      { enabled: true, devHelpersEnabled: false },
      () => new Date("2026-07-25T10:00:00.000Z"),
      { trackEvent } as never
    );
    const receipt = leftPassageReceipt();
    settleParticipant.mockResolvedValueOnce({
      state: "settled",
      receipt: { ...receipt, manualParticipation: false }
    });
    settleParticipant.mockResolvedValueOnce({
      state: "settled",
      receipt: { ...receipt, manualParticipation: true }
    });
    listPendingAchievementEffects.mockResolvedValueOnce([]);
    listPendingAchievementEffects.mockResolvedValueOnce([{
      key: "left-session:character-1:left-passage.party-attack.completed",
      type: "left-passage.party-attack.completed",
      sessionId: "left-session",
      characterId: "character-1",
      occurredAt: new Date("2026-07-25T10:00:00.000Z")
    }]);
    markAchievementEffectProjected.mockResolvedValue(true);

    await service.settleParticipant("left-session", 42n);
    expect(trackEvent).not.toHaveBeenCalled();
    await service.settleParticipant("left-session", 42n);
    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(markAchievementEffectProjected).toHaveBeenCalledTimes(1);
  });

  it("keeps a failed durable achievement projection retryable", async () => {
    const {
      repository,
      listPendingAchievementEffects,
      markAchievementEffectProjected
    } = repositoryFixture();
    const effect = {
      key: "left-session:character-1:left-passage.party-attack.completed",
      type: "left-passage.party-attack.completed" as const,
      sessionId: "left-session",
      characterId: "character-1",
      occurredAt: new Date("2026-07-25T10:00:00.000Z")
    };
    listPendingAchievementEffects.mockResolvedValue([effect]);
    const trackEvent = vi.fn()
      .mockRejectedValueOnce(new Error("achievement-store-down"))
      .mockResolvedValueOnce([]);
    markAchievementEffectProjected.mockResolvedValue(true);
    const service = new GroupCombatService(
      repository,
      { enabled: true, devHelpersEnabled: false },
      () => new Date("2026-07-25T10:00:00.000Z"),
      { trackEvent } as never
    );

    await expect(service.projectPendingAchievements(13)).resolves.toBe(0);
    expect(markAchievementEffectProjected).not.toHaveBeenCalled();
    await expect(service.projectPendingAchievements(13)).resolves.toBe(1);
    expect(trackEvent).toHaveBeenCalledTimes(2);
    expect(markAchievementEffectProjected).toHaveBeenCalledTimes(1);
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
});

function repositoryFixture() {
  const startProof = vi.fn<GroupCombatRepository["startProofForTelegramUser"]>();
  const startDueProof = vi.fn<GroupCombatRepository["startDueProof"]>();
  const submitAction = vi.fn<GroupCombatRepository["submitActionForTelegramUser"]>();
  const createLeftPassage = vi.fn<GroupCombatRepository["createLeftPassagePartyForTelegramUser"]>();
  const startLeftPassage = vi.fn<GroupCombatRepository["startLeftPassageForTelegramUser"]>();
  const findByPartyInviteToken = vi.fn<GroupCombatRepository["findByPartyInviteToken"]>();
  const resolveTimedOutSession = vi.fn<GroupCombatRepository["resolveTimedOutSession"]>();
  const settleParticipant = vi.fn<GroupCombatRepository["settleParticipant"]>();
  const listPendingAchievementEffects =
    vi.fn<GroupCombatRepository["listPendingAchievementEffects"]>();
  const markAchievementEffectProjected =
    vi.fn<GroupCombatRepository["markAchievementEffectProjected"]>();
  const repository: GroupCombatRepository = {
    createLeftPassagePartyForTelegramUser: createLeftPassage,
    startProofForTelegramUser: startProof,
    startDueProof,
    startLeftPassageForTelegramUser: startLeftPassage,
    startDueLeftPassage: vi.fn(),
    submitActionForTelegramUser: submitAction,
    resolveTimedOutSession,
    findByPartyInviteToken,
    findById: vi.fn(),
    findActiveByTelegramUserId: vi.fn(),
    inspectOperatorRepair: vi.fn(),
    listDueSessionIds: vi.fn(),
    listPendingDeliverySessionIds: vi.fn(),
    listPendingSettlementParticipants: vi.fn(),
    listPendingAchievementEffects,
    markAchievementEffectProjected,
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
    findByPartyInviteToken,
    resolveTimedOutSession,
    settleParticipant,
    listPendingAchievementEffects,
    markAchievementEffectProjected
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
