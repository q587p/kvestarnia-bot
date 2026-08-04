import { describe, expect, it, vi } from "vitest";
import type { PartySessionRepository } from "../../src/db/repositories/partySessionRepository";
import {
  GROUP_COMBAT_PARTY_ORIGIN_LOCATION_ID,
  GROUP_COMBAT_PARTY_PARTICIPANT_CAP,
  GROUP_COMBAT_PARTY_TTL_MS,
  LEFT_PASSAGE_PARTY_ORIGIN_KIND,
  buildLeftPassagePartyInviteUrl,
  buildPartyInviteUrlForSession,
  PartySessionService
} from "../../src/services/partySessionService";
import { PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT } from "../../src/services/presenceService";

describe("PartySessionService GroupCombat proof recruiting", () => {
  it("creates a three-minute 2–3 participant proof announcement", async () => {
    const now = new Date("2026-07-24T10:00:00.000Z");
    const createForTelegramUser = vi.fn().mockResolvedValue({ state: "not-found" });
    const listDueRecruitingByOrigin = vi.fn().mockResolvedValue([]);
    const service = new PartySessionService(
      {
        createForTelegramUser,
        listDueRecruitingByOrigin
      } as unknown as PartySessionRepository,
      { enabled: true, devHelpersEnabled: true },
      () => now
    );

    await service.createGroupCombatProofForTelegramUser(42n, {
      chatId: 42n,
      messageId: 13
    });

    expect(createForTelegramUser).toHaveBeenCalledWith(42n, expect.objectContaining({
      participantCap: GROUP_COMBAT_PARTY_PARTICIPANT_CAP,
      minimumParticipants: 2,
      joinUntilAt: new Date(now.getTime() + GROUP_COMBAT_PARTY_TTL_MS),
      expiresAt: new Date(now.getTime() + GROUP_COMBAT_PARTY_TTL_MS),
      originLocationId: GROUP_COMBAT_PARTY_ORIGIN_LOCATION_ID,
      chatId: 42n,
      messageId: 13
    }));
    await expect(service.listDueRecruitingGroupCombatProof()).resolves.toEqual([]);
    expect(listDueRecruitingByOrigin).toHaveBeenCalledWith(
      GROUP_COMBAT_PARTY_ORIGIN_LOCATION_ID,
      now
    );
  });

  it("does not create or scan proof announcements without dev helpers", async () => {
    const createForTelegramUser = vi.fn();
    const listDueRecruitingByOrigin = vi.fn();
    const service = new PartySessionService(
      {
        createForTelegramUser,
        listDueRecruitingByOrigin
      } as unknown as PartySessionRepository,
      { enabled: true, devHelpersEnabled: false }
    );

    await expect(service.createGroupCombatProofForTelegramUser(42n)).resolves.toEqual({ state: "disabled" });
    await expect(service.listDueRecruitingGroupCombatProof()).resolves.toEqual([]);
    expect(createForTelegramUser).not.toHaveBeenCalled();
    expect(listDueRecruitingByOrigin).not.toHaveBeenCalled();
  });

  it("lists only exact left-passage recruiting sessions for the nearby surface", async () => {
    const now = new Date("2026-07-26T10:00:00.000Z");
    const exact = { originLocationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT };
    const listRecruitingByOriginKind = vi.fn().mockResolvedValue([exact]);
    const service = new PartySessionService(
      { listRecruitingByOriginKind } as unknown as PartySessionRepository,
      { enabled: true, leftPassagePartyAttackEnabled: true },
      () => now
    );

    await expect(service.listVisibleRecruitingAtLocation(
      PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT
    )).resolves.toEqual([exact]);
    expect(listRecruitingByOriginKind).toHaveBeenCalledWith(
      LEFT_PASSAGE_PARTY_ORIGIN_KIND,
      PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT,
      now
    );
  });

  it("does not expose left-passage recruiting when fresh entry is disabled", async () => {
    const listRecruitingByOriginKind = vi.fn();
    const service = new PartySessionService(
      { listRecruitingByOriginKind } as unknown as PartySessionRepository,
      { enabled: true, leftPassagePartyAttackEnabled: false }
    );

    await expect(service.listVisibleRecruitingAtLocation(
      PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT
    )).resolves.toEqual([]);
    expect(listRecruitingByOriginKind).not.toHaveBeenCalled();
  });

  it("binds left-passage joins and URLs to the exact canonical origin", async () => {
    const joinByTokenForTelegramUser = vi.fn().mockResolvedValue({ state: "not-found" });
    const service = new PartySessionService(
      { joinByTokenForTelegramUser } as unknown as PartySessionRepository,
      { enabled: true, leftPassagePartyAttackEnabled: true }
    );

    await service.joinLeftPassageByTokenForTelegramUser(42n, "leftToken13", {
      chatId: 42n,
      messageId: 13
    });

    expect(joinByTokenForTelegramUser).toHaveBeenCalledWith(42n, "leftToken13", expect.objectContaining({
      chatId: 42n,
      messageId: 13,
      joinSource: "deep-link",
      expectedOriginKind: LEFT_PASSAGE_PARTY_ORIGIN_KIND,
      expectedOriginLocationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT,
      relocateToExpectedOrigin: true
    }));
    expect(buildLeftPassagePartyInviteUrl("@kvestarnia_test_bot", "leftToken13"))
      .toBe("https://t.me/kvestarnia_test_bot?start=nyz_left_attack_leftToken13");
    expect(buildPartyInviteUrlForSession("kvestarnia_test_bot", {
      originKind: LEFT_PASSAGE_PARTY_ORIGIN_KIND,
      originLocationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT,
      inviteToken: "leftToken13"
    })).toContain("start=nyz_left_attack_leftToken13");
  });
});
