import { Bot } from "grammy";
import { describe, expect, it, vi } from "vitest";
import type { BotServices } from "../../src/bot/botServices";
import { registerCombatLockMiddleware } from "../../src/bot/middleware/registerCombatLockMiddleware";
import type { GroupCombatSessionRecord } from "../../src/db/repositories/groupCombatRepository";
import type { GroupCombatService } from "../../src/services/groupCombatService";
import { buildGroupCombatKeyboard } from "../../src/bot/keyboards/groupCombatKeyboard";
import { GUILD_INVITE_PROMPT_HEADING } from "../../src/bot/guildRoute";
import {
  GUILD_CREATION_DESCRIPTION_PROMPT_HEADING,
  GUILD_CREATION_NAME_PROMPT_HEADING,
  GUILD_CREST_UPLOAD_PROMPT_HEADING,
  GUILD_PROFILE_DESCRIPTION_PROMPT_HEADING
} from "../../src/bot/presenters/guildPresenter";

const GUILD_FORCE_REPLY_PROMPTS = [
  ["creation name", `${GUILD_CREATION_NAME_PROMPT_HEADING} · 🐈`],
  ["creation description", `${GUILD_CREATION_DESCRIPTION_PROMPT_HEADING} · 🐈`],
  ["profile description", `${GUILD_PROFILE_DESCRIPTION_PROMPT_HEADING} · 🐈`],
  ["custom crest photo", `${GUILD_CREST_UPLOAD_PROMPT_HEADING} · c · customUploadToken13`],
  ["invitation target code", GUILD_INVITE_PROMPT_HEADING]
] as const;

describe("group-combat lock middleware", () => {
  it("keeps legacy cached guild-button text behind the canonical combat lock", async () => {
    const calls = apiCalls();
    const bot = testBot(calls.middleware);
    const downstream = vi.fn();
    const findLease = vi.fn().mockResolvedValue({
      characterId: "character-1",
      kind: "future-combat",
      referenceId: "future-guild-lock"
    });
    registerCombatLockMiddleware(bot, {
      combatLeases: { findActiveForTelegramUser: findLease },
      tavern: { getActivePendingFridayBarrelRaidForTelegramUser: () => Promise.resolve({ state: "none" }) }
    } as unknown as BotServices);
    bot.on("message", downstream);

    await bot.handleUpdate(textUpdate("🏰 Ґільдії"));

    expect(findLease).toHaveBeenCalledWith(1001n);
    expect(downstream).not.toHaveBeenCalled();
    expect(calls.sends).toHaveLength(1);
  });

  it.each([
    "/guild",
    "/guild_create",
    "/guild_invite_code",
    "/guild_invite inviteABC12",
    "/guild_party",
    "/guild_edit",
    "/guild_leave",
    "/guild_delete",
    "/guild_transfer Учасник",
    "/guild_promote Учасник",
    "/guild_demote Учасник",
    "/guild_kick Учасник",
    "/start guild_inviteABC12",
    "🏰 Ґільдії"
  ])("keeps %s behind the pending-raid lock", async (text) => {
    const calls = apiCalls();
    const bot = testBot(calls.middleware);
    const downstream = vi.fn();
    const pending = vi.fn().mockResolvedValue({
      state: "pending",
      character: { name: "Лідерка" },
      availableAt: new Date("2026-08-05T12:13:00.000Z"),
      now: new Date("2026-08-05T12:00:00.000Z")
    });
    registerCombatLockMiddleware(bot, {
      tavern: { getActivePendingFridayBarrelRaidForTelegramUser: pending }
    } as unknown as BotServices);
    bot.on("message", downstream);

    await bot.handleUpdate(textUpdate(text));

    expect(pending).toHaveBeenCalledWith(1001n);
    expect(downstream).not.toHaveBeenCalled();
    expect(calls.sends).toHaveLength(1);
  });

  it.each(["/guildhall", "/start guildish_inviteABC12"])(
    "does not classify the unrelated route %s as guild activity",
    async (text) => {
      const calls = apiCalls();
      const bot = testBot(calls.middleware);
      const downstream = vi.fn();
      const pending = vi.fn().mockResolvedValue({
        state: "pending",
        character: { name: "Лідерка" },
        availableAt: new Date("2026-08-05T12:13:00.000Z"),
        now: new Date("2026-08-05T12:00:00.000Z")
      });
      registerCombatLockMiddleware(bot, {
        tavern: { getActivePendingFridayBarrelRaidForTelegramUser: pending },
        fight: { getFightOverviewForTelegramUser: vi.fn().mockResolvedValue({ state: "no-character" }) }
      } as unknown as BotServices);
      bot.on("message", downstream);

      await bot.handleUpdate(textUpdate(text));

      expect(pending).not.toHaveBeenCalled();
      expect(downstream).toHaveBeenCalledOnce();
      expect(calls.sends).toHaveLength(0);
    }
  );

  it("keeps ordinary guild routing reachable when no raid is pending", async () => {
    const calls = apiCalls();
    const bot = testBot(calls.middleware);
    const downstream = vi.fn();
    const pending = vi.fn().mockResolvedValue({ state: "none" });
    registerCombatLockMiddleware(bot, {
      tavern: { getActivePendingFridayBarrelRaidForTelegramUser: pending },
      fight: { getFightOverviewForTelegramUser: vi.fn().mockResolvedValue({ state: "no-character" }) }
    } as unknown as BotServices);
    bot.on("message", downstream);

    await bot.handleUpdate(textUpdate("/guild_create"));

    expect(pending).toHaveBeenCalledWith(1001n);
    expect(downstream).toHaveBeenCalledOnce();
    expect(calls.sends).toHaveLength(0);
  });

  it("blocks an invitation reply published before a pending raid without guild or delivery effects", async () => {
    const calls = apiCalls();
    const bot = testBot(calls.middleware);
    let pendingActive = false;
    const pending = vi.fn(() => Promise.resolve(pendingActive
      ? pendingRaidResult()
      : { state: "none" as const }));
    const guildRepository = vi.fn();
    const guildService = vi.fn();
    const invitationDelivery = vi.fn();
    const audit = vi.fn();
    const profileMutation = vi.fn();
    const creationIntentMutation = vi.fn();
    const presenceMutation = vi.fn();

    registerCombatLockMiddleware(bot, {
      tavern: { getActivePendingFridayBarrelRaidForTelegramUser: pending }
    } as unknown as BotServices);
    bot.on("message:text", async (ctx) => {
      if (ctx.message.text === "publish invitation prompt") {
        await ctx.reply(`${GUILD_INVITE_PROMPT_HEADING}\n\nВставте код.`);
        return;
      }
      guildRepository();
      guildService();
      invitationDelivery();
      audit();
      profileMutation();
      creationIntentMutation();
      presenceMutation();
    });

    await bot.handleUpdate(textUpdate("publish invitation prompt"));
    pendingActive = true;
    await bot.handleUpdate(forceReplyUpdate(GUILD_INVITE_PROMPT_HEADING, "inviteABC12", 93));

    expect(pending).toHaveBeenCalledOnce();
    expect(pending).toHaveBeenCalledWith(1001n);
    expect(calls.sends).toHaveLength(2);
    expect(calls.sends[0]?.text).toContain(GUILD_INVITE_PROMPT_HEADING);
    expect(calls.sends[1]?.text).toContain("🍺 Ви зараз у рейді.");
    expect(guildRepository).not.toHaveBeenCalled();
    expect(guildService).not.toHaveBeenCalled();
    expect(invitationDelivery).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
    expect(profileMutation).not.toHaveBeenCalled();
    expect(creationIntentMutation).not.toHaveBeenCalled();
    expect(presenceMutation).not.toHaveBeenCalled();
  });

  it("restores the canonical solo card when a profile reply follows a newly active combat", async () => {
    const calls = apiCalls();
    const bot = testBot(calls.middleware);
    let combatActive = false;
    const fightOverview = vi.fn(() => Promise.resolve(combatActive
      ? activePersistentFightOverview()
      : { state: "no-character" as const }));
    const presenceMutation = vi.fn().mockResolvedValue(undefined);
    const profileMutation = vi.fn();

    registerCombatLockMiddleware(bot, {
      tavern: {
        getActivePendingFridayBarrelRaidForTelegramUser: vi.fn().mockResolvedValue({ state: "none" })
      },
      fight: {
        getFightOverviewForTelegramUser: fightOverview,
        recordPersistentFightMessageReference: vi.fn().mockResolvedValue(undefined)
      },
      presence: { markAction: presenceMutation }
    } as unknown as BotServices);
    bot.on("message:text", async (ctx) => {
      if (ctx.message.text === "publish profile prompt") {
        await ctx.reply(`${GUILD_PROFILE_DESCRIPTION_PROMPT_HEADING} · 🐈\n\nНовий опис.`);
        return;
      }
      profileMutation();
    });

    await bot.handleUpdate(textUpdate("publish profile prompt"));
    combatActive = true;
    await bot.handleUpdate(forceReplyUpdate(
      `${GUILD_PROFILE_DESCRIPTION_PROMPT_HEADING} · 🐈`,
      "Опис після початку бою",
      93
    ));

    expect(fightOverview).toHaveBeenCalledOnce();
    expect(profileMutation).not.toHaveBeenCalled();
    expect(presenceMutation).toHaveBeenCalledOnce();
    expect(calls.sends).toHaveLength(2);
    expect(calls.sends[1]?.text).toContain("⚔️ <b>Бій тримає вас за рукав</b>.");
    expect(calls.sends[1]?.text).toContain("👹 Павук: 13/13");
  });

  it("restores the canonical group-combat card when a creation reply follows newly active group combat", async () => {
    const session = activeSession();
    const calls = apiCalls();
    const bot = testBot(calls.middleware);
    const creationIntentMutation = vi.fn();
    const serviceSet = services(session, vi.fn().mockResolvedValue(true));
    let groupCombatActive = false;
    serviceSet.testSpies.findLease.mockImplementation(() => Promise.resolve(groupCombatActive
      ? {
          characterId: "character-1",
          kind: "group-combat",
          referenceId: session.id
        }
      : null));
    Object.assign(serviceSet, {
      tavern: {
        getActivePendingFridayBarrelRaidForTelegramUser: vi.fn().mockResolvedValue({ state: "none" })
      }
    });
    registerCombatLockMiddleware(bot, serviceSet);
    bot.on("message:text", async (ctx) => {
      if (ctx.message.text === "publish creation prompt") {
        await ctx.reply(`${GUILD_CREATION_DESCRIPTION_PROMPT_HEADING} · 🐈\n\nОпишіть статут.`);
        return;
      }
      creationIntentMutation();
    });

    await bot.handleUpdate(textUpdate("publish creation prompt"));
    groupCombatActive = true;
    await bot.handleUpdate(forceReplyUpdate(
      `${GUILD_CREATION_DESCRIPTION_PROMPT_HEADING} · 🐈`,
      "Опис після початку гуртового бою",
      93
    ));

    expect(serviceSet.testSpies.findLease).toHaveBeenCalledOnce();
    expect(serviceSet.testSpies.findGroupById).toHaveBeenCalledWith(session.id);
    expect(creationIntentMutation).not.toHaveBeenCalled();
    expect(calls.sends.some((call) => call.text.includes("<b>Бій</b>"))).toBe(true);
  });

  it.each(GUILD_FORCE_REPLY_PROMPTS)("routes the exact %s ForceReply heading through the pending-raid lock", async (_name, prompt) => {
    const calls = apiCalls();
    const bot = testBot(calls.middleware);
    const downstream = vi.fn();
    const pending = vi.fn().mockResolvedValue(pendingRaidResult());
    registerCombatLockMiddleware(bot, {
      tavern: { getActivePendingFridayBarrelRaidForTelegramUser: pending }
    } as unknown as BotServices);
    bot.on("message", downstream);

    await bot.handleUpdate(forceReplyUpdate(prompt));

    expect(pending).toHaveBeenCalledWith(1001n);
    expect(downstream).not.toHaveBeenCalled();
    expect(calls.sends[0]?.text).toContain("🍺 Ви зараз у рейді.");
  });

  it.each(GUILD_FORCE_REPLY_PROMPTS)("lets the exact %s ForceReply flow continue when no lock exists", async (_name, prompt) => {
    const calls = apiCalls();
    const bot = testBot(calls.middleware);
    const downstream = vi.fn();
    registerCombatLockMiddleware(bot, {
      tavern: {
        getActivePendingFridayBarrelRaidForTelegramUser: vi.fn().mockResolvedValue({ state: "none" })
      },
      fight: {
        getFightOverviewForTelegramUser: vi.fn().mockResolvedValue({ state: "no-character" })
      }
    } as unknown as BotServices);
    bot.on("message", downstream);

    await bot.handleUpdate(forceReplyUpdate(prompt));

    expect(downstream).toHaveBeenCalledOnce();
    expect(calls.sends).toHaveLength(0);
  });

  it("blocks an exact custom-crest photo reply before pending-raid or combat-side mutations", async () => {
    const calls = apiCalls();
    const bot = testBot(calls.middleware);
    const downstream = vi.fn();
    const pending = vi.fn().mockResolvedValue(pendingRaidResult());
    const findLease = vi.fn();
    registerCombatLockMiddleware(bot, {
      tavern: { getActivePendingFridayBarrelRaidForTelegramUser: pending },
      combatLeases: { findActiveForTelegramUser: findLease }
    } as unknown as BotServices);
    bot.on("message", downstream);

    await bot.handleUpdate(forceReplyPhotoUpdate(
      `${GUILD_CREST_UPLOAD_PROMPT_HEADING} · c · customUploadToken13`
    ));

    expect(pending).toHaveBeenCalledWith(1001n);
    expect(findLease).not.toHaveBeenCalled();
    expect(downstream).not.toHaveBeenCalled();
    expect(calls.sends[0]?.text).toContain("🍺 Ви зараз у рейді.");
  });

  it("classifies a custom-crest photo reply as guild work when combat became active after prompt publication", async () => {
    const calls = apiCalls();
    const bot = testBot(calls.middleware);
    const downstream = vi.fn();
    const findLease = vi.fn().mockResolvedValue({
      characterId: "character-1",
      kind: "future-combat",
      referenceId: "custom-crest-lock"
    });
    registerCombatLockMiddleware(bot, {
      tavern: { getActivePendingFridayBarrelRaidForTelegramUser: vi.fn().mockResolvedValue({ state: "none" }) },
      combatLeases: { findActiveForTelegramUser: findLease }
    } as unknown as BotServices);
    bot.on("message", downstream);

    await bot.handleUpdate(forceReplyPhotoUpdate(
      `${GUILD_CREST_UPLOAD_PROMPT_HEADING} · p · customUploadToken13`
    ));

    expect(findLease).toHaveBeenCalledWith(1001n);
    expect(downstream).not.toHaveBeenCalled();
    expect(calls.sends[0]?.text).toContain("не збігається");
  });

  it.each([
    ["arbitrary text", textUpdate("Звичайна розмова")],
    ["unrelated bot reply", forceReplyUpdate("🧭 Інша підказка", "Відповідь")]
  ] as const)("does not lock %s", async (_name, update) => {
    const calls = apiCalls();
    const bot = testBot(calls.middleware);
    const downstream = vi.fn();
    const pending = vi.fn().mockResolvedValue(pendingRaidResult());
    const findLease = vi.fn().mockResolvedValue({
      characterId: "character-1",
      kind: "group-combat",
      referenceId: "group-session"
    });
    registerCombatLockMiddleware(bot, {
      tavern: { getActivePendingFridayBarrelRaidForTelegramUser: pending },
      combatLeases: { findActiveForTelegramUser: findLease }
    } as unknown as BotServices);
    bot.on("message", downstream);

    await bot.handleUpdate(update);

    expect(pending).not.toHaveBeenCalled();
    expect(findLease).not.toHaveBeenCalled();
    expect(downstream).toHaveBeenCalledOnce();
    expect(calls.sends).toHaveLength(0);
  });

  it.each([
    ["turn-based-duel", "duel"],
    ["party-boss", "partyBoss"],
    ["group-combat", "groupCombat"],
    ["solo-combat", "fight"]
  ] as const)("loads only the authoritative %s owner", async (kind, expectedOwner) => {
    const calls = apiCalls();
    const bot = testBot(calls.middleware);
    const downstream = vi.fn();
    const lease = {
      characterId: "character-1",
      kind,
      referenceId: `${kind}-13`
    };
    const findLease = vi.fn().mockResolvedValue(lease);
    const duelExact = vi.fn().mockResolvedValue(null);
    const partyBossExact = vi.fn().mockResolvedValue(null);
    const groupCombatExact = vi.fn().mockResolvedValue(null);
    const fightOverview = vi.fn().mockResolvedValue({ state: "no-character" });
    const duelBroad = vi.fn();
    const partyBossBroad = vi.fn();
    const groupCombatBroad = vi.fn();
    const serviceSet = {
      combatLeases: {
        findActiveForTelegramUser: findLease
      },
      duel: {
        getActiveTurnBasedByIdForCharacterId: duelExact,
        getActiveTurnBasedForTelegramUser: duelBroad
      },
      partyBoss: {
        getActiveByPartySessionIdForCharacterId: partyBossExact,
        getActiveForTelegramUser: partyBossBroad
      },
      groupCombat: {
        findById: groupCombatExact,
        findActiveForTelegramUser: groupCombatBroad
      },
      fight: {
        getFightOverviewForTelegramUser: fightOverview
      }
    } as unknown as BotServices;
    registerCombatLockMiddleware(bot, serviceSet);
    bot.on("message", downstream);

    await bot.handleUpdate(commandUpdate("private"));

    expect(findLease).toHaveBeenCalledTimes(1);
    expect(duelExact).toHaveBeenCalledTimes(expectedOwner === "duel" ? 1 : 0);
    expect(partyBossExact).toHaveBeenCalledTimes(expectedOwner === "partyBoss" ? 1 : 0);
    expect(groupCombatExact).toHaveBeenCalledTimes(expectedOwner === "groupCombat" ? 1 : 0);
    expect(fightOverview).toHaveBeenCalledTimes(expectedOwner === "fight" ? 1 : 0);
    if (expectedOwner === "fight") {
      expect(fightOverview).toHaveBeenCalledWith(1001n, {
        authoritativeLease: lease
      });
    }
    expect(downstream).not.toHaveBeenCalled();
    expect(calls.sends).toHaveLength(1);
    expect(calls.sends[0]?.chatId).toBe(1001);
    expect(calls.sends[0]?.text).toContain("не збігається");
    expect(duelBroad).not.toHaveBeenCalled();
    expect(partyBossBroad).not.toHaveBeenCalled();
    expect(groupCombatBroad).not.toHaveBeenCalled();
  });

  it("handles an unknown authoritative owner without probing or falling through", async () => {
    const calls = apiCalls();
    const bot = testBot(calls.middleware);
    const downstream = vi.fn();
    const unrelated = vi.fn(() => {
      throw new Error("unrelated combat repository was probed");
    });
    registerCombatLockMiddleware(bot, {
      combatLeases: {
        findActiveForTelegramUser: vi.fn().mockResolvedValue({
          characterId: "character-1",
          kind: "future-combat",
          referenceId: "future-13"
        })
      },
      duel: {
        getActiveTurnBasedByIdForCharacterId: unrelated,
        getActiveTurnBasedForTelegramUser: unrelated
      },
      partyBoss: {
        getActiveByPartySessionIdForCharacterId: unrelated,
        getActiveForTelegramUser: unrelated
      },
      groupCombat: {
        findById: unrelated,
        findActiveForTelegramUser: unrelated
      },
      fight: {
        getFightOverviewForTelegramUser: unrelated
      }
    } as unknown as BotServices);
    bot.on("message", downstream);

    await bot.handleUpdate(commandUpdate("private"));
    await bot.handleUpdate({ ...commandUpdate("private"), update_id: 13 });

    expect(unrelated).not.toHaveBeenCalled();
    expect(downstream).not.toHaveBeenCalled();
    expect(calls.sends).toHaveLength(2);
    expect(calls.sends.every((call) => call.text.includes("не збігається"))).toBe(true);
  });

  it("resends a private command redirect as the sole latest canonical card", async () => {
    const session = activeSession();
    session.participants[0]!.replyKeyboardFingerprint = JSON.stringify(
      buildGroupCombatKeyboard(session, session.participants[0]!.characterId).inline_keyboard
    );
    session.participants[0]!.replyKeyboardGeneration = 1;
    const calls = apiCalls();
    const bot = testBot(calls.middleware);
    const markParticipantCardDelivered = vi.fn().mockResolvedValue(true);
    const serviceSet = services(session, markParticipantCardDelivered);
    registerCombatLockMiddleware(bot, serviceSet);

    await bot.handleUpdate(commandUpdate("private"));

    expect(calls.sends).toHaveLength(1);
    expect(calls.sends[0]?.chatId).toBe(1001);
    expect(calls.sends[0]?.text).toContain("<b>Бій</b>");
    expect(inlineKeyboardLabels(calls.sends[0]?.replyMarkup)).toContain("🔎 Оновити");
    expect(calls.edits).toEqual([
      expect.objectContaining({ chatId: 1001, messageId: 21, replyMarkup: undefined }),
      expect.objectContaining({ chatId: 1001, messageId: 93 })
    ]);
    expect(inlineKeyboardLabels(calls.edits[1]?.replyMarkup)).toContain("🔎 Оновити");
    expect(calls.deletes).toEqual([{ chatId: 1001, messageId: 21 }]);
    expect(markParticipantCardDelivered).toHaveBeenCalledWith(expect.objectContaining({
      chatId: 1001n,
      messageId: 93,
      expectedDeliveryRevision: session.deliveryRevision
    }));
    expect(serviceSet.testSpies.findLease).toHaveBeenCalledTimes(1);
    expect(serviceSet.testSpies.findGroupById).toHaveBeenCalledWith(session.id);
    expect(serviceSet.testSpies.findGroupByUser).not.toHaveBeenCalled();
    expect(serviceSet.testSpies.findDuelByUser).not.toHaveBeenCalled();
    expect(serviceSet.testSpies.findPartyBossByUser).not.toHaveBeenCalled();
    expect(serviceSet.testSpies.findFightOverview).not.toHaveBeenCalled();
  });

  it("keeps participant text and mutating buttons out of a supergroup redirect", async () => {
    const session = activeSession();
    session.participants[0]!.replyKeyboardFingerprint = JSON.stringify(
      buildGroupCombatKeyboard(session, session.participants[0]!.characterId).inline_keyboard
    );
    session.participants[0]!.replyKeyboardGeneration = 1;
    const calls = apiCalls();
    const bot = testBot(calls.middleware);
    registerCombatLockMiddleware(bot, services(session, vi.fn().mockResolvedValue(true)));

    await bot.handleUpdate(commandUpdate("supergroup"));

    expect(calls.edits).toEqual([expect.objectContaining({ chatId: 1001, messageId: 21 })]);
    expect(calls.sends).toHaveLength(1);
    expect(calls.sends[0]).toMatchObject({ chatId: -100587 });
    expect(calls.sends[0]?.text).toContain("особистій розмові");
    expect(calls.sends[0]?.text).not.toContain("Лідерка");
    expect(calls.sends[0]?.replyMarkup).toBeUndefined();

    await bot.handleUpdate(commandUpdate("private"));

    const privateCards = calls.sends.filter((call) => call.chatId === 1001);
    expect(privateCards).toHaveLength(1);
    expect(inlineKeyboardLabels(privateCards[0]?.replyMarkup)).toContain("🔎 Оновити");
  });

  it("finishes a durable GroupCombat exit-navigation fence and lets navigation continue without mismatch spam", async () => {
    const session = activeSession();
    session.turn = 2;
    session.state.turn = 2;
    session.state.participants[0]!.fledAtTurn = 1;
    session.participants[0]!.settlementStatus = "completed";
    session.participants[0]!.exitDeliveryState = "pending";
    const participant = session.participants[0]!;
    const calls = apiCalls();
    const bot = testBot(calls.middleware);
    const downstream = vi.fn();
    const serviceSet = services(session, vi.fn().mockResolvedValue(true));
    serviceSet.testSpies.findLease.mockResolvedValue({
      characterId: participant.characterId,
      kind: "group-combat-exit-navigation",
      referenceId: `${session.id}:${participant.characterId}`
    });
    Object.assign(serviceSet.groupCombat!, {
      claimParticipantFleeExitDelivery: vi.fn().mockImplementation((input: {
        claimToken: string;
        claimedAt: Date;
      }) => {
        participant.exitDeliveryState = "claimed";
        participant.exitDeliveryClaimToken = input.claimToken;
        participant.exitDeliveryClaimedAt = input.claimedAt;
        return Promise.resolve({
          state: "claimed",
          locationId: "location.korchma.deep.level1.left",
          menuDelivered: false
        });
      }),
      renewParticipantFleeExitDeliveryClaim: vi.fn().mockResolvedValue(true),
      markParticipantFleeExitMenuDelivered: vi.fn().mockImplementation((input: {
        messageId: number;
      }) => {
        participant.exitDeliveryState = "menu-delivered";
        participant.exitDeliveryMessageId = input.messageId;
        return Promise.resolve(true);
      }),
      completeParticipantFleeExitDelivery: vi.fn().mockImplementation(() => {
        participant.exitDeliveryState = "completed";
        participant.exitDeliveryClaimToken = null;
        participant.exitDeliveryClaimedAt = null;
        participant.chatId = null;
        participant.messageId = null;
        participant.referenceVersion += 1;
        return Promise.resolve(true);
      }),
      releaseParticipantFleeExitDeliveryClaim: vi.fn().mockResolvedValue(true)
    });
    registerCombatLockMiddleware(bot, serviceSet);
    bot.on("message", downstream);

    await bot.handleUpdate(commandUpdate("private"));

    expect(downstream).toHaveBeenCalledOnce();
    expect(participant.exitDeliveryState).toBe("completed");
    expect(calls.sends.some((call) => call.text.includes("не збігається"))).toBe(false);
    expect(calls.sends.some((call) => call.text.includes("Ватага продовжує бій без вас")))
      .toBe(true);
    expect(calls.sends.some((call) => call.text.includes("Головне меню знову на місці")))
      .toBe(false);
  });
});

function services(
  session: GroupCombatSessionRecord,
  markParticipantCardDelivered: ReturnType<typeof vi.fn>
): BotServices & {
  testSpies: {
    findLease: ReturnType<typeof vi.fn>;
    findGroupById: ReturnType<typeof vi.fn>;
    findGroupByUser: ReturnType<typeof vi.fn>;
    findDuelByUser: ReturnType<typeof vi.fn>;
    findPartyBossByUser: ReturnType<typeof vi.fn>;
    findFightOverview: ReturnType<typeof vi.fn>;
  };
} {
  let uiClaimToken: string | null = null;
  const findLease = vi.fn().mockResolvedValue({
    characterId: "character-1",
    kind: "group-combat",
    referenceId: session.id
  });
  const findGroupById = vi.fn().mockResolvedValue(session);
  const findGroupByUser = vi.fn().mockResolvedValue(session);
  const findDuelByUser = vi.fn();
  const findPartyBossByUser = vi.fn();
  const findFightOverview = vi.fn();
  return {
    testSpies: {
      findLease,
      findGroupById,
      findGroupByUser,
      findDuelByUser,
      findPartyBossByUser,
      findFightOverview
    },
    combatLeases: {
      findActiveForTelegramUser: findLease
    },
    duel: {
      getActiveTurnBasedForTelegramUser: findDuelByUser
    },
    partyBoss: {
      getActiveForTelegramUser: findPartyBossByUser
    },
    fight: {
      getFightOverviewForTelegramUser: findFightOverview
    },
    groupCombat: {
      findActiveForTelegramUser: findGroupByUser,
      findById: findGroupById,
      currentTime: () => new Date("2026-07-22T10:00:00.000Z"),
      compareAndSetParticipantCard: vi.fn().mockImplementation((input: {
        telegramUserId: bigint;
        chatId: bigint;
        messageId: number;
      }) => {
        const participant = session.participants.find((row) => row.telegramUserId === input.telegramUserId)!;
        participant.chatId = input.chatId;
        participant.messageId = input.messageId;
        participant.referenceVersion += 1;
        participant.deliveredRevision = 0;
        return Promise.resolve(true);
      }),
      releaseParticipantCard: vi.fn().mockResolvedValue(true),
      markParticipantCardDelivered,
      claimParticipantUiPublication: vi.fn().mockImplementation((input: {
        keyboardFingerprint: string;
        claimToken: string;
      }) => {
        if (uiClaimToken && uiClaimToken !== input.claimToken) {
          return Promise.resolve({ state: "busy" });
        }
        uiClaimToken = input.claimToken;
        const participant = session.participants[0]!;
        return Promise.resolve({
          state: "claimed",
          publishReplyKeyboard:
            participant.replyKeyboardFingerprint !== input.keyboardFingerprint,
          keyboardGeneration: participant.replyKeyboardGeneration ?? 0
        });
      }),
      renewParticipantUiPublicationClaim: vi.fn().mockImplementation((input: {
        claimToken: string;
      }) => Promise.resolve(uiClaimToken === input.claimToken)),
      acknowledgeParticipantUiPublication: vi.fn().mockImplementation((input: {
        claimToken: string;
        publishedKeyboardFingerprint: string | null;
      }) => {
        if (uiClaimToken !== input.claimToken) {
          return Promise.resolve("not-owner");
        }
        const participant = session.participants[0]!;
        if (
          input.publishedKeyboardFingerprint !== null &&
          participant.replyKeyboardFingerprint !==
            input.publishedKeyboardFingerprint
        ) {
          participant.replyKeyboardFingerprint =
            input.publishedKeyboardFingerprint;
          participant.replyKeyboardGeneration =
            (participant.replyKeyboardGeneration ?? 0) + 1;
        }
        uiClaimToken = null;
        return Promise.resolve("acknowledged");
      }),
      releaseParticipantUiPublicationClaim: vi.fn().mockImplementation((input: {
        claimToken: string;
      }) => {
        if (uiClaimToken !== input.claimToken) {
          return Promise.resolve(false);
        }
        uiClaimToken = null;
        return Promise.resolve(true);
      })
    } as unknown as GroupCombatService
  } as unknown as BotServices & {
    testSpies: {
      findLease: ReturnType<typeof vi.fn>;
      findGroupById: ReturnType<typeof vi.fn>;
      findGroupByUser: ReturnType<typeof vi.fn>;
      findDuelByUser: ReturnType<typeof vi.fn>;
      findPartyBossByUser: ReturnType<typeof vi.fn>;
      findFightOverview: ReturnType<typeof vi.fn>;
    };
  };
}

function testBot(middleware: Parameters<Bot["api"]["config"]["use"]>[0]): Bot {
  const bot = new Bot("test-token", {
    botInfo: { id: 123, is_bot: true, first_name: "Квестарня", username: "kvestarnia_bot" }
  });
  bot.api.config.use(middleware);
  return bot;
}

function apiCalls() {
  const edits: Array<{ chatId: number; messageId: number; text: string; replyMarkup: unknown }> = [];
  const sends: Array<{ chatId: number; text: string; replyMarkup: unknown }> = [];
  const deletes: Array<{ chatId: number; messageId: number }> = [];
  return {
    edits,
    sends,
    deletes,
    middleware: ((_prev, method, payload) => {
      if (method === "editMessageText") {
        edits.push({
          chatId: Number(payload.chat_id),
          messageId: Number(payload.message_id),
          text: String(payload.text),
          replyMarkup: payload.reply_markup
        });
        return Promise.resolve({ ok: true, result: true });
      }
      if (method === "sendMessage") {
        sends.push({
          chatId: Number(payload.chat_id),
          text: String(payload.text),
          replyMarkup: payload.reply_markup
        });
        return Promise.resolve({
          ok: true,
          result: { message_id: 93, date: 0, chat: { id: Number(payload.chat_id), type: "private" } }
        });
      }
      if (method === "deleteMessage") {
        deletes.push({ chatId: Number(payload.chat_id), messageId: Number(payload.message_id) });
        return Promise.resolve({ ok: true, result: true });
      }
      return Promise.resolve({ ok: true, result: true });
    }) as Parameters<Bot["api"]["config"]["use"]>[0]
  };
}

function commandUpdate(type: "private" | "supergroup") {
  const chat = type === "private"
    ? { id: 1001, type: "private" as const }
    : { id: -100587, type: "supergroup" as const, title: "Тестова ватага" };
  return {
    update_id: type === "private" ? 1 : 2,
    message: {
      message_id: 1,
      date: 1,
      chat,
      from: { id: 1001, is_bot: false, first_name: "Лідерка" },
      text: "/adventure",
      entities: [{ type: "bot_command" as const, offset: 0, length: 10 }]
    }
  };
}

function textUpdate(text: string) {
  return {
    update_id: 587,
    message: {
      message_id: 587,
      date: 1,
      chat: { id: 1001, type: "private" as const },
      from: { id: 1001, is_bot: false, first_name: "Лідерка" },
      text
    }
  };
}

function forceReplyUpdate(prompt: string, text = "Відповідь", promptMessageId = 586) {
  const update = textUpdate(text);
  return {
    ...update,
    update_id: update.update_id + 1,
    message: {
      ...update.message,
      message_id: update.message.message_id + 1,
      date: update.message.date + 1,
      reply_to_message: {
        message_id: promptMessageId,
        date: update.message.date,
        chat: update.message.chat,
        from: { id: 123, is_bot: true, first_name: "Квестарня", username: "kvestarnia_bot" },
        text: `${prompt}\n\nОпублікована раніше підказка.`
      }
    }
  };
}

function forceReplyPhotoUpdate(prompt: string, promptMessageId = 586) {
  const update = forceReplyUpdate(prompt, "", promptMessageId);
  return {
    ...update,
    message: {
      ...update.message,
      text: undefined,
      photo: [{ file_id: "secret-file", file_unique_id: "secret-unique", width: 512, height: 512 }]
    }
  };
}

function pendingRaidResult() {
  return {
    state: "pending" as const,
    character: persistentFightCharacter(),
    periodId: "12026-08-06",
    availableAt: new Date("2026-08-06T12:13:00.000Z"),
    now: new Date("2026-08-06T12:00:00.000Z")
  };
}

function activePersistentFightOverview() {
  const now = new Date("2026-08-06T12:00:00.000Z");
  return {
    state: "persistent-active" as const,
    character: persistentFightCharacter(),
    session: {
      id: "solo-session-13",
      characterId: "character-1",
      monsterId: "monster.deadline-spider",
      status: "active" as const,
      turn: 1,
      reward: null,
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date("2026-08-06T12:23:00.000Z"),
      state: {
        id: "solo-session-13",
        source: "normal" as const,
        originLocationId: "location.korchma.deep.level1.straight",
        status: "active" as const,
        turn: 1,
        hero: { hp: 23, hpMax: 23, mana: 13, manaMax: 13 },
        monster: { id: "monster.deadline-spider", hp: 13, hpMax: 13 }
      }
    },
    monster: {
      id: "monster.deadline-spider",
      name: "Павук дедлайнів",
      description: "Плете павутину з «сьогодні швиденько».",
      level: 2,
      tags: ["beast", "time", "web"]
    },
    questProgress: null
  };
}

function persistentFightCharacter() {
  return {
    name: "Лідерка",
    pronoun: "she" as const,
    pronounLabel: "Вона",
    path: "boundary" as const,
    raceId: "race.human-ish",
    raceName: "Людисько",
    classId: "class.warrior",
    className: "Воїн",
    title: "Пересічні Пригодники",
    level: 7,
    xp: 0,
    nextLevelXp: 100,
    xpToNextLevel: 100,
    gold: 587,
    hpCurrent: 23,
    hpMax: 23,
    manaCurrent: 13,
    manaMax: 13,
    stats: {
      strength: 5,
      dexterity: 5,
      intelligence: 5,
      charisma: 5,
      luck: 5
    },
    levelBonus: {
      hpMax: 0,
      manaMax: 0,
      primaryStat: { stat: "strength" as const, bonus: 0 }
    },
    combat: { attack: 5, defense: 5 },
    equipment: []
  };
}

function activeSession(): GroupCombatSessionRecord {
  const participants = [
    { characterId: "character-1", telegramUserId: 1001n, name: "Лідерка", rosterOrder: 0 },
    { characterId: "character-2", telegramUserId: 1002n, name: "Друг", rosterOrder: 1 }
  ];
  return {
    id: "group-session",
    partySessionId: "party-session",
    partyInviteToken: "proof-token-13",
    status: "active",
    turn: 1,
    version: 1,
    deliveryRevision: 2,
    deliveryPending: true,
    deliveryAttemptedAt: null,
    turnExpiresAt: new Date("2026-07-22T10:00:23.000Z"),
    completedAt: null,
    result: null,
    participants: participants.map((participant, index) => ({
      ...participant,
      remortCount: 0,
      chatId: participant.telegramUserId,
      messageId: 21 + index,
      referenceVersion: 1,
      deliveredRevision: 1,
      replyKeyboardFingerprint: null,
      replyKeyboardGeneration: 0,
      exitDeliveryState: "none" as const,
      exitDeliveryClaimToken: null,
      exitDeliveryClaimedAt: null,
      exitDeliveryMessageId: null
    })),
    queuedActions: [],
    state: {
      rulesVersion: "group-combat.v1",
      sessionId: "group-session",
      partySessionId: "party-session",
      encounterKey: "proof-cellar-many",
      deterministicSeed: 42,
      status: "active",
      turn: 1,
      participants: participants.map((participant) => ({
        ...participant,
        telegramUserId: participant.telegramUserId.toString(),
        remortCount: 0,
        hp: 30,
        hpMax: 30,
        mana: 13,
        manaMax: 13,
        attack: 8,
        defense: 2,
        support: 5,
        equipmentItemIds: []
      })),
      enemies: [
        { id: "enemy-1", name: "Шурхіт", order: 0, hp: 12, hpMax: 12, attack: 4, defense: 0 },
        { id: "enemy-2", name: "Гуп", order: 1, hp: 14, hpMax: 14, attack: 5, defense: 1 }
      ],
      contributions: participants.map((participant) => ({
        characterId: participant.characterId,
        damage: 0,
        healing: 0,
        guardedTurns: 0
      })),
      recap: []
    }
  };
}

function inlineKeyboardLabels(value: unknown): string[] {
  if (!value || typeof value !== "object") {
    return [];
  }
  const keyboard = (value as Record<string, unknown>)["inline_keyboard"];
  if (!Array.isArray(keyboard)) {
    return [];
  }
  return keyboard.flatMap((row) => Array.isArray(row)
    ? row.flatMap((button) => {
      if (!button || typeof button !== "object") {
        return [];
      }
      const label = (button as Record<string, unknown>)["text"];
      return typeof label === "string" ? [label] : [];
    })
    : []);
}
