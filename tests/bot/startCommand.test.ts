import type { Context } from "grammy";
import { describe, expect, it, vi } from "vitest";
import {
  buildExistingCharacterReplyOptions,
  sendTavernGameJoinFromStartPayload
} from "../../src/bot/commands/startCommand";
import type { OnboardingService } from "../../src/services/onboardingService";
import type { TavernGameService } from "../../src/services/tavernGameService";

describe("start command", () => {
  it("uses Telegram HTML parse mode for existing hero summary", () => {
    const options = buildExistingCharacterReplyOptions();

    expect(options.parse_mode).toBe("HTML");
    expect(options.reply_markup).toBeDefined();
  });

  it("notifies existing tavern-game participants after a game deep-link join", async () => {
    const session = tavernGameSession({
      status: "ready",
      participants: [
        tavernGameParticipant(93n, "character-creator", "Kyjivan BooksDragon", "joined", null),
        tavernGameParticipant(42n, "character-joiner", "Shannar de Kassal", "joined", null)
      ]
    });
    const joinByTokenForTelegramUser = vi.fn().mockResolvedValue({ state: "joined", session });
    const reply = vi.fn().mockResolvedValue(undefined);
    const sendMessage = vi.fn().mockResolvedValue(undefined);

    await sendTavernGameJoinFromStartPayload(
      { reply, api: { sendMessage } } as unknown as Context,
      { start: vi.fn() } as unknown as OnboardingService,
      { joinByTokenForTelegramUser } as unknown as TavernGameService,
      { telegramUserId: 42n, displayName: "Shannar de Kassal" },
      session.token,
      { botUsername: "kvestarnia_test_bot" }
    );

    expect(joinByTokenForTelegramUser).toHaveBeenCalledWith(42n, session.token);
    expect(reply).toHaveBeenCalledWith(
      expect.stringContaining("♟ Тавлеї · ставка <b>1 зол.</b>"),
      expect.objectContaining({ parse_mode: "HTML" })
    );
    expect(sendMessage).toHaveBeenCalledWith(
      93,
      expect.stringContaining("До столу підсів ще один пригодник."),
      expect.objectContaining({ parse_mode: "HTML" })
    );
    expect(JSON.stringify(sendMessage.mock.calls[0]?.[2])).toContain(`v1:sh:gt:${session.token}:`);
  });
});

function tavernGameSession(overrides: Record<string, unknown> = {}) {
  const now = new Date("2026-07-02T10:00:00.000Z");
  const participants = (overrides.participants as ReturnType<typeof tavernGameParticipant>[] | undefined) ?? [
    tavernGameParticipant(93n, "character-creator", "Kyjivan BooksDragon", "joined", null)
  ];

  return {
    id: "tavern-game-session-1",
    token: "12345678-1234-4234-9234-123456789abc",
    gameKey: "tavlei",
    status: "open",
    creatorCharacterId: "character-creator",
    stakeGold: 1,
    potGold: participants.length,
    seed: "seed",
    rulesVersion: "test",
    result: null,
    openedAt: now,
    joinExpiresAt: new Date("2026-07-02T10:13:00.000Z"),
    decisionExpiresAt: new Date("2026-07-02T10:18:00.000Z"),
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    creator: tavernGameCharacter(93n, "character-creator", "Kyjivan BooksDragon"),
    participants,
    ...overrides
  };
}

function tavernGameParticipant(
  telegramUserId: bigint,
  characterId: string,
  displayName: string,
  status: string,
  decision: unknown
) {
  const now = new Date("2026-07-02T10:00:00.000Z");

  return {
    id: `participant-${characterId}`,
    sessionId: "tavern-game-session-1",
    characterId,
    telegramUserId,
    displayName,
    remortCount: 0,
    status,
    stakeGold: 1,
    payoutGold: 0,
    refundedGold: 0,
    decision,
    result: null,
    joinedAt: now,
    decidedAt: null,
    completedAt: null,
    character: tavernGameCharacter(telegramUserId, characterId, displayName)
  };
}

function tavernGameCharacter(telegramUserId: bigint, id: string, name: string) {
  return {
    id,
    userId: `user-${id}`,
    telegramUserId,
    currentLocationId: "location.korchma.bar",
    name,
    pronoun: "they",
    path: "path.boundary",
    raceId: "race.human-ish",
    classId: "class.warrior",
    level: 8,
    xp: 587,
    gold: 42,
    hpCurrent: 60,
    hpMax: 60,
    manaCurrent: 20,
    manaMax: 20,
    hpRegenAt: null,
    manaRegenAt: null,
    activeCosmeticTitleGrantId: null,
    statsJson: {},
    remortCount: 0
  };
}
