import { describe, expect, it, vi } from "vitest";
import type { GuildRepository } from "../../src/db/repositories/guildRepository";
import { GuildService } from "../../src/services/guildService";
import type { PartySessionService } from "../../src/services/partySessionService";

describe("GuildService rollout isolation", () => {
  it("keeps every mutation inert while the guild rollout is disabled", async () => {
    const setMemberRoleForTelegramUser = vi.fn();
    const ensureCreationGoldForTelegramUser = vi.fn();
    const service = new GuildService(
      { setMemberRoleForTelegramUser, ensureCreationGoldForTelegramUser } as unknown as GuildRepository,
      {} as PartySessionService,
      { enabled: false, devHelpersEnabled: true }
    );

    await expect(service.setMemberRoleForTelegramUser(42n, "member-id", "officer", 1))
      .resolves.toEqual({ state: "not-found" });
    await expect(service.ensureCreationGoldForDev(42n)).resolves.toBe("disabled");
    expect(setMemberRoleForTelegramUser).not.toHaveBeenCalled();
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
});
