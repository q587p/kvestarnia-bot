import { describe, expect, it } from "vitest";
import {
  presentDuelResultShare,
  presentDuelView,
  presentTurnBasedDuel,
  presentTurnBasedDuelIntro,
  presentTurnBasedDuelJournal
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

    expect(challengerText).toContain("♟️ <b>Покрокова дуель: хід 2</b>");
    expect(challengerText).not.toContain("Порада дня:");
    expect(challengerText).toContain("Ваш вибір");
    expect(challengerText).toContain("звичайна атака");
    expect(challengerText).not.toContain("Шкода:");
    expect(targetText).not.toContain("звичайна атака");
    expect(targetText).not.toContain("Шкода:");
    expect(targetText).toContain("записи закритими");
  });

  it("renders turn-based duel start context as a separate intro with player titles and an italic tip", () => {
    const result = makeTurnBasedDuelView({
      participants: {
        challenger: {
          characterId: "challenger-character",
          displayName: "Ліва Рука",
          activeCosmeticTitle: "Перший рукав протоколу",
          title: "Людисько-воїн",
          level: 7,
          remortCount: 1,
          hp: 20,
          hpMax: 24,
          mana: 8,
          manaMax: 12
        },
        target: {
          characterId: "target-character",
          displayName: "Права Рука",
          title: "Вареникомант межі",
          level: 4,
          remortCount: 0,
          hp: 19,
          hpMax: 25,
          mana: 9,
          manaMax: 13
        }
      }
    });

    const intro = presentTurnBasedDuelIntro(result);

    expect(intro).toContain("♟️ <b>Покрокова дуель</b>");
    expect(intro).toContain("Перший кухоль: <b>Ліва Рука</b> (<i>«Перший рукав протоколу»</i>) · <i>Людисько-воїн</i> · рівень 7 (реморт: 1)");
    expect(intro).toContain("Другий кухоль: <b>Права Рука</b> · <i>Вареникомант межі</i> · рівень 4");
    expect(intro).toContain("<i>Порада дня:");
    expect(intro).toContain("</i>");
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

    expect(text).toContain("♟️ <b>Покрокова дуель: хід 2</b>");
    expect(text).toContain("Ліва Рука атакує влучає на <b>7</b> шкоди.");
    expect(text).toContain(
      "Права Рука застосовує 🪓 <i>Силовий замах</i>: влучає на <b>11</b> шкоди · критично."
    );
    expect(text).toContain("Що робимо?");
    expect(text).toContain("⏳ На хід є <b>23 с</b>. Потім Корчма поставить вас в атаку.");
  });

  it("renders turn-based gear action effects in stored round replays", () => {
    const result = makeTurnBasedDuelView({
      lastRound: {
        turn: 2,
        actions: [
          {
            actorCharacterId: "challenger-character",
            defenderCharacterId: "target-character",
            action: "gear",
            outcome: "hit",
            damage: 3,
            healing: 4,
            guard: 1,
            manaSpent: 5,
            critical: false,
            skillId: "gear.asclepius-instruction"
          }
        ]
      }
    });

    const text = presentTurnBasedDuel(result, { viewerCharacterId: "target-character" });

    expect(text).toContain("Ліва Рука застосовує ⚕️ <i>Інструкція Асклепія</i>: влучає на <b>3</b> шкоди.");
    expect(text).toContain("Підтримка: HP підросли на <b>4</b>; захист тримає <b>1</b>.");
  });

  it("renders turn-based ability fumbles as a visible consequence", () => {
    const result = makeTurnBasedDuelView({
      lastRound: {
        turn: 2,
        actions: [
          {
            actorCharacterId: "challenger-character",
            defenderCharacterId: "target-character",
            action: "skill",
            outcome: "critical-fumble",
            damage: 0,
            manaSpent: 4,
            critical: false,
            skillId: "skill.strict-blessing",
            fumble: {
              abilityId: "skill.strict-blessing",
              kind: "enemy-heal",
              line: "Благословення перечитало адресата й підлатало супротивника з неприємною щирістю.",
              enemyHealing: 7
            }
          }
        ]
      }
    });

    const text = presentTurnBasedDuel(result, { viewerCharacterId: "target-character" });

    expect(text).toContain("Критична невдача:");
    expect(text).toContain("підлатало супротивника");
    expect(text).toContain("Супротивник відновлює <b>7</b> HP.");
    expect(text).not.toContain("Шкода не пройшла.");
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

    expect(text).toContain("Ліва: HP 20/24 · мана 8/12");
    expect(text).toContain("Права: HP 19/25 · мана 9/13");
    expect(text).not.toContain("<b>Ліва Рука</b>: HP");
    expect(text).toContain("🫁 🪓 Силовий замах відсапується: ще 3 ходи.");
    expect(text).not.toContain("🫁 Вміння відсапується");
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

  it("shows frozen active cosmetic titles once in duel result and share headers", () => {
    const view = {
      state: "resolved",
      challenge: {
        mode: "quick",
        inviteToken: "abcDEF12"
      },
      challenger: {
        name: "Дара <&>",
        activeCosmeticTitle: "Перший <пергамент> не зʼїв",
        level: 4
      },
      target: {
        name: "Нестор",
        activeCosmeticTitle: "Табличка тримається",
        level: 4
      },
      result: {
        mode: "quick",
        outcome: "challenger",
        winnerCharacterId: "challenger-character",
        loserCharacterId: "target-character",
        challengerScore: 12,
        targetScore: 3,
        swing: 3,
        flavorKey: "direct-hit"
      }
    } as never;
    const text = presentDuelView(view);
    const share = presentDuelResultShare(view);

    expect(text).toContain("<b>Дара &lt;&amp;&gt;</b> (<i>«Перший &lt;пергамент&gt; не зʼїв»</i>)");
    expect(text).toContain("<b>Нестор</b> (<i>«Табличка тримається»</i>)");
    expect(text).toContain("🏁 <b>Дара &lt;&amp;&gt;</b> перемагає у миттєвій дуелі");
    expect(share).toContain("<b>Дара &lt;&amp;&gt;</b> (<i>«Перший &lt;пергамент&gt; не зʼїв»</i>)");
    expect(share).toContain("🏁 <b>Дара &lt;&amp;&gt;</b> переміг у миттєвій корчемній дуелі");
    expect(countOccurrences(text, "Перший &lt;пергамент&gt; не зʼїв")).toBe(1);
    expect(countOccurrences(text, "Табличка тримається")).toBe(1);
    expect(countOccurrences(share, "Перший &lt;пергамент&gt; не зʼїв")).toBe(1);
    expect(countOccurrences(share, "Табличка тримається")).toBe(1);
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
    expect(text).toContain("Золото й манатки не переходять між гравцями");
    expect(text).not.toContain("Без XP");
    expect(share).toContain("<b>Ліва Рука +7 XP\nПрава Рука +1 XP</b>");
    expect(share).not.toContain("Без XP");
  });

  it("renders a paged turn-based duel journal from stored round summaries", () => {
    const active = makeTurnBasedDuelView({});
    const satedCursorAt = new Date("2026-07-16T13:00:00.000Z");
    active.session.state.participants.challenger.varenykSated = {
      version: 1,
      activationId: "duel-journal-sated",
      recipientCharacterId: "challenger-character",
      recipientRemortCount: 0,
      rank: 1,
      expiresAt: new Date(satedCursorAt.getTime() + 12 * 60_000).toISOString(),
      cursorAt: satedCursorAt.toISOString(),
      leaseStartedAt: satedCursorAt.toISOString(),
      outsideRemainderMs: 0,
      pulseIds: ["duel:pulse:1"]
    };
    const text = presentTurnBasedDuelJournal({
      state: "ready",
      session: active.session,
      rounds: [
        {
          turn: 2,
          actions: [
            {
              actorCharacterId: "challenger-character",
              defenderCharacterId: "target-character",
              action: "attack",
              outcome: "hit",
              damage: 7,
              manaSpent: 0,
              critical: false,
              satedRecovery: { hpRestored: 1, manaRestored: 1 }
            },
            {
              actorCharacterId: "target-character",
              defenderCharacterId: "challenger-character",
              action: "attack",
              outcome: "hit",
              damage: 4,
              manaSpent: 0,
              critical: false
            }
          ]
        }
      ]
    } as never);

    expect(text).toContain("📜 <b>Журнал дуелі</b>");
    expect(text).toContain("Ліва Рука проти Права Рука.");
    expect(text).toContain("😋 Стан: <b>Ситий</b> у <b>Ліва Рука</b> ще <b>12 ходів</b>");
    expect(text).toContain("😋 Ліва Рука: <i>ситість</i> відновлює +1 HP і +1 мани.");
    expect(text).toContain("Хід <b>2</b> · запис 1/1");
    expect(text).toContain("Ліва: HP 20/24 · мана 8/12");
    expect(text).toContain("Ліва Рука атакує влучає на <b>7</b> шкоди.");
    expect(text.indexOf("Права Рука атакує влучає на <b>4</b> шкоди.")).toBeLessThan(
      text.indexOf("😋 Ліва Рука: <i>ситість</i> відновлює")
    );
  });
});

type ActiveTurnBasedDuelView = Parameters<typeof presentTurnBasedDuel>[0];

function countOccurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

function makeTurnBasedDuelView(stateOverrides: Record<string, unknown>): ActiveTurnBasedDuelView {
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
  } as ActiveTurnBasedDuelView;
}
