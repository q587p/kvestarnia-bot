import { describe, expect, it } from "vitest";
import {
  presentPartyBoss,
  presentPartyBossJournal
} from "../../src/bot/presenters/partySessionPresenter";
import type { PartyBossSessionRecord } from "../../src/db/repositories/partyBossRepository";

describe("party session presenter", () => {
  it("marks Big Barrel Brother focus on participant rows instead of the boss row", () => {
    const text = presentPartyBoss(makeBigBossSession());

    expect(text).toContain("Увага боса: Голова.");
    expect(text).toContain("🎯 Голова · 0 шкоди");
    expect(text).toContain("▪️ Шкодійка · 0 шкоди");
  });

  it("marks every living participant on the Big Barrel Brother broad-turn cadence", () => {
    const text = presentPartyBoss(makeBigBossSession({ turn: 4 }));

    expect(text).toContain("Увага боса: вся жива ватага.");
    expect(text).toContain("🎯 Голова · 0 шкоди");
    expect(text).toContain("🎯 Шкодійка · 0 шкоди");
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
    expect(text).toContain("Бос огризнувся: Голова, Шкодійка · 12 шкоди разом.");
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
