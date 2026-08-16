import { describe, expect, it } from "vitest";
import { presentGuildHub } from "../../src/bot/presenters/guildPresenter";
import {
  buildGuildCreationStartKeyboard,
  buildGuildHubKeyboard,
  buildGuildInviteCodeKeyboard,
  buildGuildProfileCrestKeyboard
} from "../../src/bot/keyboards/guildKeyboard";
import { parseGuildCallbackData } from "../../src/bot/callbacks/guildCallbackData";
import { GUILD_CREST_CATALOG } from "../../src/domain/guild";
import { GUILD_INVITE_SHARE_TEXTS } from "../../src/content/guildInviteCopy";

const keyboardRowTexts = (rows: ReturnType<typeof buildGuildCreationStartKeyboard>["inline_keyboard"]): string[][] =>
  rows.map((row) => row.map((button) => button.text));

const expectSafeCrestRows = (rows: ReturnType<typeof buildGuildCreationStartKeyboard>["inline_keyboard"]): void => {
  expect(rows.every((row) => row.length > 0)).toBe(true);
  for (const row of rows) {
    const crestChoices = row.filter((button) => {
      if (!("callback_data" in button)) {
        return false;
      }
      const parsed = parseGuildCallbackData(button.callback_data);
      return parsed.ok && (parsed.value.type === "create-crest" || parsed.value.type === "profile-crest");
    });
    expect(crestChoices.length).toBeLessThanOrEqual(5);
  }
};

describe("guild crest picker row shape", () => {
  it("chunks all thirteen available catalog crests as 5 / 5 / 3", () => {
    const rows = buildGuildCreationStartKeyboard().inline_keyboard;

    expect(keyboardRowTexts(rows)).toEqual([
      [...GUILD_CREST_CATALOG.slice(0, 5)],
      [...GUILD_CREST_CATALOG.slice(5, 10)],
      [...GUILD_CREST_CATALOG.slice(10)],
      ["✍️ Запропонувати свій емоджі"],
      ["🏰 Назад"]
    ]);
    expectSafeCrestRows(rows);
  });

  it("chunks eleven sparse choices by visible position while preserving original callback indices", () => {
    const availableCrests = GUILD_CREST_CATALOG.filter((_, index) => index !== 4 && index !== 9);
    const rows = buildGuildCreationStartKeyboard(availableCrests).inline_keyboard;
    const callbacks = rows.slice(0, 3).flat().map((button) => {
      if (!("callback_data" in button)) {
        return null;
      }
      const parsed = parseGuildCallbackData(button.callback_data);
      return parsed.ok && parsed.value.type === "create-crest" ? parsed.value.crestIndex : null;
    });

    expect(rows.slice(0, 3).map((row) => row.length)).toEqual([5, 5, 1]);
    expect(callbacks).toEqual([0, 1, 2, 3, 5, 6, 7, 8, 10, 11, 12]);
    expect(keyboardRowTexts(rows).slice(3)).toEqual([
      ["✍️ Запропонувати свій емоджі"],
      ["🏰 Назад"]
    ]);
    expectSafeCrestRows(rows);
  });

  it("renders one boundary-index crest as one row", () => {
    const rows = buildGuildCreationStartKeyboard([GUILD_CREST_CATALOG[4]]).inline_keyboard;
    const button = rows[0]?.[0];
    const parsed = button && "callback_data" in button
      ? parseGuildCallbackData(button.callback_data)
      : null;

    expect(keyboardRowTexts(rows)).toEqual([
      [GUILD_CREST_CATALOG[4]],
      ["✍️ Запропонувати свій емоджі"],
      ["🏰 Назад"]
    ]);
    expect(parsed).toEqual({ ok: true, value: { type: "create-crest", crestIndex: 4 } });
    expectSafeCrestRows(rows);
  });

  it("renders upload and back only when no catalog crest is available", () => {
    const rows = buildGuildCreationStartKeyboard([]).inline_keyboard;

    expect(keyboardRowTexts(rows)).toEqual([
      ["✍️ Запропонувати свій емоджі"],
      ["🏰 Назад"]
    ]);
    expectSafeCrestRows(rows);
  });

  it("keeps custom-profile actions full-width with no available catalog crest", () => {
    const rows = buildGuildProfileCrestKeyboard(587, [], true).inline_keyboard;

    expect(keyboardRowTexts(rows)).toEqual([
      ["🔁 Лишити чинний емоджі"],
      ["✍️ Запропонувати свій емоджі"],
      ["🏰 Назад"]
    ]);
    expectSafeCrestRows(rows);
  });

  it("retains the original profile crest index and guild version", () => {
    const rows = buildGuildProfileCrestKeyboard(587, [GUILD_CREST_CATALOG[9]], false).inline_keyboard;
    const button = rows[0]?.[0];
    const parsed = button && "callback_data" in button
      ? parseGuildCallbackData(button.callback_data)
      : null;

    expect(keyboardRowTexts(rows)).toEqual([
      [GUILD_CREST_CATALOG[9]],
      ["✍️ Запропонувати свій емоджі"],
      ["🏰 Назад"]
    ]);
    expect(parsed).toEqual({ ok: true, value: { type: "profile-crest", crestIndex: 9, version: 587 } });
    expectSafeCrestRows(rows);
  });
});

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
    const occupiedCatalogButtons = buildGuildCreationStartKeyboard([]).inline_keyboard.flat();
    expect(occupiedCatalogButtons.filter((button) =>
      "callback_data" in button && button.callback_data.startsWith("v1:g:r:")
    )).toHaveLength(0);
    expect(occupiedCatalogButtons).toContainEqual(expect.objectContaining({
      text: "✍️ Запропонувати свій емоджі",
      callback_data: "v1:g:nu"
    }));
    expect(creationButtons.some((button) =>
      "callback_data" in button && parseGuildCallbackData(button.callback_data).ok
    )).toBe(true);

    const token = "privateInviteCode93";
    const inviteUrl = `https://t.me/kvestarnia_bot?start=guild_${token}`;
    const inviteButtons = buildGuildInviteCodeKeyboard(token, inviteUrl).inline_keyboard.flat();
    expect(inviteButtons).toEqual(expect.arrayContaining([
      expect.objectContaining({ copy_text: { text: token } }),
      expect.objectContaining({ copy_text: { text: inviteUrl } }),
      expect.objectContaining({ text: "🎲 Згенерувати інший текст", callback_data: "v1:g:ig:1" }),
      expect.objectContaining({ callback_data: "v1:g:o" })
    ]));
    expect(JSON.stringify(inviteButtons.filter((button) => "callback_data" in button))).not.toContain(token);
    expect(inviteButtons.some((button) =>
      "url" in button && button.url.startsWith("https://t.me/share/url?")
    )).toBe(true);

    const renderedShareTexts = GUILD_INVITE_SHARE_TEXTS.map((expectedText, variant) => {
      const buttons = buildGuildInviteCodeKeyboard(token, inviteUrl, variant).inline_keyboard.flat();
      const share = buttons.find((button) => "url" in button && button.url.startsWith("https://t.me/share/url?"));
      expect(share && "url" in share ? new URL(share.url).searchParams.get("url") : null).toBe(inviteUrl);
      expect(share && "url" in share ? new URL(share.url).searchParams.get("text") : null).toBe(expectedText);
      expect(buttons).toContainEqual(expect.objectContaining({
        text: "🎲 Згенерувати інший текст",
        callback_data: `v1:g:ig:${((variant + 1) % 13).toString(36)}`
      }));
      expect(JSON.stringify(buttons.filter((button) => "callback_data" in button))).not.toContain(token);
      return expectedText;
    });
    expect(new Set(renderedShareTexts).size).toBe(13);
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
