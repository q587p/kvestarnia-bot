import { describe, expect, it } from "vitest";
import {
  presentGuildCreationPreview,
  presentGuildCreationStart,
  presentGuildCrestPickerUnavailable,
  presentGuildHub,
  presentGuildInviteCreate,
  presentGuildInviteOptIn,
  presentGuildGloryBoard,
  presentGuildNestRules,
  presentGuildProfileUpdate
} from "../../src/bot/presenters/guildPresenter";
import {
  buildGuildCreationStartKeyboard,
  buildGuildHubKeyboard,
  buildGuildInviteCodeKeyboard,
  buildGuildGloryBoardKeyboard,
  buildGuildProfileCrestKeyboard
} from "../../src/bot/keyboards/guildKeyboard";
import { parseGuildCallbackData } from "../../src/bot/callbacks/guildCallbackData";
import {
  GUILD_CREST_CATALOG,
  GUILD_FOUNDER_MIN_LEVEL,
  GUILD_INITIAL_MEMBER_CAPACITY,
  GUILD_MAX_MEMBER_CAPACITY,
  GUILD_REMORTED_FOUNDER_MIN_LEVEL
} from "../../src/domain/guild";
import { GUILD_INVITE_SHARE_TEXTS } from "../../src/content/guildInviteCopy";

describe("guild invitation recovery copy", () => {
  it("explains that a nonmember deep-link visitor needs an authorized guild role", () => {
    const text = presentGuildInviteCreate({ state: "not-member" }, new Date());

    expect(text).toContain("не приєднує вас до ґільдії власника картки");
    expect(text).toContain("<b>голові або старшині</b>");
    expect(text).toContain("Ви зараз не належите до ґільдії");
    expect(text).toContain("<b>🏰 До ґільдії</b>");
    expect(text).toContain("створіть власну картку");
  });

  it("explains the missing authority to an ordinary guild member", () => {
    const text = presentGuildInviteCreate({ state: "forbidden" }, new Date());

    expect(text).toContain("Посилання відкрито правильно");
    expect(text).toContain("<b>голова або старшина</b>");
    expect(text).toContain("Ваша поточна роль не має такого повноваження");
    expect(text).toContain("Передайте це саме посилання");
  });
});

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
  it("explains the initial and absolute member-capacity boundaries", () => {
    const text = presentGuildNestRules();
    const creation = presentGuildCreationStart();
    const ineligible = presentGuildCreationPreview({ state: "ineligible" }, new Date(0));
    const pickerUnavailable = presentGuildCrestPickerUnavailable({ state: "ineligible" });

    expect(text).toContain(`від ${GUILD_FOUNDER_MIN_LEVEL} рівня до першого реморту`);
    expect(text).toContain(`від ${GUILD_REMORTED_FOUNDER_MIN_LEVEL} рівня після нього`);
    expect(text).not.toContain("Заснування: 5+");
    expect(creation).toContain(`<b>${GUILD_FOUNDER_MIN_LEVEL} рівень</b> до першого реморту`);
    expect(creation).toContain(`<b>${GUILD_REMORTED_FOUNDER_MIN_LEVEL} рівень</b> після нього`);
    expect(ineligible).toContain(`з ${GUILD_FOUNDER_MIN_LEVEL} рівня до першого реморту`);
    expect(ineligible).toContain(`з ${GUILD_REMORTED_FOUNDER_MIN_LEVEL} рівня після нього`);
    expect(pickerUnavailable).toContain(`${GUILD_FOUNDER_MIN_LEVEL} рівня до першого реморту`);
    expect(pickerUnavailable).toContain(`${GUILD_REMORTED_FOUNDER_MIN_LEVEL} рівня після нього`);
    expect(pickerUnavailable).not.toContain("5 рівня");
    expect(text).toContain(`Початкова межа — <b>${GUILD_INITIAL_MEMBER_CAPACITY} учасників</b>`);
    expect(text).toContain(`розширити до <b>${GUILD_MAX_MEMBER_CAPACITY} місць</b>`);
  });

  it("keeps invitation instructions in separate beats and emphasizes the real buttons", () => {
    const text = presentGuildInviteOptIn({
      state: "ready",
      token: "privateInviteCode93",
      expiresAt: new Date("2026-08-21T20:00:00.000Z")
    }, new Date("2026-08-17T20:00:00.000Z"), {
      inviteUrl: "https://t.me/kvestarnia_bot?start=guild_privateInviteCode93"
    });

    expect(text).toContain(
      '<a href="https://t.me/kvestarnia_bot?start=guild_privateInviteCode93">https://t.me/kvestarnia_bot?start=guild_privateInviteCode93</a>'
    );
    expect(text).toContain(
      "Текст можна змінити без перевипуску посилання.\n\nКвестарня перевірить запрошувача"
    );
    expect(text).toContain("кнопки <b>✅ Долучитися</b> та <b>✖️ Відхилити</b>");
    expect(text).toContain("формований статут.\n\nНовий код одразу скасовує попередній");
    expect(text).not.toContain("місце, час появи");
  });

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
        crest: "<🛡️&>",
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
          guildCrest: "<&>",
          targetName: "Запрошена",
          canCancel: true,
          status: "pending",
          expiresAt: new Date(now.getTime() + 23 * 60_000)
        }],
        page: 0,
        hasPreviousPage: false,
        hasNextPage: false,
        leadershipNomineeName: null,
        viewerIsLeadershipNominee: false,
        weeklyGoal: {
          guildId: "guild-id",
          guildName: "Тиха Печатка",
          guildCrest: "🛡️",
          periodId: "period-id",
          periodKey: "12026-W35",
          progressCount: 8,
          targetCount: 13,
          completedAt: null,
          contributorUserIds: ["user-a", "user-b"],
          gloryTotal: 26,
          weeklyPlace: 3
        }
      },
      incomingInvites: []
    }, now);

    expect(text).toContain("Провідниця — голова");
    expect(text).not.toContain("ремортів:");
    expect(text).toContain("Запрошена — ще 23 хв");
    expect(text).not.toContain("private-outgoing-token");
    expect(text).not.toMatch(/telegram|локаці|онлайн|lastAction|lastSeen/iu);
    expect(text).not.toContain("/guild_");
    expect(text).toContain("&lt;🛡️&amp;&gt;");
    expect(text).not.toContain("<🛡️&>");
    expect(Buffer.byteLength(text, "utf8")).toBeLessThan(4096);
  });

  it("describes both catalog and one-emoji recovery for an invalid crest", () => {
    const creation = presentGuildCreationPreview({ state: "invalid", reason: "crest" }, new Date(0));
    const profile = presentGuildProfileUpdate({ state: "invalid", reason: "crest" });

    expect(creation).toContain("13 каталогових гербів");
    expect(creation).toContain("один власний емоджі");
    expect(profile).toContain("13 каталогових гербів");
    expect(profile).toContain("один власний емоджі");
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
        viewerIsLeadershipNominee: false,
        weeklyGoal: {
          guildId: "guild-id",
          guildName: "Тиха Печатка",
          guildCrest: "🛡️",
          periodId: "period-id",
          periodKey: "12026-W35",
          progressCount: 8,
          targetCount: 13,
          completedAt: null,
          contributorCharacterIds: ["character-a", "character-b"]
        }
      },
      incomingInvites: []
    };
    const text = presentGuildHub(result, now, { writesEnabled: true });
    const keyboard = buildGuildHubKeyboard(result, { writesEnabled: true }).inline_keyboard;

    expect(result.guild.members.length + result.guild.outgoingInvites.length).toBe(5);
    expect(Buffer.byteLength(text, "utf8")).toBeLessThanOrEqual(4096);
    expect(text).toContain("Тижневий спільний клопіт · 12026-W35");
    expect(text).toContain("8/13");
    expect(text).toContain("удар, захист і підтримка");
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

  it("renders five guild-only Glory rows, dense places and own-place recovery without private identity", () => {
    const result = {
      state: "ready" as const,
      view: "glory" as const,
      periodKey: "12026-W35",
      rows: Array.from({ length: 5 }, (_, index) => ({
        guildId: `guild-${index}`,
        guildName: index === 0 ? "<Печатка>" : `Печатка ${index}`,
        guildCrest: index === 0 ? "<&" : "🦉",
        place: index < 2 ? 1 : index,
        glory: index < 2 ? 26 : 13,
        progressCount: 13,
        targetCount: 13,
        completed: true,
        viewerGuild: false
      })),
      viewerGuild: {
        guildId: "viewer-guild",
        guildName: "Моя Печатка",
        guildCrest: "🛡️",
        place: 7,
        glory: 0,
        progressCount: 4,
        targetCount: 13,
        completed: false,
        viewerGuild: true
      },
      page: 0,
      hasPreviousPage: false,
      hasNextPage: true
    };
    const text = presentGuildGloryBoard(result);
    expect(text).toContain("📜 <b>Книга слави</b>");
    expect(text).toContain("1. &lt;&amp; <b>&lt;Печатка&gt;</b> — <b>26 Слави</b>");
    expect(text).toContain("Ваша ґільдія: <b>7 місце</b> · 0 Слави.");
    expect(text).not.toMatch(/гравець|роль|telegram|token|точний час/iu);
    const rows = buildGuildGloryBoardKeyboard(result).inline_keyboard;
    expect(rows[0]?.map((button) => button.text)).toEqual(["• ✨ Слава", "🏁 Першість"]);
    expect(rows[1]?.map((button) => button.text)).toEqual(["🔎 Оновити", "➡️"]);
    expect(rows[2]?.map((button) => button.text)).toEqual(["🪺 До Гнізда"]);
  });
});
