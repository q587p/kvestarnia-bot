import { describe, expect, it } from "vitest";
import { createGroupCombatProofState } from "../../src/domain/groupCombat/groupCombat";
import type { GroupCombatSessionRecord } from "../../src/db/repositories/groupCombatRepository";
import {
  buildGroupCombatJournalKeyboard,
  buildGroupCombatKeyboard
} from "../../src/bot/keyboards/groupCombatKeyboard";
import {
  presentGroupCombat,
  presentGroupCombatJournal
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
      deliveredRevision: 0
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
      turnExpiresAt: new Date(NOW.getTime() + 23_000),
      completedAt: null,
      participants,
      queuedActions: []
    };

    const text = presentGroupCombat(session, participants[0]!.characterId, NOW);

    expect(text).toContain("🧪 <b>Бій: 1 хід</b>");
    expect(text).toContain("⏳ До захисту мовчунів — 23 с.");
    expect(text).toContain("\n\n<b>Пригодник із довгим ім’ям 1</b>, що робимо?");
    expect(Buffer.byteLength(text, "utf8")).toBeLessThanOrEqual(4_096);
  });

  it("groups exact-target actions into compact two-button rows", () => {
    const session = createSession(3);
    session.state.participants[1]!.hp -= 1;
    session.state.participants[2]!.hp -= 1;

    const rows = buildGroupCombatKeyboard(session, session.participants[0]!.characterId).inline_keyboard;

    expect(rows.map((row) => row.length)).toEqual([2, 2, 2, 1]);
    expect(rows.flat().map((button) => button.text)).toEqual([
      "⚔️ Комірний Шурхіт 1",
      "⚔️ Комірний Шурхіт 2",
      "⚔️ Комірний Шурхіт 3",
      "🛡️ Захиститися",
      "🫶 Пригодник 2",
      "🫶 Пригодник 3",
      "🔎 Оновити"
    ]);
  });

  it("hides aid for full-health allies and exposes it after damage", () => {
    const session = createSession(2);

    const fullHealthLabels = buildGroupCombatKeyboard(
      session,
      session.participants[0]!.characterId
    ).inline_keyboard.flat().map((button) => button.text);
    session.state.participants[1]!.hp -= 1;
    const injuredLabels = buildGroupCombatKeyboard(
      session,
      session.participants[0]!.characterId
    ).inline_keyboard.flat().map((button) => button.text);

    expect(fullHealthLabels).not.toContain("🫶 Пригодник 2");
    expect(injuredLabels).toContain("🫶 Пригодник 2");
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

    expect(labels).toContain("🩹 Бинт");
    expect(labels).not.toContain("🧻 Щільний бинт");
    expect(labels).not.toContain("🧰 Аптечка");
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
    expect(text).toContain("⏳ До захисту мовчунів — 15 с.");
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

    expect(text).toContain("⏳ До захисту мовчунів — 1 с.");
    expect(text).not.toContain("23 с.");
  });

  it("opens the shared bounded battle journal and returns to terminal results", () => {
    const session = createSession(2);
    session.status = "won";
    session.state.status = "won";
    session.state.recap = [
      { turn: 1, lines: ["Пригодник 1 стає в захист."] },
      { turn: 2, lines: ["Пригодник 2 б’є Комірний Шурхіт 1 на 3."] }
    ];

    const text = presentGroupCombatJournal(session, 1);
    const resultLabels = buildGroupCombatKeyboard(session, session.participants[0]!.characterId)
      .inline_keyboard.flat().map((button) => button.text);
    const journalLabels = buildGroupCombatJournalKeyboard(session, 1)
      .inline_keyboard.flat().map((button) => button.text);

    expect(text).toContain("📜 <b>Журнал доказової сутички</b>");
    expect(text).toContain("Хід <b>2</b> · запис 2/2");
    expect(text).toContain("Пригодник 2 б’є Комірний Шурхіт 1 на 3.");
    expect(resultLabels).toContain("📜 Журнал");
    expect(journalLabels).toContain("↩️ До результатів");
  });

  it("renders truthful terminal contribution dimensions inside the card budget", () => {
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
      guardedTurns: 1
    };
    const text = presentGroupCombat(session, session.participants[0]!.characterId, NOW);
    expect(text).toContain("<b>Внесок:</b>");
    expect(text).toContain("⚔️ 13, ❤️ 7, 🛡️ 5, 🌀 3, 💥 11, ✅ 4");
    expect(Buffer.byteLength(text, "utf8")).toBeLessThanOrEqual(4_096);
  });
});

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
    deliveredRevision: 0
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
    turnExpiresAt: new Date(NOW.getTime() + 23_000),
    completedAt: null,
    participants,
    queuedActions: []
  };
}
