import { describe, expect, it, vi } from "vitest";
import type { GuildRepository } from "../../src/db/repositories/guildRepository";
import { GuildService } from "../../src/services/guildService";
import type { PartySessionService } from "../../src/services/partySessionService";
import type { AchievementService } from "../../src/services/achievementService";

describe("GuildService rollout isolation", () => {
  it("keeps every mutation inert while the guild rollout is disabled", async () => {
    const setMemberRoleForTelegramUser = vi.fn();
    const updateProfileForTelegramUser = vi.fn();
    const ensureCreationGoldForTelegramUser = vi.fn();
    const service = new GuildService(
      { setMemberRoleForTelegramUser, updateProfileForTelegramUser, ensureCreationGoldForTelegramUser } as unknown as GuildRepository,
      {} as PartySessionService,
      { enabled: false, devHelpersEnabled: true }
    );

    await expect(service.setMemberRoleForTelegramUser(42n, "member-id", "officer", 1))
      .resolves.toEqual({ state: "not-found" });
    await expect(service.updateProfileForTelegramUser(42n, { crest: "🦉", description: "Тихо", expectedVersion: 1 }))
      .resolves.toEqual({ state: "disabled" });
    await expect(service.ensureCreationGoldForDev(42n)).resolves.toBe("disabled");
    expect(setMemberRoleForTelegramUser).not.toHaveBeenCalled();
    expect(updateProfileForTelegramUser).not.toHaveBeenCalled();
    expect(ensureCreationGoldForTelegramUser).not.toHaveBeenCalled();
  });

  it("does not expose the dev helper when production wiring leaves it off", async () => {
    const ensureCreationGoldForTelegramUser = vi.fn();
    const service = new GuildService(
      { ensureCreationGoldForTelegramUser } as unknown as GuildRepository,
      {} as PartySessionService,
      { enabled: true, devHelpersEnabled: false }
    );

    expect(service.isEnabled()).toBe(true);
    expect(service.areDevHelpersEnabled()).toBe(false);
    await expect(service.ensureCreationGoldForDev(42n)).resolves.toBe("disabled");
    expect(ensureCreationGoldForTelegramUser).not.toHaveBeenCalled();
  });

  it("keeps recovery reads, accepted transfer, leave and sole disband available while rollout writes are off", async () => {
    const now = new Date("2026-08-02T20:00:00.000Z");
    const repository = {
      getHubForTelegramUser: vi.fn().mockResolvedValue({ state: "no-character" }),
      acceptLeadershipForTelegramUser: vi.fn().mockResolvedValue({ state: "updated", guild: {} }),
      leaveForTelegramUser: vi.fn().mockResolvedValue({ state: "left", guildName: "Тиха" }),
      deleteForTelegramUser: vi.fn().mockResolvedValue({ state: "deleted", guildName: "Тиха" }),
      createInviteForTelegramUser: vi.fn()
    };
    const service = new GuildService(
      repository as unknown as GuildRepository,
      {} as PartySessionService,
      { enabled: false },
      () => now
    );

    await expect(service.getHubForTelegramUser(42n)).resolves.toEqual({ state: "no-character" });
    await expect(service.acceptLeadershipForTelegramUser(42n, 7)).resolves.toMatchObject({ state: "updated" });
    await expect(service.leaveForTelegramUser(42n, 7)).resolves.toMatchObject({ state: "left" });
    await expect(service.deleteForTelegramUser(42n, 7)).resolves.toMatchObject({ state: "deleted" });
    await expect(service.createInviteForTelegramUser(42n, "private-code")).resolves.toEqual({ state: "disabled" });
    expect(repository.createInviteForTelegramUser).not.toHaveBeenCalled();
  });

  it("emits activation and join achievements only from an accepted repository result", async () => {
    const now = new Date("2026-08-02T20:00:00.000Z");
    const trackEventSafely = vi.fn().mockResolvedValue([]);
    const guild = {
      id: "guild-id",
      displayName: "Тиха Печатка",
      normalizedName: "тиха печатка",
      crest: "🛡️",
      description: "",
      status: "active",
      charterExpiresAt: new Date(now.getTime() + 1),
      version: 2,
      viewerRole: "member",
      memberCount: 2,
      members: [],
      outgoingInvites: [],
      page: 0,
      hasPreviousPage: false,
      hasNextPage: false,
      leadershipNomineeName: null,
      viewerIsLeadershipNominee: false
    } as const;
    const acceptInviteForTelegramUser = vi.fn().mockResolvedValue({
      state: "accepted",
      guild,
      characterId: "joiner-character",
      activatedFounderCharacterId: "founder-character"
    });
    const service = new GuildService(
      { acceptInviteForTelegramUser } as unknown as GuildRepository,
      {} as PartySessionService,
      { enabled: true },
      () => now,
      { trackEventSafely } as unknown as AchievementService
    );

    await service.acceptInviteForTelegramUser(42n, "invite-token");

    expect(trackEventSafely).toHaveBeenNthCalledWith(1, {
      type: "guild.created",
      characterId: "founder-character",
      occurredAt: now,
      sourceId: "guild-id"
    });
    expect(trackEventSafely).toHaveBeenNthCalledWith(2, {
      type: "guild.joined",
      characterId: "joiner-character",
      occurredAt: now,
      sourceId: "guild-id"
    });
  });
});
