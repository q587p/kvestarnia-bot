import { describe, expect, it } from "vitest";
import {
  BIG_BARREL_APPROACH_TEMPLATES,
  BIG_BARREL_INVITE_TEMPLATES,
  getInitialBigBarrelApproachTemplateIndex,
  getInitialBigBarrelInviteTemplateIndex,
  getNextBigBarrelApproachTemplateIndex,
  getNextBigBarrelInviteTemplateIndex,
  presentBigBarrelApproachNotice,
  presentPartyCreate,
  presentPartyInviteShare,
  presentPartySession,
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
    const text = presentPartyBossIntro(makeBigBossSession(), "leader");

    expect(text).toContain("🛢️ <b>Старший Брат Бочки втрутився</b>");
    expect(text).toContain("👥 Ватага: Голова, Шкодійка");
    expect(text).toContain("👹 Проти вас: Старший Брат Бочки · рівень 9");
    expect(text).toContain("<i>Порада дня:");
    expect(text).not.toContain("зайдіть у бойову картку");
  });

  it("renders Big Barrel Brother journal hits with player names", () => {
    const leader = participant("leader", "Голова");
    leader.resources.cooldowns = {
      abilities: {
        "ability.race.step-through-the-border": {
          id: "ability.race.step-through-the-border",
          remainingTurns: 2
        }
      }
    };
    const text = presentPartyBossJournal(makeBigBossSession({
      participants: [leader, participant("striker", "Шкодійка")],
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
        participantsAfter: [
          { characterId: "leader", status: "active", hp: 55, hpMax: 60, mana: 19, manaMax: 20 },
          { characterId: "striker", status: "active", hp: 53, hpMax: 60, mana: 20, manaMax: 20 }
        ],
        statusAfter: "active"
      }]
    }));

    expect(text).toContain("📜 <b>Журнал бою</b>");
    expect(text).toContain("Хід <b>4</b> · запис 1/1");
    expect(text).toContain("👹 Старший Брат Бочки після ходу: 42/100");
    expect(text).toContain("▪️ Голова після ходу: HP 55/60 · мана 19/20 ← 🎯 ціль боса");
    expect(text).toContain("▪️ Шкодійка після ходу: HP 53/60 · мана 20/20 ← 🎯 ціль боса");
    expect(text).toContain("<b>Останні дії:</b>");
    expect(text).toContain("Старший Брат Бочки застосував 🛢️ <i>Бочковий гуркіт</i>: Голова отримує 5 шкоди; Шкодійка отримує 7 шкоди.");
    expect(text).toContain("<b>Кулдауни та ефекти:</b>");
    expect(text).toContain("Голова: 🫁 🌀 <i>Крок крізь Межу</i> відсапується: ще 2 ходи.");
    expect(text).toContain("🎯 На наступний хід увага боса переходить на Шкодійка.");
    expect(text).not.toContain("Бос отримав:");
  });

  it("names the Big Barrel Brother broad attack in the active battle card", () => {
    const text = presentPartyBoss(makeBigBossSession({
      turn: 5,
      roundLog: [{
        turn: 4,
        actions: [
          {
            characterId: "leader",
            action: "attack",
            origin: "manual",
            outcome: "hit",
            damage: 8,
            manaSpent: 0
          },
          {
            characterId: "striker",
            action: "attack",
            origin: "manual",
            outcome: "miss",
            damage: 0,
            manaSpent: 0
          }
        ],
        bossDamage: 8,
        bossHpAfter: 42,
        bossRetaliations: [
          { characterId: "leader", damage: 5, hpAfter: 55 },
          { characterId: "striker", damage: 7, hpAfter: 53 }
        ],
        statusAfter: "active"
      }]
    }));

    expect(text).toContain("Старший Брат Бочки застосовує 🛢️ <i>Бочковий гуркіт</i>: Голова отримує 5 шкоди; Шкодійка отримує 7 шкоди.");
    expect(text).not.toContain("Старший Брат Бочки зачіпає Голова");
  });

  it("renders the last Big Barrel Brother action like an ordinary battle scene", () => {
    const leader = participant("leader", "Голова");
    const striker = participant("striker", "Шкодійка");
    leader.resources.cooldowns = {
      abilities: {
        "ability.race.step-through-the-border": {
          id: "ability.race.step-through-the-border",
          remainingTurns: 4
        }
      }
    };
    striker.resources.cooldowns = {
      skill: {
        id: "skill.ricochet-shot",
        remainingTurns: 2
      }
    };
    const text = presentPartyBoss(makeBigBossSession({
      turn: 2,
      participants: [leader, striker],
      roundLog: [{
        turn: 1,
        actions: [
          {
            characterId: "leader",
            action: "race",
            origin: "manual",
            outcome: "hit",
            damage: 10,
            manaSpent: 1,
            skillId: "ability.race.step-through-the-border"
          },
          {
            characterId: "striker",
            action: "defend",
            origin: "timeout",
            outcome: "defended",
            damage: 0,
            manaSpent: 0
          }
        ],
        bossDamage: 10,
        bossHpAfter: 42,
        bossRetaliations: [
          { characterId: "leader", damage: 5, hpAfter: 55 }
        ],
        statusAfter: "active"
      }]
    }), { viewerCharacterId: "leader" });

    expect(text).toContain("Ваше вміння 🌀 <i>Крок крізь Межу</i> влучає на 10 шкоди.");
    expect(text).toContain("Шкодійка: Корчма не дочекалася вибору й поставила в захист: ворогові важче влучити, а удар буде слабшим.");
    expect(text).toContain("Старший Брат Бочки атакує Голова у відповідь і завдає 5 шкоди.");
    expect(text).toContain("🫁 🌀 <i>Крок крізь Межу</i> відсапується: ще 4 ходи.");
    expect(text).toContain("<b>Останні дії:</b>");
    expect(text.indexOf("🫁 🌀 <i>Крок крізь Межу</i> відсапується")).toBeLessThan(text.indexOf("<b>Останні дії:</b>"));
    expect(text).not.toContain("Рикошетний постріл відсапується");
    expect(text).not.toContain("Ватага зняла");
  });

  it("does not claim the Big Barrel Brother focus switched when it stayed on the same participant", () => {
    const session = makeBigBossSession({
      turn: 2,
      roundLog: [{
        turn: 1,
        actions: [{
          characterId: "leader",
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
    });

    const text = presentPartyBoss(session);
    const journal = presentPartyBossJournal(session);

    expect(text).toContain("Старший Брат Бочки атакує Голова у відповідь і завдає 5 шкоди.");
    expect(text).not.toContain("🎯 Увага боса перемкнулася на Голова.");
    expect(journal).not.toContain("🎯 На наступний хід увага боса переходить на Голова.");
  });

  it("explains a Big Barrel Brother loss with remaining boss HP and attempt XP", () => {
    const leader = participant("leader", "Голова");
    leader.contribution = {
      submittedActions: 1,
      timeoutActions: 0,
      damageDealt: 12,
      damageTaken: 5
    };
    const text = presentPartyBoss(makeBigBossSession({
      status: "lost",
      boss: {
        ...makeBigBossSession().state.boss,
        hp: 104,
        hpMax: 216
      },
      participants: [leader, participant("striker", "Шкодійка")]
    }), { viewerCharacterId: "leader" });

    expect(text).toContain("Стан: Старший Брат Бочки пережив рейд");
    expect(text).toContain("💤 Ватага програла. Старший Брат Бочки вистояв із 104/216 HP.");
    expect(text).toContain("Пива цього разу не виставити");
    expect(text).toContain("🎒 За спробу:\n+10 XP");
  });

  it("renders a Big Barrel Brother victory with the viewer's stored rewards", () => {
    const session = makeBigBossSession({
      status: "won",
      completedAt: "2026-06-30T10:01:00.000Z",
      boss: {
        ...makeBigBossSession().state.boss,
        hp: 0,
        hpMax: 216
      }
    });
    session.status = "won";
    session.completedAt = new Date("2026-06-30T10:01:00.000Z");
    session.result = {
      status: "won",
      completedAt: "2026-06-30T10:01:00.000Z",
      bossHpAfter: 0,
      participants: [
        {
          characterId: "leader",
          status: "active",
          damageDealt: 12,
          submittedActions: 1,
          timeoutActions: 0,
          reward: {
            xp: 2,
            gold: 4,
            itemGrants: [
              {
                itemId: "item.self-check-mirror",
                name: "Дзеркальце Самоперевірки",
                quantity: 1
              }
            ]
          }
        }
      ]
    };

    const text = presentPartyBoss(session, { viewerCharacterId: "leader" });

    expect(text).toContain("🎉 Ви перемогли. Проблема закрита, журнал задоволено хрумтить сторінкою.");
    expect(text).toContain("Винагорода за бій:\n<b>+2 XP\n+4 золота</b>");
    expect(text).toContain("Здобуто: <i>Дзеркальце Самоперевірки</i>");
    expect(text).not.toContain("нагороди збережено");
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

  it("renders stable rotating Big Barrel Brother approach notices", () => {
    expect(BIG_BARREL_APPROACH_TEMPLATES).toHaveLength(13);

    const initial = getInitialBigBarrelApproachTemplateIndex("partyBIG12");
    const next = getNextBigBarrelApproachTemplateIndex("partyBIG12", initial);
    const firstText = presentBigBarrelApproachNotice("partyBIG12", { templateIndex: initial });
    const nextText = presentBigBarrelApproachNotice("partyBIG12", { templateIndex: next });

    expect(firstText).toContain("Ви підійшли до Бочки Пінного Міражу.");
    expect(firstText).toContain("ватаг");
    expect(firstText).toContain("рейд");
    expect(nextText).not.toBe(firstText);
  });

  it("keeps the Big Barrel Brother recruiting card free of the invite URL", () => {
    const session = makePartySession();
    const text = presentPartySession(session, {
      inviteUrl: "https://t.me/kvestarnia_test_bot?start=party_partyBIG12"
    });
    const createdText = presentPartyCreate({ state: "created", session }, {
      inviteUrl: "https://t.me/kvestarnia_test_bot?start=party_partyBIG12"
    });

    expect(text).toContain("🛢️ <b>Збір до Старшого Брата Бочки</b>");
    expect(text).not.toContain("Запрошення:");
    expect(text).not.toContain("https://t.me/kvestarnia_test_bot?start=party_partyBIG12");
    expect(text).not.toContain("Бочку довго ображали словом «меблі»");
    expect(createdText).not.toContain("Бочку довго ображали словом «меблі»");
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
    participants: [
      bossParticipantSnapshot("leader", "Голова", 42n),
      bossParticipantSnapshot("striker", "Шкодійка", 93n)
    ]
  };
}

function bossParticipantSnapshot(
  id: string,
  name: string,
  telegramUserId: bigint
): PartyBossSessionRecord["participants"][number] {
  return {
    ...makePartyCharacter(id, name, telegramUserId),
    remortCount: 0
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
