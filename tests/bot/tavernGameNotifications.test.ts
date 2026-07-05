import type { Context } from "grammy";
import { describe, expect, it, vi } from "vitest";
import { notifyTavernGameParticipants } from "../../src/bot/tavernGameNotifications";
import { startDicePokerTable, startQuickDicePoker } from "../../src/domain/dicePoker";

const TOKEN = "12345678-1234-4234-9234-123456789abc";

describe("tavern game notifications", () => {
  it("sends the creator viewer-specific quick dice controls after a deep-link auto-start", async () => {
    const creatorDice = startQuickDicePoker("creator-deep-link-start");
    const joinerDice = startQuickDicePoker("joiner-deep-link-start");
    const sendMessage = vi.fn().mockResolvedValue({});
    const ctx = contextWithSendMessage(sendMessage);
    const session = tavernGameSession({
      gameKey: "kosti",
      status: "ready",
      result: {
        ...startDicePokerTable("quick"),
        phase: "playing" as const
      },
      participants: [
        tavernGameParticipant(93n, "character-creator", "Kyjivan BooksDragon", "joined", creatorDice),
        tavernGameParticipant(42n, "character-joiner", "Shannar de Kassal", "joined", joinerDice)
      ]
    });

    await notifyTavernGameParticipants(ctx, { state: "started", session }, 42n, {
      botUsername: "kvestarnia_test_bot"
    });

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(
      93,
      expect.stringContaining("Партія почалась."),
      expect.objectContaining({ parse_mode: "HTML" })
    );
    const text = String(sendMessage.mock.calls[0]?.[1]);
    const keyboard = JSON.stringify(sendMessage.mock.calls[0]?.[2]);
    expect(text).toContain("Твої кості:");
    expect(text).not.toContain("Чекаємо другого гравця");
    expect(keyboard).toContain(`v1:sh:gpr:${TOKEN}`);
    expect(keyboard).toContain(`v1:sh:gdt:${TOKEN}:`);
  });

  it("sends the creator Tavlei decision controls after a deep-link join makes the table ready", async () => {
    const sendMessage = vi.fn().mockResolvedValue({});
    const ctx = contextWithSendMessage(sendMessage);
    const session = tavernGameSession({
      status: "ready",
      participants: [
        tavernGameParticipant(93n, "character-creator", "Kyjivan BooksDragon", "joined", null),
        tavernGameParticipant(42n, "character-joiner", "Shannar de Kassal", "joined", null)
      ]
    });

    await notifyTavernGameParticipants(ctx, { state: "joined", session }, 42n, {
      botUsername: "kvestarnia_test_bot"
    });

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(
      93,
      expect.stringContaining("До столу підсів ще один пригодник."),
      expect.objectContaining({ parse_mode: "HTML" })
    );
    const text = String(sendMessage.mock.calls[0]?.[1]);
    const keyboard = JSON.stringify(sendMessage.mock.calls[0]?.[2]);
    expect(text).toContain("Оберіть тактику.");
    expect(keyboard).toContain(`v1:sh:gt:${TOKEN}:`);
    expect(keyboard).toContain("v1:sh:gm");
  });
});

function contextWithSendMessage(sendMessage: ReturnType<typeof vi.fn>): Context {
  return {
    api: {
      sendMessage
    }
  } as unknown as Context;
}

function tavernGameSession(overrides: Record<string, unknown> = {}) {
  const now = new Date("2026-07-02T10:00:00.000Z");
  const participants = (overrides.participants as ReturnType<typeof tavernGameParticipant>[] | undefined) ?? [
    tavernGameParticipant(93n, "character-creator", "Kyjivan BooksDragon", "joined", null)
  ];

  return {
    id: "tavern-game-session-1",
    token: TOKEN,
    gameKey: "tavlei",
    status: "open",
    creatorCharacterId: "character-creator",
    stakeGold: 1,
    potGold: participants.length,
    seed: "seed",
    rulesVersion: "dice-poker-v1",
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
