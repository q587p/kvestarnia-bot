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

  it("releases a newly claimed inert candidate when activation fails", async () => {
    const view = activeView();
    const service = deliveryService(view);
    const transport = deliveryTransport({
      editErrors: [new Error("activation failed")],
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
    expect(edits).toEqual([canonical?.messageId]);
    expect(canonical).not.toBeNull();
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
    turn: 1,
    version: 1,
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
      turn: 1,
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
