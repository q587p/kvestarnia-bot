import { describe, expect, it, vi } from "vitest";
import type { DuelChallengeService, DuelChallengeView } from "../../src/services/duelChallengeService";
import {
  deliverCanonicalTurnBasedDuelParticipantCard,
  type TurnBasedDuelDeliveryTransport
} from "../../src/bot/turnBasedDuelCardDelivery";

type ActiveView = Extract<DuelChallengeView, { state: "active" }>;
type ResolvedView = Extract<DuelChallengeView, { state: "resolved" }>;

describe("canonical turn-based duel card delivery", () => {
  it("replaces a definitively missing canonical message through inert send, CAS claim, and winner-only activation", async () => {
    const view = activeView({ challengerChatId: 42n, challengerMessageId: 10 });
    const service = deliveryService(view);
    const transport = deliveryTransport({
      editErrors: [new Error("Bad Request: message to edit not found")],
      sentMessageIds: [20]
    });

    const result = await deliverCanonicalTurnBasedDuelParticipantCard({
      service: service.value,
      view,
      participant: "challenger",
      chatId: 42n,
      transport: transport.value
    });

    expect(result).toEqual({ state: "activated", reference: { chatId: 42n, messageId: 20 } });
    expect(transport.sendInertMessage).toHaveBeenCalledTimes(1);
    expect(transport.sendInertMessage.mock.calls[0]?.[2]).toMatchObject({
      reply_markup: { inline_keyboard: [] }
    });
    expect(service.claim).toHaveBeenCalledWith(
      "session-1",
      "challenger",
      { chatId: 42n, messageId: 20 },
      { chatId: 42n, messageId: 10 }
    );
    const activation = transport.editMessage.mock.calls[1];
    expect(activation?.[0]).toEqual({ chatId: 42n, messageId: 20 });
    expect(activation?.[1]).toContain("Покрокова дуель");
    expect(JSON.stringify(activation?.[2])).toContain("inline_keyboard");
    expect(service.release).not.toHaveBeenCalled();
  });

  it("keeps a still-canonical card on an arbitrary retryable edit failure", async () => {
    const view = activeView({ challengerChatId: 42n, challengerMessageId: 10 });
    const service = deliveryService(view);
    const transport = deliveryTransport({ editErrors: [new Error("Telegram gateway timeout")] });

    const result = await deliverCanonicalTurnBasedDuelParticipantCard({
      service: service.value,
      view,
      participant: "challenger",
      chatId: 42n,
      transport: transport.value
    });

    expect(result).toEqual({
      state: "retryable-edit-failure",
      reference: { chatId: 42n, messageId: 10 }
    });
    expect(transport.sendInertMessage).not.toHaveBeenCalled();
    expect(service.claim).not.toHaveBeenCalled();
  });

  it("reloads the active participant reference instead of trusting the caller's stale session snapshot", async () => {
    const stale = activeView();
    const storedSession = {
      ...stale.session,
      challengerChatId: 42n,
      challengerMessageId: 20
    };
    const service = {
      getByToken: vi.fn().mockResolvedValue(stale),
      getTurnBasedSessionByToken: vi.fn().mockResolvedValue(storedSession),
      claimTurnBasedMessageReference: vi.fn(),
      releaseTurnBasedMessageReference: vi.fn()
    } as unknown as DuelChallengeService;
    const transport = deliveryTransport();

    const result = await deliverCanonicalTurnBasedDuelParticipantCard({
      service,
      view: stale,
      session: stale.session,
      participant: "challenger",
      chatId: 42n,
      transport: transport.value
    });

    expect(result).toEqual({ state: "edited", reference: { chatId: 42n, messageId: 20 } });
    expect(transport.editMessage).toHaveBeenCalledWith(
      { chatId: 42n, messageId: 20 },
      expect.stringContaining("Покрокова дуель"),
      expect.any(Object)
    );
    expect(transport.sendInertMessage).not.toHaveBeenCalled();
  });

  it("releases a newly claimed inert candidate only when Telegram proves it is missing", async () => {
    const view = activeView();
    const service = deliveryService(view);
    const transport = deliveryTransport({
      editErrors: [new Error("Bad Request: message to edit not found")],
      sentMessageIds: [20]
    });

    const result = await deliverCanonicalTurnBasedDuelParticipantCard({
      service: service.value,
      view,
      participant: "challenger",
      chatId: 42n,
      transport: transport.value
    });

    expect(result).toEqual({ state: "activation-failed", reference: null });
    expect(service.release).toHaveBeenCalledWith(
      "session-1",
      "challenger",
      { chatId: 42n, messageId: 20 }
    );
  });

  it.each([
    "Telegram gateway timeout after upstream apply",
    "500 Internal Server Error after upstream apply"
  ])("keeps an ambiguously activated candidate canonical and retries that same message: %s", async (failure) => {
    let current = activeView();
    const claim = vi.fn<DuelChallengeService["claimTurnBasedMessageReference"]>((
      _sessionId,
      _participant,
      reference
    ) => {
      current = activeView({
        challengerChatId: reference.chatId,
        challengerMessageId: reference.messageId
      });
      return Promise.resolve({ claimed: true, session: current.session });
    });
    const releaseTurnBasedMessageReference = vi.fn();
    const service = {
      claimTurnBasedMessageReference: claim,
      releaseTurnBasedMessageReference,
      getByToken: vi.fn(() => Promise.resolve(current))
    } as unknown as DuelChallengeService;
    const transport = deliveryTransport({
      editErrors: [new Error(failure)],
      sentMessageIds: [20]
    });

    const first = await deliverCanonicalTurnBasedDuelParticipantCard({
      service,
      view: current,
      participant: "challenger",
      chatId: 42n,
      transport: transport.value
    });
    const second = await deliverCanonicalTurnBasedDuelParticipantCard({
      service,
      view: current,
      participant: "challenger",
      chatId: 42n,
      transport: transport.value
    });

    expect(first).toEqual({
      state: "retryable-activation-failure",
      reference: { chatId: 42n, messageId: 20 }
    });
    expect(second).toEqual({ state: "edited", reference: { chatId: 42n, messageId: 20 } });
    expect(transport.sendInertMessage).toHaveBeenCalledTimes(1);
    expect(transport.editMessage.mock.calls.map((call) => call[0])).toEqual([
      { chatId: 42n, messageId: 20 },
      { chatId: 42n, messageId: 20 }
    ]);
    expect(releaseTurnBasedMessageReference).not.toHaveBeenCalled();
  });

  it("retries an ambiguously failed resolved activation on the retained canonical message", async () => {
    const resolved = resolvedView();
    const originalSession = {
      ...activeView().session,
      status: "resolved" as const,
      completedAt: new Date("2026-07-18T12:00:00.000Z"),
      challengerChatId: null,
      challengerMessageId: null
    };
    let storedSession = { ...originalSession };
    const claimTurnBasedMessageReference = vi.fn<DuelChallengeService["claimTurnBasedMessageReference"]>((
      _sessionId,
      _participant,
      reference
    ) => {
      storedSession = {
        ...storedSession,
        challengerChatId: reference.chatId,
        challengerMessageId: reference.messageId
      };
      return Promise.resolve({ claimed: true, session: storedSession });
    });
    const service = {
      getByToken: vi.fn().mockResolvedValue(resolved),
      getTurnBasedSessionByToken: vi.fn(() => Promise.resolve(storedSession)),
      claimTurnBasedMessageReference,
      releaseTurnBasedMessageReference: vi.fn()
    } as unknown as DuelChallengeService;
    const transport = deliveryTransport({
      editErrors: [new Error("Telegram gateway timeout before local acknowledgement")],
      sentMessageIds: [20]
    });

    const first = await deliverCanonicalTurnBasedDuelParticipantCard({
      service,
      view: resolved,
      session: originalSession,
      participant: "challenger",
      chatId: 42n,
      transport: transport.value
    });
    const second = await deliverCanonicalTurnBasedDuelParticipantCard({
      service,
      view: resolved,
      session: originalSession,
      participant: "challenger",
      chatId: 42n,
      transport: transport.value
    });

    expect(first).toEqual({
      state: "retryable-activation-failure",
      reference: { chatId: 42n, messageId: 20 }
    });
    expect(second).toEqual({ state: "edited", reference: { chatId: 42n, messageId: 20 } });
    expect(transport.sendInertMessage).toHaveBeenCalledTimes(1);
    expect(claimTurnBasedMessageReference).toHaveBeenCalledTimes(1);
    expect(transport.editMessage.mock.calls.map((call) => call[0])).toEqual([
      { chatId: 42n, messageId: 20 },
      { chatId: 42n, messageId: 20 }
    ]);
    expect(storedSession.challengerMessageId).toBe(20);
    const retry = transport.editMessage.mock.calls.at(-1);
    expect(String(retry?.[1])).toContain("Результат покрокової дуелі");
    expect(JSON.stringify(retry?.[2])).toContain("inline_keyboard");
    expect(JSON.stringify(retry?.[2])).not.toContain("v1:duel:t:");
  });

  it("renders a terminal card instead of stale active controls when resolution wins after the claim", async () => {
    const active = activeView();
    const resolved = resolvedView();
    const service = deliveryService(resolved);
    const transport = deliveryTransport({ sentMessageIds: [20] });

    const result = await deliverCanonicalTurnBasedDuelParticipantCard({
      service: service.value,
      view: active,
      participant: "challenger",
      chatId: 42n,
      transport: transport.value
    });

    expect(result.state).toBe("activated");
    const activation = transport.editMessage.mock.calls.at(-1);
    expect(String(activation?.[1])).toContain("Результат покрокової дуелі");
    expect(JSON.stringify(activation?.[2])).not.toContain("v1:duel:t:");
  });

  it("lets exactly one candidate activate when initial remote delivery races an immediate local turn", async () => {
    const initial = activeView();
    let canonical: { chatId: bigint; messageId: number } | null = null;
    let nextMessageId = 20;
    const claim = vi.fn<DuelChallengeService["claimTurnBasedMessageReference"]>((
      _sessionId: string,
      _participant: "challenger" | "target",
      candidate: { chatId: bigint; messageId: number }
    ) => {
      const claimed = canonical === null;
      if (claimed) {
        canonical = candidate;
      }
      return Promise.resolve({
        claimed,
        session: activeView({
          challengerChatId: canonical?.chatId ?? null,
          challengerMessageId: canonical?.messageId ?? null
        }).session
      });
    });
    const service = {
      claimTurnBasedMessageReference: claim,
      releaseTurnBasedMessageReference: vi.fn(),
      getByToken: vi.fn().mockResolvedValue(initial)
    } as unknown as DuelChallengeService;
    const edits: number[] = [];
    const transports = [0, 1].map((): TurnBasedDuelDeliveryTransport => ({
      editMessage: vi.fn<TurnBasedDuelDeliveryTransport["editMessage"]>((reference) => {
        edits.push(reference.messageId);
        return Promise.resolve();
      }),
      sendInertMessage: vi.fn<TurnBasedDuelDeliveryTransport["sendInertMessage"]>(() =>
        Promise.resolve(nextMessageId++)
      )
    }));

    await Promise.all(transports.map((transport) =>
      deliverCanonicalTurnBasedDuelParticipantCard({
        service,
        view: initial,
        participant: "challenger",
        chatId: 42n,
        transport
      })
    ));

    expect(claim).toHaveBeenCalledTimes(2);
    expect(edits).toEqual([canonical?.messageId, canonical?.messageId]);
    expect(canonical).not.toBeNull();
  });

  it("converges an existing canonical card from active N to active N+1", async () => {
    const activeN = activeView({ challengerChatId: 42n, challengerMessageId: 10, turn: 1, version: 1 });
    const activeNext = activeView({ challengerChatId: 42n, challengerMessageId: 10, turn: 2, version: 2 });
    let current = activeN;
    let releaseFirstEdit!: () => void;
    const firstEditStarted = new Promise<void>((resolve) => {
      releaseFirstEdit = resolve;
    });
    let unblockFirstEdit!: () => void;
    const firstEditBlocked = new Promise<void>((resolve) => {
      unblockFirstEdit = resolve;
    });
    let editCount = 0;
    const edits: Array<{ text: string; options: unknown }> = [];
    const sendInertMessage = vi.fn<TurnBasedDuelDeliveryTransport["sendInertMessage"]>();
    const transport: TurnBasedDuelDeliveryTransport = {
      editMessage: vi.fn<TurnBasedDuelDeliveryTransport["editMessage"]>(async (_reference, text, options) => {
        editCount += 1;
        edits.push({ text, options });
        if (editCount === 1) {
          unblockFirstEdit();
          await firstEditStarted;
        }
      }),
      sendInertMessage
    };
    const service = {
      getByToken: vi.fn(() => Promise.resolve(current)),
      claimTurnBasedMessageReference: vi.fn(),
      releaseTurnBasedMessageReference: vi.fn()
    } as unknown as DuelChallengeService;

    const olderDelivery = deliverCanonicalTurnBasedDuelParticipantCard({
      service,
      view: activeN,
      participant: "challenger",
      chatId: 42n,
      transport
    });
    await firstEditBlocked;
    current = activeNext;
    const newerDelivery = deliverCanonicalTurnBasedDuelParticipantCard({
      service,
      view: activeNext,
      participant: "challenger",
      chatId: 42n,
      transport
    });
    releaseFirstEdit();
    await Promise.all([olderDelivery, newerDelivery]);

    const finalEdit = edits.at(-1);
    expect(finalEdit?.text).toContain("хід 2");
    expect(JSON.stringify(finalEdit?.options)).toContain("v1:duel:t:abcDEF12:atk:2:2");
    expect(sendInertMessage).not.toHaveBeenCalled();
  });

  it("makes a resolved terminal card win an existing-reference race against active controls", async () => {
    const active = activeView({ challengerChatId: 42n, challengerMessageId: 10 });
    const resolved = resolvedView();
    let current: ActiveView | ResolvedView = active;
    let releaseFirstEdit!: () => void;
    const firstEditGate = new Promise<void>((resolve) => {
      releaseFirstEdit = resolve;
    });
    let notifyFirstEdit!: () => void;
    const firstEditStarted = new Promise<void>((resolve) => {
      notifyFirstEdit = resolve;
    });
    let editCount = 0;
    const edits: Array<{ text: string; options: unknown }> = [];
    const sendInertMessage = vi.fn<TurnBasedDuelDeliveryTransport["sendInertMessage"]>();
    const transport: TurnBasedDuelDeliveryTransport = {
      editMessage: vi.fn<TurnBasedDuelDeliveryTransport["editMessage"]>(async (_reference, text, options) => {
        editCount += 1;
        edits.push({ text, options });
        if (editCount === 1) {
          notifyFirstEdit();
          await firstEditGate;
        }
      }),
      sendInertMessage
    };
    const service = {
      getByToken: vi.fn(() => Promise.resolve(current)),
      claimTurnBasedMessageReference: vi.fn(),
      releaseTurnBasedMessageReference: vi.fn()
    } as unknown as DuelChallengeService;

    const activeDelivery = deliverCanonicalTurnBasedDuelParticipantCard({
      service,
      view: active,
      participant: "challenger",
      chatId: 42n,
      transport
    });
    await firstEditStarted;
    current = resolved;
    const terminalDelivery = deliverCanonicalTurnBasedDuelParticipantCard({
      service,
      view: resolved,
      session: active.session,
      participant: "challenger",
      chatId: 42n,
      transport
    });
    releaseFirstEdit();
    await Promise.all([activeDelivery, terminalDelivery]);

    const finalEdit = edits.at(-1);
    expect(finalEdit?.text).toContain("Результат покрокової дуелі");
    expect(JSON.stringify(finalEdit?.options)).not.toContain("v1:duel:t:");
    expect(sendInertMessage).not.toHaveBeenCalled();
  });
});

function deliveryService(currentView: ActiveView | ResolvedView) {
  const claim = vi.fn<DuelChallengeService["claimTurnBasedMessageReference"]>((
    _sessionId: string,
    _participant: "challenger" | "target",
    reference: { chatId: bigint; messageId: number }
  ) => Promise.resolve({
    claimed: true,
    session: activeView({
      challengerChatId: reference.chatId,
      challengerMessageId: reference.messageId
    }).session
  }));
  const release = vi.fn().mockResolvedValue({ released: true, session: null });
  return {
    claim,
    release,
    value: {
      claimTurnBasedMessageReference: claim,
      releaseTurnBasedMessageReference: release,
      getByToken: vi.fn().mockResolvedValue(currentView)
    } as unknown as DuelChallengeService
  };
}

function deliveryTransport(options: {
  editErrors?: Error[];
  sentMessageIds?: number[];
} = {}) {
  const editErrors = [...(options.editErrors ?? [])];
  const sentMessageIds = [...(options.sentMessageIds ?? [])];
  const editMessage = vi.fn<TurnBasedDuelDeliveryTransport["editMessage"]>(() => {
    const error = editErrors.shift();
    if (error) {
      return Promise.reject(error);
    }
    return Promise.resolve();
  });
  const sendInertMessage = vi.fn<TurnBasedDuelDeliveryTransport["sendInertMessage"]>(() =>
    Promise.resolve(sentMessageIds.shift() ?? null)
  );
  return {
    editMessage,
    sendInertMessage,
    value: { editMessage, sendInertMessage } satisfies TurnBasedDuelDeliveryTransport
  };
}

function activeView(references: {
  challengerChatId?: bigint | null;
  challengerMessageId?: number | null;
  targetChatId?: bigint | null;
  targetMessageId?: number | null;
  turn?: number;
  version?: number;
} = {}): ActiveView {
  const participant = (characterId: string, displayName: string) => ({
    characterId,
    displayName,
    title: "Пересічні Пригодники",
    raceId: "race.human-ish",
    raceName: "Людисько",
    classId: "class.warrior",
    className: "Воїн",
    level: 3,
    remortCount: 0,
    stats: { strength: 7, dexterity: 7, intelligence: 6, charisma: 6, luck: 6 },
    hp: 24,
    hpMax: 24,
    mana: 12,
    manaMax: 12,
    combatStats: {
      level: 3,
      hpMax: 24,
      manaMax: 12,
      strength: 7,
      dexterity: 7,
      intelligence: 6,
      charisma: 6,
      luck: 6,
      classId: "class.warrior"
    }
  });
  const session = {
    id: "session-1",
    duelChallengeId: "challenge-1",
    challengerCharacterId: "character-1",
    targetCharacterId: "character-2",
    status: "active",
    actingCharacterId: "character-1",
    turn: references.turn ?? 1,
    version: references.version ?? 1,
    turnExpiresAt: new Date("2026-07-17T12:00:23.000Z"),
    completedAt: null,
    challengerChatId: references.challengerChatId ?? null,
    challengerMessageId: references.challengerMessageId ?? null,
    targetChatId: references.targetChatId ?? null,
    targetMessageId: references.targetMessageId ?? null,
    createdAt: new Date("2026-07-17T12:00:00.000Z"),
    updatedAt: new Date("2026-07-17T12:00:00.000Z"),
    state: {
      mode: "turn-based",
      status: "active",
      rulesVersion: "turn-based-duel-v1",
      balanceVersion: "instant-duel-v2",
      turn: references.turn ?? 1,
      actingCharacterId: "character-1",
      participants: {
        challenger: participant("character-1", "Перший Кухоль"),
        target: participant("character-2", "Другий Кухоль")
      }
    }
  };
  const challenge = {
    id: "challenge-1",
    inviteToken: "abcDEF12",
    mode: "turn-based",
    status: "active",
    challengerCharacterId: "character-1",
    targetCharacterId: "character-2",
    challenger: { telegramUserId: 42n },
    target: { telegramUserId: 99n }
  };
  return {
    state: "active",
    challenge,
    challenger: { name: "Перший Кухоль" },
    target: { name: "Другий Кухоль" },
    session: { ...session, challenge },
    turnExpiresAt: session.turnExpiresAt,
    now: new Date("2026-07-17T12:00:00.000Z")
  } as unknown as ActiveView;
}

function resolvedView(): ResolvedView {
  const active = activeView();
  return {
    state: "resolved",
    challenge: { ...active.challenge, status: "resolved" },
    challenger: active.challenger,
    target: active.target,
    result: {
      outcome: "challenger",
      winnerCharacterId: "character-1",
      loserCharacterId: "character-2",
      challengerScore: 13,
      targetScore: 7,
      swing: 0,
      flavorKey: "paperwork-stall"
    }
  } as unknown as ResolvedView;
}
