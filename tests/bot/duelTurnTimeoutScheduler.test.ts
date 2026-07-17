import type { Bot } from "grammy";
import { describe, expect, it, vi } from "vitest";
import { createDuelTurnTimeoutScheduler } from "../../src/bot/duelTurnTimeoutScheduler";
import {
  deliverCanonicalTurnBasedDuelParticipantCard,
  type TurnBasedDuelDeliveryTransport
} from "../../src/bot/turnBasedDuelCardDelivery";
import type { DuelChallengeService, DuelChallengeView } from "../../src/services/duelChallengeService";

type ActiveView = Extract<DuelChallengeView, { state: "active" }>;

describe("duel turn timeout scheduler", () => {
  it("keeps terminal settlement complete when quest notification delivery fails", async () => {
    const session = {
      challenge: { inviteToken: "timeout-duel-token" }
    };
    const listDueTurnBasedSessions = vi.fn(() => Promise.resolve([session]));
    const resolveDueTurnBasedSession = vi.fn(() => Promise.resolve({
      state: "updated",
      session,
      questProgressUpdates: [{
        telegramUserId: 42n,
        objective: "turn-based-duel",
        progress: {
          accepted: true,
          trainingCompleted: false,
          quickDuelCompleted: false,
          turnBasedDuelCompleted: true,
          completedObjectives: 1,
          requiredObjectives: 3,
          readyToClaim: false,
          currentLocationId: "location.korchma.fighting_corner"
        }
      }]
    }));
    const getByToken = vi.fn(() => Promise.resolve({ state: "not-found" }));
    const service = {
      listDueTurnBasedSessions,
      resolveDueTurnBasedSession,
      getByToken
    } as unknown as DuelChallengeService;
    const sendMessage = vi.fn(() => Promise.reject(new Error("Telegram unavailable")));
    const bot = { api: { sendMessage } } as unknown as Bot;
    const scheduler = createDuelTurnTimeoutScheduler(service, bot, { intervalMs: 60_000 });

    scheduler.start();
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalled());
    scheduler.stop();

    expect(resolveDueTurnBasedSession).toHaveBeenCalledWith(session);
    expect(getByToken).toHaveBeenCalledWith("timeout-duel-token");
    expect(sendMessage).toHaveBeenCalledWith(
      42,
      expect.stringContaining("Зараховано покрокову дуель"),
      { parse_mode: "HTML" }
    );
  });

  it("keeps one canonical card when an active deep link races the timeout scheduler", async () => {
    const view = makeActiveView();
    const session = view.session;
    let canonical: { chatId: bigint; messageId: number } | null = null;
    let releaseClaims: (() => void) | null = null;
    const claimsReady = new Promise<void>((resolve) => {
      releaseClaims = resolve;
    });
    const claimTurnBasedMessageReference = vi.fn<DuelChallengeService["claimTurnBasedMessageReference"]>(async (
      _sessionId: string,
      _participant: "challenger" | "target",
      candidate: { chatId: bigint; messageId: number }
    ) => {
      await claimsReady;
      const claimed = canonical === null;
      if (claimed) {
        canonical = candidate;
      }
      return {
        claimed,
        session: {
          ...session,
          challengerChatId: canonical?.chatId ?? null,
          challengerMessageId: canonical?.messageId ?? null
        }
      };
    });
    const service = {
      listDueTurnBasedSessions: vi.fn().mockResolvedValue([session]),
      resolveDueTurnBasedSession: vi.fn().mockResolvedValue({ state: "updated", session }),
      getByToken: vi.fn().mockResolvedValue(view),
      claimTurnBasedMessageReference,
      releaseTurnBasedMessageReference: vi.fn()
    } as unknown as DuelChallengeService;
    const schedulerEdits: number[] = [];
    const sendMessage = vi.fn().mockResolvedValue({ message_id: 501 });
    const editMessageText = vi.fn((_chatId: number, messageId: number) => {
      schedulerEdits.push(messageId);
      return Promise.resolve(true);
    });
    const bot = { api: { sendMessage, editMessageText } } as unknown as Bot;
    const scheduler = createDuelTurnTimeoutScheduler(service, bot, { intervalMs: 60_000 });

    scheduler.start();
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));

    const deepLinkEdits: number[] = [];
    const deepLinkDelivery = deliverCanonicalTurnBasedDuelParticipantCard({
      service,
      view,
      participant: "challenger",
      chatId: 42n,
      transport: {
        editMessage: vi.fn<TurnBasedDuelDeliveryTransport["editMessage"]>((reference) => {
          deepLinkEdits.push(reference.messageId);
          return Promise.resolve();
        }),
        sendInertMessage: vi.fn().mockResolvedValue(502)
      }
    });
    await vi.waitFor(() => expect(claimTurnBasedMessageReference).toHaveBeenCalledTimes(2));
    releaseClaims?.();
    await deepLinkDelivery;
    await vi.waitFor(() => expect([...schedulerEdits, ...deepLinkEdits]).toHaveLength(1));
    scheduler.stop();

    expect(canonical).not.toBeNull();
    expect([...schedulerEdits, ...deepLinkEdits]).toEqual([canonical?.messageId]);
    expect(claimTurnBasedMessageReference).toHaveBeenCalledTimes(2);
  });
});

function makeActiveView(): ActiveView {
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
  const challenger = participant("character-1", "Перший Кухоль");
  const target = participant("character-2", "Другий Кухоль");
  const challenge = {
    id: "challenge-1",
    inviteToken: "timeout-duel-token",
    mode: "turn-based",
    status: "active",
    challengerCharacterId: challenger.characterId,
    targetCharacterId: target.characterId,
    challenger: { telegramUserId: 42n },
    target: { telegramUserId: null }
  };
  const session = {
    id: "session-1",
    duelChallengeId: challenge.id,
    challengerCharacterId: challenger.characterId,
    targetCharacterId: target.characterId,
    status: "active",
    actingCharacterId: challenger.characterId,
    turn: 1,
    version: 1,
    turnExpiresAt: new Date("2026-07-17T12:00:23.000Z"),
    completedAt: null,
    challengerChatId: null,
    challengerMessageId: null,
    targetChatId: null,
    targetMessageId: null,
    createdAt: new Date("2026-07-17T12:00:00.000Z"),
    updatedAt: new Date("2026-07-17T12:00:00.000Z"),
    challenge,
    state: {
      mode: "turn-based",
      status: "active",
      rulesVersion: "turn-based-duel-v1",
      balanceVersion: "instant-duel-v2",
      turn: 1,
      actingCharacterId: challenger.characterId,
      participants: { challenger, target }
    }
  };
  return {
    state: "active" as const,
    challenge,
    challenger,
    target,
    session,
    turnExpiresAt: session.turnExpiresAt,
    now: new Date("2026-07-17T12:00:00.000Z")
  } as unknown as ActiveView;
}
