import { describe, expect, it } from "vitest";
import {
  presentDuelResultShare,
  presentDuelView,
  presentTurnBasedDuel
} from "../../src/bot/presenters/duelPresenter";

describe("duel presenter", () => {
  it("shows only the viewer's queued turn-based choice before the round resolves", () => {
    const result = makeTurnBasedDuelView({
      pendingActions: {
        challenger: {
          actorCharacterId: "challenger-character",
          action: "attack"
        }
      }
    });

    const challengerText = presentTurnBasedDuel(result, { viewerCharacterId: "challenger-character" });
    const targetText = presentTurnBasedDuel(result, { viewerCharacterId: "target-character" });

    expect(challengerText).toContain("Ваш вибір");
    expect(challengerText).toContain("звичайна атака");
    expect(challengerText).not.toContain("Шкода:");
    expect(targetText).not.toContain("звичайна атака");
    expect(targetText).not.toContain("Шкода:");
    expect(targetText).toContain("записи закритими");
  });

  it("reveals round damage after both turn-based choices resolve", () => {
    const result = makeTurnBasedDuelView({
      lastRound: {
        turn: 2,
        actions: [
          {
            actorCharacterId: "challenger-character",
            defenderCharacterId: "target-character",
            action: "attack",
            outcome: "hit",
            damage: 7,
            manaSpent: 0,
            critical: false
          },
          {
            actorCharacterId: "target-character",
            defenderCharacterId: "challenger-character",
            action: "skill",
            outcome: "critical-hit",
            damage: 11,
            manaSpent: 2,
            critical: true,
            skillId: "skill.forceful-strike"
          }
        ]
      }
    });

    const text = presentTurnBasedDuel(result, { viewerCharacterId: "target-character" });

    expect(text).toContain("Звичайна атака записана в протокол.");
    expect(text).toContain("Класова дія записана в протокол.");
    expect(text).toContain("Шкода: <b>7</b>");
    expect(text).toContain("Шкода: <b>11</b> · критично");
  });

  it("shows the viewer's active turn-based skill cooldown", () => {
    const result = makeTurnBasedDuelView({
      participants: {
        challenger: {
          characterId: "challenger-character",
          displayName: "Ліва Рука",
          hp: 20,
          hpMax: 24,
          mana: 8,
          manaMax: 12,
          cooldowns: {
            skill: {
              id: "skill.forceful-strike",
              remainingTurns: 3
            }
          }
        },
        target: {
          characterId: "target-character",
          displayName: "Права Рука",
          hp: 19,
          hpMax: 25,
          mana: 9,
          manaMax: 13
        }
      }
    });

    const text = presentTurnBasedDuel(result, { viewerCharacterId: "challenger-character" });

    expect(text).toContain("🫁 Вміння відсапується: ще 3 ходи.");
  });

  it("uses explicit surrender copy for stored turn-based results", () => {
    const text = presentDuelView({
      state: "resolved",
      challenge: {
        mode: "turn-based",
        inviteToken: "abcDEF12"
      },
      challenger: {
        name: "Ліва Рука",
        level: 4
      },
      target: {
        name: "Права Рука",
        level: 4
      },
      result: {
        mode: "turn-based",
        terminalReason: "surrender",
        outcome: "challenger",
        winnerCharacterId: "challenger-character",
        loserCharacterId: "target-character",
        challengerScore: 12,
        targetScore: 3,
        swing: 3,
        flavorKey: "direct-hit"
      }
    } as never);

    expect(text).toContain("🏳️ <b>Права Рука</b> здається.");
    expect(text).toContain("<b>Ліва Рука</b> отримує перемогу");
  });

  it("shows stored XP rewards for turn-based results without claiming no XP", () => {
    const view = {
      state: "resolved",
      challenge: {
        mode: "turn-based",
        inviteToken: "abcDEF12"
      },
      challenger: {
        name: "Ліва Рука",
        level: 4
      },
      target: {
        name: "Права Рука",
        level: 4
      },
      result: {
        mode: "turn-based",
        terminalReason: "defeat",
        xpRewards: {
          challenger: 7,
          target: 1
        },
        outcome: "challenger",
        winnerCharacterId: "challenger-character",
        loserCharacterId: "target-character",
        challengerScore: 12,
        targetScore: 0,
        swing: 3,
        flavorKey: "direct-hit"
      }
    } as never;
    const text = presentDuelView(view);
    const share = presentDuelResultShare(view);

    expect(text).toContain("Досвід за дуель:");
    expect(text).toContain("<b>Ліва Рука +7 XP\nПрава Рука +1 XP</b>");
    expect(text).toContain("Без золота й манаток");
    expect(text).not.toContain("Без XP");
    expect(share).toContain("<b>Ліва Рука +7 XP\nПрава Рука +1 XP</b>");
    expect(share).not.toContain("Без XP");
  });
});

function makeTurnBasedDuelView(stateOverrides: Record<string, unknown>) {
  return {
    state: "active",
    challenge: {
      inviteToken: "abcDEF12",
      challenger: { telegramUserId: 11n },
      target: { telegramUserId: 22n }
    },
    challenger: {
      name: "Ліва Рука",
      level: 4
    },
    target: {
      name: "Права Рука",
      level: 4
    },
    turnExpiresAt: new Date("2026-06-19T12:00:23.000Z"),
    now: new Date("2026-06-19T12:00:00.000Z"),
    session: {
      status: "active",
      turn: 2,
      state: {
        mode: "turn-based",
        status: "active",
        rulesVersion: "turn-based-duel-v1",
        balanceVersion: "instant-duel-v2",
        turn: 2,
        actingCharacterId: "challenger-character",
        participants: {
          challenger: {
            characterId: "challenger-character",
            displayName: "Ліва Рука",
            hp: 20,
            hpMax: 24,
            mana: 8,
            manaMax: 12
          },
          target: {
            characterId: "target-character",
            displayName: "Права Рука",
            hp: 19,
            hpMax: 25,
            mana: 9,
            manaMax: 13
          }
        },
        ...stateOverrides
      }
    }
  } as never;
}
