import { describe, expect, it } from "vitest";
import {
  buildPartyBossKeyboard,
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
      "⚔️ Вдарити",
      "🛡️ Захист",
      "✨ Вміння",
      "🧬 Раса",
      "⏱️ Dev: добити хід",
      "📜 Журнал",
      "🔎 Оновити"
    ]);
    expect(inlineButtonTexts(buildPartyBossKeyboard(session, null))).toEqual([
      "📜 Журнал",
      "🔎 Оновити"
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

function makeBossSession(): PartyBossSessionRecord {
  const now = new Date("2026-06-30T10:00:00.000Z");
  const participant = makeCharacter("character-1", 42n);

  return {
    id: "boss-1",
    partySessionId: "party-1",
    partyInviteToken: "partyABC12",
    leaderCharacterId: "character-1",
    status: "active",
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
      status: "active",
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
        }
      ],
      roundLog: [],
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
