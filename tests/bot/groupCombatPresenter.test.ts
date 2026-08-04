import { describe, expect, it } from "vitest";
import {
  createGroupCombatProofState,
  GROUP_COMBAT_COMPACT_EFFECT_KIND_BY_KIND
} from "../../src/domain/groupCombat/groupCombat";
import { parseGroupCombatCallbackData } from "../../src/bot/callbacks/groupCombatCallbackData";
import type { GroupCombatSessionRecord } from "../../src/db/repositories/groupCombatRepository";
import {
  buildGroupCombatAbilityTargetKeyboard,
  buildGroupCombatActionMenuKeyboard,
  buildGroupCombatItemsKeyboard,
  buildGroupCombatJournalKeyboard,
  buildGroupCombatKeyboard,
  buildGroupCombatReplyKeyboard,
  buildGroupCombatStatisticsKeyboard,
  parseGroupCombatReplyAbility,
  parseGroupCombatReplyButton
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
      replyKeyboardFingerprint: null,
      replyKeyboardGeneration: 0,
      exitDeliveryState: "none" as const,
      exitDeliveryClaimToken: null,
      exitDeliveryClaimedAt: null,
      exitDeliveryMessageId: null,
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
    console.log(
      "GroupCombat presenter terminal fixture bytes",
      Buffer.byteLength(terminalText, "utf8"),
      "/",
      4_096
    );
    expect(Buffer.byteLength(terminalText, "utf8")).toBeLessThanOrEqual(4_096);
  });

  it("keeps every active card actionable with compact inline controls", () => {
    const session = createSession(3);
    session.state.participants[1]!.hp -= 1;
    session.state.participants[2]!.hp -= 1;

    const rows = buildGroupCombatKeyboard(
      session,
      session.participants[0]!.characterId
    ).inline_keyboard;
    const replyLabels = replyKeyboardTexts(
      buildGroupCombatReplyKeyboard(session, session.participants[0]!.characterId).keyboard
    ).flat();

    expect(rows.flat().map((button) => button.text)).toEqual([
      "🗡️ Вдарити",
      "🛡 Захищатися",
      "🏃 Відступити",
      "🔎 Оновити"
    ]);
    expect(rows.map((row) => row.map((button) => button.text))).toEqual([
      ["🗡️ Вдарити", "🛡 Захищатися"],
      ["🏃 Відступити", "🔎 Оновити"]
    ]);
    expect(replyLabels).toEqual([
      "🗡️ Вдарити",
      "🛡 Захищатися",
      "🏃 Відступити",
      "🔎 Оновити"
    ]);
    expect(replyLabels).not.toContain("✨ Вміння");
    expect(parseGroupCombatReplyButton("🎒 Манатки")).toBeNull();
    expect(parseGroupCombatReplyButton("⚔️ Атакувати")).toBe("attack");
    expect(parseGroupCombatReplyButton("🛡️ Захиститися")).toBe("guard");
    expect(parseGroupCombatReplyButton("🎒 Разові")).toBe("items");
  });

  it("matches ordinary combat labels and row order when one enemy remains", () => {
    const session = createSession(2);
    const viewer = session.state.participants[0]!;
    viewer.classId = "class.warrior";
    viewer.raceId = "race.bisyny";
    session.state.enemies[1]!.hp = 0;

    expect(buildGroupCombatKeyboard(session, viewer.characterId).inline_keyboard
      .map((row) => row.map((button) => button.text))).toEqual([
      ["🗡️ Вдарити", "🛡 Захищатися"],
      ["🪓 Силовий замах", "📝 Правка на полях"],
      ["🏃 Відступити", "🔎 Оновити"]
    ]);
    expect(replyKeyboardTexts(
      buildGroupCombatReplyKeyboard(session, viewer.characterId).keyboard
    ).at(-1)).toEqual(["🏃 Відступити", "🔎 Оновити"]);

    const actionButtons = buildGroupCombatKeyboard(session, viewer.characterId)
      .inline_keyboard.flat()
      .map((button) => ({
        text: button.text,
        callbackData: "callback_data" in button ? button.callback_data : undefined
      }));
    expect(parseGroupCombatCallbackData(
      actionButtons.find((button) => button.text === "🗡️ Вдарити")?.callbackData
    )).toMatchObject({ ok: true, value: { type: "action", action: "attack", targetIndex: 0 } });
    expect(parseGroupCombatCallbackData(
      actionButtons.find((button) => button.text === "🪓 Силовий замах")?.callbackData
    )).toMatchObject({ ok: true, value: { type: "action", action: "class", targetIndex: 0 } });
  });

  it("marks the current enemy focus on participant rows like the raid card", () => {
    const session = createSession(2);
    const leader = session.state.participants[0]!;
    const striker = session.state.participants[1]!;

    expect(presentGroupCombat(session, leader.characterId, NOW))
      .toContain(`${leader.name}: ${leader.hp}/${leader.hpMax} · мана ${leader.mana}/${leader.manaMax} ← 🎯 ціль ворогів`);

    striker.threat = 13;
    const shifted = presentGroupCombat(session, leader.characterId, NOW);
    expect(shifted).toContain(`${striker.name}: ${striker.hp}/${striker.hpMax} · мана ${striker.mana}/${striker.manaMax} ← 🎯 ціль ворогів`);
    expect(shifted).not.toContain(`${leader.name}: ${leader.hp}/${leader.hpMax} · мана ${leader.mana}/${leader.manaMax} ← 🎯 ціль ворогів`);
  });

  it("marks the stored enemy focus on compact journal snapshots without inferring legacy focus", () => {
    const session = createSession(2);
    const leader = session.state.participants[0]!;
    const striker = session.state.participants[1]!;
    session.state.rulesVersion = "group-combat.v3";
    session.state.encounterKey = "nyz-left-passage-party.v1";
    session.state.recap = [{
      turn: 1,
      lines: ["Вороги відповідають ватазі."],
      snapshot: {
        f: 1,
        p: session.state.participants.map((participant) => [
          participant.hp,
          participant.mana,
          null,
          null,
          null,
          null
        ]),
        e: session.state.enemies.map((enemy) => [enemy.hp, null, null])
      }
    }];

    const stored = presentGroupCombatJournal(session, 0);
    expect(stored).toContain(
      `❤️ ${striker.name} · рівень ${striker.level} — ${striker.hp}/${striker.hpMax} · 🔮 мана ${striker.mana}/${striker.manaMax} ← 🎯 ціль ворогів`
    );
    expect(stored).not.toContain(
      `❤️ ${leader.name} · рівень ${leader.level} — ${leader.hp}/${leader.hpMax} · 🔮 мана ${leader.mana}/${leader.manaMax} ← 🎯 ціль ворогів`
    );

    const legacySnapshot = session.state.recap[0]!.snapshot;
    if (!legacySnapshot || !("p" in legacySnapshot)) {
      throw new Error("Expected compact recap snapshot");
    }
    delete legacySnapshot.f;
    expect(presentGroupCombatJournal(session, 0)).not.toContain("🎯 ціль ворогів");
  });

  it("packs multi-enemy guard and abilities into paired rows", () => {
    const session = createSession(2);
    const viewer = session.state.participants[0]!;
    viewer.classId = "class.mage";
    viewer.raceId = "race.elf";

    expect(buildGroupCombatKeyboard(session, viewer.characterId).inline_keyboard
      .map((row) => row.map((button) => button.text))).toEqual([
      ["🗡️ Вдарити", "🛡 Захищатися"],
      ["🔥 Гаряче закляття", "🎯 Ображена точність"],
      ["🏃 Відступити", "🔎 Оновити"]
    ]);
  });

  it("shows every frozen ability directly and narrows a selected ability to targets only", () => {
    const session = createSession(2);
    session.state.participants[0]!.classId = "class.warrior";
    session.state.participants[0]!.raceId = "race.dwarf";
    const viewerCharacterId = session.participants[0]!.characterId;

    const replyLabels = replyKeyboardTexts(
      buildGroupCombatReplyKeyboard(session, viewerCharacterId).keyboard
    ).flat();
    expect(replyLabels).toContain("🪓 Силовий замах");
    expect(replyLabels).toContain("🪨 Низький центр ваги");
    expect(replyLabels).not.toContain("✨ Вміння");

    const targetLabels = buildGroupCombatAbilityTargetKeyboard(
      session,
      viewerCharacterId,
      { action: "class", label: "🪓 Силовий замах", optionIndex: 0 }
    ).inline_keyboard.flat().map((button) => button.text);
    expect(targetLabels).toEqual(["Комірний 1", "Комірний 2", "↩️ До дій"]);
    expect(targetLabels.some((label) => label.includes("Низький центр ваги"))).toBe(false);
  });

  it("hides cooldown and mana unavailable abilities from the direct reply keyboard", () => {
    const session = createSession(2);
    const viewer = session.state.participants[0]!;
    viewer.classId = "class.warrior";
    viewer.raceId = "race.bisyny";
    viewer.cooldowns = {
      abilities: {
        "ability.race.margin-note": {
          id: "ability.race.margin-note",
          remainingTurns: 2
        }
      }
    };
    const labels = (): string[] => replyKeyboardTexts(
      buildGroupCombatReplyKeyboard(session, viewer.characterId).keyboard
    ).flat();

    expect(labels()).toContain("🪓 Силовий замах");
    expect(labels()).not.toContain("📝 Правка на полях");
    expect(parseGroupCombatReplyAbility(
      session,
      viewer.characterId,
      "📝 Правка на полях"
    )).toMatchObject({ action: "race", optionIndex: 0 });

    viewer.cooldowns = undefined;
    viewer.mana = 0;
    expect(labels()).toContain("🪓 Силовий замах");
    expect(labels()).not.toContain("📝 Правка на полях");

    viewer.mana = 1;
    expect(labels()).toContain("📝 Правка на полях");
    expect(replyKeyboardTexts(
      buildGroupCombatReplyKeyboard(session, viewer.characterId).keyboard
    )).toContainEqual([
      "🪓 Силовий замах",
      "📝 Правка на полях"
    ]);
    expect(replyKeyboardTexts(
      buildGroupCombatReplyKeyboard(session, viewer.characterId).keyboard
    )[0]).toEqual(["🗡️ Вдарити", "🛡 Захищатися"]);

    viewer.hp = 0;
    expect(labels()).toEqual(["🔎 Оновити"]);
    expect(parseGroupCombatReplyAbility(
      session,
      viewer.characterId,
      "📝 Правка на полях"
    )).toMatchObject({ action: "race", optionIndex: 0 });
  });

  it("gives a knocked-out participant only a refresh control while the group fight continues", () => {
    const session = createSession(2);
    session.state.rulesVersion = "group-combat.v3";
    session.state.participants[0]!.hp = 0;
    const text = presentGroupCombat(
      session,
      session.participants[0]!.characterId,
      NOW
    );

    expect(replyKeyboardTexts(
      buildGroupCombatReplyKeyboard(
        session,
        session.participants[0]!.characterId
      ).keyboard
    ).flat()).toEqual(["🔎 Оновити"]);
    expect(text).toContain("Ви вибиті з бою. Картка лишається для спостереження й оновлення.");
    expect(text).not.toContain("що робимо?");
    expect(text).not.toContain("Оберіть точну ціль");
    expect(text).not.toContain("Потім Корчма поставить вас у захист");
  });

  it("still asks for the explicit attack target when only one monster remains", () => {
    const session = createSession(2);
    session.state.enemies[1]!.hp = 0;

    const labels = buildGroupCombatActionMenuKeyboard(
      session,
      session.participants[0]!.characterId,
      "attack"
    ).inline_keyboard.flat().map((button) => button.text);

    expect(labels).toEqual(["Комірний", "↩️ До дій"]);
  });

  it("uses distinct ordinary-fight short monster names on the live card and target buttons", () => {
    const session = createSession(2);
    session.state.enemies[0]!.name = "Архівний книшоїд";
    session.state.enemies[1]!.name = "Капустяний лицар на перерві";
    session.state.recap = [{
      turn: 1,
      lines: [
        "Архівний книшоїд відповідає Пригодник 1: 3 шкоди.",
        "Капустяний лицар на перерві відповідає Пригодник 1: 3 шкоди."
      ]
    }];

    const text = presentGroupCombat(session, session.participants[0]!.characterId, NOW);
    const labels = buildGroupCombatActionMenuKeyboard(
      session,
      session.participants[0]!.characterId,
      "attack"
    ).inline_keyboard.flat().map((button) => button.text);

    expect(text).toContain("👹 Архівний: HP 14/14");
    expect(text).toContain("👹 Капустяний: HP 16/16");
    expect(text).toContain("Архівний відповідає Пригодник 1: 3 шкоди.");
    expect(text).toContain("Капустяний відповідає Пригодник 1: 3 шкоди.");
    expect(labels).toEqual([
      "Архівний",
      "Капустяний",
      "↩️ До дій"
    ]);
  });

  it("keeps the journal off active combat cards even after resolved turns", () => {
    const session = createSession(2);
    session.state.recap = [{ turn: 1, lines: ["Пригодник 1 атакує."] }];

    const labels = buildGroupCombatKeyboard(
      session,
      session.participants[0]!.characterId
    ).inline_keyboard.flat().map((button) => button.text);

    expect(labels).toContain("🔎 Оновити");
    expect(labels).toContain("🛡 Захищатися");
    expect(labels).not.toContain("📜 Журнал");
    expect(labels).not.toContain("📊 Статистика");
  });

  it("keeps an authored ally/self picker target-only and marks self unambiguously", () => {
    const session = createSession(2);
    session.state.participants[0]!.classId = "class.priest";
    session.state.participants[1]!.hp -= 1;
    const labels = buildGroupCombatActionMenuKeyboard(
      session,
      session.participants[0]!.characterId,
      "abilities"
    ).inline_keyboard.flat().map((button) => button.text);

    expect(labels).toContain("Пригодник 1 (ви)");
    expect(labels).not.toContain("✨ Суворе благословення");
    expect(labels).not.toContain("🫶 Пригодник 2");
    expect(labels).toContain("↩️ До дій");
  });

  it("keeps duplicate ally names distinct in a target-only gear picker", () => {
    const session = createSession(3);
    const viewer = session.state.participants[0]!;
    viewer.level = 12;
    viewer.gearAbilityIds = ["gear.siege-filling"];
    for (const participant of session.state.participants) {
      participant.name = "Тезка";
      participant.hp -= 1;
    }

    const labels = buildGroupCombatAbilityTargetKeyboard(session, viewer.characterId, {
      action: "gear",
      label: "🥟 Облога начинки",
      optionIndex: 0
    }).inline_keyboard.flat().map((button) => button.text);

    expect(labels).toContain("Тезка (ви)");
    expect(labels).toContain("Тезка · 2");
    expect(labels).toContain("Тезка · 3");
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("retains the frozen cosmetic title in the combat presentation", () => {
    const session = createSession(2);
    session.state.participants[0]!.activeCosmeticTitle = "Туманник";

    expect(presentGroupCombatIntro(session)).toContain("<i>Туманник</i>");
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

    const itemLabels = buildGroupCombatItemsKeyboard(session, viewer.characterId)
      .inline_keyboard.flat().map((button) => button.text);

    expect(itemLabels).toContain("🩹 Бинт відповідальної паніки");
    expect(itemLabels).not.toContain("🩹 Щільний бинт");
    expect(itemLabels).not.toContain("⚕️ Польова аптечка");
    expect(itemLabels).toContain("↩️ До бою");
    expect(replyKeyboardTexts(
      buildGroupCombatReplyKeyboard(session, viewer.characterId).keyboard
    ).flat()).toContain("🎒 Одноразові манатки");

    viewer.combatItems = {
      cooldowns: {
        "item.responsible-panic-bandage": {
          itemId: "item.responsible-panic-bandage",
          remainingTurns: 5
        },
        "item.dense-bandage": { itemId: "item.dense-bandage", remainingTurns: 5 }
      },
      uses: {
        "item.field-kit": { itemId: "item.field-kit", count: 1 }
      }
    };
    delete viewer.combatItemQuantities["item.responsible-panic-bandage"];
    expect(replyKeyboardTexts(
      buildGroupCombatReplyKeyboard(session, viewer.characterId).keyboard
    ).flat()).not.toContain("🎒 Одноразові манатки");
  });

  it("shows paired healing to a wounded owner when no living ally can benefit", () => {
    const session = createSession(2);
    const viewer = session.state.participants[0]!;
    viewer.hp = 9;
    viewer.hpMax = 35;
    viewer.combatItemQuantities = { "item.loot-v1-c002": 1 };
    session.state.participants[1]!.hp = 0;

    const usefulLabels = buildGroupCombatItemsKeyboard(session, viewer.characterId)
      .inline_keyboard.flat().map((button) => button.text);
    expect(usefulLabels).toContain("🥟 Вареники Парного Бафу");

    viewer.hp = viewer.hpMax;
    const fullLabels = buildGroupCombatItemsKeyboard(session, viewer.characterId)
      .inline_keyboard.flat().map((button) => button.text);
    expect(fullLabels).not.toContain("🥟 Вареники Парного Бафу");
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
    expect(rows.flat().map((button) => button.text)).toContain("🛡 Захищатися");
    expect(rows.flat().map((button) => button.text)).toContain("🔎 Оновити");
    expect(replyKeyboardTexts(buildGroupCombatReplyKeyboard().keyboard).flat())
      .toContain("🛡 Захищатися");
  });

  it("describes a queued flee as one participant's personal attempt", () => {
    const session = createSession(2);
    session.queuedActions = [{
      turn: session.turn,
      actorCharacterId: session.participants[0]!.characterId,
      action: "flee",
      targetKind: "self",
      targetId: session.participants[0]!.characterId,
      origin: "manual"
    }];

    const text = presentGroupCombat(
      session,
      session.participants[0]!.characterId,
      NOW
    );

    expect(text).toContain("вибір записано: спробувати відступити самому");
    expect(text).not.toContain("відступити всією ватагою");
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
    session.state.abilityEffects = [{
      id: "monster-evasion:enemy-1",
      sourceEnemyId: session.state.enemies[0]!.id,
      sourceAbilityId: "monster.emergency-dance",
      targetKind: "enemy",
      targetId: session.state.enemies[0]!.id,
      kind: "evasion",
      value: 0.2,
      polarity: "positive",
      removable: true,
      trigger: "on-monster-own-activation",
      remainingSourceActivations: 2
    }];

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
    expect(first).toContain("🫧 Комірний 1 · щит: 4.");
    expect(first).toContain("🛡️ захист · Пригодник 1: ще 2 ходи.");
    expect(first).toContain("🧱 укріплення · Комірний 1: ще 1 хід.");
    expect(first).toContain("🪽 підвищене ухилення · Комірний 1: ще 2 ходи.");
    expect(Buffer.byteLength(first, "utf8")).toBeLessThanOrEqual(4_096);
  });

  it("renders mechanically truthful effect polarity in active cards and packed history", () => {
    const session = createSession(2);
    const participant = session.state.participants[0]!;
    const enemy = session.state.enemies[0]!;
    const effects = [
      ["outgoing-damage", "participant", participant.characterId, "📉 знижена шкода"],
      ["accuracy", "participant", participant.characterId, "🌫️ знижена влучність"],
      ["evasion", "participant", participant.characterId, "🪨 знижене ухилення"],
      ["crit", "participant", participant.characterId, "📉 слабший критичний удар"],
      ["outgoing-damage", "enemy", enemy.id, "📈 посилена шкода"],
      ["evasion", "enemy", enemy.id, "🪽 підвищене ухилення"],
      ["status-resistance", "enemy", enemy.id, "🧿 підвищена стійкість до станів"],
      ["next-attack-bonus", "enemy", enemy.id, "⏭️ посилена наступна атака"]
    ] as const;
    session.state.abilityEffects = effects.map(([kind, targetKind, targetId], index) => ({
      id: `effect-${index}`,
      sourceEnemyId: enemy.id,
      sourceAbilityId: index === 0 ? "monster.title-tax" : "monster.inventory-prophecy",
      targetKind,
      targetId,
      kind,
      value: targetKind === "participant" ? 0.85 : 1.15,
      polarity: targetKind === "participant" ? "harmful" as const : "beneficial" as const,
      removable: true,
      trigger: "on-cast" as const,
      remainingTargetActivations: 3
    }));
    session.state.recap = [{
      turn: 1,
      lines: ["Ефекти звірено."],
      snapshot: {
        p: session.state.participants.map((actor) => [
          actor.hp,
          actor.mana,
          null,
          null,
          null,
          null
        ]),
        e: session.state.enemies.map((actor) => [actor.hp, null, null]),
        x: packPresenterEffects(effects.map(([kind, targetKind, targetId]) => [
          kind,
          targetKind,
          targetKind === "participant"
            ? 1 << session.state.participants.findIndex((actor) => actor.characterId === targetId)
            : 1 << session.state.enemies.findIndex((actor) => actor.id === targetId),
          3
        ]))
      }
    }];

    const active = presentGroupCombat(session, participant.characterId, NOW);
    const historical = presentGroupCombatJournal(session, 0);
    for (const [, , , expectedLabel] of effects) {
      expect(active).toContain(`${expectedLabel} ·`);
      expect(historical).toContain(`${expectedLabel} ·`);
    }
    expect(active).toContain(`${participant.name}: ще 3 ходи.`);
    expect(historical).toContain(`${participant.name}: ще 3 ходи.`);
    expect(active).toContain("Комірний 1: ще 3 ходи.");
    expect(historical).toContain("Комірний 1: ще 3 ходи.");
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

  it("keeps defeated-enemy notices after the complete action exchange", () => {
    const session = createSession(2);
    session.state.recap = [{
      turn: 1,
      lines: [
        "Пригодник 1 атакує: 13 шкоди.",
        "🧾 Знешкоджено: Комірний Шурхіт 1.",
        "Комірний Шурхіт 2 відповідає Пригодник 1: 3 шкоди.",
        "🧾 Знешкоджено: Комірний Шурхіт 2."
      ]
    }];

    const text = presentGroupCombat(session, session.participants[0]!.characterId, NOW);
    const journal = presentGroupCombatJournal(session, 0);

    for (const card of [text, journal]) {
      const attackIndex = card.indexOf("Пригодник 1 атакує: 13 шкоди.");
      const responseIndex = card.indexOf("відповідає Пригодник 1: 3 шкоди.");
      const defeatIndex = card.indexOf("🧾 Знешкоджено: Комірний Шурхіт 1.");
      expect(attackIndex).toBeGreaterThanOrEqual(0);
      expect(responseIndex).toBeGreaterThan(attackIndex);
      expect(defeatIndex).toBeGreaterThan(responseIndex);
      expect(card).toContain(
        "🧾 Знешкоджено: Комірний Шурхіт 1.\n\n🧾 Знешкоджено: Комірний Шурхіт 2."
      );
    }
  });

  it("keeps reaction causes visible on active, terminal and journal cards", () => {
    const session = createSession(2);
    session.state.recap = [{
      turn: 1,
      lines: [
        "↩️ Комірний Шурхіт 1: контрудар по Пригодник 1 — 5 шкоди.",
        "🪞 Комірний Шурхіт 2: відбиття в Пригодник 1 — 3 шкоди.",
        "💥 Комірний Шурхіт 1: щит розбито, Пригодник 1 отримує 4 шкоди."
      ]
    }];
    const active = presentGroupCombat(session, session.participants[0]!.characterId, NOW);
    const journal = presentGroupCombatJournal(session, 0);
    session.state.status = "won";
    session.status = "won";
    const terminal = presentGroupCombat(session, session.participants[0]!.characterId, NOW);

    for (const card of [active, journal, terminal]) {
      expect(card).toContain("контрудар по Пригодник 1 — 5 шкоди");
      expect(card).toContain("відбиття в Пригодник 1 — 3 шкоди");
      expect(card).toContain("щит розбито, Пригодник 1 отримує 4 шкоди");
    }
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
          enemyFocusCharacterId: session.state.participants[1]!.characterId,
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
          effects: [
            {
              kind: "guard",
              targetKind: "participant",
              targetId: session.state.participants[0]!.characterId,
              remainingTurns: 2
            },
            {
              kind: "evasion",
              targetKind: "enemy",
              targetId: session.state.enemies[0]!.id,
              remainingTurns: 2
            }
          ]
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
    expect(text).toContain("🔮 мана");
    expect(text).toContain("← 🎯 ціль ворогів");
    expect(text).not.toContain("🔷 мана");
    expect(text).toContain("🗣️ Монстр:");
    expect(text).toContain("Усім терміново? Чудово, всіх і заплутаю.");
    expect(text).toContain("Силовий замах відсапується: ще 2 ходи.");
    expect(text).toContain("Павутина «на вчора» відсапується: ще 3 ходи.");
    expect(text).toContain("🛡️ захист");
    expect(text).toContain("🪽 підвищене ухилення · Комірний 1: ще 2 ходи.");
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

  it("does not call a zero-share manual participant timeout-only", () => {
    const session = productionTerminalSession();
    const viewer = session.participants[0]!;
    session.settlementPlan!.participants[0]!.rewards = { xp: 0, gold: 0, items: [] };

    const text = presentGroupCombat(session, viewer.characterId, NOW);

    expect(text).toContain("Ручну участь записано");
    expect(text).toContain("ваш рядок — 0 XP");
    expect(text).not.toContain("ви не обрали жодної дії вручну");
  });
});

function replyKeyboardTexts(keyboard: unknown): string[][] {
  const rows = keyboard as Array<Array<{ text: string }>>;
  return rows.map((row) => row.map((button) => button.text));
}

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
    primaryStartingHp: session.state.enemies[0]!.hp,
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
    replyKeyboardFingerprint: null,
    replyKeyboardGeneration: 0,
    exitDeliveryState: "none" as const,
    exitDeliveryClaimToken: null,
    exitDeliveryClaimedAt: null,
    exitDeliveryMessageId: null,
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

function packPresenterEffects(
  effects: Array<[
    keyof typeof GROUP_COMBAT_COMPACT_EFFECT_KIND_BY_KIND,
    "participant" | "enemy",
    number,
    number
  ]>
): string {
  const kinds = Object.keys(GROUP_COMBAT_COMPACT_EFFECT_KIND_BY_KIND);
  const packed = effects.map(([kind, targetKind, targetMask, remainingTurns]) =>
    (kinds.indexOf(kind) << 11) |
    ((targetKind === "enemy" ? 1 : 0) << 10) |
    (targetMask << 4) |
    remainingTurns
  ).sort((left, right) => left - right);
  return Buffer.from(packed.flatMap((entry) => [
    (entry >> 8) & 0xff,
    entry & 0xff
  ])).toString("base64url");
}
