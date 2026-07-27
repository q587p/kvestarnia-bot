import { describe, expect, it } from "vitest";
import { createGroupCombatProofState } from "../../src/domain/groupCombat/groupCombat";
import type { GroupCombatSessionRecord } from "../../src/db/repositories/groupCombatRepository";
import {
  buildGroupCombatItemsKeyboard,
  buildGroupCombatJournalKeyboard,
  buildGroupCombatKeyboard,
  buildGroupCombatStatisticsKeyboard
} from "../../src/bot/keyboards/groupCombatKeyboard";
import {
  presentGroupCombat,
  presentGroupCombatIntro,
  presentGroupCombatJournal,
  presentGroupCombatStatistics
} from "../../src/bot/presenters/groupCombatPresenter";

const NOW = new Date("2026-07-22T10:00:00.000Z");

describe("group combat presenter", () => {
  it("keeps the maximum proof card bounded and matches the established 23-second combat prompt", () => {
    const state = createGroupCombatProofState({
      sessionId: "group-card",
      partySessionId: "party-card",
      deterministicSeed: 42,
      participants: Array.from({ length: 3 }, (_, index) => ({
        characterId: `character-${index}`,
        telegramUserId: `${1001 + index}`,
        name: `Пригодник із довгим ім’ям ${index + 1}`,
        remortCount: 0,
        rosterOrder: index,
        hp: 93,
        hpMax: 93,
        mana: 42,
        manaMax: 42,
        attack: 8,
        defense: 2,
        support: 6,
        equipmentItemIds: [`item-${index}`]
      }))
    });
    state.recap = Array.from({ length: 5 }, (_, index) => ({
      turn: index + 1,
      lines: Array.from({ length: 13 }, (__, line) => `Рядок ${line + 1}: пригода триває без зайвого галасу.`)
    }));
    const participants = state.participants.map((actor) => ({
      characterId: actor.characterId,
      telegramUserId: BigInt(actor.telegramUserId),
      name: actor.name,
      remortCount: actor.remortCount,
      rosterOrder: actor.rosterOrder,
      chatId: BigInt(actor.telegramUserId),
      messageId: 13 + actor.rosterOrder,
      referenceVersion: 1,
      deliveredRevision: 0,
      settlementStatus: "pending" as const,
      settlementAttempts: 0,
      settlementReceipt: null,
      settledAt: null
    }));
    const session: GroupCombatSessionRecord = {
      id: state.sessionId,
      partySessionId: state.partySessionId,
      partyInviteToken: "proof-token-13",
      status: "active",
      turn: state.turn,
      version: 1,
      deliveryRevision: 1,
      deliveryPending: true,
      deliveryAttemptedAt: null,
      state,
      result: null,
      settlementPlan: null,
      turnExpiresAt: new Date(NOW.getTime() + 23_000),
      completedAt: null,
      participants,
      queuedActions: []
    };

    const text = presentGroupCombat(session, participants[0]!.characterId, NOW);

    expect(text).toContain("🧪 <b>Бій</b>: 1 хід");
    expect(text).toContain("⏳ На хід є 23 с. Потім Корчма поставить вас у захист.");
    expect(text).toContain("\n\n<b>Пригодник із довгим ім’ям 1</b>, що робимо?");
    expect(Buffer.byteLength(text, "utf8")).toBeLessThanOrEqual(4_096);

    state.status = "won";
    session.status = "won";
    state.enemies.forEach((enemy) => { enemy.hp = 0; });
    state.contributions.forEach((contribution, index) => {
      contribution.damage = 93;
      contribution.healing = 93;
      contribution.guardPrevented = 93;
      contribution.control = 93;
      contribution.damageTaken = 93;
      contribution.committedActions = 25;
      contribution.guardedTurns = index;
    });
    const terminalText = presentGroupCombat(session, participants[0]!.characterId, NOW);
    expect(Buffer.byteLength(terminalText, "utf8")).toBeLessThanOrEqual(4_096);
  });

  it("omits generic ally support controls even when allies are injured", () => {
    const session = createSession(3);
    session.state.participants[1]!.hp -= 1;
    session.state.participants[2]!.hp -= 1;

    const rows = buildGroupCombatKeyboard(session, session.participants[0]!.characterId).inline_keyboard;

    expect(rows.map((row) => row.length)).toEqual([2, 2, 1]);
    expect(rows.flat().map((button) => button.text)).toEqual([
      "⚔️ Комірний Шурхіт 1",
      "⚔️ Комірний Шурхіт 2",
      "⚔️ Комірний Шурхіт 3",
      "🛡️ Захиститися",
      "🔎 Оновити"
    ]);
  });

  it("uses one plain attack button when only one monster remains", () => {
    const session = createSession(2);
    session.state.enemies[1]!.hp = 0;

    const labels = buildGroupCombatKeyboard(
      session,
      session.participants[0]!.characterId
    ).inline_keyboard.flat().map((button) => button.text);

    expect(labels).toContain("⚔️ Атакувати");
    expect(labels).not.toContain(`⚔️ ${session.state.enemies[0]!.name}`);
  });

  it("keeps the journal off active combat cards even after resolved turns", () => {
    const session = createSession(2);
    session.state.recap = [{ turn: 1, lines: ["Пригодник 1 атакує."] }];

    const labels = buildGroupCombatKeyboard(
      session,
      session.participants[0]!.characterId
    ).inline_keyboard.flat().map((button) => button.text);

    expect(labels).not.toContain("📜 Журнал");
    expect(labels).toContain("🔎 Оновити");
  });

  it("offers authored class support without restoring generic ally support", () => {
    const session = createSession(2);
    session.state.participants[0]!.classId = "class.priest";
    session.state.participants[1]!.hp -= 1;
    const labels = buildGroupCombatKeyboard(
      session,
      session.participants[0]!.characterId
    ).inline_keyboard.flat().map((button) => button.text);

    expect(labels).toContain("✨ Суворе благословення");
    expect(labels).not.toContain("🫶 Пригодник 2");
  });

  it("hides combat items while their canonical cooldown or once-per-fight limit is active", () => {
    const session = createSession(2);
    const viewer = session.state.participants[0]!;
    viewer.hp = 5;
    viewer.combatItemQuantities = {
      "item.responsible-panic-bandage": 1,
      "item.dense-bandage": 1,
      "item.field-kit": 1
    };
    viewer.combatItems = {
      cooldowns: {
        "item.dense-bandage": { itemId: "item.dense-bandage", remainingTurns: 5 }
      },
      uses: {
        "item.field-kit": { itemId: "item.field-kit", count: 1 }
      }
    };

    const labels = buildGroupCombatKeyboard(session, viewer.characterId)
      .inline_keyboard.flat().map((button) => button.text);
    const itemLabels = buildGroupCombatItemsKeyboard(session, viewer.characterId)
      .inline_keyboard.flat().map((button) => button.text);

    expect(labels).toContain("🎒 Одноразові манатки");
    expect(labels).not.toContain("🩹 Бинт відповідальної паніки");
    expect(itemLabels).toContain("🩹 Бинт відповідальної паніки");
    expect(itemLabels).not.toContain("🩹 Щільний бинт");
    expect(itemLabels).not.toContain("⚕️ Польова аптечка");
    expect(itemLabels).toContain("↩️ До бою");
  });

  it("keeps action controls available so a queued choice can be changed", () => {
    const session = createSession(2);
    session.queuedActions = [{
      turn: session.turn,
      actorCharacterId: session.participants[0]!.characterId,
      action: "guard",
      targetKind: "self",
      targetId: session.participants[0]!.characterId
    }];

    const text = presentGroupCombat(
      session,
      session.participants[0]!.characterId,
      new Date(NOW.getTime() + 8_000)
    );
    const rows = buildGroupCombatKeyboard(session, session.participants[0]!.characterId).inline_keyboard;

    expect(text).toContain("вибір записано: захиститися. Можна змінити до розіграшу ходу.");
    expect(text).toContain("⏳ На хід є 15 с. Потім Корчма поставить вас у захист.");
    expect(rows.flat().map((button) => button.text)).toEqual([
      "⚔️ Комірний Шурхіт 1",
      "⚔️ Комірний Шурхіт 2",
      "🛡️ Захиститися",
      "🔎 Оновити"
    ]);
  });

  it("renders authoritative remaining time close to timeout instead of resetting the turn", () => {
    const session = createSession(2);

    const text = presentGroupCombat(
      session,
      session.participants[0]!.characterId,
      new Date(session.turnExpiresAt.getTime() - 350)
    );

    expect(text).toContain("⏳ На хід є 1 с. Потім Корчма поставить вас у захист.");
    expect(text).not.toContain("23 с.");
  });

  it("separates the opening roster and tip from the active cooldown and effect card", () => {
    const session = createSession(2);
    const viewer = session.state.participants[0]!;
    viewer.cooldowns = {
      skill: { id: "skill.forceful-strike", remainingTurns: 2 }
    };
    viewer.combatItems = {
      cooldowns: {
        "item.dense-bandage": { itemId: "item.dense-bandage", remainingTurns: 5 }
      },
      uses: {}
    };
    session.state.enemies[0]!.abilityCooldowns = {
      "monster.deadline-web": { id: "monster.deadline-web", remainingTurns: 3 }
    };
    session.state.enemies[0]!.shield = {
      sourceAbilityId: "monster.common-group-rally",
      sourceEnemyId: session.state.enemies[0]!.id,
      points: 4
    };
    session.state.statuses = [
      {
        id: "guard:character-1",
        kind: "guard",
        sourceCharacterId: viewer.characterId,
        targetKind: "participant",
        targetId: viewer.characterId,
        value: 3,
        remainingTurns: 2
      },
      {
        id: "monster-buff",
        kind: "monster-damage-reduction",
        sourceEnemyId: session.state.enemies[0]!.id,
        sourceAbilityId: "monster.common-group-rally",
        targetKind: "enemy",
        targetId: session.state.enemies[0]!.id,
        value: 1000,
        remainingTurns: 1,
        appliedTurn: session.state.turn
      }
    ];

    const intro = presentGroupCombatIntro(session);
    const first = presentGroupCombat(session, viewer.characterId, NOW);
    const repeated = presentGroupCombat(session, viewer.characterId, NOW);

    expect(first).toBe(repeated);
    expect(intro).toContain("⚔️ <b>Бій</b>");
    expect(intro).toContain("<b>Пригодник 1</b> · рівень");
    expect(intro).toContain("Бій починається. Корчма відкриває журнал ходів");
    expect(intro).toContain("Проти вас:");
    expect(intro).toContain("<i>Порада дня:");
    expect(first).not.toContain("<b>Хто проти кого:</b>");
    expect(first).not.toContain("<i>Порада дня:");
    expect(first).not.toContain("<b>Кулдауни й ефекти:</b>");
    expect(first).not.toContain("<b>Останні дії:</b>");
    expect(first).toContain("Силовий замах відсапується: ще 2 ходи.");
    expect(first).toContain("Щільний бинт відсапується: ще 5 ходів.");
    expect(first).toContain("Павутина «на вчора» відсапується: ще 3 ходи.");
    expect(first).toContain(`🫧 ${session.state.enemies[0]!.name} · щит: 4.`);
    expect(first).toContain("🛡️ захист · Пригодник 1: ще 2 ходи.");
    expect(first).toContain(`🧱 укріплення · ${session.state.enemies[0]!.name}: ще 1 хід.`);
    expect(Buffer.byteLength(first, "utf8")).toBeLessThanOrEqual(4_096);
  });

  it("explains remort reinforcements and Nyz pressure in the one-time intro", () => {
    const session = productionTerminalSession();
    session.state.production!.remort.sourceRemortCount = 3;
    session.state.production!.threat.escalated = true;
    session.state.production!.threat.appliedSecondEnemyLevelBonus = 2;

    const intro = presentGroupCombatIntro(session);

    expect(intro).toContain(
      "🧿 <i>Відплата за минулі пригоди:</i> ремортна памʼять покликала ворогам підмогу."
    );
    expect(intro).toContain(
      "📈 <i>Натиск Низу:</i> перша підмога отримала +2 рівні."
    );
  });

  it("keeps each defeated-enemy notice in its own active-card paragraph", () => {
    const session = createSession(2);
    session.state.recap = [{
      turn: 1,
      lines: [
        "Пригодник 1 атакує: 13 шкоди.",
        "🧾 Знешкоджено: Комірний Шурхіт 1.",
        "Комірний Шурхіт 2 відповідає Пригодник 1: 3 шкоди."
      ]
    }];

    const text = presentGroupCombat(session, session.participants[0]!.characterId, NOW);

    expect(text).toContain(
      "Пригодник 1 атакує: 13 шкоди.\n\n🧾 Знешкоджено: Комірний Шурхіт 1.\n\nКомірний Шурхіт 2 відповідає Пригодник 1: 3 шкоди."
    );
  });

  it("opens the shared bounded battle journal and returns to terminal results", () => {
    const session = createSession(2);
    session.status = "won";
    session.state.status = "won";
    session.state.rulesVersion = "group-combat.v3";
    session.state.encounterKey = "nyz-left-passage-party.v1";
    session.participants.forEach((participant) => {
      participant.settlementStatus = "completed";
    });
    session.state.recap = [
      { turn: 1, lines: ["Пригодник 1 стає в захист."] },
      {
        turn: 2,
        lines: ["Пригодник 2 атакує «Комірний Шурхіт 1»: 3 шкоди."],
        monsterBarkIds: ["bark.deadline-spider.engage-party"],
        snapshot: {
          participants: session.state.participants.map((participant, index) => ({
            hp: participant.hp - index,
            mana: participant.mana,
            cooldowns: index === 0
              ? [{ id: "skill.forceful-strike", remainingTurns: 2 }]
              : [],
            itemCooldowns: []
          })),
          enemies: session.state.enemies.map((enemy, index) => ({
            hp: enemy.hp - index,
            cooldowns: index === 0
              ? [{ id: "monster.deadline-web", remainingTurns: 3 }]
              : []
          })),
          effects: [{
            kind: "guard",
            targetKind: "participant",
            targetId: session.state.participants[0]!.characterId,
            remainingTurns: 2
          }]
        }
      }
    ];

    const text = presentGroupCombatJournal(session, 1);
    const resultLabels = buildGroupCombatKeyboard(session, session.participants[0]!.characterId)
      .inline_keyboard.flat().map((button) => button.text);
    const journalLabels = buildGroupCombatJournalKeyboard(session, 1)
      .inline_keyboard.flat().map((button) => button.text);

    expect(text).toContain("📜 <b>Журнал бою</b>");
    expect(text).toContain("Хід <b>2</b> · запис 2/2");
    expect(text).toContain("Збережено весь бій: 2 ходи.");
    expect(text).toContain("Пригодник 2 атакує «Комірний Шурхіт 1»: 3 шкоди.");
    expect(text).toContain("❤️ життя");
    expect(text).toContain("🔷 мана");
    expect(text).toContain("🗣️ Монстр:");
    expect(text).toContain("Усім терміново? Чудово, всіх і заплутаю.");
    expect(text).toContain("Силовий замах відсапується: ще 2 ходи.");
    expect(text).toContain("Павутина «на вчора» відсапується: ще 3 ходи.");
    expect(text).toContain("🛡️ захист");
    expect(resultLabels).toContain("📜 Журнал");
    expect(resultLabels).toContain("📊 Статистика");
    expect(resultLabels).not.toContain("🔎 Оновити");
    expect(journalLabels).toContain("↩️ До результатів");
  });

  it("labels a production journal as the rolling last twenty-five turns", () => {
    const session = createSession(2);
    session.status = "won";
    session.state.status = "won";
    session.state.rulesVersion = "group-combat.v3";
    session.state.encounterKey = "nyz-left-passage-party.v1";
    session.state.recap = Array.from({ length: 25 }, (_, index) => ({
      turn: index + 2,
      lines: [`Хід ${index + 2}.`]
    }));

    const text = presentGroupCombatJournal(session, 0);

    expect(text).toContain("Збережено останні 25 ходів: ходи 2–26.");
  });

  it("moves truthful terminal contribution dimensions to a separate bounded statistics card", () => {
    const session = createSession(3);
    session.status = "won";
    session.state.status = "won";
    session.state.enemies.forEach((enemy) => { enemy.hp = 0; });
    session.state.contributions[0] = {
      characterId: session.state.participants[0]!.characterId,
      damage: 13,
      healing: 7,
      guardPrevented: 5,
      control: 3,
      damageTaken: 11,
      committedActions: 4,
      guardedTurns: 1,
      specialActions: 2
    };
    const result = presentGroupCombat(session, session.participants[0]!.characterId, NOW);
    const statistics = presentGroupCombatStatistics(session);
    const labels = buildGroupCombatStatisticsKeyboard(session)
      .inline_keyboard.flat().map((button) => button.text);

    expect(result).not.toContain("<b>Легенда:</b>");
    expect(result).not.toContain("<b>Пригодники:</b>");
    expect(statistics).toContain("📊 <b>Статистика бою</b>");
    expect(statistics).toContain("<b>Легенда:</b>");
    expect(statistics).toContain("⚔️ шкода суперникам · ❤️ лікування · 🛡️ відвернена шкода");
    expect(statistics).toContain("🌀 послаблена відповідь · 💥 отримана шкода · ✅ дії");
    expect(statistics).toContain("✨ спецатаки · 🧱 захисні ходи");
    expect(statistics).toContain("<b>Пригодники:</b>");
    expect(statistics).toContain("⚔️ 13, ❤️ 7, 🛡️ 5, 🌀 3, 💥 11, ✅ 4, ✨ 2, 🧱 1");
    expect(statistics).toContain("<b>Монстри:</b>");
    expect(statistics).toContain("Комірний Шурхіт 1: ⚔️ 0, ❤️ 0, 🛡️ 0, 🌀 0, 💥 0, ✅ 0, ✨ 0, 🧱 0");
    expect(labels).toEqual(["↩️ До результатів"]);
    expect(Buffer.byteLength(statistics, "utf8")).toBeLessThanOrEqual(4_096);
  });

  it("uses the ordinary fight result and reward shape for a production participant", () => {
    const session = productionTerminalSession();
    const viewer = session.participants[0]!;

    const text = presentGroupCombat(session, viewer.characterId, NOW);

    expect(text).not.toContain("🧾 Знешкоджено:");
    expect(text).toContain("🎉 Ватага перемогла.");
    expect(text).toContain("Винагорода за бій:");
    expect(text).toContain("+13 XP");
    expect(text).toContain("+2 золота");
    expect(text).toContain("Здобуто: <i>Бинт відповідальної паніки</i>");
    expect(text).toContain("🎉 Рівень підріс: <b>3 → 4</b>.");
    expect(text).not.toContain("Ваш підсумок");
  });

  it("states plainly when the encounter-wide manatka roll grants nothing", () => {
    const session = productionTerminalSession();
    const viewer = session.participants[0]!;
    session.settlementPlan!.participants[0]!.rewards.items = [];

    const text = presentGroupCombat(session, viewer.characterId, NOW);

    expect(text).toContain("+13 XP");
    expect(text).toContain("🎒 Манатки цього разу не випали.");
  });

  it("keeps the full production result while excluding a timeout-only viewer from rewards", () => {
    const session = productionTerminalSession();
    const viewer = session.participants[1]!;

    const text = presentGroupCombat(session, viewer.characterId, NOW);

    expect(text).not.toContain("🧾 Знешкоджено:");
    expect(text).toContain("🎉 Ватага перемогла.");
    expect(text).toContain("Винагороди немає: цього разу ви не обрали жодної дії вручну.");
    expect(text).not.toContain("Винагорода за бій:");
  });
});

function productionTerminalSession(): GroupCombatSessionRecord {
  const session = createSession(2);
  session.status = "won";
  session.state.status = "won";
  session.state.rulesVersion = "group-combat.v3";
  session.state.encounterKey = "nyz-left-passage-party.v1";
  session.state.enemies.forEach((enemy) => {
    enemy.hp = 0;
  });
  session.state.participants.forEach((participant) => {
    participant.level = 3;
  });
  session.state.contributions[0]!.committedActions = 2;
  session.state.contributions[0]!.specialActions = 1;
  session.state.contributions[1]!.committedActions = 0;
  session.state.contributions[1]!.specialActions = 0;
  session.state.production = {
    version: 1,
    origin: "nyz-left-passage-party.v1",
    locationId: "location.korchma.deep.level1.left",
    encounterId: "encounter-13",
    encounterToken: "encounter-token-13",
    encounterSeed: "encounter-seed-13",
    initiatingCharacterId: session.participants[0]!.characterId,
    initiatingRemortCount: 0,
    primaryMonsterId: "monster.deadline-spider",
    primaryBaseMonsterLevel: 2,
    primaryEffectiveMonsterLevel: 5,
    threat: {
      participants: session.state.participants.map((participant) => ({
        characterId: participant.characterId,
        rosterOrder: participant.rosterOrder,
        remortCount: 0,
        decision: {
          enemyCount: 1,
          reason: "base",
          eligibleWins: 0,
          secondEnemyLevelBonus: 0
        }
      })),
      sourceCharacterId: session.participants[0]!.characterId,
      sourceRosterOrder: 0,
      escalated: false,
      requestedSecondEnemyLevelBonus: 0,
      appliedSecondEnemyLevelBonus: 0,
      boostedEnemyId: null,
      levelCap: 23
    },
    remort: {
      participants: session.state.participants.map((participant) => ({
        characterId: participant.characterId,
        rosterOrder: participant.rosterOrder,
        remortCount: 0
      })),
      sourceCharacterId: session.participants[0]!.characterId,
      sourceRosterOrder: 0,
      sourceRemortCount: 0,
      backupAdjustments: []
    },
    rewards: {
      winXpTotal: 13,
      winGoldTotal: 2,
      lossXpTotal: 2,
      lootVersion: 1
    }
  };
  session.participants[0]!.currentLevel = 4;
  session.participants[1]!.currentLevel = 3;
  session.settlementPlan = {
    version: 1,
    policy: "left-passage-party",
    sessionId: session.id,
    outcome: "won",
    completedTurn: 3,
    participants: session.state.participants.map((participant, index) => ({
      characterId: participant.characterId,
      remortCount: participant.remortCount,
      rosterOrder: participant.rosterOrder,
      resources: { hp: participant.hp, mana: participant.mana },
      contribution: { ...session.state.contributions[index]! },
      rewards: index === 0
        ? {
            xp: 13,
            gold: 2,
            items: [{ itemId: "item.responsible-panic-bandage", quantity: 1 }]
          }
        : { xp: 0, gold: 0, items: [] },
      effects: {
        resourcesKey: `resources-${index}`,
        xpKey: `xp-${index}`,
        goldKey: `gold-${index}`,
        itemKey: index === 0 ? `item-${index}` : null,
        activityKey: index === 0 ? "activity-13" : null
      }
    }))
  };
  return session;
}

function createSession(participantCount: 2 | 3): GroupCombatSessionRecord {
  const state = createGroupCombatProofState({
    sessionId: `group-card-${participantCount}`,
    partySessionId: `party-card-${participantCount}`,
    deterministicSeed: 42,
    participants: Array.from({ length: participantCount }, (_, index) => ({
      characterId: `character-${index + 1}`,
      telegramUserId: `${1001 + index}`,
      name: `Пригодник ${index + 1}`,
      remortCount: 0,
      rosterOrder: index,
      hp: 20,
      hpMax: 20,
      mana: 10,
      manaMax: 10,
      attack: 8,
      defense: 2,
      support: 6,
      equipmentItemIds: []
    }))
  });
  state.enemies.forEach((enemy, index) => {
    enemy.name = `Комірний Шурхіт ${index + 1}`;
  });
  const participants = state.participants.map((actor) => ({
    characterId: actor.characterId,
    telegramUserId: BigInt(actor.telegramUserId),
    name: actor.name,
    remortCount: actor.remortCount,
    rosterOrder: actor.rosterOrder,
    chatId: BigInt(actor.telegramUserId),
    messageId: 13 + actor.rosterOrder,
    referenceVersion: 1,
    deliveredRevision: 0,
    settlementStatus: "pending" as const,
    settlementAttempts: 0,
    settlementReceipt: null,
    settledAt: null
  }));

  return {
    id: state.sessionId,
    partySessionId: state.partySessionId,
    partyInviteToken: `proof-token-${participantCount}`,
    status: "active",
    turn: state.turn,
    version: 1,
    deliveryRevision: 1,
    deliveryPending: true,
    deliveryAttemptedAt: null,
    state,
    result: null,
    settlementPlan: null,
    turnExpiresAt: new Date(NOW.getTime() + 23_000),
    completedAt: null,
    participants,
    queuedActions: []
  };
}
