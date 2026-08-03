import { describe, expect, it } from "vitest";
import { presentGuildHub } from "../../src/bot/presenters/guildPresenter";
import { buildGuildHubKeyboard } from "../../src/bot/keyboards/guildKeyboard";
import { parseGuildCallbackData } from "../../src/bot/callbacks/guildCallbackData";

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
        status: "active",
        charterExpiresAt: new Date(now.getTime() + 93 * 60_000),
        version: 3,
        viewerRole: "leader",
        memberCount: 1,
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
        }],
        page: 0,
        hasPreviousPage: false,
        hasNextPage: false,
        leadershipNomineeName: null,
        viewerIsLeadershipNominee: false
      },
      incomingInvites: []
    }, now);

    expect(text).toContain("Провідниця — голова");
    expect(text).not.toContain("ремортів:");
    expect(text).toContain("Запрошена — ще 23 хв");
    expect(text).not.toContain("private-outgoing-token");
    expect(text).not.toMatch(/telegram|локаці|онлайн|lastAction|lastSeen/iu);
    expect(Buffer.byteLength(text, "utf8")).toBeLessThan(4096);
  });

  it("keeps a full five-row roster/invite page and callbacks within Telegram bounds", () => {
    const now = new Date("2026-08-02T20:00:00.000Z");
    const result = {
      state: "ready" as const,
      guild: {
        id: "guild-id",
        displayName: "Тиха Печатка",
        normalizedName: "тиха печатка",
        crest: "🛡️",
        description: "д".repeat(93),
        status: "active" as const,
        charterExpiresAt: new Date(now.getTime() + 93 * 60_000),
        version: 587,
        viewerRole: "leader" as const,
        memberCount: 8,
        members: Array.from({ length: 3 }, (_, index) => ({
          id: `member-${String(index).padStart(8, "0")}`,
          name: `Пригодник ${index} ${"я".repeat(23)}`,
          role: index === 0 ? "leader" as const : "member" as const
        })),
        outgoingInvites: Array.from({ length: 2 }, (_, index) => ({
          token: `inviteToken${String(index).padStart(8, "0")}`,
          guildId: "guild-id",
          guildName: "Тиха Печатка",
          guildCrest: "🛡️",
          targetName: `Запрошена ${index} ${"я".repeat(23)}`,
          status: "pending" as const,
          expiresAt: new Date(now.getTime() + 93 * 60 * 60_000)
        })),
        page: 1,
        hasPreviousPage: true,
        hasNextPage: true,
        leadershipNomineeName: null,
        viewerIsLeadershipNominee: false
      },
      incomingInvites: []
    };
    const text = presentGuildHub(result, now, { writesEnabled: true });
    const keyboard = buildGuildHubKeyboard(result, { writesEnabled: true }).inline_keyboard;

    expect(result.guild.members.length + result.guild.outgoingInvites.length).toBe(5);
    expect(Buffer.byteLength(text, "utf8")).toBeLessThanOrEqual(4096);
    expect(keyboard.flat().every((button) =>
      !("callback_data" in button) || Buffer.byteLength(button.callback_data, "utf8") <= 64
    )).toBe(true);
    const navigation = keyboard.flat().flatMap((button) => {
      if (!("callback_data" in button)) {
        return [];
      }
      const parsed = parseGuildCallbackData(button.callback_data);
      return parsed.ok && parsed.value.type === "open" ? [parsed.value.page] : [];
    });
    expect(navigation).toEqual([0, 1, 2]);
  });
});
