import { describe, expect, it } from "vitest";
import {
  presentFightAlreadyCompleted,
  presentFightNoCharacter,
  presentFightNeedsRest,
  presentFightResult,
  presentFightStart,
  presentProblemQuestIssueNext,
  presentProblemQuestProgressAfterFight,
  presentProblemQuestTurnIn,
  presentQuestProgressAfterFight,
  presentPersistentFightDifficultyChoice,
  presentPersistentFight,
  presentPersistentFightPassagePreview,
  presentPersistentFightIntro,
  presentPersistentFightJournal,
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

  it("renders the Nyz level choice without a character header", () => {
    const text = presentPersistentFightDifficultyChoice();

    expect(text).toContain("Ярус I: Сутерени Корчми");
    expect(text).not.toContain("<b>Мандрівник</b>");
    expect(text).not.toContain("Пересічний Пригодник");
  });

  it("uses neutral passage preview copy for monsters without grammar metadata", () => {
    const text = presentPersistentFightPassagePreview({
      state: "persistent-preview",
      character,
      questProgress: null,
      monster: {
        id: "monster.cellar-mouse-with-title",
        name: "Льохова Миша з Титулом",
        description: "Тестова миша з дуже серйозним папірцем.",
        level: 3,
        tags: ["beast"]
      },
      difficulty: "easy",
      originLocationId: "location.korchma.deep.level1.right",
      encounterToken: "token13",
      expiresAt: new Date("2026-06-22T10:00:00.000Z"),
      monsterHp: {
        current: 7,
        max: 18
      }
    });

    expect(text).toContain("Ви у правому проході. Попереду — <b>Льохова Миша з Титулом</b> · рівень 3.");
    expect(text).not.toContain("<b>Мандрівник</b>");
    expect(text).not.toContain("Пересічний Пригодник");
    expect(text).toContain("Поранений слід: 7/18 здоров’я.");
    expect(text).toContain("Увага ще не впала на вас.");
    expect(text).not.toContain("Він вас");
    expect(text).not.toContain("Бачите перед собою");
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
    expect(text).toContain("Спершу трохи відновіться");
    expect(text).toContain("коли HP буде хоча б 1");
    expect(text).not.toContain("/hero");
  });

  it("shows combat preview and reward for a completed action", () => {
    const text = presentFightResult(completed("attack", 9, 3));

    expect(text).toContain("⚔️ <b>Бій</b>: ви вдарили Міміка-шаурму.");
    expect(text).toContain("навіть лаваш зрозумів сюжет");
    expect(text).toContain("❤️ Ви: 19/22");
    expect(text).toContain("🌯 Мімік-шаурма: 5/14");
    expect(text).toContain("Винагорода за бій:\n<b>+9 XP\n+3 золота</b>");
    expect(text).toContain("Здобуто: <i>Підозрілий лавашний доказ</i>");
    expect(text).toContain(
      [
        "❤️ Ви: 19/22",
        "🌯 Мімік-шаурма: 5/14",
        "",
        "Мімік отримав 9 шкоди й задумався про карʼєру салату.",
        "Мімік атакує у відповідь і завдає 3 шкоди.",
        "",
        "🎉 Ви перемогли. Ваш удар був настільки прямий, що навіть лаваш зрозумів сюжет.",
        "",
        "Винагорода за бій:",
        "<b>+9 XP",
        "+3 золота</b>",
        "",
        "Здобуто: <i>Підозрілий лавашний доказ</i>"
      ].join("\n")
    );
    expect(text).not.toContain("Наступний крок");
    expect(text).not.toContain("×1");
  });

  it("orders the receipt probe like a compact battle result", () => {
    const baseResult = completed("receipt", 8, 5) as Extract<FightResult, { state: "completed" }>;
    const text = presentFightResult({
      ...baseResult,
      character: {
        ...character,
        classId: "class.priest",
        className: "Жрець"
      },
      combat: {
        ...baseResult.combat,
        playerHpPreview: 18,
        playerHpMaxPreview: 20,
        enemyHpPreview: 6,
        enemyHpMaxPreview: 14,
        playerDamage: 8,
        enemyDamage: 2
      },
      reward: {
        ...baseResult.reward,
        xp: 8,
        gold: 5,
        itemGrants: [
          {
            itemId: "item.small-advantage-stamp",
            name: "Печатка дрібної переваги",
            quantity: 1
          },
          {
            itemId: "item.receipt-of-formal-suspicion",
            name: "Чек формальної підозри",
            quantity: 1
          }
        ]
      }
    });

    expect(text).toContain(
      [
        "⚔️ <b>Бій</b>: ви показали чек.",
        "",
        "❤️ Ви: 18/20",
        "🌯 Мімік-шаурма: 6/14",
        "",
        "Мімік отримав 8 шкоди від формальної ввічливості.",
        "Мімік атакує у відповідь і завдає 2 шкоди.",
        "",
        "🎉 Ви перемогли. Жрець після небезпечної бюрократії демонструє милосердя дозовано. Монстру дісталась навчальна порція.",
        "",
        "Винагорода за бій:",
        "<b>+8 XP",
        "+5 золота</b>",
        "",
        "Здобуто: <i>Печатка дрібної переваги</i>",
        "Здобуто: <i>Чек формальної підозри</i>"
      ].join("\n")
    );
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
    const result = {
      state: "persistent-active",
      character: {
        ...character,
        name: "<b>Мандрівник</b>"
      },
      session: persistentSession({
        monsterRuntime: {
          version: 1,
          rulesVersion: "monster-abilities-v1",
          aiProfile: "controller",
          loadoutIds: [],
          cooldowns: {},
          onceUsedAbilityIds: [],
          consecutiveAbilityUses: 0,
          ownActionCount: 0,
          effects: [{
            id: "test-accuracy-pressure",
            sourceAbilityId: "monster.test-pressure",
            sourceActor: "monster",
            target: "hero",
            kind: "accuracy",
            value: 15,
            polarity: "harmful",
            removable: true,
            remainingTargetActivations: 1
          }]
        }
      }),
      monster: {
        id: "monster.test",
        name: "<i>Монстр</i>",
        description: "Тестовий монстр.",
        level: 3,
        tags: ["test"]
      },
      questProgress: questProgress(4)
    } as const;
    const intro = presentPersistentFightIntro(result);
    const text = presentPersistentFight(result);

    expect(intro).toContain("&lt;b&gt;Мандрівник&lt;/b&gt;");
    expect(intro).toContain("Проти вас: <b>&lt;i&gt;Монстр&lt;/i&gt;</b> · рівень 3");
    expect(intro).toContain("Бій починається. Корчма відкриває журнал ходів");
    expect(intro).not.toContain("поки не видає нагород");
    expect(intro).toContain("<i>Порада дня:");
    expect(text).toContain("<b>&lt;b&gt;Мандрівник&lt;/b&gt;</b>, що робимо?");
    expect(text).not.toContain("<b>Мандрівник</b>, що робимо?");
    expect(text).toContain("⚔️ <b>Бій</b>: 1 хід");
    expect(text).not.toContain("\nХід:");
    expect(text).not.toContain("Проти вас:");
    expect(text).not.toContain("<i>Порада дня:");
    expect(text).not.toContain("📋 <b>Тринадцять дрібних проблем</b>");
    expect(text).not.toContain("Прогрес справи: <b>4/13</b> проблем записано в журнал.");
    expect(text).toContain("❤️ Ви: 24/24 · мана 12/12");
    expect(text).toContain("👹 Тестовий: 18/18");
    expect(text).toContain("🧷 Ефект триває: ваша влучність просіла на 15 пунктів, спаде після вашої наступної дії.");
    expect(text).toContain("<b>&lt;b&gt;Мандрівник&lt;/b&gt;</b>, що робимо?\n⏳ На хід є 23 секунди. Потім Корчма поставить вас у захист.");
    expect(text).not.toContain("що робимо?\n\n⏳");
    expect(text).toContain("⏳ На хід є 23 секунди");
    expect(text).toContain("<b>&lt;b&gt;Мандрівник&lt;/b&gt;</b>, що робимо?");
    expect(text).not.toContain("Не зволікайте надто довго");
    expect(text).not.toContain("Нагорода");
    expect(text).not.toContain("XP");
    expect(text).not.toContain("золота</b>");
  });

  it("marks the reloaded living primary enemy as the target", () => {
    const result = {
      state: "persistent-active",
      character,
      session: persistentSession({
        turn: 2,
        threat: {
          version: 1,
          enemyCount: 2,
          reason: "ordinary-win-streak",
          eligibleWins: 3,
          lineId: "one-hero-invitation",
          lineVersion: "threat-escalation-v1",
          pressure: {
            version: 1,
            consecutiveWonEscalatedFights: 1,
            requestedSecondEnemyLevelBonus: 2,
            appliedSecondEnemyLevelBonus: 2,
            boostedEnemyId: "enemy:2",
            boostedEnemyEffectiveLevel: 3,
            levelCap: 23
          }
        },
        monster: {
          id: "monster.second",
          name: "<i>Другий</i>",
          level: 3,
          hp: 7,
          hpMax: 16
        },
        enemies: [
          {
            enemyId: "enemy:2",
            id: "monster.second",
            name: "<i>Другий</i>",
            level: 3,
            hp: 7,
            hpMax: 16
          },
          {
            enemyId: "enemy:1",
            id: "monster.first",
            name: "<b>Перший</b>",
            level: 2,
            hp: 0,
            hpMax: 18
          }
        ]
      }),
      monster: {
        id: "monster.second",
        name: "<i>Другий</i>",
        description: "Тестовий монстр.",
        level: 3,
        tags: ["test"]
      },
      questProgress: questProgress(4)
    } as const;
    const intro = presentPersistentFightIntro(result);
    const text = presentPersistentFight(result);

    expect(intro).toContain("⚠️ <i>Хтось у Низу сказав «та він один». Інші сприйняли це як запрошення.</i>\n📈 <i>Натиск Низу:</i> <b>&lt;i&gt;Другий&lt;/i&gt;</b> має +2 рівні — рівень 3 із межі 23; як підмога тримає коротшу планку здоровʼя.\n\nПроти вас:\n👹 1. <b>&lt;i&gt;Другий&lt;/i&gt;</b> · рівень 3\n👹 2. <b>&lt;b&gt;Перший&lt;/b&gt;</b> · рівень 2");
    expect(intro).toContain("Хтось у Низу сказав «та він один». Інші сприйняли це як запрошення.");
    expect(intro).toContain("Натиск Низу:");
    expect(intro).toContain("<b>&lt;i&gt;Другий&lt;/i&gt;</b> має +2 рівні — рівень 3 із межі 23; як підмога тримає коротшу планку здоровʼя.");
    expect(intro).toContain("<i>Порада дня:");
    expect(intro).not.toContain("<i>Другий</i>");
    expect(intro).not.toContain("<b>Перший</b>");

    expect(text).not.toContain("Проти вас:");
    expect(text).not.toContain("Хтось у Низу сказав «та він один». Інші сприйняли це як запрошення.");
    expect(text).not.toContain("Натиск Низу:");
    expect(text).not.toContain("<b>&lt;i&gt;Другий&lt;/i&gt;</b> має +2 рівні — рівень 3 із межі 23; як підмога тримає коротшу планку здоровʼя.");
    expect(text).not.toContain("Проти вас: <b>&lt;i&gt;Другий&lt;/i&gt;</b> · рівень 3");
    expect(text).toContain("👹 1. Другий: 7/16 ← ціль");
    expect(text).toContain("👹 2. Перший: 0/18");
    expect(text).not.toContain("<i>Порада дня:");
    expect(text).not.toContain("<i>Другий</i>");
    expect(text).not.toContain("<b>Перший</b>");
  });

  it("announces a defeated enemy and the next target in a two-enemy fight", () => {
    const text = presentPersistentFightTurn({
      state: "updated",
      character,
      session: persistentSession({
        turn: 6,
        monster: {
          id: "monster.spider",
          name: "Павук дедлайнів",
          level: 3,
          hp: 18,
          hpMax: 18
        },
        enemies: [
          {
            enemyId: "enemy:2",
            id: "monster.spider",
            name: "Павук дедлайнів",
            level: 3,
            hp: 18,
            hpMax: 18
          },
          {
            enemyId: "enemy:1",
            id: "monster.cabbage",
            name: "Капустяний лицар на перерві",
            level: 2,
            hp: 0,
            hpMax: 18
          }
        ],
        lastTurn: {
          action: "skill",
          heroOutcome: "hit",
          heroDamage: 18,
          monsterDamage: 5,
          manaSpent: 3,
          critical: true,
          skillId: "skill.hot-spell",
          enemyActions: [
            {
              enemyId: "enemy:2",
              monsterId: "monster.spider",
              monsterName: "Павук дедлайнів",
              monsterOutcome: "hit",
              monsterDamage: 5,
              monsterAction: "attack"
            }
          ]
        },
        turnLog: [
          {
            turn: 2,
            hero: { hp: 29, mana: 5 },
            monster: { hp: 18 },
            enemies: [
              { enemyId: "enemy:2", hp: 18 },
              { enemyId: "enemy:1", hp: 0 }
            ],
            summary: {
              action: "skill",
              heroOutcome: "hit",
              heroDamage: 18,
              monsterDamage: 5,
              manaSpent: 3,
              critical: true,
              skillId: "skill.hot-spell",
              enemyActions: [
                {
                  enemyId: "enemy:2",
                  monsterId: "monster.spider",
                  monsterName: "Павук дедлайнів",
                  monsterOutcome: "hit",
                  monsterDamage: 5,
                  monsterAction: "attack"
                }
              ]
            }
          }
        ]
      }),
      monster: {
        id: "monster.spider",
        name: "Павук дедлайнів",
        description: "Тестовий павук.",
        level: 3,
        tags: ["test"]
      },
      questProgress: questProgress(4),
      fightReward: null
    });

    expect(text).toContain("⚔️ <b>Бій</b>: 6 хід");
    expect(text).not.toContain("⚔️ <b>Бій</b>: 6 ходів");
    expect(text).toContain("👹 1. Павук: 18/18 ← ціль");
    expect(text).toContain("👹 2. Капустяний: 0/18");
    expect(text).toContain("Знешкоджено: <b>Капустяний лицар на перерві</b>. Нова ціль — <b>Павук дедлайнів</b>; Корчма переставила табличку без голосування.");
  });

  it("disambiguates colliding short monster names in multi-enemy response lines", () => {
    const text = presentPersistentFight({
      state: "persistent-active",
      character,
      session: persistentSession({
        turn: 3,
        monster: {
          id: "monster.ghost-audit",
          name: "Привид аудиту",
          level: 3,
          hp: 12,
          hpMax: 18
        },
        enemies: [
          {
            enemyId: "enemy:1",
            id: "monster.ghost-audit",
            name: "Привид аудиту",
            level: 3,
            hp: 12,
            hpMax: 18
          },
          {
            enemyId: "enemy:2",
            id: "monster.ghost-comment",
            name: "Привид коментаря",
            level: 3,
            hp: 10,
            hpMax: 18
          }
        ],
        lastTurn: {
          action: "attack",
          heroOutcome: "hit",
          heroDamage: 5,
          monsterDamage: 7,
          manaSpent: 0,
          critical: false,
          enemyActions: [
            {
              enemyId: "enemy:1",
              monsterId: "monster.ghost-audit",
              monsterName: "Привид аудиту",
              monsterOutcome: "hit",
              monsterDamage: 3,
              monsterAction: "attack"
            },
            {
              enemyId: "enemy:2",
              monsterId: "monster.ghost-comment",
              monsterName: "Привид коментаря",
              monsterOutcome: "hit",
              monsterDamage: 4,
              monsterAction: "attack"
            }
          ]
        }
      }),
      monster: {
        id: "monster.ghost-audit",
        name: "Привид аудиту",
        description: "Тестовий привид.",
        level: 3,
        tags: ["test"]
      },
      questProgress: questProgress(4)
    });

    expect(text).toContain("Привид 1 атакує у відповідь і завдає 3 шкоди.");
    expect(text).toContain("Привид 2 атакує у відповідь і завдає 4 шкоди.");
    expect(text).not.toContain("Привид атакує у відповідь і завдає 3 шкоди.");
    expect(text).not.toContain("Привид атакує у відповідь і завдає 4 шкоди.");
    expect(text).not.toContain("діє окремо");
  });

  it("combines multi-enemy final responses into one readable line", () => {
    const text = presentPersistentFight({
      state: "persistent-active",
      character,
      session: persistentSession({
        turn: 2,
        lastTurn: {
          action: "attack",
          heroOutcome: "hit",
          heroDamage: 1,
          monsterDamage: 6,
          manaSpent: 0,
          critical: true,
          enemyActions: [
            {
              enemyId: "enemy:1",
              monsterId: "monster.ghost",
              monsterName: "Привид старого боргу",
              monsterOutcome: "hit",
              monsterDamage: 6,
              monsterAction: "attack",
              simultaneousFinalResponse: true
            },
            {
              enemyId: "enemy:2",
              monsterId: "monster.dragon",
              monsterName: "Дракончик попереднього погодження",
              monsterOutcome: "hit",
              monsterDamage: 6,
              monsterAction: "attack"
            }
          ]
        }
      }),
      monster: {
        id: "monster.ghost",
        name: "Привид старого боргу",
        description: "Тестовий привид.",
        level: 3,
        tags: ["test"]
      },
      questProgress: questProgress(4)
    });

    expect(text).toContain("Привид устиг відповісти в ту саму мить і завдав 6 шкоди.");
    expect(text).toContain("Дракончик атакує у відповідь і завдає 6 шкоди.");
    expect(text).not.toContain("Привид устиг відповісти в ту саму мить.\nПривид");
    expect(text).not.toContain("діє окремо");
  });

  it("renders stored multi-enemy monster skill signatures", () => {
    const text = presentPersistentFight({
      state: "persistent-active",
      character,
      session: persistentSession({
        turn: 2,
        lastTurn: {
          action: "attack",
          heroOutcome: "hit",
          heroDamage: 5,
          monsterDamage: 8,
          manaSpent: 0,
          critical: false,
          enemyActions: [
            {
              enemyId: "enemy:1",
              monsterId: "monster.ledger-boar",
              monsterName: "Кабан прибутково-видаткової книги",
              monsterOutcome: "hit",
              monsterDamage: 8,
              monsterAction: "skill",
              monsterSkillId: "monster.ledger-charge",
              monsterDamageKind: "physical"
            },
            {
              enemyId: "enemy:2",
              monsterId: "monster.queue-counter-gargoyle",
              monsterName: "Гаргулья віконця черги",
              monsterOutcome: "miss",
              monsterDamage: 0,
              monsterAction: "attack"
            }
          ]
        }
      }),
      monster: {
        id: "monster.ledger-boar",
        name: "Кабан прибутково-видаткової книги",
        description: "Тестовий кабан.",
        level: 5,
        tags: ["beast"]
      },
      questProgress: questProgress(4)
    });

    expect(text).toContain(
      "Кабан застосовує 🐗 <i>Прибутково-видатковий таран</i>: завдав 8 шкоди; Кабан вписав шкоду в обидві колонки й підкріпив це копитом."
    );
  });

  it("renders stored monster skill and telegraph signatures in live turns", () => {
    const skillText = presentPersistentFight({
      state: "persistent-active",
      character,
      session: persistentSession({
        lastTurn: {
          action: "attack",
          heroOutcome: "hit",
          heroDamage: 4,
          monsterDamage: 6,
          manaSpent: 0,
          critical: false,
          monsterAction: "skill",
          monsterOutcome: "hit",
          monsterSkillId: "monster.queue-number",
          monsterEffectText: "точність просіла на 1"
        }
      }),
      monster: {
        id: "monster.queue-counter-gargoyle",
        name: "Гаргулья віконця черги",
        description: "Тестова черга.",
        level: 4,
        tags: ["construct"]
      },
      questProgress: questProgress(4)
    });
    const telegraphText = presentPersistentFight({
      state: "persistent-active",
      character,
      session: persistentSession({
        lastTurn: {
          action: "attack",
          heroOutcome: "hit",
          heroDamage: 2,
          monsterDamage: 0,
          manaSpent: 0,
          critical: false,
          monsterAction: "telegraph",
          monsterOutcome: "defended",
          monsterTelegraphAbilityId: "monster.ledger-charge"
        }
      }),
      monster: {
        id: "monster.ledger-boar",
        name: "Кабан прибутково-видаткової книги",
        description: "Тестовий кабан.",
        level: 5,
        tags: ["beast"]
      },
      questProgress: questProgress(4)
    });

    expect(skillText).toContain(
      "Монстр застосував 🎟 <i>Ваш номер ще не настав</i>: завдав 6 шкоди; Черга посунулася не туди, і ваша точність слухняно стала в кінець; точність просіла на 1."
    );
    expect(telegraphText).toContain(
      "⚠️ Монстр готує 🐗 <i>Прибутково-видатковий таран</i>. Кабан шкрябає копитом рядок для великого тарана; захист тут дуже доречний."
    );
  });

  it("does not render a single-enemy impact signature for a missed no-effect skill", () => {
    const text = presentPersistentFight({
      state: "persistent-active",
      character,
      session: persistentSession({
        lastTurn: {
          action: "attack",
          heroOutcome: "hit",
          heroDamage: 4,
          monsterDamage: 0,
          manaSpent: 0,
          critical: false,
          monsterAction: "skill",
          monsterOutcome: "miss",
          monsterSkillId: "monster.queue-number"
        }
      }),
      monster: {
        id: "monster.queue-counter-gargoyle",
        name: "Гаргулья віконця черги",
        description: "Тестова черга.",
        level: 4,
        tags: ["construct"]
      },
      questProgress: questProgress(4)
    });

    expect(text).toContain("Монстр застосував 🎟 <i>Ваш номер ще не настав</i> без прямої шкоди цього ходу.");
    expect(text).not.toContain("Черга посунулася не туди");
  });

  it("does not render a multi-enemy impact signature for a missed no-effect skill", () => {
    const text = presentPersistentFight({
      state: "persistent-active",
      character,
      session: persistentSession({
        turn: 2,
        lastTurn: {
          action: "attack",
          heroOutcome: "hit",
          heroDamage: 5,
          monsterDamage: 0,
          manaSpent: 0,
          critical: false,
          enemyActions: [
            {
              enemyId: "enemy:1",
              monsterId: "monster.ledger-boar",
              monsterName: "Кабан прибутково-видаткової книги",
              monsterOutcome: "miss",
              monsterDamage: 0,
              monsterAction: "skill",
              monsterSkillId: "monster.ledger-charge",
              monsterDamageKind: "physical"
            },
            {
              enemyId: "enemy:2",
              monsterId: "monster.queue-counter-gargoyle",
              monsterName: "Гаргулья віконця черги",
              monsterOutcome: "miss",
              monsterDamage: 0,
              monsterAction: "attack"
            }
          ]
        }
      }),
      monster: {
        id: "monster.ledger-boar",
        name: "Кабан прибутково-видаткової книги",
        description: "Тестовий кабан.",
        level: 5,
        tags: ["beast"]
      },
      questProgress: questProgress(4)
    });

    expect(text).toContain("Кабан застосовує 🐗 <i>Прибутково-видатковий таран</i> без прямої шкоди цього ходу.");
    expect(text).not.toContain("Кабан вписав шкоду в обидві колонки");
  });

  it("renders impact signatures for no-damage stored skill effects", () => {
    const text = presentPersistentFight({
      state: "persistent-active",
      character,
      session: persistentSession({
        lastTurn: {
          action: "attack",
          heroOutcome: "hit",
          heroDamage: 4,
          monsterDamage: 0,
          manaSpent: 0,
          critical: false,
          monsterAction: "skill",
          monsterOutcome: "hit",
          monsterSkillId: "monster.queue-number",
          monsterEffectText: "точність просіла на 1"
        }
      }),
      monster: {
        id: "monster.queue-counter-gargoyle",
        name: "Гаргулья віконця черги",
        description: "Тестова черга.",
        level: 4,
        tags: ["construct"]
      },
      questProgress: questProgress(4)
    });

    expect(text).toContain(
      "Монстр застосував 🎟 <i>Ваш номер ще не настав</i>: Черга посунулася не туди, і ваша точність слухняно стала в кінець; точність просіла на 1."
    );
  });

  it("marks simultaneous final response lines in persisted turn summaries", () => {
    const text = presentPersistentFight({
      state: "persistent-active",
      character,
      session: persistentSession({
        turn: 2,
        lastTurn: {
          action: "attack",
          heroOutcome: "won",
          heroDamage: 18,
          monsterDamage: 4,
          manaSpent: 0,
          critical: false,
          simultaneousFinalResponse: true,
          monsterOutcome: "hit",
          monsterAction: "attack"
        }
      }),
      monster: {
        id: "monster.test",
        name: "Тестовий монстр",
        description: "Тест.",
        level: 1,
        tags: ["test"]
      },
      questProgress: questProgress(4)
    });

    expect(text).toContain("Монстр устиг відповісти в ту саму мить.");
    expect(text).toContain("Монстр атакував у відповідь на ваш хід і завдав 4 шкоди.");
  });

  it("falls back to stable labels when multi-enemy HP rows lack names", () => {
    const text = presentPersistentFight({
      state: "persistent-active",
      character,
      session: persistentSession({
        turn: 4,
        monster: {
          id: "monster.sourdough-golem",
          name: "Квасний голем на заквасці",
          level: 5,
          hp: 32,
          hpMax: 32
        },
        enemies: [
          {
            enemyId: "enemy:1",
            id: "monster.sourdough-golem",
            level: 5,
            hp: 32,
            hpMax: 32
          },
          {
            enemyId: "enemy:2",
            id: "monster.second",
            level: 3,
            hp: 26,
            hpMax: 26
          }
        ]
      }),
      monster: {
        id: "monster.sourdough-golem",
        name: "Квасний голем на заквасці",
        description: "Тестовий монстр.",
        level: 5,
        tags: ["test"]
      },
      questProgress: questProgress(4)
    });

    expect(text).toContain("👹 1. Квасний: 32/32 ← ціль");
    expect(text).toContain("👹 2. Монстр: 26/26");
    expect(text).not.toContain("👹 1.:");
    expect(text).not.toContain("👹 2.:");
  });

  it("does not render active prompts for terminal multi-enemy state", () => {
    const text = presentPersistentFight({
      state: "persistent-terminal",
      character,
      session: persistentSession({
        status: "won",
        monster: {
          id: "monster.second",
          name: "Другий",
          level: 3,
          hp: 0,
          hpMax: 16
        },
        enemies: [
          {
            enemyId: "enemy:2",
            id: "monster.second",
            name: "Другий",
            level: 3,
            hp: 0,
            hpMax: 16
          },
          {
            enemyId: "enemy:1",
            id: "monster.first",
            name: "Перший",
            level: 2,
            hp: 0,
            hpMax: 18
          }
        ]
      }),
      monster: null,
      questProgress: questProgress(4),
      fightReward: null
    });

    expect(text).toContain("👹 1. Другий: 0/16");
    expect(text).toContain("👹 2. Перший: 0/18");
    expect(text).not.toContain("що робимо?");
    expect(text).not.toContain("На хід є 23 секунди");
  });

  it("names the skill that is still on cooldown", () => {
    const text = presentPersistentFight({
      state: "persistent-active",
      character,
      session: persistentSession({
        cooldowns: {
          skill: {
            id: "skill.strict-blessing",
            remainingTurns: 1
          }
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

    expect(text).toContain("🫁 ✨ Суворе благословення відсапується: ще 1 хід.");
    expect(text).not.toContain("🫁 Вміння відсапується");
  });

  it("shows dense bandage cooldown with active combat notices", () => {
    const text = presentPersistentFight({
      state: "persistent-active",
      character,
      session: persistentSession({
        combatItems: {
          cooldowns: {
            "item.dense-bandage": {
              itemId: "item.dense-bandage",
              remainingTurns: 3
            }
          }
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

    expect(text).toContain("🫁 🩹 Щільний бинт відсапується: ще 3 ходи.");
  });

  it("describes field kit combat healing as reaching the resulting HP", () => {
    const text = presentPersistentFight({
      state: "persistent-active",
      character,
      session: persistentSession({
        lastTurn: {
          action: "item",
          heroOutcome: "item-used",
          heroDamage: 0,
          monsterDamage: 0,
          manaSpent: 0,
          critical: false,
          itemId: "item.field-kit",
          itemName: "Польова аптечка",
          heroHealing: 18,
          heroHpAfter: 93
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

    expect(text).toContain("Ви використали <b>Польова аптечка</b>. HP підтягнулись до 93.");
    expect(text).not.toContain("Польова аптечка</b>. HP підросли на 18.");
  });

  it("explains when a hidden class skill needs more mana after cooldown", () => {
    const text = presentPersistentFight({
      state: "persistent-active",
      character: {
        ...character,
        classId: "class.mage",
        className: "Маг",
        manaCurrent: 4,
        manaMax: 14
      },
      session: persistentSession({
        hero: {
          hp: 15,
          hpMax: 28,
          mana: 4,
          manaMax: 14
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

    expect(text).toContain("🪫 🔥 Гаряче закляття: треба 5 мани, зараз 4.");
    expect(text).not.toContain("Гаряче закляття відсапується");
  });

  it("shows frozen monster context cues only on the opening active card", () => {
    const text = presentPersistentFight({
      state: "persistent-active",
      character,
      session: persistentSession({
        context: {
          version: 1,
          rulesVersion: "monster-context-v1",
          monsterId: "monster.test",
          traitIds: ["context.night-shift"],
          world: {
            version: 1,
            timezone: "Europe/Kyiv",
            utcStartedAt: "2026-06-20T00:30:00.000Z",
            localStartedAt: "2026-06-20T03:30:00[Europe/Kyiv]",
            localDate: "2026-06-20",
            dayPhase: "night",
            weekKind: "weekend",
            season: "summer",
            mealWindow: "none",
            monthEdge: "middle",
            calendarDay: 20,
            locationTags: ["korchma"],
            partySizeBand: "solo"
          },
          matchedBranches: [],
          effects: {
            outgoingDamageMultiplier: 1,
            incomingDamageMultiplier: 1,
            accuracyDeltaPp: 0,
            evasionDeltaPp: 0,
            abilityWeightDelta: 0,
            signatureCooldownDelta: 0,
            flatArmorDelta: 0,
            flatResistDelta: 0,
            flatDexterityDelta: 0
          },
          cue: {
            id: "context-cue.test",
            text: "<нічний> настрій монстра не лізе в HTML.",
            tone: "behavior-shift"
          }
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

    expect(text).toContain("🌗 <i>&lt;нічний&gt; настрій монстра не лізе в HTML.</i>");
  });

  it("does not add new-fight hero guidance to terminal persistent results", () => {
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

    expect(text).toContain("💤 Ви програли.");
    expect(text).not.toContain("/hero");
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
    expect(stale).not.toContain("Проти вас:");
    expect(stale).toContain("👹 Тестовий: 18/18");
    expect(noMana).toContain("Мани не стало навіть на драматичний жест");
    expect(noMana).not.toContain("Нагорода");
  });

  it("shows gear action availability, cooldown and bleed notices on active fight cards", () => {
    const text = presentPersistentFight({
      state: "persistent-active",
      character: { ...character, level: 10 },
      session: persistentSession({
        hero: {
          hp: 24,
          hpMax: 24,
          mana: 0,
          manaMax: 12
        },
        equipmentAbilities: {
          version: 1,
          grantIds: ["mantok-ability.red-line-dagger"]
        },
        cooldowns: {
          abilities: {
            "gear.red-line-dagger": {
              id: "gear.red-line-dagger",
              remainingTurns: 2
            }
          }
        },
        enemyStatuses: {
          version: 1,
          enemies: {
            "enemy:1": {
              bleed: {
                sourceAbilityId: "gear.red-line-dagger",
                sourceActor: "hero",
                target: "enemy",
                kind: "bleed",
                polarity: "harmful",
                removable: true,
                damagePerActivation: 1,
                remainingHeroActivations: 2,
                refreshedAtTurn: 1
              }
            }
          }
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

    expect(text).toContain("🫁 🩸 Червоний рядок відсапується: ще 2 ходи.");
    expect(text).toContain("🩸 Кровотеча триває: 1 шкоди, ще 2 активац.");
  });

  it("shows gear mana failure reasons on active fight cards", () => {
    const text = presentPersistentFight({
      state: "persistent-active",
      character: { ...character, level: 10 },
      session: persistentSession({
        hero: {
          hp: 24,
          hpMax: 24,
          mana: 0,
          manaMax: 12
        },
        equipmentAbilities: {
          version: 1,
          grantIds: ["mantok-ability.red-line-dagger"]
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

    expect(text).toContain("🪫 🩸 Червоний рядок: треба 1 мани, зараз 0.");
  });

  it("shows gear action names and bleed notices in the fight journal", () => {
    const text = presentPersistentFightJournal(
      {
        state: "found",
        character: { ...character, level: 10 },
        session: persistentSession({
          turn: 2,
          turnLog: [
            {
              turn: 1,
              summary: {
                action: "gear",
                heroOutcome: "hit",
                heroDamage: 5,
                monsterDamage: 2,
                heroEffectDamage: 1,
                manaSpent: 1,
                critical: false,
                skillId: "gear.red-line-dagger",
                abilitySource: "equipment"
              },
              notices: ["Ефект триває: кровотеча 1 шкоди, ще 2 активац."],
              cooldowns: {
                abilities: {
                  "gear.red-line-dagger": {
                    id: "gear.red-line-dagger",
                    remainingTurns: 2
                  }
                }
              },
              hero: {
                hp: 22,
                mana: 9
              },
              monster: {
                hp: 12
              }
            }
          ]
        }),
        monster: null
      },
      0
    );

    expect(text).toContain("Вміння 🩸 <i>Червоний рядок</i> влучає на 5 шкоди.");
    expect(text).toContain("Накладений ефект спрацював і завдав 1 шкоди.");
    expect(text).toContain("🫁 🩸 Червоний рядок відсапується: ще 2 ходи.");
    expect(text).toContain("🧷 Ефект триває: кровотеча 1 шкоди, ще 2 активац.");
  });

  it("shows item-use failures without replaying the previous real turn", () => {
    const text = presentPersistentFightTurn({
      state: "item-unavailable",
      reason: "reserved",
      character,
      session: persistentSession({
        turn: 2,
        lastTurn: {
          action: "skill",
          heroOutcome: "skill-hit",
          heroDamage: 26,
          monsterDamage: 12,
          manaSpent: 3,
          critical: true
        }
      }),
      monster: {
        id: "monster.test",
        name: "Млинок наклепу",
        description: "Меле репутацію.",
        level: 3,
        tags: ["test"]
      },
      questProgress: questProgress(4)
    });

    expect(text).toContain("Ця манатка вже зайнята іншою дією");
    expect(text).toContain("👹 Тестовий: 18/18");
    expect(text).not.toContain("Хитрий постріл");
    expect(text).not.toContain("Монстр атакував у відповідь");
  });

  it("shows a short recovery note for persistent turn callbacks at zero HP", () => {
    const text = presentPersistentFightTurn({
      state: "needs-rest",
      character: { ...character, hpCurrent: 0 },
      session: persistentSession({
        hero: {
          hp: 0,
          hpMax: 24,
          mana: 4,
          manaMax: 12
        }
      }),
      monster: null,
      questProgress: questProgress(4)
    });

    expect(text).toContain("Спершу прийдіть до тями");
    expect(text).toContain("Відновіться хоча б до 1 HP");
    expect(text).toContain("Корчма цінує бойовий запал");
    expect(text).not.toContain("Нагорода");
  });

  it("uses neutral grammar for skill turn summaries without service-log clutter", () => {
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
          critical: true,
          skillId: "skill.strict-blessing"
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

    expect(text).toContain(
      [
        "Вміння ✨ <i>Суворе благословення</i> влучає критично на 17 шкоди.",
        "Монстр атакував у відповідь на ваш хід і завдав 8 шкоди."
      ].join("\n")
    );
    expect(text).not.toContain("Хід записано");
    expect(text).not.toContain("Остання дія");
    expect(text).not.toContain("Останній хід: вміння");
    expect(text).not.toContain("критично:");
    expect(text).toContain("⏳ На хід є 23 секунди. Потім Корчма поставить вас у захист.");
    expect(text).not.toContain("Проти вас:");
    expect(text).toContain("👹 Тестовий: 18/18");
    expect(text).not.toContain("критично дала");
  });

  it("shows timeout notices for auto-attack and skipped expired turns", () => {
    const autoAttack = presentPersistentFightTurn({
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
          critical: false,
          debugTrace: {
            timeoutMode: "auto-attack"
          }
        }
      }),
      monster: null,
      questProgress: questProgress(4)
    });
    const skipped = presentPersistentFight({
      state: "persistent-active",
      character,
      session: persistentSession({
        turn: 2,
        lastTurn: {
          action: "skip",
          heroOutcome: "inactive",
          heroDamage: 0,
          monsterDamage: 3,
          manaSpent: 0,
          critical: false,
          debugTrace: {
            timeoutMode: "skip"
          }
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

    expect(autoAttack).toContain("Попередній хід прострочено: Корчма зарахувала звичайну атаку.");
    expect(skipped).toContain("Попередній хід прострочено: дію пропущено, а монстр не чекав.");
  });

  it("shows the new auto-defend timeout notice", () => {
    const text = presentPersistentFight({
      state: "persistent-active",
      character,
      session: persistentSession({
        turn: 2,
        lastTurn: {
          action: "defend",
          heroOutcome: "defended",
          heroDamage: 0,
          monsterDamage: 1,
          manaSpent: 0,
          critical: false,
          debugTrace: {
            timeoutMode: "auto-defend"
          }
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

    expect(text).toContain("Попередній хід прострочено: Корчма поставила вас у захист.");
    expect(text).toContain("Ви стали в захист");
  });

  it("renders a paged persistent fight journal from stored turns", () => {
    const session = persistentSession({
      turn: 3,
      turnLog: [
        {
          turn: 1,
          hero: { hp: 22, mana: 12 },
          monster: { hp: 14 },
          summary: {
            action: "attack",
            heroOutcome: "hit",
            heroDamage: 4,
            monsterDamage: 2,
            manaSpent: 0,
            critical: false,
            monsterAction: "attack"
          }
        },
        {
          turn: 2,
          hero: { hp: 22, mana: 12 },
          monster: { hp: 14 },
          summary: {
            action: "defend",
            heroOutcome: "defended",
            heroDamage: 0,
            monsterDamage: 0,
            manaSpent: 0,
            critical: false,
            monsterAction: "defend",
            monsterEffectText: "Монстр прикрився щитом."
          }
        }
      ]
    });
    const text = presentPersistentFightJournal({
      state: "found",
      character,
      session,
      monster: {
        id: "monster.test",
        name: "Тестовий монстр",
        description: "Тестовий монстр.",
        level: 3,
        tags: ["test"]
      },
      questProgress: questProgress(4),
      fightReward: null
    }, 1);

    expect(text).toContain("📜 <b>Журнал бою</b>");
    expect(text).toContain("Хід <b>2</b> · запис 2/2");
    expect(text).toContain("❤️ Ви після ходу: 22/24 · мана 12/12");
    expect(text).toContain("👹 Монстр після ходу: 14/18");
    expect(text).toContain("Ви стали в захист");
    expect(text).not.toContain("Хід записано");
  });

  it("replays stored monster skill signatures in combat journal pages", () => {
    const session = persistentSession({
      turn: 2,
      turnLog: [
        {
          turn: 1,
          hero: { hp: 18, mana: 12 },
          monster: { hp: 16 },
          summary: {
            action: "attack",
            heroOutcome: "hit",
            heroDamage: 4,
            monsterDamage: 5,
            manaSpent: 0,
            critical: false,
            monsterAction: "skill",
            monsterOutcome: "hit",
            monsterSkillId: "monster.balance-the-tide"
          }
        }
      ]
    });
    const text = presentPersistentFightJournal({
      state: "found",
      character,
      session,
      monster: {
        id: "monster.accountant-vodianyk",
        name: "Водяний-бухгалтер припливів",
        description: "Тестовий водяний.",
        level: 7,
        tags: ["aquatic"]
      },
      questProgress: questProgress(4),
      fightReward: null
    });

    expect(text).toContain("Водяний звів приплив із відпливом; частина шкоди повернулася хвилею.");
  });

  it("does not replay a missed no-effect monster skill as an impact signature in combat journal pages", () => {
    const session = persistentSession({
      turn: 2,
      turnLog: [
        {
          turn: 1,
          hero: { hp: 18, mana: 12 },
          monster: { hp: 16 },
          summary: {
            action: "attack",
            heroOutcome: "hit",
            heroDamage: 4,
            monsterDamage: 0,
            manaSpent: 0,
            critical: false,
            monsterAction: "skill",
            monsterOutcome: "miss",
            monsterSkillId: "monster.balance-the-tide"
          }
        }
      ]
    });
    const text = presentPersistentFightJournal({
      state: "found",
      character,
      session,
      monster: {
        id: "monster.accountant-vodianyk",
        name: "Водяний-бухгалтер припливів",
        description: "Тестовий водяний.",
        level: 7,
        tags: ["aquatic"]
      },
      questProgress: questProgress(4),
      fightReward: null
    });

    expect(text).toContain("без прямої шкоди цього ходу");
    expect(text).not.toContain("Водяний звів приплив із відпливом");
  });

  it("renders stored cooldowns and active effect notices in combat journal pages", () => {
    const session = persistentSession({
      turn: 3,
      turnLog: [
        {
          turn: 2,
          hero: { hp: 22, mana: 9 },
          monster: { hp: 11 },
          cooldowns: {
            skill: {
              id: "skill.hot-spell",
              remainingTurns: 1
            }
          },
          notices: [
            "Ефект триває: ваша влучність просіла на 15 пунктів, спаде після вашої наступної дії."
          ],
          summary: {
            action: "skill",
            heroOutcome: "hit",
            heroDamage: 7,
            monsterDamage: 3,
            manaSpent: 3,
            critical: false,
            skillId: "skill.hot-spell",
            damageKind: "spell"
          }
        }
      ]
    });
    const text = presentPersistentFightJournal({
      state: "found",
      character,
      session,
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

    expect(text).toContain("🫁 🔥 Гаряче закляття відсапується: ще 1 хід.");
    expect(text).toContain("🧷 Ефект триває: ваша влучність просіла на 15 пунктів, спаде після вашої наступної дії.");
    expect(text).not.toContain("п.п.");
  });

  it("renders multi-enemy journal HP rows and zero-damage enemy misses", () => {
    const session = persistentSession({
      turn: 2,
      monster: {
        id: "monster.bread",
        name: "Буханець дедлайнів",
        level: 3,
        hp: 6,
        hpMax: 17
      },
      enemies: [
        {
          enemyId: "enemy:1",
          id: "monster.bread",
          name: "Буханець дедлайнів",
          level: 3,
          hp: 6,
          hpMax: 17
        },
        {
          enemyId: "enemy:2",
          id: "monster.pack",
          name: "Зграя дрібних правок",
          level: 2,
          hp: 8,
          hpMax: 18
        }
      ],
      turnLog: [
        {
          turn: 1,
          hero: { hp: 16, mana: 11 },
          monster: { hp: 6 },
          enemies: [
            { enemyId: "enemy:1", hp: 6 },
            { enemyId: "enemy:2", hp: 8 }
          ],
          summary: {
            action: "attack",
            heroOutcome: "hit",
            heroDamage: 9,
            monsterDamage: 0,
            manaSpent: 0,
            critical: false,
            enemyActions: [
              {
                enemyId: "enemy:1",
                monsterId: "monster.bread",
                monsterName: "Буханець дедлайнів",
                monsterOutcome: "miss",
                monsterDamage: 0,
                monsterAction: "attack"
              },
              {
                enemyId: "enemy:2",
                monsterId: "monster.pack",
                monsterName: "Зграя дрібних правок",
                monsterOutcome: "miss",
                monsterDamage: 0,
                monsterAction: "attack"
              }
            ]
          }
        }
      ]
    });
    const text = presentPersistentFightJournal({
      state: "found",
      character,
      session,
      monster: {
        id: "monster.bread",
        name: "Буханець дедлайнів",
        description: "Тестовий буханець.",
        level: 3,
        tags: ["test"]
      },
      questProgress: questProgress(4),
      fightReward: null
    }, 0);

    expect(text).toContain("👹 1. Буханець після ходу: 6/17");
    expect(text).toContain("👹 2. Зграя після ходу: 8/18");
    expect(text).not.toContain("👹 Монстр після ходу");
    expect(text).toContain("Атака влучає на 9 шкоди.");
    expect(text).toContain("Буханець промахується");
    expect(text).toContain("Зграя промахується");
  });

  it("renders backup enemy pressure pauses in multi-enemy journals", () => {
    const session = persistentSession({
      turn: 2,
      monster: {
        id: "monster.borshch",
        name: "Борщовий ревізор",
        level: 3,
        hp: 14,
        hpMax: 18
      },
      enemies: [
        {
          enemyId: "enemy:1",
          id: "monster.borshch",
          name: "Борщовий ревізор",
          level: 3,
          hp: 14,
          hpMax: 18
        },
        {
          enemyId: "enemy:2",
          id: "monster.gargoyle",
          name: "Ґарґулья з мокрим протоколом",
          level: 4,
          hp: 26,
          hpMax: 30
        }
      ],
      turnLog: [
        {
          turn: 1,
          hero: { hp: 22, mana: 12 },
          monster: { hp: 14 },
          enemies: [
            { enemyId: "enemy:1", hp: 14 },
            { enemyId: "enemy:2", hp: 26 }
          ],
          summary: {
            action: "skill",
            heroOutcome: "hit",
            heroDamage: 8,
            monsterDamage: 6,
            manaSpent: 2,
            critical: false,
            skillId: "skill.dry-tide",
            enemyResults: [
              {
                enemyId: "enemy:1",
                monsterId: "monster.borshch",
                monsterName: "Борщовий ревізор",
                damage: 4,
                outcome: "hit"
              },
              {
                enemyId: "enemy:2",
                monsterId: "monster.gargoyle",
                monsterName: "Ґарґулья з мокрим протоколом",
                damage: 4,
                outcome: "hit"
              }
            ],
            enemyActions: [
              {
                enemyId: "enemy:1",
                monsterId: "monster.borshch",
                monsterName: "Борщовий ревізор",
                monsterOutcome: "hit",
                monsterDamage: 6,
                monsterAction: "attack"
              }
            ],
            enemyPressureSkips: [
              {
                enemyId: "enemy:2",
                monsterId: "monster.gargoyle",
                monsterName: "Ґарґулья з мокрим протоколом"
              }
            ]
          }
        }
      ]
    });
    const text = presentPersistentFightJournal({
      state: "found",
      character,
      session,
      monster: {
        id: "monster.borshch",
        name: "Борщовий ревізор",
        description: "Тестовий ревізор.",
        level: 3,
        tags: ["test"]
      },
      questProgress: questProgress(4),
      fightReward: null
    }, 0);

    expect(text).toContain("Монстр атакував у відповідь на ваш хід і завдав 6 шкоди.");
    expect(text).toContain("Ґарґулья займає позицію і поки не б’є: підмога тисне через хід.");
  });

  it("adds the terminal last turn to the journal when it is missing from stored turns", () => {
    const session = persistentSession({
      status: "won",
      turn: 3,
      hero: {
        hp: 19,
        hpMax: 24,
        mana: 11,
        manaMax: 12
      },
      monster: {
        id: "monster.test",
        hp: 0,
        hpMax: 18
      },
      turnLog: [
        {
          turn: 1,
          hero: { hp: 22, mana: 12 },
          monster: { hp: 14 },
          summary: {
            action: "attack",
            heroOutcome: "hit",
            heroDamage: 4,
            monsterDamage: 2,
            manaSpent: 0,
            critical: false,
            monsterAction: "attack"
          }
        }
      ],
      lastTurn: {
        action: "skill",
        heroOutcome: "won",
        heroDamage: 14,
        monsterDamage: 0,
        manaSpent: 1,
        critical: false,
        skillId: "skill.strict-blessing"
      }
    });
    const text = presentPersistentFightJournal({
      state: "found",
      character,
      session,
      monster: {
        id: "monster.test",
        name: "Тестовий монстр",
        description: "Тестовий монстр.",
        level: 3,
        tags: ["test"]
      },
      questProgress: questProgress(4),
      fightReward: null
    }, 1);

    expect(text).toContain("Хід <b>2</b> · запис 2/2");
    expect(text).toContain("❤️ Ви після ходу: 19/24 · мана 11/12");
    expect(text).toContain("👹 Монстр після ходу: 0/18");
    expect(text).toContain("Вміння ✨ <i>Суворе благословення</i> влучає на 14 шкоди.");
  });

  it("does not duplicate an explicit terminal journal event", () => {
    const session = persistentSession({
      status: "won",
      turn: 3,
      hero: {
        hp: 19,
        hpMax: 24,
        mana: 11,
        manaMax: 12
      },
      monster: {
        id: "monster.test",
        hp: 0,
        hpMax: 18
      },
      turnLog: [
        {
          turn: 1,
          hero: { hp: 22, mana: 12 },
          monster: { hp: 14 },
          summary: {
            action: "attack",
            heroOutcome: "hit",
            heroDamage: 4,
            monsterDamage: 2,
            manaSpent: 0,
            critical: false,
            monsterAction: "attack"
          }
        },
        {
          eventId: "terminal:won",
          turn: 2,
          hero: { hp: 19, mana: 11 },
          monster: { hp: 0 },
          summary: {
            action: "skill",
            heroOutcome: "won",
            heroDamage: 14,
            monsterDamage: 0,
            manaSpent: 1,
            critical: false,
            skillId: "skill.strict-blessing"
          }
        }
      ],
      lastTurn: {
        action: "skill",
        heroOutcome: "won",
        heroDamage: 14,
        monsterDamage: 0,
        manaSpent: 1,
        critical: false,
        skillId: "skill.strict-blessing"
      }
    });
    const text = presentPersistentFightJournal({
      state: "found",
      character,
      session,
      monster: {
        id: "monster.test",
        name: "Тестовий монстр",
        description: "Тестовий монстр.",
        level: 3,
        tags: ["test"]
      },
      questProgress: questProgress(4),
      fightReward: null
    }, 1);

    expect(text).toContain("Хід <b>2</b> · запис 2/2");
    expect(text).not.toContain("запис 2/3");
  });

  it("adds one legacy eventless terminal entry when the same turn stored a different summary", () => {
    const session = persistentSession({
      status: "expired",
      turn: 3,
      hero: {
        hp: 7,
        hpMax: 24,
        mana: 10,
        manaMax: 12
      },
      monster: {
        id: "monster.test",
        hp: 6,
        hpMax: 18
      },
      turnLog: [
        {
          turn: 2,
          hero: { hp: 8, mana: 10 },
          monster: { hp: 6 },
          summary: {
            action: "attack",
            heroOutcome: "miss",
            heroDamage: 0,
            monsterDamage: 1,
            manaSpent: 0,
            critical: false,
            monsterAction: "attack"
          }
        }
      ],
      lastTurn: {
        action: "skip",
        actionOrigin: "timeout-expired",
        heroOutcome: "miss",
        monsterOutcome: "miss",
        heroDamage: 0,
        monsterDamage: 0,
        manaSpent: 0,
        critical: false
      }
    });
    const text = presentPersistentFightJournal({
      state: "found",
      character,
      session,
      monster: {
        id: "monster.test",
        name: "Тестовий монстр",
        description: "Тестовий монстр.",
        level: 3,
        tags: ["test"]
      },
      questProgress: questProgress(4),
      fightReward: null
    }, 1);

    expect(text).toContain("Хід <b>2</b> · запис 2/2");
    expect(text).toContain("Відступ не влучає.");
    expect(text).toContain("Монстр промахнувся");
  });

  it("shows monster ability consequences instead of only naming the ability", () => {
    const damaging = presentPersistentFightTurn({
      state: "updated",
      character,
      session: persistentSession({
        turn: 2,
        lastTurn: {
          action: "attack",
          heroOutcome: "hit",
          heroDamage: 4,
          monsterDamage: 7,
          heroEffectDamage: 2,
          manaSpent: 0,
          critical: false,
          monsterAction: "skill",
          monsterSkillId: "monster.split-sprint",
          monsterEffectText: "захист героя просів на 1"
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
    const noDamage = presentPersistentFightTurn({
      state: "updated",
      character,
      session: persistentSession({
        turn: 2,
        lastTurn: {
          action: "attack",
          heroOutcome: "hit",
          heroDamage: 4,
          monsterDamage: 0,
          manaSpent: 0,
          critical: false,
          monsterAction: "skill",
          monsterSkillId: "monster.split-sprint"
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
    const renamedPlaceholder = presentPersistentFightTurn({
      state: "updated",
      character,
      session: persistentSession({
        turn: 2,
        lastTurn: {
          action: "attack",
          heroOutcome: "hit",
          heroDamage: 4,
          monsterDamage: 0,
          manaSpent: 0,
          critical: false,
          monsterAction: "skill",
          monsterSkillId: "monster.missing-line"
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

    expect(damaging).toContain("Монстр застосував");
    expect(damaging).toContain("завдав 5 шкоди");
    expect(damaging).toContain("Накладений ефект спрацював і завдав 2 шкоди.");
    expect(damaging).toContain("захист героя просів на 1");
    expect(noDamage).toContain("без прямої шкоди цього ходу");
    expect(renamedPlaceholder).toContain("Рядок мінус влучність");
    expect(renamedPlaceholder).not.toContain("Немає в описі");
  });

  it("renders stored monster bark ids without rerolling copy", () => {
    const text = presentPersistentFightTurn({
      state: "updated",
      character,
      session: persistentSession({
        turn: 2,
        lastTurn: {
          action: "attack",
          heroOutcome: "hit",
          heroDamage: 4,
          monsterDamage: 1,
          manaSpent: 0,
          critical: false,
          monsterBarkId: "bark.deadline-spider.early-turn"
        }
      }),
      monster: {
        id: "monster.deadline-spider",
        name: "Павук дедлайнів",
        description: "Тестовий монстр.",
        level: 3,
        tags: ["beast"]
      },
      questProgress: questProgress(4),
      fightReward: null
    });

    expect(text).toContain(
      "🗣️ Монстр:\n<blockquote>Ще один хід — і прострочення стане вашим титулом.</blockquote>"
    );
    expect(text).toContain("Атака влучає на 4 шкоди.");
    expect(text).not.toContain("Остання дія");
  });

  it("points completed problem quest stages to Korchmar instead of auto-claiming", () => {
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
      questProgress: questProgress(14, true, false),
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
      }
    });

    expect(text).toContain("Винагорода за бій:\n<b>+9 XP\n+2 золота</b>");
    expect(text).not.toContain("Корчмар підсунув малу оплату за закриту проблему");
    expect(text).toContain("Здобуто: <i>Павутинка обіцянки «завтра»</i>");
    expect(text).not.toContain("Тринадцята проблема впала");
    expect(text).not.toContain("Нагорода за справу:\n<b>+35 XP\n+10 золота</b>");
    expect(text).not.toContain("Здобуто: <i>Жетон тринадцяти дрібних проблем</i>");
    expect(text).toContain("Корчмар уже чує, що проблем вистачило — занесіть це в шинок.");
    expect(text.indexOf("🎉 Ви перемогли")).toBeLessThan(text.indexOf("Винагорода за бій:"));
    expect(text.indexOf("Корчмар уже чує")).toBeLessThan(text.indexOf("Винагорода за бій:"));
    expect(text).not.toContain("Після бою:");
    expect(text).not.toContain("список дрібних проблем теж не відвертівся");
  });

  it("renders a separate progress ping for won problem fights", () => {
    const moved = presentProblemQuestProgressAfterFight(questProgress(5));
    const ready = presentProblemQuestProgressAfterFight(questProgress(13, true, false));
    const multiEnemy = presentProblemQuestProgressAfterFight(questProgress(6), {
      singleProblemHint: true
    });
    const claimed = presentProblemQuestProgressAfterFight(questProgress(13, true, true));

    expect(moved).toContain("📋 <b>Прогрес справи зрушив</b>");
    expect(moved).toContain("<i>Тринадцять дрібних проблем</i>: <b>5/13</b>.");
    expect(moved).not.toContain("Корчмар чекає");
    expect(moved).not.toContain("Корчмар зараховує цей бій як одну проблему");
    expect(multiEnemy).toContain("Корчмар зараховує цей бій як одну проблему");
    expect(ready).toContain("<i>Тринадцять дрібних проблем</i>: <b>13/13</b>.");
    expect(ready).toContain("Корчмар чекає в шинку");
    expect(claimed).toBeNull();
  });

  it("uses clean Shynok wording for problem-chain issue and next prompts", () => {
    const issueText = presentProblemQuestIssueNext({
      state: "issued",
      character,
      progress: questProgress(13, true, true),
      stage: problemStage("13", "Тринадцять дрібних проблем", 13, "23"),
      nextStage: problemStage("23", "Двадцять три підозрілі проблеми", 23, "42"),
      issued: "created"
    });
    const turnInText = presentProblemQuestTurnIn({
      state: "turned-in",
      character,
      progress: questProgress(13, true, false),
      result: {
        state: "claimed",
        stage: problemStage("13", "Тринадцять дрібних проблем", 13, "23"),
        reward: {
          xp: 35,
          gold: 10,
          localDate: "once",
          itemGrants: []
        },
        levelChange: null,
        nextStage: problemStage("23", "Двадцять три підозрілі проблеми", 23, "42"),
        nextStageAvailable: true,
        branchComplete: false
      }
    });

    expect(issueText).toContain("Справу «<i>Двадцять три підозрілі проблеми</i>» видано.");
    expect(issueText).not.toContain("Двадцять три підозрілі проблеми видано");
    expect(turnInText).toContain("Якщо беретеся — хай відкриє новий лічильник.");
    expect(turnInText).not.toContain("скажіть йому");
    expect(turnInText).not.toContain("в Шинку");
  });

  it("shows recovered first-paper progress instead of claiming the counter starts from zero", () => {
    const text = presentProblemQuestIssueNext({
      state: "issued",
      character,
      progress: questProgress(14, true, false),
      stage: problemStage("13", "Тринадцять дрібних проблем", 13, "23"),
      nextStage: problemStage("13", "Тринадцять дрібних проблем", 13, "23"),
      issued: "created"
    });

    expect(text).toContain("Справу «<i>Тринадцять дрібних проблем</i>» видано.");
    expect(text).toContain("У старому журналі вже <b>14/13</b> проблем.");
    expect(text).toContain("можна здати справу Корчмарю");
    expect(text).not.toContain("Лічильник починається з нуля");
  });

  it("renders a plural progress ping when several quest counters moved", () => {
    const text = presentQuestProgressAfterFight([
      {
        title: "Тринадцять дрібних проблем",
        wins: 11,
        target: 13
      },
      {
        title: "Неспокійні справи",
        wins: 3,
        target: 5
      }
    ]);

    expect(text).toContain("📋 <b>Прогрес справ зрушив</b>");
    expect(text).toContain("<i>Тринадцять дрібних проблем</i>: <b>11/13</b>.");
    expect(text).toContain("<i>Неспокійні справи</i>: <b>3/5</b>.");
    expect(text).toContain("Журнал і дощечка");
    expect(text).not.toContain("Прогрес справи зрушив");
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
    expect(text).not.toContain("Проти вас:");
    expect(text).toContain("👹 Монстр: 0/18");
    expect(text).not.toContain("👹 <b>Монстр</b>: 0/18");
    expect(text).toContain("Знешкоджено: <b>Монстр</b>.");
    expect(text).not.toContain("Корчмар зараховує");
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
      }
    });

    expect(text).toContain("🎒 За спробу:\n<b>+1 XP</b>");
    expect(text.indexOf("💤 Ви програли.")).toBeLessThan(text.indexOf("🎒 За спробу:"));
    expect(text).not.toContain("Корчмар підсунув 1 XP за спробу");
    expect(text).not.toContain("Винагорода за бій:\n<b>+1 XP</b>");
    expect(text).not.toContain("+0 золота");
    expect(text).toContain("💤 Ви програли. Список дрібних проблем не зрушив");
    expect(text).not.toContain("Після бою:");
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
      questProgress: questProgress(14, true, false),
      fightReward: {
        state: "claimed",
        reward: {
          xp: 1,
          gold: 0,
          localDate: "123e4567-e89b-12d3-a456-426614174000",
          itemGrants: []
        },
        levelChange: null
      }
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
        name: "Тестовий монстр",
        level: 3,
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

function questProgress(wins: number, completed = false, rewardClaimed = completed) {
  return {
    stageId: "13" as const,
    title: "Тринадцять дрібних проблем" as const,
    wins,
    target: 13,
    completed,
    rewardClaimed,
    issued: true,
    branchComplete: false
  };
}

function problemStage(
  id: "13" | "23" | "42" | "93",
  title: string,
  target: number,
  nextStageId: "13" | "23" | "42" | "93" | null
) {
  return {
    id,
    title,
    target,
    reward: {
      xp: 1,
      gold: 1,
      itemId: `item.problem-${id}`
    },
    issueKey: `quest.problem-chain.${id}.issued`,
    rewardKey: `quest.problem-chain.${id}.reward`,
    nextStageId
  };
}
