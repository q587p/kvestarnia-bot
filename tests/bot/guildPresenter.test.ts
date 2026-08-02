import { describe, expect, it } from "vitest";
import { presentGuildHub } from "../../src/bot/presenters/guildPresenter";

describe("guild presenter privacy", () => {
  it("shows safe identity, roles and canonical waits without tokens or presence data", () => {
    const now = new Date("2026-08-02T20:00:00.000Z");
    const text = presentGuildHub({
      state: "ready",
      guild: {
        id: "guild-id",
        displayName: "Тиха Печатка",
        normalizedName: "тиха печатка",
        crest: "🛡️",
        description: "Мала ґільдія без стеження.",
        version: 3,
        viewerRole: "leader",
        members: [{
          id: "member-id",
          name: "Провідниця",
          role: "leader"
        }],
        outgoingInvites: [{
          token: "private-outgoing-token",
          guildId: "guild-id",
          guildName: "Тиха Печатка",
          guildCrest: "🛡️",
          targetName: "Запрошена",
          status: "pending",
          expiresAt: new Date(now.getTime() + 23 * 60_000)
        }]
      },
      incomingInvites: []
    }, now);

    expect(text).toContain("Провідниця — провідник");
    expect(text).not.toContain("ремортів:");
    expect(text).toContain("Запрошена — ще 23 хв");
    expect(text).not.toContain("private-outgoing-token");
    expect(text).not.toMatch(/telegram|локаці|онлайн|lastAction|lastSeen/iu);
  });
});
