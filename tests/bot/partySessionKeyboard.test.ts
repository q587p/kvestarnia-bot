import { describe, expect, it } from "vitest";
import {
  buildPartyBossKeyboard,
  buildPartyBossJournalKeyboard,
  buildPartySessionInviteShareKeyboard,
  buildPartySessionKeyboard,
  buildPartySessionNearbyCandidatesKeyboard
} from "../../src/bot/keyboards/partySessionKeyboard";
import type { PartyBossSessionRecord } from "../../src/db/repositories/partyBossRepository";
import type { PartySessionRecord } from "../../src/db/repositories/partySessionRepository";

describe("party session keyboard", () => {
  it("shows the dev expiry helper only when explicitly allowed", () => {
    const session = makeSession();

    expect(keyboardText(buildPartySessionKeyboard(session, {
      viewerCharacterId: session.leaderCharacterId,
      includeDevExpire: true
    }))).toContain("⏱️ Dev: завершити строк");
    expect(keyboardText(buildPartySessionKeyboard(session, {
      viewerCharacterId: session.leaderCharacterId,
      includeDevExpire: true
    }))).toContain("🧪 Dev: бос-проба");
    expect(keyboardText(buildPartySessionKeyboard(session, {
      viewerCharacterId: session.leaderCharacterId,
      includeDevExpire: false
    }))).not.toContain("⏱️ Dev: завершити строк");
  });

  it("shows compact party boss actions only to active participants", () => {
    const session = makeBossSession();

    expect(inlineButtonTexts(buildPartyBossKeyboard(session, "character-1", {
      includeDevTimeout: true
    }))).toEqual([
      "🗡️ Вдарити",
      "🛡 Захищатися",
      "🪓 Силовий замах",
      "🧰 Практична імпровізація",
      "⏱️ Dev: добити хід",
      "🔎 Оновити"
    ]);
    expect(inlineButtonTexts(buildPartyBossKeyboard(session, null))).toEqual([
      "🔎 Оновити"
    ]);
  });

  it("shows the Big Barrel Brother raid start without dev proof helpers", () => {
    const session = {
      ...makeSession(),
      originLocationId: "barrel.big-brother"
    };

    const keyboard = buildPartySessionKeyboard(session, {
      viewerCharacterId: session.leaderCharacterId,
      inviteUrl: "https://t.me/kvestarnia_test_bot?start=party_partyABC12",
      includeBossStart: true,
      includeDevExpire: false
    });

    expect(inlineButtonTexts(keyboard)).toEqual([
      "🚪 Вийти",
      "🧹 Скасувати збір",
      "🛢️ Почати рейд",
      "📣 Запрошення на рейд",
      "🔗 Запросити в рейд",
      "🔎 Оновити"
    ]);
    expect(keyboardText(keyboard)).toContain("https://t.me/share/url");
    expect(keyboardText(keyboard)).toContain("party_partyABC12");
    expect(keyboardText(keyboard)).toContain("v1:party:sh:partyABC12");
  });

  it("rotates Big Barrel Brother invite-card text", () => {
    const keyboard = buildPartySessionInviteShareKeyboard("partyABC12", 12);

    expect(inlineButtonTexts(keyboard)).toEqual(["🎲 Інший текст"]);
    expect(keyboardText(keyboard)).toContain("v1:party:in:partyABC12:c");
  });

  it("hides party boss action buttons from knocked-out participants", () => {
    const session = makeBossSession({
      status: "knocked-out",
      hp: 0
    });

    expect(inlineButtonTexts(buildPartyBossKeyboard(session, "character-1", {
      includeDevTimeout: true
    }))).toEqual([
      "⏱️ Dev: добити хід",
      "🔎 Оновити"
    ]);
  });

  it("hides unavailable concrete party boss skills like ordinary combat", () => {
    const session = makeBossSession({ classId: "class.mage", mana: 0 });

    expect(inlineButtonTexts(buildPartyBossKeyboard(session, "character-1"))).toEqual([
      "🗡️ Вдарити",
      "🛡 Захищатися",
      "🧰 Практична імпровізація",
      "🔎 Оновити"
    ]);
  });

  it("shows the party boss journal only after the battle ends", () => {
    const session = makeBossSession({}, { status: "won" });

    expect(inlineButtonTexts(buildPartyBossKeyboard(session, "character-1"))).toEqual([
      "📜 Журнал",
      "🔎 Оновити"
    ]);
  });

  it("paginates terminal party boss journal entries", () => {
    const session = makeBossSession({}, {
      status: "won",
      roundLogLength: 3
    });

    expect(inlineButtonTexts(buildPartyBossJournalKeyboard(session, 1))).toEqual([
      "⏮️ Початок",
      "◀️ Назад",
      "2/3",
      "Далі ▶️",
      "Кінець ⏭️",
      "↩️ До результатів"
    ]);
  });

  it("shows nearby party invite rows without duel actions", () => {
    const keyboard = buildPartySessionNearbyCandidatesKeyboard({
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
          name: "Shannar de Kassal",
          level: 8,
          status: "active"
        }
      ]
    });

    expect(inlineButtonTexts(keyboard)).toEqual([
      "🧭 Покликати у ватагу: Shannar de Kassal · 8",
      "🔎 Оновити"
    ]);
    expect(keyboardText(keyboard)).not.toContain("⚔️");
    expect(keyboardText(keyboard)).not.toContain("v1:nd:");
  });
});

function inlineButtonTexts(keyboard: { inline_keyboard: Array<Array<{ text: string }>> }): string[] {
  return keyboard.inline_keyboard.flatMap((row) => row.map((button) => button.text));
}

function makeBossSession(
  participantOverrides: { status?: "active" | "knocked-out"; hp?: number; mana?: number; classId?: string } = {},
  sessionOverrides: { status?: PartyBossSessionRecord["status"]; roundLogLength?: number } = {}
): PartyBossSessionRecord {
  const now = new Date("2026-06-30T10:00:00.000Z");
  const participant = makeCharacter("character-1", 42n);

  return {
    id: "boss-1",
    partySessionId: "party-1",
    partyInviteToken: "partyABC12",
    leaderCharacterId: "character-1",
    status: sessionOverrides.status ?? "active",
    turn: 1,
    version: 1,
    rulesVersion: "party-boss-proof-v1",
    bossKey: "party-boss-proof-one",
    turnExpiresAt: new Date("2026-06-30T10:00:23.000Z"),
    completedAt: null,
    result: null,
    participants: [participant],
    state: {
      rulesVersion: "party-boss-proof-v1",
      partySessionId: "party-1",
      status: sessionOverrides.status ?? "active",
      turn: 1,
      boss: {
        monsterId: "party-boss-proof-one",
        name: "Контрольний Бос",
        level: 3,
        hp: 42,
        hpMax: 42,
        attack: 8,
        armor: 2,
        resist: 1,
        dexterity: 5,
        tags: ["party-boss-proof"]
      },
      participants: [
        {
          characterId: "character-1",
          name: "Тестовий Лідер",
          remortCount: 0,
          status: participantOverrides.status ?? "active",
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
            classId: participantOverrides.classId ?? "class.warrior"
          },
          resources: {
            hp: participantOverrides.hp ?? 25,
            hpMax: 25,
            mana: participantOverrides.mana ?? 10,
            manaMax: 10
          },
          contribution: {
            submittedActions: 0,
            timeoutActions: 0,
            damageDealt: 0,
            damageTaken: 0
          }
        }
      ],
      roundLog: Array.from({ length: sessionOverrides.roundLogLength ?? 0 }, (_unused, index) => ({
        turn: index + 1,
        actions: [],
        bossDamage: 0,
        bossHpAfter: 42,
        bossRetaliations: [],
        statusAfter: index + 1 === (sessionOverrides.roundLogLength ?? 0) ? "won" : "active"
      })),
      startedAt: now.toISOString()
    }
  };
}

function keyboardText(keyboard: unknown): string {
  return JSON.stringify(keyboard);
}

function makeSession(): PartySessionRecord {
  const now = new Date("2026-06-29T15:00:00.000Z");

  return {
    id: "party-1",
    inviteToken: "partyABC12",
    status: "recruiting",
    leaderCharacterId: "character-1",
    periodId: "12026-06-29",
    originLocationId: "korchma.board",
    participantCap: 8,
    minimumParticipants: 1,
    joinUntilAt: new Date("2026-06-29T15:13:00.000Z"),
    expiresAt: new Date("2026-06-29T15:13:00.000Z"),
    version: 1,
    activeLeaderKey: "party-leader:character-1",
    createdAt: now,
    updatedAt: now,
    leader: makeCharacter("character-1", 42n),
    participants: [
      {
        id: "participant-1",
        sessionId: "party-1",
        characterId: "character-1",
        remortCount: 0,
        status: "joined",
        joinSource: "leader",
        joinedAt: now,
        leftAt: null,
        chatId: 42n,
        messageId: 13,
        character: makeCharacter("character-1", 42n)
      }
    ]
  };
}

function makeCharacter(id: string, telegramUserId: bigint): PartySessionRecord["leader"] {
  return {
    id,
    userId: `user-${id}`,
    telegramUserId,
    currentLocationId: "korchma.board",
    name: "Тестовий Лідер",
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
