import { describe, expect, it } from "vitest";
import {
  BIG_BARREL_INVITE_TEMPLATES,
  getInitialBigBarrelInviteTemplateIndex,
  getNextBigBarrelInviteTemplateIndex,
  presentPartyInviteShare,
  presentPartyBoss,
  presentPartyBossIntro,
  presentPartyBossJournal
} from "../../src/bot/presenters/partySessionPresenter";
import type { PartyBossSessionRecord } from "../../src/db/repositories/partyBossRepository";
import type { PartySessionRecord } from "../../src/db/repositories/partySessionRepository";

describe("party session presenter", () => {
  it("marks Big Barrel Brother focus on participant rows instead of the boss row", () => {
    const text = presentPartyBoss(makeBigBossSession());

    expect(text).toContain("🛢️ <b>Бій: 1 хід</b>");
    expect(text).toContain("👹 Старший Брат Бочки: HP 55/100");
    expect(text).toContain("▪️ Голова: HP 60/60 · мана 20/20 ← 🎯 ціль боса");
    expect(text).toContain("▪️ Шкодійка: HP 60/60 · мана 20/20");
    expect(text).toContain("⏳ На хід є 23 секунди.");
  });

  it("marks every living participant on the Big Barrel Brother broad-turn cadence", () => {
    const text = presentPartyBoss(makeBigBossSession({ turn: 4 }));

    expect(text).toContain("▪️ Голова: HP 60/60 · мана 20/20 ← 🎯 ціль боса");
    expect(text).toContain("▪️ Шкодійка: HP 60/60 · мана 20/20 ← 🎯 ціль боса");
  });

  it("renders the Big Barrel Brother intro as a separate start card", () => {
    const text = presentPartyBossIntro(makeBigBossSession());

    expect(text).toContain("🛢️ <b>Старший Брат Бочки втрутився</b>");
    expect(text).toContain("👥 Ватага: Голова, Шкодійка");
    expect(text).toContain("👹 Проти вас: Старший Брат Бочки · рівень 9");
    expect(text).toContain("💡 Порада дня:");
  });

  it("renders Big Barrel Brother journal hits with player names", () => {
    const text = presentPartyBossJournal(makeBigBossSession({
      roundLog: [{
        turn: 4,
        actions: [
          {
            characterId: "leader",
            action: "defend",
            origin: "manual",
            outcome: "defended",
            damage: 0,
            manaSpent: 0
          },
          {
            characterId: "striker",
            action: "attack",
            origin: "manual",
            outcome: "hit",
            damage: 13,
            manaSpent: 0
          }
        ],
        bossDamage: 13,
        bossHpAfter: 42,
        bossRetaliations: [
          { characterId: "leader", damage: 5, hpAfter: 55 },
          { characterId: "striker", damage: 7, hpAfter: 53 }
        ],
        statusAfter: "active"
      }]
    }));

    expect(text).toContain("📜 <b>Журнал бою</b>");
    expect(text).toContain("Початок: хід <b>4</b> · 1/1");
    expect(text).toContain("🎯 Ціль боса: Голова, Шкодійка.");
    expect(text).toContain("Бос огризнувся: 12 шкоди разом.");
    expect(text).toContain("🎯 На наступний хід увага боса переходить на Шкодійка.");
  });

  it("declines singular participant wording in the last Big Barrel Brother action", () => {
    const text = presentPartyBoss(makeBigBossSession({
      turn: 2,
      roundLog: [{
        turn: 1,
        actions: [{
          characterId: "striker",
          action: "attack",
          origin: "manual",
          outcome: "hit",
          damage: 13,
          manaSpent: 0
        }],
        bossDamage: 13,
        bossHpAfter: 42,
        bossRetaliations: [
          { characterId: "leader", damage: 5, hpAfter: 55 }
        ],
        statusAfter: "active"
      }]
    }));

    expect(text).toContain("— Старший Брат Бочки влучає у Голова на 5.");
    expect(text).toContain("🎯 Увага боса перемкнулася на Шкодійка.");
  });

  it("explains a Big Barrel Brother loss with remaining boss HP and attempt XP", () => {
    const text = presentPartyBoss(makeBigBossSession({
      status: "lost",
      boss: {
        ...makeBigBossSession().state.boss,
        hp: 104,
        hpMax: 216
      }
    }));

    expect(text).toContain("Стан: Старший Брат Бочки пережив рейд");
    expect(text).toContain("Старший Брат Бочки вистояв із 104/216 HP.");
    expect(text).toContain("досвід за спробу");
  });

  it("renders a forwardable Big Barrel Brother invite card with visible URL and rotating text", () => {
    expect(BIG_BARREL_INVITE_TEMPLATES).toHaveLength(13);

    const session = makePartySession();
    const initial = getInitialBigBarrelInviteTemplateIndex(session.inviteToken);
    const next = getNextBigBarrelInviteTemplateIndex(session.inviteToken, initial);
    const firstText = presentPartyInviteShare(
      session,
      "https://t.me/kvestarnia_test_bot?start=party_partyBIG12",
      { templateIndex: initial }
    );
    const nextText = presentPartyInviteShare(
      session,
      "https://t.me/kvestarnia_test_bot?start=party_partyBIG12",
      { templateIndex: next }
    );

    expect(firstText).toContain("https://t.me/kvestarnia_test_bot?start=party_partyBIG12");
    expect(firstText).toContain("Ватажок: <b>Голова</b>");
    expect(firstText).toContain("Учасників: <b>2/8</b>");
    expect(nextText).not.toBe(firstText);
  });
});

function makeBigBossSession(
  stateOverrides: Partial<PartyBossSessionRecord["state"]> = {}
): PartyBossSessionRecord {
  const now = new Date("2026-06-30T10:00:00.000Z");
  const state: PartyBossSessionRecord["state"] = {
    rulesVersion: "big-barrel-brother-v1",
    partySessionId: "party-big",
    status: "active",
    turn: 1,
    boss: {
      monsterId: "big-barrel-brother",
      name: "Старший Брат Бочки",
      level: 9,
      hp: 55,
      hpMax: 100,
      attack: 14,
      armor: 4,
      resist: 2,
      dexterity: 8,
      tags: ["boss", "barrel"]
    },
    participants: [
      participant("leader", "Голова"),
      participant("striker", "Шкодійка")
    ],
    roundLog: [],
    startedAt: now.toISOString(),
    ...stateOverrides
  };

  return {
    id: "boss-big",
    partySessionId: "party-big",
    partyInviteToken: "partyBIG12",
    leaderCharacterId: "leader",
    status: state.status,
    turn: state.turn,
    version: 1,
    rulesVersion: "big-barrel-brother-v1",
    bossKey: "big-barrel-brother",
    state,
    result: null,
    turnExpiresAt: new Date("2026-06-30T10:00:23.000Z"),
    completedAt: null,
    participants: []
  };
}

function participant(
  characterId: string,
  name: string
): PartyBossSessionRecord["state"]["participants"][number] {
  return {
    characterId,
    name,
    remortCount: 0,
    status: "active",
    combatStats: {
      level: 8,
      hpMax: 60,
      manaMax: 20,
      hpCurrent: 60,
      manaCurrent: 20,
      strength: 10,
      dexterity: 10,
      intelligence: 10,
      charisma: 10,
      luck: 10,
      raceId: "race.human-ish",
      classId: "class.warrior"
    },
    resources: {
      hp: 60,
      hpMax: 60,
      mana: 20,
      manaMax: 20
    },
    contribution: {
      submittedActions: 0,
      timeoutActions: 0,
      damageDealt: 0,
      damageTaken: 0
    }
  };
}

function makePartySession(): PartySessionRecord {
  const now = new Date("2026-06-30T10:00:00.000Z");
  const leader = makePartyCharacter("leader", "Голова", 42n);
  const member = makePartyCharacter("striker", "Шкодійка", 93n);

  return {
    id: "party-big",
    inviteToken: "partyBIG12",
    status: "recruiting",
    leaderCharacterId: leader.id,
    periodId: "12026-06-30T10:23",
    originLocationId: "barrel.big-brother",
    participantCap: 8,
    minimumParticipants: 1,
    joinUntilAt: new Date("2026-06-30T10:13:00.000Z"),
    expiresAt: new Date("2026-06-30T10:13:00.000Z"),
    version: 1,
    activeLeaderKey: "party-leader:leader",
    createdAt: now,
    updatedAt: now,
    leader,
    participants: [
      partyParticipant("participant-leader", leader, now),
      partyParticipant("participant-striker", member, now)
    ]
  };
}

function partyParticipant(
  id: string,
  character: PartySessionRecord["leader"],
  joinedAt: Date
): PartySessionRecord["participants"][number] {
  return {
    id,
    sessionId: "party-big",
    characterId: character.id,
    remortCount: 0,
    status: "joined",
    joinSource: "nearby",
    joinedAt,
    leftAt: null,
    chatId: character.telegramUserId,
    messageId: 13,
    character
  };
}

function makePartyCharacter(
  id: string,
  name: string,
  telegramUserId: bigint
): PartySessionRecord["leader"] {
  return {
    id,
    userId: `user-${id}`,
    telegramUserId,
    currentLocationId: "location.korchma.barrel",
    name,
    pronoun: "they",
    path: "path.boundary",
    raceId: "race.human-ish",
    classId: "class.warrior",
    level: 8,
    xp: 42,
    gold: 13,
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
