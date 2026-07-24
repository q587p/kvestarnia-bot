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
});

function repositoryFixture() {
  const startProof = vi.fn<GroupCombatRepository["startProofForTelegramUser"]>();
  const startDueProof = vi.fn<GroupCombatRepository["startDueProof"]>();
  const submitAction = vi.fn<GroupCombatRepository["submitActionForTelegramUser"]>();
  const repository: GroupCombatRepository = {
    startProofForTelegramUser: startProof,
    startDueProof,
    submitActionForTelegramUser: submitAction,
    resolveTimedOutSession: vi.fn(),
    findByPartyInviteToken: vi.fn(),
    findById: vi.fn(),
    findActiveByTelegramUserId: vi.fn(),
    listDueSessionIds: vi.fn(),
    repairInvalidOrOrphaned: vi.fn(),
    compareAndSetParticipantCard: vi.fn(),
    releaseParticipantCard: vi.fn()
  };
  return { repository, startProof, startDueProof, submitAction };
}
