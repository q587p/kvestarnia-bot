import type { Bot } from "grammy";
import { describe, expect, it, vi } from "vitest";
import { createDuelTurnTimeoutScheduler } from "../../src/bot/duelTurnTimeoutScheduler";
import type { DuelChallengeService } from "../../src/services/duelChallengeService";

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
});
