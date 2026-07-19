import { Bot, type Context } from "grammy";
import { describe, expect, it, vi } from "vitest";
import {
  handlePartySessionCallback,
  registerPartySessionDevCommand,
  sendPartyJoinFromStartPayload
} from "../../src/bot/commands/partySessionCommand";
import type { PartyBossSessionRecord } from "../../src/db/repositories/partyBossRepository";
import type { PartySessionRecord } from "../../src/db/repositories/partySessionRepository";
import type { PartySessionService } from "../../src/services/partySessionService";
import type { PartyBossService } from "../../src/services/partyBossService";
import type { PresenceService } from "../../src/services/presenceService";

describe("handlePartySessionCallback", () => {
  it("does not create a dev party when the command is accidentally registered without dev helpers", async () => {
    const bot = new Bot("test-token", {
      botInfo: {
        id: 123,
        is_bot: true,
        first_name: "Квестарня",
        username: "kvestarnia_bot"
      }
    });
    const replies: string[] = [];
    const createForTelegramUser = vi.fn();
    bot.api.config.use((_prev, method, payload) => {
      if (method === "sendMessage") {
        replies.push(String(payload.text));
      }

      return Promise.resolve({
        ok: true,
        result: { message_id: replies.length }
      });
    });

    registerPartySessionDevCommand(
      bot,
      serviceWith({
        areDevHelpersEnabled: () => false,
        createForTelegramUser
      }),
      { presence: {} as PresenceService }
    );

    await bot.handleUpdate(commandUpdate("/dev_party"));

    expect(createForTelegramUser).not.toHaveBeenCalled();
    expect(replies).toEqual(["Dev-команди тут не ввімкнені. Корчмар сховав мотузку."]);
  });

  it("opens a standalone nearby party invite picker", async () => {
    const session = makeSession("recruiting");
    const getLiveRecruitingByTelegramUser = vi.fn().mockResolvedValue(session);
    const getNearbyDuelCandidatesForTelegramUser = vi.fn().mockResolvedValue({
      state: "ready",
      location: {
        id: "location.korchma.bar",
        name: "Шинок"
      },
      page: 0,
      pageSize: 5,
      total: 1,
      totalPages: 1,
      visible: [
        {
          telegramUserId: 93n,
          name: "Сусідня Пригодниця",
          level: 8,
          status: "active"
        }
      ]
    });
    const { ctx, editMessageText } = createCallbackContext();

    await handlePartySessionCallback(
      ctx,
      { type: "nearby-open", page: 0 },
      serviceWith({ getLiveRecruitingByTelegramUser }),
      { presence: { getNearbyDuelCandidatesForTelegramUser } as unknown as PresenceService }
    );

    expect(getLiveRecruitingByTelegramUser).toHaveBeenCalledWith(42n);
    expect(getNearbyDuelCandidatesForTelegramUser).toHaveBeenCalledWith(42n, 0);
    expect(messageText(editMessageText)).toContain("🧭 <b>Покликати у ватагу</b>");
    expect(messageText(editMessageText)).not.toContain("Кинути виклик присутнім");
    expect(keyboardJson(editMessageText)).toContain("v1:party:ni:2l:0");
    expect(keyboardJson(editMessageText)).not.toContain("v1:nd:");
  });

  it("force-expires a live recruiting party through the dev helper when allowed", async () => {
    const session = makeSession("recruiting");
    const expired = { ...session, status: "expired" as const, activeLeaderKey: null, version: 2 };
    const forceExpireByToken = vi.fn().mockResolvedValue({ state: "ready", session: expired });
    const { ctx, answerCallbackQuery, editMessageText } = createCallbackContext();

    await handlePartySessionCallback(
      ctx,
      { type: "expire", token: session.inviteToken },
      serviceWith({
        areDevHelpersEnabled: () => true,
        forceExpireByToken
      }),
      { presence: {} as PresenceService }
    );

    expect(forceExpireByToken).toHaveBeenCalledWith(session.inviteToken);
    expect(answerCallbackQuery).toHaveBeenCalledWith({ text: "Строк збору завершено." });
    expect(messageText(editMessageText)).toContain("Стан: строк збору минув");
    expect(keyboardJson(editMessageText)).not.toContain("⏱️ Dev: завершити строк");
  });

  it("rejects the dev expiry callback without mutating when helper mode is disabled", async () => {
    const forceExpireByToken = vi.fn();
    const { ctx, answerCallbackQuery, editMessageText } = createCallbackContext();

    await handlePartySessionCallback(
      ctx,
      { type: "expire", token: "partyABC12" },
      serviceWith({
        areDevHelpersEnabled: () => false,
        forceExpireByToken
      }),
      { presence: {} as PresenceService }
    );

    expect(forceExpireByToken).not.toHaveBeenCalled();
    expect(answerCallbackQuery).toHaveBeenCalledWith({
      text: "Ця кнопка вже втратила магію. Спробуйте /start ще раз.",
      show_alert: true
    });
    expect(editMessageText).not.toHaveBeenCalled();
  });

  it("updates raid readiness and refreshes other recruiting cards", async () => {
    const session = makeBigBarrelSessionWithMember();
    const updated = {
      ...session,
      participants: session.participants.map((participant) =>
        participant.characterId === "character-42"
          ? { ...participant, readiness: "ready" as const }
          : participant
      )
    };
    const setReadinessForTelegramUser = vi.fn().mockResolvedValue({
      state: "updated",
      session: updated
    });
    const getByPartyInviteToken = vi.fn().mockResolvedValue(null);
    const { ctx, answerCallbackQuery, editMessageText, apiEditMessageText } = createCallbackContext();

    await handlePartySessionCallback(
      ctx,
      { type: "readiness", token: session.inviteToken, readiness: "ready" },
      serviceWithCanonicalSession(updated, { setReadinessForTelegramUser }),
      {
        botUsername: "kvestarnia_test_bot",
        presence: {} as PresenceService,
        partyBoss: partyBossWith({ getByPartyInviteToken })
      }
    );

    expect(setReadinessForTelegramUser).toHaveBeenCalledWith(42n, session.inviteToken, "ready");
    expect(answerCallbackQuery).toHaveBeenCalledWith({ text: "Позначено: ви готові." });
    expect(messageText(editMessageText)).toContain("1. ✅ <b>Тестова Лідерка</b>");
    expect(keyboardJson(editMessageText)).toContain("⏳ Зачекайте");
    expect(apiEditMessageText).toHaveBeenCalledTimes(1);
    expect(apiEditMessageText.mock.calls[0]?.[0]).toBe(93);
    expect(String(apiEditMessageText.mock.calls[0]?.[2])).toContain("1. ✅ <b>Тестова Лідерка</b>");
  });

  it("refreshes the leader recruiting card when another participant changes readiness", async () => {
    const session = makeBigBarrelSessionWithMember();
    const updated = {
      ...session,
      participants: session.participants.map((participant) =>
        participant.characterId === "character-93"
          ? { ...participant, readiness: "ready" as const }
          : participant
      )
    };
    const setReadinessForTelegramUser = vi.fn().mockResolvedValue({
      state: "updated",
      session: updated
    });
    const getByPartyInviteToken = vi.fn().mockResolvedValue(null);
    const { ctx, apiEditMessageText } = createCallbackContext(93);

    await handlePartySessionCallback(
      ctx,
      { type: "readiness", token: session.inviteToken, readiness: "ready" },
      serviceWithCanonicalSession(updated, { setReadinessForTelegramUser }),
      {
        botUsername: "kvestarnia_test_bot",
        presence: {} as PresenceService,
        partyBoss: partyBossWith({ getByPartyInviteToken })
      }
    );

    expect(apiEditMessageText).toHaveBeenCalledWith(
      42,
      13,
      expect.stringContaining("2. ✅ <b>Друга Учасниця</b>"),
      expect.objectContaining({ parse_mode: "HTML" })
    );
  });

  it("sends and stores a fresh leader card when readiness cannot use a saved reference", async () => {
    const session = makeBigBarrelSessionWithMember();
    const updated = {
      ...session,
      participants: session.participants.map((participant) =>
        participant.characterId === "character-42"
          ? { ...participant, chatId: null, messageId: null }
          : participant.characterId === "character-93"
            ? { ...participant, readiness: "ready" as const }
            : participant
      )
    };
    const setReadinessForTelegramUser = vi.fn().mockResolvedValue({ state: "updated", session: updated });
    const recordParticipantMessageReference = vi.fn().mockResolvedValue(updated);
    const { ctx, sendMessage } = createCallbackContext(93);
    sendMessage.mockResolvedValue({ message_id: 77 });

    await handlePartySessionCallback(
      ctx,
      { type: "readiness", token: session.inviteToken, readiness: "ready" },
      serviceWithCanonicalSession(updated, { setReadinessForTelegramUser, recordParticipantMessageReference }),
      {
        botUsername: "kvestarnia_test_bot",
        presence: {} as PresenceService,
        partyBoss: partyBossWith({ getByPartyInviteToken: vi.fn().mockResolvedValue(null) })
      }
    );

    expect(sendMessage).toHaveBeenCalledWith(
      42,
      expect.stringContaining("2. ✅ <b>Друга Учасниця</b>"),
      expect.objectContaining({ parse_mode: "HTML" })
    );
    expect(recordParticipantMessageReference).toHaveBeenCalledWith(42n, session.inviteToken, {
      chatId: 42n,
      messageId: 77
    });
  });

  it("replaces a stale saved leader card after another participant changes readiness", async () => {
    const session = makeBigBarrelSessionWithMember();
    const updated = {
      ...session,
      participants: session.participants.map((participant) =>
        participant.characterId === "character-93"
          ? { ...participant, readiness: "ready" as const }
          : participant
      )
    };
    const recordParticipantMessageReference = vi.fn().mockResolvedValue(updated);
    const { ctx, apiEditMessageText, sendMessage } = createCallbackContext(93);
    apiEditMessageText.mockRejectedValue(new Error("Bad Request: message can't be edited"));
    sendMessage.mockResolvedValue({ message_id: 77 });

    await handlePartySessionCallback(
      ctx,
      { type: "readiness", token: session.inviteToken, readiness: "ready" },
      serviceWithCanonicalSession(updated, {
        setReadinessForTelegramUser: vi.fn().mockResolvedValue({ state: "updated", session: updated }),
        recordParticipantMessageReference
      }),
      {
        botUsername: "kvestarnia_test_bot",
        presence: {} as PresenceService,
        partyBoss: partyBossWith({ getByPartyInviteToken: vi.fn().mockResolvedValue(null) })
      }
    );

    expect(apiEditMessageText).toHaveBeenCalledWith(42, 13, expect.any(String), expect.any(Object));
    expect(sendMessage).toHaveBeenCalledWith(
      42,
      expect.stringContaining("2. ✅ <b>Друга Учасниця</b>"),
      expect.objectContaining({ parse_mode: "HTML" })
    );
    expect(recordParticipantMessageReference).toHaveBeenCalledWith(42n, session.inviteToken, {
      chatId: 42n,
      messageId: 77
    });
  });

  it("treats message-not-modified as a successful leader refresh", async () => {
    const session = makeBigBarrelSessionWithMember();
    const updated = withParticipantReadiness(session, "character-93", "ready", 2);
    const recordParticipantMessageReference = vi.fn();
    const { ctx, apiEditMessageText, sendMessage } = createCallbackContext(93);
    apiEditMessageText.mockRejectedValue(new Error("400: Bad Request: message is not modified"));

    await handlePartySessionCallback(
      ctx,
      { type: "readiness", token: session.inviteToken, readiness: "ready" },
      serviceWithCanonicalSession(updated, {
        setReadinessForTelegramUser: vi.fn().mockResolvedValue({ state: "updated", session: updated }),
        recordParticipantMessageReference
      }),
      {
        botUsername: "kvestarnia_test_bot",
        presence: {} as PresenceService,
        partyBoss: partyBossWith({ getByPartyInviteToken: vi.fn().mockResolvedValue(null) })
      }
    );

    expect(sendMessage).not.toHaveBeenCalled();
    expect(recordParticipantMessageReference).not.toHaveBeenCalled();
  });

  it("does not replace the leader card after a transient edit failure", async () => {
    const session = makeBigBarrelSessionWithMember();
    const updated = withParticipantReadiness(session, "character-93", "ready", 2);
    const recordParticipantMessageReference = vi.fn();
    const { ctx, apiEditMessageText, sendMessage } = createCallbackContext(93);
    apiEditMessageText.mockRejectedValue(new Error("429: Too Many Requests: retry after 2"));

    await handlePartySessionCallback(
      ctx,
      { type: "readiness", token: session.inviteToken, readiness: "ready" },
      serviceWithCanonicalSession(updated, {
        setReadinessForTelegramUser: vi.fn().mockResolvedValue({ state: "updated", session: updated }),
        recordParticipantMessageReference
      }),
      {
        botUsername: "kvestarnia_test_bot",
        presence: {} as PresenceService,
        partyBoss: partyBossWith({ getByPartyInviteToken: vi.fn().mockResolvedValue(null) })
      }
    );

    expect(sendMessage).not.toHaveBeenCalled();
    expect(recordParticipantMessageReference).not.toHaveBeenCalled();
  });

  it("serializes concurrent missing-reference fallbacks into one canonical leader card", async () => {
    const base = makeBigBarrelSessionWithMember();
    const missing = {
      ...withParticipantReadiness(base, "character-93", "ready", 2),
      participants: withParticipantReadiness(base, "character-93", "ready", 2).participants.map((participant) =>
        participant.characterId === base.leaderCharacterId
          ? { ...participant, chatId: null, messageId: null }
          : participant
      )
    };
    let canonical = missing;
    const recordParticipantMessageReference = vi.fn().mockImplementation((
      _telegramUserId: bigint,
      _inviteToken: string,
      reference: { chatId: bigint; messageId: number }
    ) => {
      canonical = {
        ...canonical,
        participants: canonical.participants.map((participant) =>
          participant.characterId === canonical.leaderCharacterId
            ? { ...participant, ...reference }
            : participant
        )
      };
      return Promise.resolve(canonical);
    });
    const service = serviceWith({
      setReadinessForTelegramUser: vi.fn().mockResolvedValue({ state: "updated", session: missing }),
      getByToken: vi.fn().mockImplementation(() => Promise.resolve({ state: "ready", session: canonical })),
      recordParticipantMessageReference
    });
    const first = createCallbackContext(93);
    const second = createCallbackContext(93);
    first.sendMessage.mockResolvedValue({ message_id: 77 });
    second.sendMessage.mockResolvedValue({ message_id: 78 });
    const partyBoss = partyBossWith({ getByPartyInviteToken: vi.fn().mockResolvedValue(null) });

    await Promise.all([
      handlePartySessionCallback(
        first.ctx,
        { type: "readiness", token: base.inviteToken, readiness: "ready" },
        service,
        { botUsername: "kvestarnia_test_bot", presence: {} as PresenceService, partyBoss }
      ),
      handlePartySessionCallback(
        second.ctx,
        { type: "readiness", token: base.inviteToken, readiness: "ready" },
        service,
        { botUsername: "kvestarnia_test_bot", presence: {} as PresenceService, partyBoss }
      )
    ]);

    expect(first.sendMessage.mock.calls.length + second.sendMessage.mock.calls.length).toBe(1);
    expect(recordParticipantMessageReference).toHaveBeenCalledTimes(1);
    const storedLeader = canonical.participants.find((participant) =>
      participant.characterId === canonical.leaderCharacterId
    );
    expect(storedLeader?.chatId).toBe(42n);
    expect(storedLeader?.messageId).toBeTypeOf("number");
  });

  it("renders the latest canonical preparation version to three participants when v2 and v3 finish in reverse order", async () => {
    const base = makeBigBarrelSessionWithTwoMembers();
    const v2 = withParticipantReadiness(base, "character-93", "ready", 2);
    const v3 = withParticipantReadiness(base, "character-93", "waiting", 3);
    let canonical = base;
    const setReadinessForTelegramUser = vi.fn()
      .mockImplementationOnce(() => {
        canonical = v2;
        return Promise.resolve({ state: "updated", session: v2 });
      })
      .mockImplementationOnce(() => {
        canonical = v3;
        return Promise.resolve({ state: "updated", session: v3 });
      });
    const service = serviceWith({
      setReadinessForTelegramUser,
      getByToken: vi.fn().mockImplementation(() => Promise.resolve({ state: "ready", session: canonical }))
    });
    const first = createCallbackContext(93);
    const second = createCallbackContext(93);
    const delayedOlderAnswer = deferred<boolean>();
    first.answerCallbackQuery.mockImplementationOnce(() => delayedOlderAnswer.promise);
    const partyBoss = partyBossWith({ getByPartyInviteToken: vi.fn().mockResolvedValue(null) });

    const older = handlePartySessionCallback(
      first.ctx,
      { type: "readiness", token: base.inviteToken, readiness: "ready" },
      service,
      { botUsername: "kvestarnia_test_bot", presence: {} as PresenceService, partyBoss }
    );
    await vi.waitFor(() => expect(setReadinessForTelegramUser).toHaveBeenCalledTimes(1));
    const newer = handlePartySessionCallback(
      second.ctx,
      { type: "readiness", token: base.inviteToken, readiness: "waiting" },
      service,
      { botUsername: "kvestarnia_test_bot", presence: {} as PresenceService, partyBoss }
    );
    await newer;
    delayedOlderAnswer.resolve(true);
    await older;

    const leaderEdits = [...first.apiEditMessageText.mock.calls, ...second.apiEditMessageText.mock.calls]
      .filter((call) => call[0] === 42)
      .map((call) => String(call[2]));
    expect(leaderEdits.length).toBeGreaterThan(0);
    expect(leaderEdits.every((text) => text.includes("2. ⏳ <b>Друга Учасниця</b>"))).toBe(true);
    expect(leaderEdits.every((text) => !text.includes("2. ✅ <b>Друга Учасниця</b>"))).toBe(true);
    const thirdParticipantEdits = [...first.apiEditMessageText.mock.calls, ...second.apiEditMessageText.mock.calls]
      .filter((call) => call[0] === 587)
      .map((call) => String(call[2]));
    expect(thirdParticipantEdits.length).toBeGreaterThan(0);
    expect(thirdParticipantEdits.every((text) => text.includes("2. ⏳ <b>Друга Учасниця</b>"))).toBe(true);
    expect(thirdParticipantEdits.every((text) => !text.includes("2. ✅ <b>Друга Учасниця</b>"))).toBe(true);
  });

  it("pushes the started boss card to other participants", async () => {
    const session = makeBossSession();
    const startFromPartyForTelegramUser = vi.fn().mockResolvedValue({ state: "started", session });
    const { ctx, editMessageText, reply, sendMessage } = createCallbackContext();

    await handlePartySessionCallback(
      ctx,
      { type: "boss-start", token: session.partyInviteToken },
      serviceWith({}),
      {
        presence: {} as PresenceService,
        partyBoss: partyBossWith({
          areDevHelpersEnabled: () => true,
          startFromPartyForTelegramUser
        })
      }
    );

    expect(startFromPartyForTelegramUser).toHaveBeenCalledWith(42n, session.partyInviteToken);
    expect(messageText(editMessageText)).toContain("🧪 <b>Контрольний бос прокинувся</b>");
    expect(reply).toHaveBeenCalledWith(
      expect.stringContaining("Тестового боса запущено"),
      expect.objectContaining({ parse_mode: "HTML" })
    );
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage.mock.calls[0]?.[0]).toBe(93);
    expect(String(sendMessage.mock.calls[0]?.[1])).toContain("🧪 <b>Контрольний бос прокинувся</b>");
    expect(String(sendMessage.mock.calls[1]?.[1])).toContain("Бойова картка тестового боса готова.");
    expect(JSON.stringify(sendMessage.mock.calls[1]?.[2])).toContain("v1:party:ba");
  });

  it("does not publish recruiting controls when a preparation callback finishes after boss start", async () => {
    const party = makeBigBarrelSessionWithTwoMembers();
    const boss = makeBossSession();
    const start = deferred<{ state: "started"; session: PartyBossSessionRecord }>();
    let canonicalBoss: PartyBossSessionRecord | null = null;
    const startFromPartyForTelegramUser = vi.fn().mockImplementation(() => start.promise);
    const partyBoss = partyBossWith({
      areDevHelpersEnabled: () => true,
      startFromPartyForTelegramUser,
      getByPartyInviteToken: vi.fn().mockImplementation(() => Promise.resolve(canonicalBoss))
    });
    const updated = withParticipantReadiness(party, "character-93", "ready", 2);
    const service = serviceWithCanonicalSession(updated, {
      setReadinessForTelegramUser: vi.fn().mockResolvedValue({ state: "updated", session: updated })
    });
    const leader = createCallbackContext(42);
    const member = createCallbackContext(93);

    const starting = handlePartySessionCallback(
      leader.ctx,
      { type: "boss-start", token: party.inviteToken },
      service,
      { presence: {} as PresenceService, partyBoss, botUsername: "kvestarnia_test_bot" }
    );
    const preparing = handlePartySessionCallback(
      member.ctx,
      { type: "readiness", token: party.inviteToken, readiness: "ready" },
      service,
      { presence: {} as PresenceService, partyBoss, botUsername: "kvestarnia_test_bot" }
    );
    canonicalBoss = boss;
    start.resolve({ state: "started", session: boss });
    await Promise.all([starting, preparing]);

    expect(messageText(member.editMessageText)).toContain("Контрольний Бос");
    expect(keyboardJson(member.editMessageText)).toContain("v1:party:ba");
    expect(keyboardJson(member.editMessageText)).not.toContain("v1:party:r:");
    expect(member.apiEditMessageText).not.toHaveBeenCalledWith(42, 13, expect.anything(), expect.anything());
    expect(member.apiEditMessageText.mock.calls.some((call) =>
      call[0] === 587 && JSON.stringify(call[3]).includes("v1:party:rs:")
    )).toBe(false);
  });

  it("renders the boss card when view races manual boss start", async () => {
    const party = makeBigBarrelSessionWithTwoMembers();
    const boss = makeBossSession();
    const start = deferred<{ state: "started"; session: PartyBossSessionRecord }>();
    let canonicalBoss: PartyBossSessionRecord | null = null;
    const startFromPartyForTelegramUser = vi.fn().mockImplementation(() => start.promise);
    const partyBoss = partyBossWith({
      areDevHelpersEnabled: () => true,
      startFromPartyForTelegramUser,
      getByPartyInviteToken: vi.fn().mockImplementation(() => Promise.resolve(canonicalBoss))
    });
    const service = serviceWithCanonicalSession(party, {});
    const leader = createCallbackContext(42);
    const viewer = createCallbackContext(93);

    const starting = handlePartySessionCallback(
      leader.ctx,
      { type: "boss-start", token: party.inviteToken },
      service,
      { presence: {} as PresenceService, partyBoss, botUsername: "kvestarnia_test_bot" }
    );
    await vi.waitFor(() => expect(startFromPartyForTelegramUser).toHaveBeenCalledTimes(1));
    const viewing = handlePartySessionCallback(
      viewer.ctx,
      { type: "view", token: party.inviteToken },
      service,
      { presence: {} as PresenceService, partyBoss, botUsername: "kvestarnia_test_bot" }
    );
    canonicalBoss = boss;
    start.resolve({ state: "started", session: boss });
    await Promise.all([starting, viewing]);

    expect(messageText(viewer.editMessageText)).toContain("Контрольний Бос");
    expect(keyboardJson(viewer.editMessageText)).toContain("v1:party:ba");
    expect(keyboardJson(viewer.editMessageText)).not.toContain("v1:party:rs:");
  });

  it("does not persist a recruiting card when deep-link join races manual boss start", async () => {
    const party = makeBigBarrelSessionWithTwoMembers();
    const boss = makeBossSession();
    const start = deferred<{ state: "started"; session: PartyBossSessionRecord }>();
    let canonicalBoss: PartyBossSessionRecord | null = null;
    const startFromPartyForTelegramUser = vi.fn().mockImplementation(() => start.promise);
    const partyBoss = partyBossWith({
      areDevHelpersEnabled: () => true,
      startFromPartyForTelegramUser,
      getByPartyInviteToken: vi.fn().mockImplementation(() => Promise.resolve(canonicalBoss))
    });
    const recordParticipantMessageReference = vi.fn();
    const joinByTokenForTelegramUser = vi.fn().mockResolvedValue({ state: "joined", session: party });
    const service = serviceWithCanonicalSession(party, {
      joinByTokenForTelegramUser,
      recordParticipantMessageReference
    });
    const leader = createCallbackContext(42);
    const joiner = createCallbackContext(93);

    const starting = handlePartySessionCallback(
      leader.ctx,
      { type: "boss-start", token: party.inviteToken },
      service,
      { presence: {} as PresenceService, partyBoss, botUsername: "kvestarnia_test_bot" }
    );
    await vi.waitFor(() => expect(startFromPartyForTelegramUser).toHaveBeenCalledTimes(1));
    const joining = sendPartyJoinFromStartPayload(
      joiner.ctx,
      service,
      party.inviteToken,
      { partyBoss, botUsername: "kvestarnia_test_bot" }
    );
    await vi.waitFor(() => expect(joinByTokenForTelegramUser).toHaveBeenCalledTimes(1));
    canonicalBoss = boss;
    start.resolve({ state: "started", session: boss });
    await Promise.all([starting, joining]);

    expect(String(joiner.reply.mock.calls[0]?.[0])).toContain("Контрольний Бос");
    expect(JSON.stringify(joiner.reply.mock.calls[0]?.[1])).toContain("v1:party:ba");
    expect(JSON.stringify(joiner.reply.mock.calls[0]?.[1])).not.toContain("v1:party:rs:");
    expect(recordParticipantMessageReference).not.toHaveBeenCalled();
  });

  it("rejects non-Big Barrel Brother boss starts when dev helper mode is disabled", async () => {
    const session = makeSession("recruiting");
    const getByToken = vi.fn().mockResolvedValue({ state: "ready", session });
    const startFromPartyForTelegramUser = vi.fn();
    const { ctx, answerCallbackQuery, editMessageText } = createCallbackContext();

    await handlePartySessionCallback(
      ctx,
      { type: "boss-start", token: session.inviteToken },
      serviceWith({ getByToken }),
      {
        presence: {} as PresenceService,
        partyBoss: partyBossWith({
          areDevHelpersEnabled: () => false,
          startFromPartyForTelegramUser
        })
      }
    );

    expect(getByToken).toHaveBeenCalledWith(session.inviteToken);
    expect(startFromPartyForTelegramUser).not.toHaveBeenCalled();
    expect(answerCallbackQuery).toHaveBeenCalledWith({
      text: "Ця кнопка вже втратила магію. Спробуйте /start ще раз.",
      show_alert: true
    });
    expect(editMessageText).not.toHaveBeenCalled();
  });

  it("pushes the next boss turn to participants who acted earlier", async () => {
    const session = makeBossSession({
      turn: 2,
      roundLog: [{
        turn: 1,
        actions: [
          {
            characterId: "character-42",
            action: "attack",
            origin: "manual",
            outcome: "hit",
            damage: 7,
            manaSpent: 0
          },
          {
            characterId: "character-93",
            action: "defend",
            origin: "manual",
            outcome: "defended",
            damage: 0,
            manaSpent: 0
          }
        ],
        bossDamage: 7,
        bossHpAfter: 58,
        bossRetaliations: [
          { characterId: "character-42", damage: 4, hpAfter: 21 },
          { characterId: "character-93", damage: 3, hpAfter: 22 }
        ],
        statusAfter: "active"
      }]
    });
    const submitActionForTelegramUser = vi.fn().mockResolvedValue({ state: "resolved", session });
    const { ctx, editMessageText, sendMessage } = createCallbackContext(93);

    await handlePartySessionCallback(
      ctx,
      { type: "boss-action", token: session.partyInviteToken, turn: 1, action: "defend" },
      serviceWith({}),
      {
        presence: {} as PresenceService,
        partyBoss: partyBossWith({ submitActionForTelegramUser })
      }
    );

    expect(submitActionForTelegramUser).toHaveBeenCalledWith(93n, session.partyInviteToken, 1, "defend");
    expect(messageText(editMessageText)).toContain("2 хід");
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0]?.[0]).toBe(42);
    expect(String(sendMessage.mock.calls[0]?.[1])).toContain("Хід оновлено");
    expect(String(sendMessage.mock.calls[0]?.[1])).toContain("2 хід");
  });

  it("keeps the canonical raid card when an old Lament callback arrives with Bard support off", async () => {
    const session = makeBossSession();
    const submitLamentForTelegramUser = vi.fn().mockResolvedValue({ state: "disabled" });
    const getByPartyInviteToken = vi.fn().mockResolvedValue(session);
    const { ctx, answerCallbackQuery, editMessageText } = createCallbackContext();

    await handlePartySessionCallback(
      ctx,
      { type: "boss-action", token: session.partyInviteToken, turn: 1, action: "lament" },
      serviceWith({}),
      {
        presence: {} as PresenceService,
        partyBoss: partyBossWith({ submitLamentForTelegramUser, getByPartyInviteToken })
      }
    );

    expect(answerCallbackQuery).toHaveBeenCalledWith({
      text: "Журлива балада зараз недоступна.",
      show_alert: true
    });
    expect(messageText(editMessageText)).toContain("Контрольний Бос");
    expect(messageText(editMessageText)).not.toContain("Тестовий бос вимкнений");
  });

  it("answers queued boss gear actions with readable callback copy", async () => {
    const session = makeBossSession();
    const submitGearForTelegramUser = vi.fn().mockResolvedValue({ state: "updated", session });
    const { ctx, answerCallbackQuery, editMessageText, sendMessage } = createCallbackContext();

    await handlePartySessionCallback(
      ctx,
      { type: "boss-gear", token: session.partyInviteToken, turn: 1, grantKey: "rldagr" },
      serviceWith({}),
      {
        presence: {} as PresenceService,
        partyBoss: partyBossWith({ submitGearForTelegramUser })
      }
    );

    expect(submitGearForTelegramUser).toHaveBeenCalledWith(42n, session.partyInviteToken, 1, "rldagr");
    expect(answerCallbackQuery).toHaveBeenCalledWith({ text: "Вибір оновлено." });
    expect(messageText(editMessageText)).toContain("1 хід");
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("submits resolved boss gear actions with readable participant notices", async () => {
    const proofSession = makeBossSession({
      turn: 2,
      roundLog: [{
        turn: 1,
        actions: [
          {
            characterId: "character-42",
            action: "gear",
            origin: "manual",
            outcome: "hit",
            damage: 8,
            manaSpent: 2,
            skillId: "gear.red-line-dagger"
          },
          {
            characterId: "character-93",
            action: "defend",
            origin: "manual",
            outcome: "defended",
            damage: 0,
            manaSpent: 0
          }
        ],
        bossDamage: 8,
        bossHpAfter: 57,
        bossRetaliations: [
          { characterId: "character-42", damage: 4, hpAfter: 21 },
          { characterId: "character-93", damage: 3, hpAfter: 22 }
        ],
        statusAfter: "active"
      }]
    });
    const session = {
      ...proofSession,
      rulesVersion: "big-barrel-brother-v1",
      bossKey: "big-barrel-brother",
      state: {
        ...proofSession.state,
        rulesVersion: "big-barrel-brother-v1",
        boss: {
          ...proofSession.state.boss,
          monsterId: "big-barrel-brother",
          name: "Старший Брат Бочки"
        }
      }
    };
    const submitGearForTelegramUser = vi.fn().mockResolvedValue({
      state: "resolved",
      session,
      achievementUnlocksByCharacterId: {
        "character-42": [
          {
            id: "achievement.mantok.gear-action.first",
            title: "Манатка натиснула кнопку",
            cosmeticTitleGrantId: null,
            unlockedAt: new Date("2026-07-07T10:00:00.000Z")
          }
        ],
        "character-93": [
          {
            id: "achievement.mantok.gear-action.first",
            title: "Манатка натиснула кнопку",
            cosmeticTitleGrantId: null,
            unlockedAt: new Date("2026-07-07T10:00:00.000Z")
          }
        ]
      }
    });
    const { ctx, answerCallbackQuery, editMessageText, reply, sendMessage } = createCallbackContext();

    await handlePartySessionCallback(
      ctx,
      { type: "boss-gear", token: session.partyInviteToken, turn: 1, grantKey: "rldagr" },
      serviceWith({}),
      {
        presence: {} as PresenceService,
        partyBoss: partyBossWith({ submitGearForTelegramUser })
      }
    );

    expect(submitGearForTelegramUser).toHaveBeenCalledWith(42n, session.partyInviteToken, 1, "rldagr");
    expect(answerCallbackQuery).toHaveBeenCalledWith(undefined);
    expect(messageText(editMessageText)).toContain("2 хід");
    expect(reply).toHaveBeenCalledTimes(1);
    expect(String(reply.mock.calls[0]?.[0])).toContain("Нова ачівка");
    expect(String(reply.mock.calls[0]?.[0])).toContain("Манатка натиснула кнопку");
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(String(sendMessage.mock.calls[0]?.[1])).toContain("Хід оновлено. Показую новий стан рейду.");
    expect(String(sendMessage.mock.calls[1]?.[1])).toContain("Нова ачівка");
    expect(String(sendMessage.mock.calls[1]?.[1])).toContain("Манатка натиснула кнопку");
  });

  it("answers duplicate boss gear callbacks with readable copy", async () => {
    const session = makeBossSession();
    const submitGearForTelegramUser = vi.fn().mockResolvedValue({ state: "duplicate", session });
    const { ctx, answerCallbackQuery, editMessageText, sendMessage } = createCallbackContext();

    await handlePartySessionCallback(
      ctx,
      { type: "boss-gear", token: session.partyInviteToken, turn: 1, grantKey: "rldagr" },
      serviceWith({}),
      {
        presence: {} as PresenceService,
        partyBoss: partyBossWith({ submitGearForTelegramUser })
      }
    );

    expect(answerCallbackQuery).toHaveBeenCalledWith({ text: "Дію вже записано." });
    expect(messageText(editMessageText)).toContain("1 хід");
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it.each([
    {
      reason: "not-enough-mana" as const,
      callbackText: "Не вистачає мани.",
      cardText: "Дія спорядження не спрацювала: мани замало"
    },
    {
      reason: "skill-on-cooldown" as const,
      callbackText: "Дія спорядження ще відсапується.",
      cardText: "Дія спорядження ще відсапується. Корчмар показує свіжу картку бою."
    }
  ])("answers blocked boss gear callbacks for $reason without advancing the raid", async ({
    reason,
    callbackText,
    cardText
  }) => {
    const session = makeBossSession();
    const submitGearForTelegramUser = vi.fn().mockResolvedValue({
      state: "gear-unavailable",
      reason,
      session
    });
    const { ctx, answerCallbackQuery, editMessageText, sendMessage } = createCallbackContext();

    await handlePartySessionCallback(
      ctx,
      { type: "boss-gear", token: session.partyInviteToken, turn: 1, grantKey: "rldagr" },
      serviceWith({}),
      {
        presence: {} as PresenceService,
        partyBoss: partyBossWith({ submitGearForTelegramUser })
      }
    );

    expect(answerCallbackQuery).toHaveBeenCalledWith({ text: callbackText });
    expect(messageText(editMessageText)).toContain(cardText);
    expect(messageText(editMessageText)).toContain("1 хід");
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("opens a concrete one-use item picker instead of immediately using a bandage", async () => {
    const session = makeBossSession({
      participants: [
        {
          ...makeBossParticipant("character-42", "Тестова Лідерка"),
          resources: {
            hp: 10,
            hpMax: 25,
            mana: 10,
            manaMax: 10
          }
        },
        makeBossParticipant("character-93", "Друга Учасниця")
      ]
    });
    const listCombatItemsForTelegramUser = vi.fn().mockResolvedValue({
      state: "ready",
      session,
      items: [
        {
          itemId: "item.field-kit",
          itemKey: "field1",
          name: "Польова аптечка",
          quantity: 1
        }
      ]
    });
    const submitItemForTelegramUser = vi.fn();
    const { ctx, editMessageText } = createCallbackContext();

    await handlePartySessionCallback(
      ctx,
      { type: "boss-items", token: session.partyInviteToken, turn: 1 },
      serviceWith({}),
      {
        presence: {} as PresenceService,
        partyBoss: partyBossWith({
          listCombatItemsForTelegramUser,
          submitItemForTelegramUser
        })
      }
    );

    expect(listCombatItemsForTelegramUser).toHaveBeenCalledWith(42n, session.partyInviteToken, 1);
    expect(submitItemForTelegramUser).not.toHaveBeenCalled();
    expect(messageText(editMessageText)).toContain("Одноразові манатки");
    expect(keyboardJson(editMessageText)).toContain("⚕️ Польова аптечка");
    expect(keyboardJson(editMessageText)).toContain("v1:party:bi:partyABC12:1:field1");
  });

  it("restores the canonical raid card for a stale source-Lament item-menu callback", async () => {
    const session = makeBossSession({
      bardMusic: {
        kind: "lament",
        activationId: "lament-stale-items",
        sourceCharacterId: "character-42",
        grade: "pleasant",
        damageReduction: 3,
        remainingBossResponses: 3,
        activatedTurn: 1
      }
    });
    const listCombatItemsForTelegramUser = vi.fn().mockResolvedValue({ state: "stale", session });
    const { ctx, editMessageText } = createCallbackContext();

    await handlePartySessionCallback(
      ctx,
      { type: "boss-items", token: session.partyInviteToken, turn: 1 },
      serviceWith({}),
      {
        presence: {} as PresenceService,
        partyBoss: partyBossWith({ listCombatItemsForTelegramUser })
      }
    );

    expect(listCombatItemsForTelegramUser).toHaveBeenCalledWith(42n, session.partyInviteToken, 1);
    expect(messageText(editMessageText)).toContain("Показую канонічний стан");
    expect(messageText(editMessageText)).not.toContain("Одноразові манатки");
    expect(keyboardJson(editMessageText)).not.toContain(":bi:");
  });

  it("routes forged non-dev boss timeout callbacks through the due-timeout path only", async () => {
    const session = makeBossSession();
    const resolveDueTimedOutByToken = vi.fn().mockResolvedValue({ state: "queued", session });
    const forceResolveTimedOutByToken = vi.fn();
    const { ctx, answerCallbackQuery, editMessageText, sendMessage } = createCallbackContext();

    await handlePartySessionCallback(
      ctx,
      { type: "boss-timeout", token: session.partyInviteToken },
      serviceWith({}),
      {
        presence: {} as PresenceService,
        partyBoss: partyBossWith({
          areDevHelpersEnabled: () => false,
          resolveDueTimedOutByToken,
          forceResolveTimedOutByToken
        })
      }
    );

    expect(resolveDueTimedOutByToken).toHaveBeenCalledWith(session.partyInviteToken);
    expect(forceResolveTimedOutByToken).not.toHaveBeenCalled();
    expect(answerCallbackQuery).toHaveBeenCalledWith({ text: "Хід перевірено." });
    expect(messageText(editMessageText)).toContain("1 хід");
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("uses the dev force-timeout path when helper mode is enabled", async () => {
    const session = makeBossSession({
      turn: 2,
      roundLog: [{
        turn: 1,
        actions: [
          {
            characterId: "character-42",
            action: "defend",
            origin: "timeout",
            outcome: "defended",
            damage: 0,
            manaSpent: 0
          }
        ],
        bossDamage: 0,
        bossHpAfter: 65,
        bossRetaliations: [],
        statusAfter: "active"
      }]
    });
    const resolveDueTimedOutByToken = vi.fn();
    const forceResolveTimedOutByToken = vi.fn().mockResolvedValue({ state: "resolved", session });
    const { ctx, editMessageText, sendMessage } = createCallbackContext();

    await handlePartySessionCallback(
      ctx,
      { type: "boss-timeout", token: session.partyInviteToken },
      serviceWith({}),
      {
        presence: {} as PresenceService,
        partyBoss: partyBossWith({
          areDevHelpersEnabled: () => true,
          resolveDueTimedOutByToken,
          forceResolveTimedOutByToken
        })
      }
    );

    expect(forceResolveTimedOutByToken).toHaveBeenCalledWith(session.partyInviteToken);
    expect(resolveDueTimedOutByToken).not.toHaveBeenCalled();
    expect(messageText(editMessageText)).toContain("2 хід");
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(String(sendMessage.mock.calls[0]?.[1])).toContain("Dev-таймер добив хід");
  });

  it("opens the boss journal from the stored round log", async () => {
    const session = makeBossSession({
      status: "won",
      roundLog: [{
        turn: 1,
        actions: [
          {
            characterId: "character-42",
            action: "attack",
            origin: "manual",
            outcome: "hit",
            damage: 7,
            manaSpent: 0
          },
          {
            characterId: "character-93",
            action: "race",
            origin: "manual",
            outcome: "hit",
            damage: 0,
            manaSpent: 0,
            skillId: "ability.race.low-center-of-gravity"
          }
        ],
        bossDamage: 7,
        bossHpAfter: 58,
        bossRetaliations: [{ characterId: "character-42", damage: 4, hpAfter: 21 }],
        statusAfter: "won"
      }]
    });
    const getByPartyInviteToken = vi.fn().mockResolvedValue(session);
    const { ctx, editMessageText } = createCallbackContext();

    await handlePartySessionCallback(
      ctx,
      { type: "boss-journal", token: session.partyInviteToken, page: null },
      serviceWith({}),
      {
        presence: {} as PresenceService,
        partyBoss: partyBossWith({ getByPartyInviteToken })
      }
    );

    expect(getByPartyInviteToken).toHaveBeenCalledWith(session.partyInviteToken);
    expect(messageText(editMessageText)).toContain("📜 <b>Журнал тестового бою</b>");
    expect(messageText(editMessageText)).toContain("Хід <b>1</b> · запис 1/1");
    expect(messageText(editMessageText)).toContain("👹 Контрольний Бос після ходу: 58/65");
    expect(messageText(editMessageText)).toContain("▪️ Тестова Лідерка після ходу: HP 21/25 · мана 10/10 ← 🎯 ціль боса");
    expect(messageText(editMessageText)).toContain("<b>Останні дії:</b>");
    expect(messageText(editMessageText)).toContain("Атака Тестова Лідерка влучає на 7 шкоди.");
    expect(messageText(editMessageText)).toContain("Друга Учасниця застосовує 🪨 <i>Низький центр ваги</i>: спрацьовує без прямої шкоди.");
  });

  it("keeps the boss journal closed while the battle is active", async () => {
    const session = makeBossSession();
    const getByPartyInviteToken = vi.fn().mockResolvedValue(session);
    const { ctx, editMessageText } = createCallbackContext();

    await handlePartySessionCallback(
      ctx,
      { type: "boss-journal", token: session.partyInviteToken, page: null },
      serviceWith({}),
      {
        presence: {} as PresenceService,
        partyBoss: partyBossWith({ getByPartyInviteToken })
      }
    );

    expect(messageText(editMessageText)).toContain("Журнал відкриється після бою");
    expect(messageText(editMessageText)).toContain("<b>Бій: 1 хід</b>");
  });

  it("hides the active boss one-use shortcut when no useful combat items are available", async () => {
    const session = makeBossSession();
    const getByPartyInviteToken = vi.fn().mockResolvedValue(session);
    const hasCombatItemsForTelegramUser = vi.fn().mockResolvedValue(false);
    const { ctx, editMessageText } = createCallbackContext();

    await handlePartySessionCallback(
      ctx,
      { type: "boss-journal", token: session.partyInviteToken, page: null },
      serviceWith({}),
      {
        presence: {} as PresenceService,
        partyBoss: partyBossWith({
          getByPartyInviteToken,
          hasCombatItemsForTelegramUser
        })
      }
    );

    expect(hasCombatItemsForTelegramUser).toHaveBeenCalledWith(42n, session.partyInviteToken, 1);
    expect(keyboardJson(editMessageText)).toContain("v1:party:ba:partyABC12:1:a");
    expect(keyboardJson(editMessageText)).not.toContain("v1:party:bm:partyABC12:1");
  });

  it("refreshes the leader recruiting card after another player joins", async () => {
    const session = makeSessionWithMember();
    const joinByTokenForTelegramUser = vi.fn().mockResolvedValue({ state: "joined", session });
    const { ctx, editMessageText, apiEditMessageText, reply } = createCallbackContext(93);

    await handlePartySessionCallback(
      ctx,
      { type: "join", token: session.inviteToken },
      serviceWithCanonicalSession(session, { joinByTokenForTelegramUser }),
      {
        presence: {} as PresenceService,
        botUsername: "kvestarnia_test_bot"
      }
    );

    expect(joinByTokenForTelegramUser).toHaveBeenCalledWith(93n, session.inviteToken, {
      source: "nearby",
      chatId: 93n,
      messageId: 13
    });
    expect(messageText(editMessageText)).toContain("Ви приєдналися до ватаги");
    expect(apiEditMessageText).toHaveBeenCalledWith(
      42,
      13,
      expect.stringContaining("Учасники: 2/8"),
      expect.objectContaining({
        parse_mode: "HTML"
      })
    );
    expect(String(apiEditMessageText.mock.calls[0]?.[2])).toContain("href=\"https://t.me/kvestarnia_test_bot?start=party_partyABC12\"");
    expect(reply).not.toHaveBeenCalled();
  });

  it("refreshes the leader card after a non-leader leaves", async () => {
    const original = makeBigBarrelSessionWithMember();
    const session: PartySessionRecord = {
      ...original,
      version: 2,
      participants: original.participants.map((participant) =>
        participant.characterId === "character-93"
          ? { ...participant, status: "left", leftAt: original.updatedAt }
          : participant
      )
    };
    const leaveByTokenForTelegramUser = vi.fn().mockResolvedValue({ state: "left", session });
    const { ctx, apiEditMessageText } = createCallbackContext(93);

    await handlePartySessionCallback(
      ctx,
      { type: "leave", token: session.inviteToken },
      serviceWithCanonicalSession(session, { leaveByTokenForTelegramUser }),
      { presence: {} as PresenceService, botUsername: "kvestarnia_test_bot" }
    );

    expect(apiEditMessageText).toHaveBeenCalledWith(
      42,
      13,
      expect.stringContaining("Учасники: 1/8"),
      expect.objectContaining({ parse_mode: "HTML" })
    );
  });

  it("refreshes the transferred leader card with leader recruiting controls", async () => {
    const original = makeBigBarrelSessionWithMember();
    const newLeader = original.participants.find((participant) => participant.characterId === "character-93")!;
    const session: PartySessionRecord = {
      ...original,
      leaderCharacterId: newLeader.characterId,
      leader: newLeader.character,
      version: 2,
      activeLeaderKey: `party-leader:${newLeader.characterId}`,
      participants: original.participants.map((participant) =>
        participant.characterId === original.leaderCharacterId
          ? { ...participant, status: "left", leftAt: original.updatedAt }
          : participant
      )
    };
    const leaveByTokenForTelegramUser = vi.fn().mockResolvedValue({ state: "leader-transferred", session });
    const { ctx, apiEditMessageText } = createCallbackContext(42);

    await handlePartySessionCallback(
      ctx,
      { type: "leave", token: session.inviteToken },
      serviceWithCanonicalSession(session, { leaveByTokenForTelegramUser }),
      { presence: {} as PresenceService, botUsername: "kvestarnia_test_bot" }
    );

    expect(apiEditMessageText).toHaveBeenCalledWith(
      93,
      99,
      expect.stringContaining("Учасники: 1/8"),
      expect.objectContaining({ parse_mode: "HTML" })
    );
    expect(JSON.stringify(apiEditMessageText.mock.calls[0]?.[3])).toContain("v1:party:bs:");
  });

  it.each(["active", "completed"] as const)(
    "renders the canonical %s party card for stale join, leave, and cancel callbacks",
    async (status) => {
      const session: PartySessionRecord = {
        ...makeBigBarrelSessionWithMember(),
        status,
        version: 2,
        activeLeaderKey: status === "active" ? "party-leader:character-42" : null
      };
      const joinByTokenForTelegramUser = vi.fn().mockResolvedValue({ state: "stale", session });
      const leaveByTokenForTelegramUser = vi.fn().mockResolvedValue({ state: "stale", session });
      const cancelByTokenForTelegramUser = vi.fn().mockResolvedValue({ state: "stale", session });
      const service = serviceWith({
        joinByTokenForTelegramUser,
        leaveByTokenForTelegramUser,
        cancelByTokenForTelegramUser,
        getByToken: vi.fn().mockResolvedValue({ state: "ready", session })
      });
      const cases = [
        {
          callback: { type: "join", token: session.inviteToken } as const,
          notice: "Стан ватаги змінився раніше за цей запис",
          expectedCall: () => expect(joinByTokenForTelegramUser).toHaveBeenCalledWith(42n, session.inviteToken, {
            source: "nearby",
            chatId: 42n,
            messageId: 13
          })
        },
        {
          callback: { type: "leave", token: session.inviteToken } as const,
          notice: "Стан ватаги змінився раніше за цей вихід",
          expectedCall: () => expect(leaveByTokenForTelegramUser).toHaveBeenCalledWith(42n, session.inviteToken)
        },
        {
          callback: { type: "cancel", token: session.inviteToken } as const,
          notice: "Стан ватаги змінився раніше за скасування",
          expectedCall: () => expect(cancelByTokenForTelegramUser).toHaveBeenCalledWith(42n, session.inviteToken)
        }
      ];

      for (const testCase of cases) {
        const { ctx, answerCallbackQuery, editMessageText, apiEditMessageText } = createCallbackContext(42);

        await handlePartySessionCallback(
          ctx,
          testCase.callback,
          service,
          {
            presence: {} as PresenceService,
            botUsername: "kvestarnia_test_bot"
          }
        );

        testCase.expectedCall();
        expect(answerCallbackQuery).toHaveBeenCalledWith(undefined);
        expect(messageText(editMessageText)).toContain("Стан: архівний запис");
        expect(messageText(editMessageText)).toContain(testCase.notice);
        expect(keyboardJson(editMessageText)).toContain("v1:party:v:partyABC12");
        expect(keyboardJson(editMessageText)).not.toContain("v1:party:j:partyABC12");
        expect(keyboardJson(editMessageText)).not.toContain("v1:party:l:partyABC12");
        expect(keyboardJson(editMessageText)).not.toContain("v1:party:c:partyABC12");
        expect(apiEditMessageText).not.toHaveBeenCalled();
      }
    }
  );

  it("refreshes the stored leader recruiting card after the leader files Protocol 13-Z", async () => {
    const base = makeBigBarrelSessionWithMember();
    const session: PartySessionRecord = {
      ...base,
      personalProtocol: {
        kind: "bureaucramancer-personal-protocol-13b",
        protocolId: "protocol-party-1-filing-1",
        filerCharacterId: base.leaderCharacterId,
        signatureCount: 1,
        manaCost: 5,
        filedAt: new Date("2026-06-29T15:03:00.000Z")
      },
      participants: base.participants.map((participant) =>
        participant.characterId === base.leaderCharacterId
          ? {
              ...participant,
              personalProtocolSignature: {
                kind: "bureaucramancer-personal-protocol-13b",
                protocolId: "protocol-party-1-filing-1",
                filerCharacterId: base.leaderCharacterId,
                signerCharacterId: base.leaderCharacterId,
                signedAt: new Date("2026-06-29T15:03:00.000Z")
              }
            }
          : participant
      )
    };
    const fileBureaucramancerPersonalProtocolForTelegramUser = vi.fn().mockResolvedValue({
      state: "updated",
      session
    });
    const { ctx, editMessageText, apiEditMessageText } = createCallbackContext(42);

    await handlePartySessionCallback(
      ctx,
      { type: "protocol-file", token: session.inviteToken },
      serviceWithCanonicalSession(session, { fileBureaucramancerPersonalProtocolForTelegramUser }),
      {
        presence: {} as PresenceService,
        botUsername: "kvestarnia_test_bot"
      }
    );

    expect(messageText(editMessageText)).toContain("📄 Протокол 13-З відкрито. Підписів: 1.");
    expect(apiEditMessageText).toHaveBeenCalledWith(
      93,
      99,
      expect.stringContaining("📄 Протокол 13-З відкрито. Підписів: 1."),
      expect.objectContaining({ parse_mode: "HTML" })
    );
  });

  it("keeps leader Protocol v2 and v3 deliveries canonical when the older handler finishes last", async () => {
    const base = makeBigBarrelSessionWithTwoMembers();
    const protocol = {
      kind: "bureaucramancer-personal-protocol-13b" as const,
      protocolId: "protocol-party-1-leader-race",
      filerCharacterId: base.leaderCharacterId,
      manaCost: 5,
      filedAt: new Date("2026-06-29T15:03:00.000Z")
    };
    const v2: PartySessionRecord = {
      ...base,
      version: 2,
      personalProtocol: { ...protocol, signatureCount: 1 }
    };
    const v3: PartySessionRecord = {
      ...v2,
      version: 3,
      personalProtocol: { ...protocol, signatureCount: 2 }
    };
    let canonical = base;
    const fileBureaucramancerPersonalProtocolForTelegramUser = vi.fn()
      .mockImplementationOnce(() => {
        canonical = v2;
        return Promise.resolve({ state: "updated", session: v2 });
      })
      .mockImplementationOnce(() => {
        canonical = v3;
        return Promise.resolve({ state: "updated", session: v3 });
      });
    const service = serviceWith({
      fileBureaucramancerPersonalProtocolForTelegramUser,
      getByToken: vi.fn().mockImplementation(() => Promise.resolve({ state: "ready", session: canonical }))
    });
    const first = createCallbackContext(42);
    const second = createCallbackContext(42);
    const delayedOlderAnswer = deferred<boolean>();
    first.answerCallbackQuery.mockImplementationOnce(() => delayedOlderAnswer.promise);

    const older = handlePartySessionCallback(
      first.ctx,
      { type: "protocol-file", token: base.inviteToken },
      service,
      { presence: {} as PresenceService, botUsername: "kvestarnia_test_bot" }
    );
    await vi.waitFor(() => expect(fileBureaucramancerPersonalProtocolForTelegramUser).toHaveBeenCalledTimes(1));
    const newer = handlePartySessionCallback(
      second.ctx,
      { type: "protocol-file", token: base.inviteToken },
      service,
      { presence: {} as PresenceService, botUsername: "kvestarnia_test_bot" }
    );
    await newer;
    delayedOlderAnswer.resolve(true);
    await older;

    const actorCards = [messageText(first.editMessageText), messageText(second.editMessageText)];
    expect(actorCards.every((text) => text.includes("Підписів: 2."))).toBe(true);
    const storedCards = [...first.apiEditMessageText.mock.calls, ...second.apiEditMessageText.mock.calls]
      .map((call) => String(call[2]));
    expect(storedCards.length).toBeGreaterThan(0);
    expect(storedCards.every((text) => text.includes("Підписів: 2."))).toBe(true);
  });

  it("refreshes the stored leader card when Protocol is filed from a different callback message", async () => {
    const base = makeBigBarrelSessionWithMember();
    const session: PartySessionRecord = {
      ...base,
      version: 2,
      personalProtocol: {
        kind: "bureaucramancer-personal-protocol-13b",
        protocolId: "protocol-party-1-other-leader-card",
        filerCharacterId: base.leaderCharacterId,
        signatureCount: 1,
        manaCost: 5,
        filedAt: new Date("2026-06-29T15:03:00.000Z")
      },
      participants: base.participants.map((participant) =>
        participant.characterId === base.leaderCharacterId
          ? { ...participant, messageId: 77 }
          : participant
      )
    };
    const fileBureaucramancerPersonalProtocolForTelegramUser = vi.fn().mockResolvedValue({ state: "updated", session });
    const { ctx, editMessageText, apiEditMessageText } = createCallbackContext(42);

    await handlePartySessionCallback(
      ctx,
      { type: "protocol-file", token: session.inviteToken },
      serviceWithCanonicalSession(session, { fileBureaucramancerPersonalProtocolForTelegramUser }),
      { presence: {} as PresenceService, botUsername: "kvestarnia_test_bot" }
    );

    expect(messageText(editMessageText)).toContain("📄 Протокол 13-З відкрито. Підписів: 1.");
    expect(apiEditMessageText).toHaveBeenCalledWith(
      42,
      77,
      expect.stringContaining("📄 Протокол 13-З відкрито. Підписів: 1."),
      expect.objectContaining({ parse_mode: "HTML" })
    );
  });

  it("refreshes the leader card when a non-leader files Protocol 13-Z", async () => {
    const base = makeBigBarrelSessionWithMember();
    const session: PartySessionRecord = {
      ...base,
      version: 2,
      personalProtocol: {
        kind: "bureaucramancer-personal-protocol-13b",
        protocolId: "protocol-party-1-member-filing",
        filerCharacterId: "character-93",
        signatureCount: 1,
        manaCost: 5,
        filedAt: new Date("2026-06-29T15:03:00.000Z")
      }
    };
    const fileBureaucramancerPersonalProtocolForTelegramUser = vi.fn().mockResolvedValue({ state: "updated", session });
    const { ctx, apiEditMessageText } = createCallbackContext(93);

    await handlePartySessionCallback(
      ctx,
      { type: "protocol-file", token: session.inviteToken },
      serviceWithCanonicalSession(session, { fileBureaucramancerPersonalProtocolForTelegramUser }),
      { presence: {} as PresenceService, botUsername: "kvestarnia_test_bot" }
    );

    expect(apiEditMessageText).toHaveBeenCalledWith(
      42,
      13,
      expect.stringContaining("📄 Протокол 13-З відкрито. Підписів: 1."),
      expect.objectContaining({ parse_mode: "HTML" })
    );
  });

  it("sends protocol cooldown remaining time as a separate durable message", async () => {
    const session = makeBigBarrelSessionWithMember();
    const now = new Date("2026-06-29T15:00:00.000Z");
    const availableAt = new Date("2026-06-29T16:32:00.000Z");
    const fileBureaucramancerPersonalProtocolForTelegramUser = vi.fn().mockResolvedValue({
      state: "cooldown",
      availableAt,
      now,
      session
    });
    const { ctx, answerCallbackQuery, reply } = createCallbackContext(42);

    await handlePartySessionCallback(
      ctx,
      { type: "protocol-file", token: session.inviteToken },
      serviceWithCanonicalSession(session, { fileBureaucramancerPersonalProtocolForTelegramUser }),
      {
        presence: {} as PresenceService,
        botUsername: "kvestarnia_test_bot"
      }
    );

    expect(answerCallbackQuery).toHaveBeenCalledWith(undefined);
    expect(reply).toHaveBeenCalledWith(
      expect.stringContaining("До наступного подання зачекайте ще <b>92 хвилини</b>."),
      expect.objectContaining({ parse_mode: "HTML" })
    );
    expect(String(reply.mock.calls[0]?.[0])).not.toContain("відлежується");
  });

  it("refreshes the cancelled solo Big Barrel recruiting card after switching into another raid", async () => {
    const session = {
      ...makeSessionWithMember(),
      originLocationId: "barrel.big-brother"
    };
    const switcher = {
      ...makeCharacter(),
      id: "character-93",
      userId: "user-93",
      telegramUserId: 93n,
      name: "Перемикачка"
    };
    const cancelledSoloSession: PartySessionRecord = {
      ...makeSession("cancelled"),
      id: "party-old",
      inviteToken: "partyOLD12",
      status: "cancelled",
      originLocationId: "barrel.big-brother",
      leaderCharacterId: switcher.id,
      activeLeaderKey: null,
      leader: switcher,
      participants: [
        {
          id: "participant-old-93",
          sessionId: "party-old",
          characterId: switcher.id,
          remortCount: 0,
          status: "joined",
          joinSource: "leader",
          joinedAt: session.createdAt,
          leftAt: null,
          chatId: 93n,
          messageId: 77,
          character: switcher
        }
      ]
    };
    const joinByTokenForTelegramUser = vi.fn().mockResolvedValue({
      state: "joined",
      session,
      cancelledSoloSession
    });
    const { ctx, apiEditMessageText } = createCallbackContext(93);

    await handlePartySessionCallback(
      ctx,
      { type: "join", token: session.inviteToken },
      serviceWith({
        joinByTokenForTelegramUser,
        getByToken: vi.fn().mockImplementation((token: string) => Promise.resolve({
          state: "ready",
          session: token === session.inviteToken ? session : cancelledSoloSession
        }))
      }),
      {
        presence: {} as PresenceService,
        botUsername: "kvestarnia_test_bot"
      }
    );

    expect(apiEditMessageText).toHaveBeenCalledWith(
      42,
      13,
      expect.stringContaining("Учасники: 2/8"),
      expect.objectContaining({ parse_mode: "HTML" })
    );
    expect(apiEditMessageText).toHaveBeenCalledWith(
      93,
      77,
      expect.stringContaining("Стан: скасовано"),
      expect.objectContaining({ parse_mode: "HTML" })
    );
  });

  it("shows fallback copy for reasonless ineligible Big Barrel Brother nearby joins without participant refresh", async () => {
    const session = {
      ...makeSession("recruiting"),
      originLocationId: "barrel.big-brother"
    };
    const joinByTokenForTelegramUser = vi.fn().mockResolvedValue({ state: "ineligible", session });
    const { ctx, editMessageText, apiEditMessageText, reply } = createCallbackContext(93);

    await handlePartySessionCallback(
      ctx,
      { type: "join", token: session.inviteToken },
      serviceWith({ joinByTokenForTelegramUser }),
      {
        presence: {} as PresenceService,
        botUsername: "kvestarnia_test_bot"
      }
    );

    expect(joinByTokenForTelegramUser).toHaveBeenCalledWith(93n, session.inviteToken, {
      source: "nearby",
      chatId: 93n,
      messageId: 13
    });
    expect(messageText(editMessageText)).toContain("Рейдова канцелярія відсіяла запис");
    expect(messageText(editMessageText)).not.toContain("Ви приєдналися");
    expect(keyboardJson(editMessageText)).toBeUndefined();
    expect(apiEditMessageText).not.toHaveBeenCalled();
    expect(reply).not.toHaveBeenCalled();
  });

  it("shows fallback copy for reasonless ineligible Big Barrel Brother deep-link joins without a joined card", async () => {
    const session = {
      ...makeSession("recruiting"),
      originLocationId: "barrel.big-brother"
    };
    const joinByTokenForTelegramUser = vi.fn().mockResolvedValue({ state: "ineligible", session });
    const { ctx, reply } = createCallbackContext(93);

    const handled = await sendPartyJoinFromStartPayload(
      ctx,
      serviceWith({ joinByTokenForTelegramUser }),
      session.inviteToken,
      { botUsername: "kvestarnia_test_bot" }
    );

    expect(handled).toBe(true);
    expect(joinByTokenForTelegramUser).toHaveBeenCalledWith(93n, session.inviteToken, {
      source: "deep-link",
      chatId: 93n
    });
    expect(String(reply.mock.calls[0]?.[0])).toContain("Рейдова канцелярія відсіяла запис");
    expect(String(reply.mock.calls[0]?.[0])).not.toContain("Ви приєдналися");
    expect(JSON.stringify(reply.mock.calls[0]?.[1])).not.toContain("Приєднатися");
  });

  it("persists a deep-link join card and refreshes it with the leader card after protocol filing", async () => {
    const joinedSession = makeBigBarrelSessionWithMember();
    let storedSession = joinedSession;
    const joinByTokenForTelegramUser = vi.fn().mockResolvedValue({ state: "joined", session: joinedSession });
    const recordParticipantMessageReference = vi.fn().mockImplementation((
      telegramUserId: bigint,
      _inviteToken: string,
      reference: { chatId: bigint; messageId: number }
    ) => {
      storedSession = {
        ...storedSession,
        participants: storedSession.participants.map((participant) =>
          participant.character.telegramUserId === telegramUserId
            ? { ...participant, ...reference }
            : participant
        )
      };
      return Promise.resolve(storedSession);
    });
    const joinContext = createCallbackContext(93);

    const handled = await sendPartyJoinFromStartPayload(
      joinContext.ctx,
      serviceWith({
        joinByTokenForTelegramUser,
        recordParticipantMessageReference,
        getByToken: vi.fn().mockImplementation(() => Promise.resolve({ state: "ready", session: storedSession }))
      }),
      joinedSession.inviteToken,
      { botUsername: "kvestarnia_test_bot" }
    );

    expect(handled).toBe(true);
    expect(recordParticipantMessageReference).toHaveBeenCalledWith(93n, joinedSession.inviteToken, {
      chatId: 93n,
      messageId: 23
    });

    const protocolSession: PartySessionRecord = {
      ...storedSession,
      personalProtocol: {
        kind: "bureaucramancer-personal-protocol-13b",
        protocolId: "protocol-deep-link-refresh",
        filerCharacterId: joinedSession.leaderCharacterId,
        signatureCount: 1,
        manaCost: 7,
        filedAt: new Date("2026-06-29T15:04:00.000Z")
      },
      participants: storedSession.participants
    };
    const fileBureaucramancerPersonalProtocolForTelegramUser = vi.fn().mockResolvedValue({
      state: "updated",
      session: protocolSession
    });
    const filingContext = createCallbackContext(42);

    await handlePartySessionCallback(
      filingContext.ctx,
      { type: "protocol-file", token: protocolSession.inviteToken },
      serviceWithCanonicalSession(protocolSession, { fileBureaucramancerPersonalProtocolForTelegramUser }),
      { presence: {} as PresenceService, botUsername: "kvestarnia_test_bot" }
    );

    expect(filingContext.apiEditMessageText).toHaveBeenCalledWith(
      93,
      23,
      expect.stringContaining("📄 Протокол 13-З відкрито. Підписів: 1."),
      expect.objectContaining({ parse_mode: "HTML" })
    );

    const signedSession: PartySessionRecord = {
      ...protocolSession,
      personalProtocol: {
        ...protocolSession.personalProtocol!,
        signatureCount: 2
      }
    };
    const signBureaucramancerPersonalProtocolForTelegramUser = vi.fn().mockResolvedValue({
      state: "updated",
      session: signedSession
    });
    const recordSignedMessageReference = vi.fn().mockResolvedValue(signedSession);
    const signingContext = createCallbackContext(93);
    signingContext.apiEditMessageText.mockRejectedValue(new Error("message to edit not found"));
    signingContext.sendMessage.mockResolvedValue({ message_id: 79 });

    await handlePartySessionCallback(
      signingContext.ctx,
      { type: "protocol-sign", token: signedSession.inviteToken },
      serviceWithCanonicalSession(signedSession, {
        signBureaucramancerPersonalProtocolForTelegramUser,
        recordParticipantMessageReference: recordSignedMessageReference
      }),
      { presence: {} as PresenceService, botUsername: "kvestarnia_test_bot" }
    );

    expect(signingContext.apiEditMessageText).toHaveBeenCalledWith(
      42,
      13,
      expect.stringContaining("📄 Протокол 13-З відкрито. Підписів: 2."),
      expect.objectContaining({ parse_mode: "HTML" })
    );
    expect(signingContext.apiEditMessageText).toHaveBeenCalledWith(
      93,
      23,
      expect.stringContaining("📄 Протокол 13-З відкрито. Підписів: 2."),
      expect.objectContaining({ parse_mode: "HTML" })
    );
    expect(signingContext.sendMessage).toHaveBeenCalledWith(
      42,
      expect.stringContaining("📄 Протокол 13-З відкрито. Підписів: 2."),
      expect.objectContaining({ parse_mode: "HTML" })
    );
    expect(recordSignedMessageReference).toHaveBeenCalledWith(42n, signedSession.inviteToken, {
      chatId: 42n,
      messageId: 79
    });
  });

  it("sends a forwardable Big Barrel Brother invite card after explicit share press", async () => {
    const session = {
      ...makeSessionWithMember(),
      originLocationId: "barrel.big-brother"
    };
    const getByToken = vi.fn().mockResolvedValue({ state: "ready", session });
    const { ctx, reply } = createCallbackContext(93);

    await handlePartySessionCallback(
      ctx,
      { type: "share", token: session.inviteToken },
      serviceWith({ getByToken }),
      {
        presence: {} as PresenceService,
        botUsername: "kvestarnia_test_bot"
      }
    );

    expect(getByToken).toHaveBeenCalledWith(session.inviteToken);
    expect(String(reply.mock.calls[0]?.[0])).toContain("https://t.me/kvestarnia_test_bot?start=party_partyABC12");
    expect(String(reply.mock.calls[0]?.[0])).toContain("Учасників: <b>2/8</b>");
    expect(JSON.stringify(reply.mock.calls[0]?.[1])).toContain("🎲 Інший текст");
    expect(JSON.stringify(reply.mock.calls[0]?.[1])).toContain("v1:party:in:partyABC12");
  });

  it("sends a separate mana-spend confirmation after placing a Kharakternyk ward sign", async () => {
    const session = {
      ...makeBigBarrelSessionWithMember(),
      wardSign: {
        kind: "kharakternyk" as const,
        placerCharacterId: "character-42",
        supportCount: 0,
        supportCap: 7,
        manaCost: 9,
        placedAt: new Date("2026-06-29T15:01:00.000Z")
      }
    };
    const placeKharakternykWardSignForTelegramUser = vi.fn().mockResolvedValue({
      state: "updated",
      session
    });
    const { ctx, answerCallbackQuery, editMessageText, reply } = createCallbackContext(42);

    await handlePartySessionCallback(
      ctx,
      { type: "ward-place", token: session.inviteToken },
      serviceWithCanonicalSession(session, { placeKharakternykWardSignForTelegramUser }),
      {
        presence: {} as PresenceService,
        botUsername: "kvestarnia_test_bot"
      }
    );

    expect(placeKharakternykWardSignForTelegramUser).toHaveBeenCalledWith(42n, session.inviteToken);
    expect(answerCallbackQuery).toHaveBeenCalledWith({ text: "Знак поставлено." });
    expect(messageText(editMessageText)).toContain("🧿 Знак характерника стоїть біля бочки.");
    expect(reply).toHaveBeenCalledWith(
      "🧿 <b>Ви поставили знак</b>\n\n💫 Мани витрачено: <b>9</b>.",
      expect.objectContaining({ parse_mode: "HTML" })
    );
  });

  it("refreshes the leader card when a non-leader places a Kharakternyk ward sign", async () => {
    const base = makeBigBarrelSessionWithMember();
    const session: PartySessionRecord = {
      ...base,
      version: 2,
      wardSign: {
        kind: "kharakternyk",
        placerCharacterId: "character-93",
        supportCount: 0,
        supportCap: 7,
        manaCost: 9,
        placedAt: new Date("2026-06-29T15:03:00.000Z")
      }
    };
    const placeKharakternykWardSignForTelegramUser = vi.fn().mockResolvedValue({ state: "updated", session });
    const { ctx, apiEditMessageText } = createCallbackContext(93);

    await handlePartySessionCallback(
      ctx,
      { type: "ward-place", token: session.inviteToken },
      serviceWithCanonicalSession(session, { placeKharakternykWardSignForTelegramUser }),
      { presence: {} as PresenceService, botUsername: "kvestarnia_test_bot" }
    );

    expect(apiEditMessageText).toHaveBeenCalledWith(
      42,
      13,
      expect.stringContaining("🧿 Знак характерника стоїть біля бочки."),
      expect.objectContaining({ parse_mode: "HTML" })
    );
  });

  it("answers exhausted Kharakternyk ward placement CAS loss as stale", async () => {
    const session = makeBigBarrelSessionWithMember();
    const placeKharakternykWardSignForTelegramUser = vi.fn().mockResolvedValue({
      state: "stale",
      session
    });
    const { ctx, answerCallbackQuery, reply } = createCallbackContext(42);

    await handlePartySessionCallback(
      ctx,
      { type: "ward-place", token: session.inviteToken },
      serviceWithCanonicalSession(session, { placeKharakternykWardSignForTelegramUser }),
      {
        presence: {} as PresenceService,
        botUsername: "kvestarnia_test_bot"
      }
    );

    expect(answerCallbackQuery).toHaveBeenCalledWith({
      text: "Стан ватаги змінився. Спробуйте поставити знак ще раз."
    });
    expect(reply).not.toHaveBeenCalled();
  });

  it("sends a separate mana-spend confirmation after supporting a Kharakternyk ward sign", async () => {
    const base = makeBigBarrelSessionWithMember();
    const session = {
      ...base,
      wardSign: {
        kind: "kharakternyk" as const,
        placerCharacterId: "character-42",
        supportCount: 1,
        supportCap: 7,
        manaCost: 9,
        placedAt: new Date("2026-06-29T15:01:00.000Z")
      },
      participants: base.participants.map((participant) =>
        participant.character.telegramUserId === 93n
          ? {
              ...participant,
              wardSignSupport: {
                kind: "kharakternyk" as const,
                placerCharacterId: "character-42",
                supporterCharacterId: participant.characterId,
                manaCost: 6,
                supportedAt: new Date("2026-06-29T15:02:00.000Z")
              }
            }
          : participant
      )
    };
    const updatedSession = {
      ...session,
      participants: session.participants.map((participant) =>
        participant.characterId === session.leaderCharacterId
          ? { ...participant, chatId: null, messageId: null }
          : participant
      )
    };
    const supportKharakternykWardSignForTelegramUser = vi.fn().mockResolvedValue({
      state: "updated",
      session: updatedSession
    });
    const recordParticipantMessageReference = vi.fn().mockResolvedValue(session);
    const { ctx, answerCallbackQuery, editMessageText, reply, sendMessage } = createCallbackContext(93);
    sendMessage.mockResolvedValue({ message_id: 78 });

    await handlePartySessionCallback(
      ctx,
      { type: "ward-support", token: session.inviteToken },
      serviceWithCanonicalSession(updatedSession, {
        supportKharakternykWardSignForTelegramUser,
        recordParticipantMessageReference
      }),
      {
        presence: {} as PresenceService,
        botUsername: "kvestarnia_test_bot"
      }
    );

    expect(supportKharakternykWardSignForTelegramUser).toHaveBeenCalledWith(93n, session.inviteToken);
    expect(answerCallbackQuery).toHaveBeenCalledWith({ text: "Підпор записано." });
    expect(messageText(editMessageText)).toContain("🧿 Знак характерника стоїть біля бочки. Підпор: 1/7.");
    expect(reply).toHaveBeenCalledWith(
      "✋ <b>Ви підперли знак</b>\n\n💫 Мани витрачено: <b>6</b>.",
      expect.objectContaining({ parse_mode: "HTML" })
    );
    expect(sendMessage).toHaveBeenCalledWith(
      42,
      expect.stringContaining("🧿 Знак характерника стоїть біля бочки. Підпор: 1/7."),
      expect.objectContaining({ parse_mode: "HTML" })
    );
    expect(recordParticipantMessageReference).toHaveBeenCalledWith(42n, session.inviteToken, {
      chatId: 42n,
      messageId: 78
    });
  });

  it("does not mutate or confirm stale ward support callbacks after the raid starts", async () => {
    const boss = makeBossSession({
      rulesVersion: "big-barrel-brother-v1",
      boss: {
        ...makeBossSession().state.boss,
        monsterId: "big-barrel-brother",
        name: "Старший Брат Бочки"
      }
    });
    const getByPartyInviteToken = vi.fn().mockResolvedValue(boss);
    const supportKharakternykWardSignForTelegramUser = vi.fn();
    const { ctx, answerCallbackQuery, editMessageText, reply } = createCallbackContext(93);

    await handlePartySessionCallback(
      ctx,
      { type: "ward-support", token: boss.partyInviteToken },
      serviceWith({ supportKharakternykWardSignForTelegramUser }),
      {
        presence: {} as PresenceService,
        botUsername: "kvestarnia_test_bot",
        partyBoss: partyBossWith({ getByPartyInviteToken })
      }
    );

    expect(getByPartyInviteToken).toHaveBeenCalledWith(boss.partyInviteToken);
    expect(supportKharakternykWardSignForTelegramUser).not.toHaveBeenCalled();
    expect(answerCallbackQuery).toHaveBeenCalledWith({
      text: "Рейд уже стартував. Нові підпори не приймаються."
    });
    expect(messageText(editMessageText)).toContain("Старший Брат Бочки");
    expect(reply).not.toHaveBeenCalled();
  });

  it("lets any joined Big Barrel Brother participant rotate invite-card text", async () => {
    const session = {
      ...makeSessionWithMember(),
      originLocationId: "barrel.big-brother"
    };
    const getByToken = vi.fn().mockResolvedValue({ state: "ready", session });
    const { ctx, editMessageText } = createCallbackContext(93);

    await handlePartySessionCallback(
      ctx,
      { type: "invite", token: session.inviteToken, templateIndex: 0 },
      serviceWith({ getByToken }),
      {
        presence: {} as PresenceService,
        botUsername: "kvestarnia_test_bot"
      }
    );

    expect(messageText(editMessageText)).toContain("https://t.me/kvestarnia_test_bot?start=party_partyABC12");
    expect(messageText(editMessageText)).toContain("Формат: гуртовий рейд проти Старшого Брата Бочки.");
    expect(keyboardJson(editMessageText)).toContain("🎲 Інший текст");
  });

  it("opens a completed party boss result from a party deep link before falling back to recruiting join", async () => {
    const session = makeBossSession({
      status: "won",
      participants: [
        {
          ...makeBossParticipant("character-42", "Тестова Лідерка"),
          status: "knocked-out",
          resources: {
            hp: 0,
            hpMax: 25,
            mana: 10,
            manaMax: 10
          }
        },
        makeBossParticipant("character-93", "Друга Учасниця")
      ]
    });
    session.status = "won";
    const getByPartyInviteToken = vi.fn().mockResolvedValue(session);
    const joinByTokenForTelegramUser = vi.fn();
    const { ctx, reply } = createCallbackContext(93);

    const handled = await sendPartyJoinFromStartPayload(
      ctx,
      serviceWith({ joinByTokenForTelegramUser }),
      session.partyInviteToken,
      { partyBoss: partyBossWith({ getByPartyInviteToken }) }
    );

    expect(handled).toBe(true);
    expect(getByPartyInviteToken).toHaveBeenCalledWith(session.partyInviteToken);
    expect(joinByTokenForTelegramUser).not.toHaveBeenCalled();
    expect(String(reply.mock.calls[0]?.[0])).toContain("Ватага перемогла");
    expect(String(reply.mock.calls[0]?.[0])).toContain("▫️ Тестова Лідерка: HP 0/25 · мана 10/10 · вибито");
    expect(String(reply.mock.calls[0]?.[0])).not.toContain("❤️ Ви:");
  });
});

function serviceWith(overrides: Partial<PartySessionService>): PartySessionService {
  return {
    isEnabled: () => true,
    areDevHelpersEnabled: () => false,
    forceExpireByToken: vi.fn(),
    getLiveRecruitingByTelegramUser: vi.fn(),
    ...overrides
  } as unknown as PartySessionService;
}

function serviceWithCanonicalSession(
  session: PartySessionRecord,
  overrides: Partial<PartySessionService>
): PartySessionService {
  return serviceWith({
    getByToken: vi.fn().mockResolvedValue({ state: "ready", session }),
    ...overrides
  });
}

function partyBossWith(overrides: Partial<PartyBossService>): PartyBossService {
  return {
    isEnabled: () => true,
    areDevHelpersEnabled: () => false,
    startFromPartyForTelegramUser: vi.fn(),
    submitActionForTelegramUser: vi.fn(),
    resolveDueTimedOutByToken: vi.fn(),
    forceResolveTimedOutByToken: vi.fn(),
    getByPartyInviteToken: vi.fn(),
    hasCombatItemsForTelegramUser: vi.fn().mockResolvedValue(true),
    ...overrides
  } as unknown as PartyBossService;
}

function createCallbackContext(): {
  ctx: Context;
  answerCallbackQuery: ReturnType<typeof vi.fn>;
  editMessageText: ReturnType<typeof vi.fn>;
  apiEditMessageText: ReturnType<typeof vi.fn>;
  reply: ReturnType<typeof vi.fn>;
  sendMessage: ReturnType<typeof vi.fn>;
}

function commandUpdate(text: string) {
  return {
    update_id: 1,
    message: {
      message_id: 1,
      date: 1,
      chat: {
        id: 42,
        type: "private"
      },
      from: {
        id: 42,
        is_bot: false,
        first_name: "Тест"
      },
      text,
      entities: [
        {
          offset: 0,
          length: text.length,
          type: "bot_command"
        }
      ]
    }
  };
}
function createCallbackContext(telegramUserId = 42): {
  ctx: Context;
  answerCallbackQuery: ReturnType<typeof vi.fn>;
  editMessageText: ReturnType<typeof vi.fn>;
  apiEditMessageText: ReturnType<typeof vi.fn>;
  reply: ReturnType<typeof vi.fn>;
  sendMessage: ReturnType<typeof vi.fn>;
} {
  const answerCallbackQuery = vi.fn().mockResolvedValue(true);
  const editMessageText = vi.fn().mockResolvedValue(true);
  const apiEditMessageText = vi.fn().mockResolvedValue(true);
  const reply = vi.fn().mockResolvedValue({ message_id: 23 });
  const sendMessage = vi.fn().mockResolvedValue(true);
  const ctx = {
    from: {
      id: telegramUserId,
      is_bot: false,
      first_name: "Тест"
    },
    chat: {
      id: telegramUserId,
      type: "private"
    },
    callbackQuery: {
      id: "callback-1",
      message: {
        message_id: 13,
        chat: {
          id: telegramUserId,
          type: "private"
        }
      }
    },
    answerCallbackQuery,
    editMessageText,
    reply,
    api: {
      editMessageText: apiEditMessageText,
      sendMessage
    }
  } as unknown as Context;

  return { ctx, answerCallbackQuery, editMessageText, apiEditMessageText, reply, sendMessage };
}

function messageText(editMessageText: ReturnType<typeof vi.fn>): string {
  const call = editMessageText.mock.calls[0] as [string, { reply_markup?: unknown }?] | undefined;

  return call?.[0] ?? "";
}

function keyboardJson(editMessageText: ReturnType<typeof vi.fn>): string {
  const call = editMessageText.mock.calls[0] as [string, { reply_markup?: unknown }?] | undefined;

  return JSON.stringify(call?.[1]?.reply_markup);
}

function makeSession(status: PartySessionRecord["status"]): PartySessionRecord {
  const now = new Date("2026-06-29T15:00:00.000Z");

  return {
    id: "party-1",
    inviteToken: "partyABC12",
    status,
    leaderCharacterId: "character-42",
    periodId: "12026-06-29",
    originLocationId: "korchma.board",
    participantCap: 8,
    minimumParticipants: 1,
    joinUntilAt: new Date("2026-06-29T15:13:00.000Z"),
    expiresAt: new Date("2026-06-29T15:13:00.000Z"),
    version: status === "recruiting" ? 1 : 2,
    activeLeaderKey: status === "recruiting" ? "party-leader:character-42" : null,
    createdAt: now,
    updatedAt: now,
    leader: makeCharacter(),
    participants: [
      {
        id: "participant-42",
        sessionId: "party-1",
        characterId: "character-42",
        remortCount: 0,
        status: "joined",
        joinSource: "leader",
        joinedAt: now,
        leftAt: null,
        chatId: 42n,
        messageId: 13,
        character: makeCharacter()
      }
    ]
  };
}

function makeSessionWithMember(): PartySessionRecord {
  const session = makeSession("recruiting");
  const member = {
    ...makeCharacter(),
    id: "character-93",
    userId: "user-93",
    telegramUserId: 93n,
    name: "Друга Учасниця"
  };

  return {
    ...session,
    participants: [
      ...session.participants,
      {
        id: "participant-93",
        sessionId: session.id,
        characterId: member.id,
        remortCount: 0,
        status: "joined",
        joinSource: "nearby",
        joinedAt: session.createdAt,
        leftAt: null,
        chatId: 93n,
        messageId: 99,
        character: member
      }
    ]
  };
}

function makeBigBarrelSessionWithMember(): PartySessionRecord {
  const session = makeSessionWithMember();

  return {
    ...session,
    originLocationId: "barrel.big-brother"
  };
}

function makeBigBarrelSessionWithTwoMembers(): PartySessionRecord {
  const session = makeBigBarrelSessionWithMember();
  const member = {
    ...makeCharacter(),
    id: "character-587",
    userId: "user-587",
    telegramUserId: 587n,
    name: "Третя Учасниця"
  };

  return {
    ...session,
    participants: [
      ...session.participants,
      {
        id: "participant-587",
        sessionId: session.id,
        characterId: member.id,
        remortCount: 0,
        status: "joined",
        joinSource: "nearby",
        joinedAt: session.createdAt,
        leftAt: null,
        chatId: 587n,
        messageId: 587,
        character: member
      }
    ]
  };
}

function withParticipantReadiness(
  session: PartySessionRecord,
  characterId: string,
  readiness: "ready" | "waiting",
  version: number
): PartySessionRecord {
  return {
    ...session,
    version,
    participants: session.participants.map((participant) =>
      participant.characterId === characterId
        ? {
            ...participant,
            readiness
          }
        : participant
    )
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });

  return { promise, resolve };
}

function makeBossSession(overrides: Partial<PartyBossSessionRecord["state"]> = {}): PartyBossSessionRecord {
  const now = new Date("2026-06-30T10:00:00.000Z");
  const leader = makeCharacter();
  const member = {
    ...makeCharacter(),
    id: "character-93",
    userId: "user-93",
    telegramUserId: 93n,
    name: "Друга Учасниця"
  };
  const state: PartyBossSessionRecord["state"] = {
    rulesVersion: "party-boss-proof-v1",
    partySessionId: "party-1",
    status: "active",
    turn: 1,
    boss: {
      monsterId: "party-boss-proof-one",
      name: "Контрольний Бос",
      level: 3,
      hp: 65,
      hpMax: 65,
      attack: 8,
      armor: 2,
      resist: 1,
      dexterity: 5,
      tags: ["party-boss-proof"]
    },
    participants: [
      makeBossParticipant("character-42", "Тестова Лідерка"),
      makeBossParticipant("character-93", "Друга Учасниця")
    ],
    roundLog: [],
    startedAt: now.toISOString(),
    ...overrides
  };

  return {
    id: "boss-1",
    partySessionId: "party-1",
    partyInviteToken: "partyABC12",
    leaderCharacterId: "character-42",
    status: state.status,
    turn: state.turn,
    version: 1,
    rulesVersion: "party-boss-proof-v1",
    bossKey: "party-boss-proof-one",
    state,
    result: null,
    turnExpiresAt: new Date("2026-06-30T10:00:23.000Z"),
    completedAt: null,
    participants: [leader, member]
  };
}

function makeBossParticipant(characterId: string, name: string): PartyBossSessionRecord["state"]["participants"][number] {
  return {
    characterId,
    name,
    remortCount: 0,
    status: "active",
    combatStats: {
      level: 3,
      hpMax: 25,
      manaMax: 10,
      hpCurrent: 25,
      manaCurrent: 10,
      strength: 5,
      dexterity: 5,
      intelligence: 5,
      charisma: 5,
      luck: 5,
      raceId: "race.human-ish",
      classId: "class.warrior"
    },
    resources: {
      hp: 25,
      hpMax: 25,
      mana: 10,
      manaMax: 10
    },
    contribution: {
      submittedActions: 0,
      timeoutActions: 0,
      damageDealt: 0,
      damageTaken: 0
    }
  };
}

function makeCharacter(): PartySessionRecord["leader"] {
  return {
    id: "character-42",
    userId: "user-42",
    telegramUserId: 42n,
    currentLocationId: "korchma.board",
    name: "Тестова Лідерка",
    pronoun: "they",
    path: "path.boundary",
    raceId: "race.human-ish",
    classId: "class.warrior",
    level: 3,
    xp: 42,
    gold: 13,
    hpCurrent: 25,
    hpMax: 25,
    manaCurrent: 10,
    manaMax: 10,
    hpRegenAt: null,
    manaRegenAt: null,
    activeCosmeticTitleGrantId: null,
    statsJson: {},
    remortCount: 0
  };
}
