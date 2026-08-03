import { describe, expect, it } from "vitest";
import { presentGuildHub } from "../../src/bot/presenters/guildPresenter";
import {
  buildGuildCreationStartKeyboard,
  buildGuildHubKeyboard,
  buildGuildInviteCodeKeyboard
} from "../../src/bot/keyboards/guildKeyboard";
import { parseGuildCallbackData } from "../../src/bot/callbacks/guildCallbackData";

describe("guild presenter privacy", () => {
  it("offers button-first creation and private invite-code controls without exposing the token in text", () => {
    const hub = {
      state: "not-member" as const,
      incomingInvites: [],
      page: 0,
      hasPreviousPage: false,
      hasNextPage: false
    };
    const hubKeyboard = buildGuildHubKeyboard(hub, { writesEnabled: true }).inline_keyboard.flat();
    const callbacks = hubKeyboard.flatMap((button) => {
      if (!("callback_data" in button)) {
        return [];
      }
      const parsed = parseGuildCallbackData(button.callback_data);
      return parsed.ok ? [parsed.value.type] : [];
    });
    expect(callbacks).toEqual(["create-open", "invite-code", "open"]);

    const creationButtons = buildGuildCreationStartKeyboard().inline_keyboard.flat();
    const crestChoices = creationButtons.flatMap((button) => {
      if (!("callback_data" in button)) {
        return [];
      }
      const parsed = parseGuildCallbackData(button.callback_data);
      return parsed.ok && parsed.value.type === "create-crest" ? [parsed.value.crestIndex] : [];
    });
    expect(crestChoices).toEqual(Array.from({ length: 13 }, (_, index) => index));
    expect(creationButtons.some((button) =>
      "callback_data" in button && parseGuildCallbackData(button.callback_data).ok
    )).toBe(true);

    const token = "privateInviteCode93";
    const inviteUrl = `https://t.me/kvestarnia_bot?start=guild_${token}`;
    const inviteButtons = buildGuildInviteCodeKeyboard(token, inviteUrl).inline_keyboard.flat();
    expect(inviteButtons).toEqual(expect.arrayContaining([
      expect.objectContaining({ copy_text: { text: token } }),
      expect.objectContaining({ copy_text: { text: inviteUrl } }),
      expect.objectContaining({ callback_data: "v1:g:o" })
    ]));
    expect(inviteButtons.some((button) =>
      "url" in button && button.url.startsWith("https://t.me/share/url?")
    )).toBe(true);
  });

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
          canCancel: true,
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
    expect(text).not.toContain("/guild_");
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
          canCancel: true,
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

  it("shows every pending invitation but only actionable cancellation controls", () => {
    const now = new Date("2026-08-02T20:00:00.000Z");
    const result = {
      state: "ready" as const,
      guild: {
        id: "guild-id",
        displayName: "Тиха Печатка",
        normalizedName: "тиха печатка",
        crest: "🛡️",
        description: "",
        status: "active" as const,
        charterExpiresAt: new Date(now.getTime() + 93 * 60_000),
        version: 7,
        viewerRole: "officer" as const,
        memberCount: 3,
        members: [],
        outgoingInvites: [
          {
            token: "ownInviteToken93",
            guildId: "guild-id",
            guildName: "Тиха Печатка",
            guildCrest: "🛡️",
            targetName: "Власна адресатка",
            canCancel: true,
            status: "pending" as const,
            expiresAt: new Date(now.getTime() + 93 * 60_000)
          },
          {
            token: "otherInviteToken93",
            guildId: "guild-id",
            guildName: "Тиха Печатка",
            guildCrest: "🛡️",
            targetName: "Чужа адресатка",
            canCancel: false,
            status: "pending" as const,
            expiresAt: new Date(now.getTime() + 93 * 60_000)
          }
        ],
        page: 0,
        hasPreviousPage: false,
        hasNextPage: false,
        leadershipNomineeName: null,
        viewerIsLeadershipNominee: false
      },
      incomingInvites: []
    };
    const text = presentGuildHub(result, now, { writesEnabled: true });
    const cancelTokens = buildGuildHubKeyboard(result, { writesEnabled: true }).inline_keyboard
      .flat()
      .flatMap((button) => {
        if (!("callback_data" in button)) {
          return [];
        }
        const parsed = parseGuildCallbackData(button.callback_data);
        return parsed.ok && parsed.value.type === "invite-cancel" ? [parsed.value.token] : [];
      });

    expect(text).toContain("Власна адресатка");
    expect(text).toContain("Чужа адресатка");
    expect(cancelTokens).toEqual(["ownInviteToken93"]);
  });
});
