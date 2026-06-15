import { describe, expect, it } from "vitest";
import {
  presentFightAlreadyCompleted,
  presentFightNoCharacter,
  presentFightNeedsRest,
  presentFightResult,
  presentFightStart,
  presentPersistentFight,
  presentPersistentFightTurn
} from "../../src/bot/presenters/fightPresenter";
import type { SoloCombatSessionRecord } from "../../src/db/repositories/soloCombatSessionRepository";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";
import type { FightResult } from "../../src/services/fightService";

const character: CharacterSummary = {
  name: "Мандрівник",
  pronoun: "they",
  pronounLabel: "Вони",
  path: "boundary",
  raceId: "race.human-ish",
  raceName: "Людисько",
  classId: "class.warrior",
  className: "Воїн",
  title: "Пересічний Пригодник",
  level: 2,
  xp: 15,
  nextLevelXp: 25,
  xpToNextLevel: 10,
  gold: 9,
  hpCurrent: 24,
  hpMax: 24,
  manaCurrent: 12,
  manaMax: 12,
  stats: {
    strength: 9,
    dexterity: 6,
    intelligence: 6,
    charisma: 6,
    luck: 6
  },
  levelBonus: {
    hpMax: 4,
    manaMax: 2,
    primaryStat: {
      stat: "strength",
      bonus: 1
    }
  }
};

describe("fight presenter", () => {
  it("shows a short Ukrainian start scene", () => {
    const text = presentFightStart(character);

    expect(text).toContain("Сутичка з підозрілим монстром");
    expect(text).not.toContain("Це Мімік-шаурма");
    expect(text).not.toContain("Мімік-шаурма");
    expect(text).toContain(
      "⚔️ Сутичка з підозрілим монстром\n\nТе, що мало бути простою шаурмою"
    );
    expect(text).toContain("підозрілого монстра");
    expect(text).toContain("❤️ Ви: 24/24");
    expect(text).toContain("🌯 Монстр: 14/14");
    expect(text).toContain("Що робимо?");
    expect(text.length).toBeLessThan(420);
  });

  it("prompts /start when no character exists", () => {
    expect(presentFightNoCharacter()).toContain("/start");
  });

  it("shows a spent fight screen with an optional quest suggestion", () => {
    const withQuest = presentFightAlreadyCompleted({
      state: "already-completed",
      character,
      questAvailable: true
    });
    const withoutQuest = presentFightAlreadyCompleted({
      state: "already-completed",
      character,
      questAvailable: false
    });

    expect(withQuest).toContain("вже зараховано");
    expect(withQuest).toContain("/quest");
    expect(withQuest).not.toContain("Що робимо?");
    expect(withoutQuest).not.toContain("/quest");
    expect(withoutQuest).toContain("/hero");
  });

  it("tells zero-HP heroes to rest before opening a new fight", () => {
    const text = presentFightNeedsRest({
      state: "needs-rest",
      character: {
        ...character,
        hpCurrent: 0,
        hpMax: 24,
        resourceRecovery: {
          hpSecondsToFull: 600,
          manaSecondsToFull: 0
        }
      }
    });

    expect(text).toContain("Пригодник ще не тримається на ногах");
    expect(text).toContain("Орієнтовно до повного HP: ~10 хв.");
    expect(text).toContain("Спершу /hero");
  });

  it("shows combat preview and reward for a completed action", () => {
    const text = presentFightResult(completed("attack", 9, 3));

    expect(text).toContain("Ви вдарили");
    expect(text).toContain("навіть лаваш зрозумів сюжет");
    expect(text).toContain("❤️ Ви: 19/22");
    expect(text).toContain("🌯 Мімік-шаурма: 5/14");
    expect(text).toContain("Нагорода:\n<b>+9 XP\n+3 золота</b>");
    expect(text).toContain("Здобуто: <i>Підозрілий лавашний доказ</i>");
    expect(text).toContain(
      [
        "❤️ Ви: 19/22   🌯 Мімік-шаурма: 5/14",
        "",
        "Нагорода:",
        "<b>+9 XP",
        "+3 золота</b>",
        "",
        "Здобуто: <i>Підозрілий лавашний доказ</i>",
        "",
        "Наступний крок: /hero"
      ].join("\n")
    );
    expect(text).not.toContain("×1");
  });

  it("escapes character names in fight outcomes", () => {
    const text = presentFightResult({
      ...completed("flee", 2, 0),
      character: {
        ...character,
        name: "<b>Мандрівник</b>"
      }
    });

    expect(text).toContain("&lt;b&gt;Мандрівник&lt;/b&gt; зберіг обличчя");
    expect(text).not.toContain("<b>Мандрівник</b> зберіг обличчя");
  });

  it("keeps level-up out of the result message", () => {
    expect(presentFightResult(completed("receipt", 7, 5, true))).not.toContain("Рівень підріс");
    expect(presentFightResult(completed("receipt", 7, 5, true))).not.toContain("Стало краще");
    expect(presentFightResult(completed("receipt", 7, 5, false))).not.toContain("Рівень підріс");
    expect(presentFightResult(completed("receipt", 7, 5, false))).not.toContain("Стало краще");
  });

  it("does not imply duplicate rewards for already-completed fight", () => {
    const text = presentFightResult({
      state: "already-completed",
      character,
      questAvailable: true
    });

    expect(text).toContain("вже зараховано");
    expect(text).toContain("/quest");
    expect(text).not.toContain("+9 XP");
  });

  it("renders a persistent fight state without reward promises", () => {
    const text = presentPersistentFight({
      state: "persistent-active",
      character: {
        ...character,
        name: "<b>Мандрівник</b>"
      },
      session: persistentSession(),
      monster: {
        id: "monster.test",
        name: "<i>Монстр</i>",
        description: "Тестовий монстр.",
        level: 3,
        tags: ["test"]
      },
      questProgress: questProgress(4)
    });

    expect(text).toContain("&lt;b&gt;Мандрівник&lt;/b&gt;");
    expect(text).toContain("&lt;i&gt;Монстр&lt;/i&gt;");
    expect(text).toContain("Проти вас: <b>&lt;i&gt;Монстр&lt;/i&gt;</b> · рівень 3");
    expect(text).not.toContain("📋 <b>Тринадцять дрібних проблем</b>");
    expect(text).not.toContain("Прогрес справи: <b>4/13</b> проблем записано в журнал.");
    expect(text).toContain("❤️ Ви: 24/24 · мана 12/12");
    expect(text).toContain("👹 Монстр: 18/18");
    expect(text).toContain("Що робимо?");
    expect(text).not.toContain("Не зволікайте надто довго");
    expect(text).not.toContain("Нагорода");
    expect(text).not.toContain("XP");
    expect(text).not.toContain("золота</b>");
  });

  it("guides wounded persistent fighters back to /hero after a terminal result", () => {
    const text = presentPersistentFight({
      state: "persistent-terminal",
      character,
      session: persistentSession({
        status: "lost",
        hero: {
          hp: 0,
          hpMax: 24,
          mana: 4,
          manaMax: 12
        }
      }),
      monster: {
        id: "monster.test",
        name: "Тестовий монстр",
        description: "Тестовий монстр.",
        level: 3,
        tags: ["test"]
      },
      questProgress: questProgress(4),
      fightReward: null
    });

    expect(text).toContain("Спершу /hero, тоді новий бій.");
  });

  it("shows stale and mana failure persistent turns without mutating reward copy", () => {
    const stale = presentPersistentFightTurn({
      state: "stale-turn",
      character,
      session: persistentSession({
        turn: 2,
        lastTurn: {
          action: "attack",
          heroOutcome: "hit",
          heroDamage: 4,
          monsterDamage: 1,
          manaSpent: 0,
          critical: false
        }
      }),
      monster: null,
      questProgress: questProgress(4)
    });
    const noMana = presentPersistentFightTurn({
      state: "not-enough-mana",
      character,
      session: persistentSession({
        hero: {
          hp: 24,
          hpMax: 24,
          mana: 1,
          manaMax: 12
        }
      }),
      monster: {
        id: "monster.test",
        name: "Тестовий монстр",
        description: "Тестовий монстр.",
        level: 3,
        tags: ["test"]
      },
      questProgress: questProgress(4)
    });

    expect(stale).toContain("поточний стан");
    expect(stale).toContain("Невідомий монстр");
    expect(stale).not.toContain("Невідомий монстр</b> · рівень");
    expect(noMana).toContain("Мани не вистачило");
    expect(noMana).not.toContain("Нагорода");
  });

  it("uses neutral grammar for skill turn summaries", () => {
    const text = presentPersistentFightTurn({
      state: "updated",
      character,
      session: persistentSession({
        turn: 2,
        lastTurn: {
          action: "skill",
          heroOutcome: "hit",
          heroDamage: 17,
          monsterDamage: 8,
          manaSpent: 3,
          critical: true
        }
      }),
      monster: {
        id: "monster.test",
        name: "Тестовий монстр",
        description: "Тестовий монстр.",
        level: 3,
        tags: ["test"]
      },
      questProgress: questProgress(4),
      fightReward: null,
      questReward: null
    });

    expect(text).toContain(
      ["Останній хід", "Вміння влучає критично на 17 шкоди.", "Монстр відповів на 8 шкоди."].join(
        "\n"
      )
    );
    expect(text).not.toContain("Останній хід: вміння");
    expect(text).not.toContain("критично:");
    expect(text).toContain("Проти вас: <b>Тестовий монстр</b> · рівень 3");
    expect(text).not.toContain("критично дала");
  });

  it("shows the thirteen small problems completion reward once", () => {
    const text = presentPersistentFightTurn({
      state: "updated",
      character,
      session: persistentSession({
        status: "won",
        turn: 4,
        monster: {
          id: "monster.test",
          hp: 0,
          hpMax: 18
        },
        lastTurn: {
          action: "attack",
          heroOutcome: "hit",
          heroDamage: 18,
          monsterDamage: 0,
          manaSpent: 0,
          critical: false
        }
      }),
      monster: {
        id: "monster.test",
        name: "Тестовий монстр",
        description: "Тестовий монстр.",
        level: 3,
        tags: ["test"]
      },
      questProgress: questProgress(14, true),
      fightReward: {
        state: "claimed",
        reward: {
          xp: 9,
          gold: 2,
          localDate: "123e4567-e89b-12d3-a456-426614174000",
          itemGrants: [
            {
              itemId: "item.web-of-tomorrow-promise",
              name: "Павутинка обіцянки «завтра»",
              quantity: 1
            }
          ]
        },
        levelChange: null
      },
      questReward: {
        state: "claimed",
        reward: {
          xp: 35,
          gold: 10,
          localDate: "once",
          itemGrants: [
            {
              itemId: "item.badge-of-thirteen-small-problems",
              name: "Жетон тринадцяти дрібних проблем",
              quantity: 1
            }
          ]
        },
        levelChange: null
      }
    });

    expect(text).toContain("Винагорода за бій:\n<b>+9 XP\n+2 золота</b>");
    expect(text).not.toContain("Корчмар підсунув малу оплату за закриту проблему");
    expect(text).toContain("Здобуто: <i>Павутинка обіцянки «завтра»</i>");
    expect(text).toContain("Тринадцята проблема впала");
    expect(text).toContain("Нагорода за справу:\n<b>+35 XP\n+10 золота</b>");
    expect(text).toContain("Здобуто: <i>Жетон тринадцяти дрібних проблем</i>");
    expect(text).toContain("У корчмі стало на одну проблему тихіше");
    expect(text).not.toContain("список дрібних проблем теж не відвертівся");
  });

  it("replays persistent fight rewards without implying duplicate payment", () => {
    const text = presentPersistentFightTurn({
      state: "terminal",
      character,
      session: persistentSession({
        status: "won",
        turn: 3,
        monster: {
          id: "monster.test",
          hp: 0,
          hpMax: 18
        }
      }),
      monster: {
        id: "monster.test",
        name: "<b>Монстр</b>",
        description: "Тестовий монстр.",
        level: 3,
        tags: ["test"]
      },
      questProgress: questProgress(5),
      fightReward: {
        state: "replayed",
        reward: {
          xp: 7,
          gold: 2,
          localDate: "123e4567-e89b-12d3-a456-426614174000",
          itemGrants: []
        },
        levelChange: null
      }
    });

    expect(text).toContain("Винагорода вже видана");
    expect(text).toContain("Винагорода за бій:\n<b>+7 XP\n+2 золота</b>");
    expect(text).toContain("Проти вас: <b>&lt;b&gt;Монстр&lt;/b&gt;</b> · рівень 3");
    expect(text).not.toContain("<b>Монстр</b>");
  });

  it("shows consolation XP for a lost persistent fight as an attempt reward", () => {
    const text = presentPersistentFightTurn({
      state: "updated",
      character,
      session: persistentSession({
        status: "lost",
        turn: 4,
        hero: {
          hp: 0,
          hpMax: 56,
          mana: 28,
          manaMax: 28
        },
        lastTurn: {
          action: "attack",
          heroOutcome: "miss",
          heroDamage: 0,
          monsterDamage: 41,
          manaSpent: 0,
          critical: false
        }
      }),
      monster: {
        id: "monster.test",
        name: "Тестовий монстр",
        description: "Тестовий монстр.",
        level: 3,
        tags: ["test"]
      },
      questProgress: questProgress(2),
      fightReward: {
        state: "claimed",
        reward: {
          xp: 1,
          gold: 0,
          localDate: "123e4567-e89b-12d3-a456-426614174000",
          itemGrants: []
        },
        levelChange: null
      },
      questReward: null
    });

    expect(text).toContain("🎒 За спробу:\n<b>+1 XP</b>");
    expect(text).not.toContain("Корчмар підсунув 1 XP за спробу");
    expect(text).not.toContain("Винагорода за бій:\n<b>+1 XP</b>");
    expect(text).not.toContain("+0 золота");
    expect(text).toContain("💤 Ви програли. Список дрібних проблем не зрушив");
    expect(text).not.toContain("цінні дані для балансу");
    expect(text).not.toContain("оплату за закриту проблему");
  });

  it("does not mention thirteen-problems progress on losses after the list is closed", () => {
    const text = presentPersistentFightTurn({
      state: "updated",
      character,
      session: persistentSession({
        status: "lost",
        turn: 4,
        hero: {
          hp: 0,
          hpMax: 56,
          mana: 28,
          manaMax: 28
        },
        lastTurn: {
          action: "attack",
          heroOutcome: "miss",
          heroDamage: 0,
          monsterDamage: 41,
          manaSpent: 0,
          critical: false
        }
      }),
      monster: {
        id: "monster.test",
        name: "Тестовий монстр",
        description: "Тестовий монстр.",
        level: 3,
        tags: ["test"]
      },
      questProgress: questProgress(14, true),
      fightReward: {
        state: "claimed",
        reward: {
          xp: 1,
          gold: 0,
          localDate: "123e4567-e89b-12d3-a456-426614174000",
          itemGrants: []
        },
        levelChange: null
      },
      questReward: null
    });

    expect(text).toContain("Ви програли");
    expect(text).not.toContain("Прогрес справи: <b>14/13</b> · закрито.");
    expect(text).not.toContain("Список дрібних проблем не зрушив");
    expect(text).not.toContain("зробив вигляд, що співчуває");
  });
});

function completed(
  action: "attack" | "receipt" | "flee",
  xp: number,
  gold: number,
  leveledUp = false
): Exclude<FightResult, { state: "no-character" | "already-completed" }> {
  return {
    state: "completed",
    action,
    character,
    combat: {
      action,
      playerHpPreview: 19,
      playerHpMaxPreview: 22,
      enemyHpPreview: 5,
      enemyHpMaxPreview: 14,
      playerDamage: 9,
      enemyDamage: 3,
      outcome: action === "receipt" ? "messy-win" : action === "flee" ? "flee" : "win"
    },
    reward: {
      xp,
      gold,
      localDate: "12026-06-12",
      itemGrants:
        action === "flee"
          ? []
          : [
              {
                itemId:
                  action === "receipt"
                    ? "item.receipt-of-formal-suspicion"
                    : "item.suspicious-shawarma-wrapper",
                name:
                  action === "receipt"
                    ? "Чек формальної підозри"
                    : "Підозрілий лавашний доказ",
                quantity: 1
              }
            ]
    },
    levelChange: {
      oldLevel: 1,
      newLevel: leveledUp ? 2 : 1,
      leveledUp
    }
  };
}

function persistentSession(overrides: Partial<NonNullable<SoloCombatSessionRecord["state"]>> = {}): SoloCombatSessionRecord {
  return {
    id: "123e4567-e89b-12d3-a456-426614174000",
    characterId: "character-42",
    monsterId: "monster.test",
    status: overrides.status ?? "active",
    turn: overrides.turn ?? 1,
    state: {
      id: "123e4567-e89b-12d3-a456-426614174000",
      turn: 1,
      status: "active",
      hero: {
        hp: 24,
        hpMax: 24,
        mana: 12,
        manaMax: 12
      },
      monster: {
        id: "monster.test",
        hp: 18,
        hpMax: 18
      },
      ...overrides
    },
    reward: null,
    createdAt: new Date("2026-06-12T10:30:00.000Z"),
    updatedAt: new Date("2026-06-12T10:30:00.000Z"),
    expiresAt: new Date("2026-06-12T11:00:00.000Z")
  };
}

function questProgress(wins: number, completed = false) {
  return {
    title: "Тринадцять дрібних проблем" as const,
    wins,
    target: 13,
    completed,
    rewardClaimed: completed
  };
}
