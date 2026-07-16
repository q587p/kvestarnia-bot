import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  presentClassNoncombatOpen,
  presentPriestBlessTargetNotification,
  presentPriestBlessResult,
  presentPriestHealResult,
  presentRoguePickpocketResult,
  presentRoguePickpocketTargetNotification,
  presentVarenykSatedPreview,
  presentVarenykSatedResult,
  presentVarenykSatedTargetNotification
} from "../../src/bot/presenters/classNoncombatPresenter";
import type {
  ClassNoncombatOpenResult,
  PriestBlessResult,
  PriestHealResult,
  RoguePickpocketResult
} from "../../src/services/classNoncombatService";

describe("class noncombat presenter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-03T09:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not duplicate the Priest target prompt when no active nearby targets exist", () => {
    const text = presentClassNoncombatOpen({
      state: "ready",
      mode: "priest",
      character: {
        id: "character-1",
        name: "Жрець",
        classId: "class.priest",
        manaCurrent: 16,
        manaMax: 16
      },
      targets: [],
      locationName: "Стіл зі справами",
      priestBlessCooldownAvailableAt: null
    } as unknown as ClassNoncombatOpenResult);

    expect(text).toContain("Поруч нікого активного немає, але себе можна підтримати без черги.");
    expect(text).toContain("⚕️ Лікування: без відпочинку, доки вистачає мани.");
    expect(text).not.toContain("⚕️ Лікування: готово.");
    expect(text).not.toContain("Оберіть себе або когось активного поруч:");
  });

  it("keeps Varenyk rank internal and shows only the applied cost and effects", () => {
    const preview = presentVarenykSatedPreview({
      state: "preview",
      targetTelegramUserId: 42n,
      target: { name: "Сусід" },
      statRank: 5,
      plan: { rank: 3, manaCost: 16, immediateHp: 5, immediateMana: 0 },
      durationMinutes: 13,
      recipientWaitMinutes: 93
    } as never);
    expect(preview).toBe([
      "🍽️ <b>Підтвердити годування?</b>",
      "",
      "Ціль: <b>Сусід</b>.",
      "",
      "Точна ціна: <b>16 мани</b>.",
      "Одразу: до <b>+5 HP</b>.",
      "Далі: <b>+2 HP і +2 мани</b> після повної хвилини поза боєм або власного ходу в бою (кожне бойове відновлення додатково скорочує «Ситого» на хвилину).",
      "",
      "😋 «Ситий»: <b>13 хв</b> · ваша нова миска для цієї цілі через <b>93 хв</b>.",
      "",
      "Вареники вже пораховані. Відступити ще не соромно."
    ].join("\n"));
    expect(preview).not.toMatch(/ранг/iu);
    expect(preview).toContain("Точна ціна: <b>16 мани</b>");
    expect(preview).toContain("Одразу: до <b>+5 HP</b>.");
    expect(preview).toContain("Далі: <b>+2 HP і +2 мани</b>");
    expect(preview).not.toContain("Одразу: до <b>+5 HP</b> і");
    expect(preview).toContain("після повної хвилини поза боєм або власного ходу в бою");
    expect(preview).toContain("кожне бойове відновлення додатково скорочує «Ситого» на хвилину");

    const completed = {
      state: "completed",
      created: true,
      action: {
        actorTelegramUserId: 1n,
        targetTelegramUserId: 2n,
        actorName: "Пан Вареник",
        targetName: "Сусід",
        rank: 3,
        manaCost: 16,
        immediateHpRestored: 0,
        immediateManaRestored: 0,
        expiresAt: new Date("2026-07-03T09:13:00.000Z"),
        availableAt: new Date("2026-07-03T10:33:00.000Z")
      },
      target: { manaCurrent: 4, manaMax: 10 }
    } as never;
    const actorResult = presentVarenykSatedResult(completed);
    const targetNotification = presentVarenykSatedTargetNotification(completed);
    expect(actorResult).not.toContain("Відновлено:");
    expect(targetNotification).not.toContain("Відновлено:");
    expect(actorResult).not.toMatch(/ранг/iu);
    expect(targetNotification).not.toMatch(/ранг/iu);
    expect(actorResult).toContain("питань.\n\nHP уже повне");
    expect(actorResult).not.toContain("Ресурси повні");
    expect(actorResult).toContain("<b>Пан Вареник</b> нагодував <b>Сусід</b>");
    expect(actorResult).toContain("станами.\n\nВи зможете нагодувати цю ціль знову");
    expect(actorResult).toContain("\n\n💫 Мани витрачено: <b>16</b>.");
    expect(targetNotification).toContain("турботою.\n\nHP уже повне");
    expect(targetNotification).not.toContain("Ресурси вже повні");
    expect(targetNotification).toContain("<b>Пан Вареник</b> передав вам вареники");
    expect(targetNotification).toContain("Видно в персонажі поруч з іншими станами.");
  });

  it("formats a fresh self-feeding result like other class support outcomes", () => {
    const text = presentVarenykSatedResult({
      state: "completed",
      created: true,
      action: {
        actorTelegramUserId: 1n,
        targetTelegramUserId: 1n,
        actorName: "Пан Вареник",
        targetName: "Пан Вареник",
        rank: 1,
        manaCost: 8,
        immediateHpRestored: 0,
        immediateManaRestored: 0,
        expiresAt: new Date("2026-07-03T09:13:00.000Z"),
        availableAt: new Date("2026-07-03T10:33:00.000Z")
      }
    } as never);

    expect(text).toBe([
      "😋 <b>Ситий</b>",
      "",
      "Вареник-мант нагодував себе. Кухонна етика знизала плечима, але зарахувала.",
      "",
      "HP уже повне, зате стан акуратно загорнутий.",
      "",
      "😋 Стан: <b>Ситий</b> ще <b>13 хв</b> — <b>+1 HP</b> і <b>+1 мани</b> щохвилини поза боєм або після власного ходу в бою (кожне бойове відновлення додатково скорочує дію на хвилину). Видно в персонажі поруч з іншими станами.",
      "",
      "Ви зможете нагодувати цю ціль знову <b>через 93 хвилини</b>.",
      "",
      "💫 Мани витрачено: <b>8</b>."
    ].join("\n"));
  });

  it("uses Varenyk-specific blockers and canonical active/wait wording", () => {
    const blocked = presentVarenykSatedResult({
      state: "blocked",
      reason: "actor-blocked"
    } as never);
    const active = presentVarenykSatedResult({
      state: "blocked",
      reason: "already-sated",
      availableAt: new Date("2026-07-03T09:13:00.000Z")
    } as never);
    const wait = presentVarenykSatedResult({
      state: "blocked",
      reason: "target-cooldown",
      availableAt: new Date("2026-07-03T10:33:00.000Z")
    } as never);

    expect(blocked).toContain("активну пригоду");
    expect(blocked).toContain("Миска почекає");
    expect(blocked).not.toContain("Жрець");
    expect(blocked).not.toContain("злодій");
    expect(active).toContain("Стан «Ситий» ще діє 13 хвилин");
    expect(wait).toContain("нагодувати цю ціль знову через 93 хвилини");
    expect(wait).not.toContain("ще пам’ятає");
  });

  it("shows only the authoritative wait on an expired replay and availability after the wait", () => {
    const action = {
      actorTelegramUserId: 1n,
      targetTelegramUserId: 2n,
      actorName: "Пан Вареник",
      targetName: "Сусід",
      rank: 2,
      manaCost: 12,
      immediateHpRestored: 1,
      immediateManaRestored: 0,
      expiresAt: new Date("2026-07-03T09:13:00.000Z"),
      availableAt: new Date("2026-07-03T10:33:00.000Z")
    };
    vi.setSystemTime(new Date("2026-07-03T09:14:00.000Z"));
    const waiting = presentVarenykSatedResult({ state: "completed", created: false, action } as never);

    expect(waiting).not.toContain("Діє ще");
    expect(waiting).toContain("Ви зможете нагодувати цю ціль знову <b>через 79 хвилин</b>");

    vi.setSystemTime(new Date("2026-07-03T10:33:00.000Z"));
    const available = presentVarenykSatedResult({ state: "completed", created: false, action } as never);
    expect(available).not.toContain("Діє ще");
    expect(available).not.toContain("Ви зможете нагодувати цю ціль знову");
    expect(available).toContain("знову можете нагодувати");
  });

  it("keeps the Priest target prompt when active nearby targets exist", () => {
    const text = presentClassNoncombatOpen({
      state: "ready",
      mode: "priest",
      character: {
        id: "character-1",
        name: "Жрець",
        classId: "class.priest",
        manaCurrent: 16,
        manaMax: 16
      },
      targets: [{
        telegramUserId: 42n,
        characterId: "target-1",
        name: "Сусід",
        classId: "class.rogue",
        level: 3,
        hpCurrent: 10,
        hpMax: 20,
        gold: 3,
        remortCount: 0
      }],
      locationName: "Стіл зі справами",
      priestBlessCooldownAvailableAt: null
    } as unknown as ClassNoncombatOpenResult);

    expect(text).toContain("Оберіть себе або когось активного поруч:");
    expect(text).not.toContain("Поруч нікого активного немає");
  });

  it("shows Priest blessing as mana-gated and lists per-target repeat waits", () => {
    const text = presentClassNoncombatOpen({
      state: "ready",
      mode: "priest",
      character: {
        id: "character-1",
        name: "Жрець",
        classId: "class.priest",
        manaCurrent: 16,
        manaMax: 16
      },
      targets: [],
      locationName: "Дошка корчми",
      priestBlessCooldownAvailableAt: null,
      priestSelfBlessAvailableAt: new Date("2026-07-03T10:33:00.000Z")
    } as unknown as ClassNoncombatOpenResult);

    expect(text).toContain("✨ Благословення: без загального відпочинку; повтор тієї самої цілі має паузу.");
    expect(text).toContain("✨ Ви: повтор через 93 хвилини.");
    expect(text).not.toContain("✨ Благословення: очікування ще 93 хвилини.");
  });

  it("shows busy Priest aid as unavailable instead of ready", () => {
    const text = presentClassNoncombatOpen({
      state: "ready",
      mode: "priest",
      actorBlocked: true,
      character: {
        id: "character-1",
        name: "Жрець",
        classId: "class.priest",
        manaCurrent: 16,
        manaMax: 16
      },
      targets: [],
      locationName: "Прямий прохід",
      priestBlessCooldownAvailableAt: null
    } as unknown as ClassNoncombatOpenResult);

    expect(text).toContain("⚕️ Лікування: недоступне під час бою або рейду.");
    expect(text).toContain("✨ Благословення: недоступне під час бою або рейду.");
    expect(text).toContain("Спершу завершіть бій або рейд.");
    expect(text).not.toContain("готово");
    expect(text).not.toContain("активним протоколом");
  });

  it("names the active adventure in the blocked Varenyk support surface", () => {
    const text = presentClassNoncombatOpen({
      state: "ready",
      mode: "varenyk",
      actorBlocked: true,
      character: {
        id: "character-varenyk",
        name: "Вареник-мант",
        classId: "class.varenyk-mancer",
        manaCurrent: 16,
        manaMax: 16
      },
      targets: [],
      locationName: "Прямий прохід"
    } as unknown as ClassNoncombatOpenResult);

    expect(text).toContain("активну пригоду, бій або рейд");
    expect(text).not.toContain("Жрець");
  });

  it("explains stale busy Priest callbacks without the protocol wording", () => {
    const text = presentPriestBlessResult({
      state: "blocked",
      reason: "actor-blocked",
      actor: {
        id: "character-1",
        name: "Жрець"
      },
      target: {
        id: "character-2",
        name: "Сусід"
      }
    } as unknown as PriestBlessResult);

    expect(text).toContain("Спершу завершіть бій або рейд.");
    expect(text).not.toContain("активним протоколом");
  });

  it("formats Priest blessing duration and mana spend clearly", () => {
    const text = presentPriestBlessResult({
      state: "completed",
      action: {
        id: "aid-1",
        actorCharacterId: "character-1",
        targetCharacterId: "character-1",
        actorTelegramUserId: 1001n,
        targetTelegramUserId: 1001n,
        actorName: "Жрець",
        targetName: "Жрець",
        actionKind: "blessing",
        healAmount: 0,
        manaCost: 23,
        cooldownAvailableAt: new Date("2026-07-03T10:33:00.000Z"),
        completedAt: new Date("2026-07-03T09:00:00.000Z")
      },
      blessing: {
        id: "blessing-1",
        actorName: "Жрець",
        targetName: "Жрець",
        expiresAt: new Date("2026-07-03T09:13:00.000Z"),
        bonusStat: "luck",
        bonusAmount: 5
      },
      actor: {
        id: "character-1",
        name: "Жрець"
      },
      target: {
        id: "character-1",
        name: "Жрець"
      },
      created: true
    } as unknown as PriestBlessResult);

    expect(text).toContain("Стан діє ще: <b>13 хвилин</b>.");
    expect(text).toContain("Бонус: <b>+5 Вдачі</b>. Видно в персонажі поруч із бафами.");
    expect(text).toContain("кадилом.\n\nСтан діє ще");
    expect(text).toContain("бафами.\n\n💫 Мани витрачено");
    expect(text).toContain("💫 Мани витрачено: <b>23</b>.");
    expect(text).not.toContain("Бонус поки");
    expect(text).not.toContain("не складається в стос");
  });

  it("bolds both names and separates Priest blessing status beats", () => {
    const text = presentPriestBlessResult({
      state: "completed",
      action: {
        id: "aid-1",
        actorCharacterId: "character-1",
        targetCharacterId: "character-2",
        actorTelegramUserId: 1001n,
        targetTelegramUserId: 1002n,
        actorName: "Zerg M",
        targetName: "Kyjivan BooksDragon",
        actionKind: "blessing",
        healAmount: 0,
        manaCost: 8,
        cooldownAvailableAt: new Date("2026-07-03T10:33:00.000Z"),
        completedAt: new Date("2026-07-03T09:00:00.000Z")
      },
      blessing: {
        id: "blessing-1",
        actorName: "Zerg M",
        targetName: "Kyjivan BooksDragon",
        expiresAt: new Date("2026-07-03T09:13:00.000Z"),
        bonusStat: "luck",
        bonusAmount: 1
      },
      actor: {
        id: "character-1",
        name: "Zerg M"
      },
      target: {
        id: "character-2",
        name: "Kyjivan BooksDragon"
      },
      created: true
    } as unknown as PriestBlessResult);

    expect(text).toContain("<b>Zerg M</b> благословив <b>Kyjivan BooksDragon</b>.");
    expect(text).toContain("<b>Kyjivan BooksDragon</b>.\n\nСтан діє ще");
    expect(text).toContain("бафами.\n\n💫 Мани витрачено: <b>8</b>.");
  });

  it("shows the blessing Priest title in target notifications", () => {
    const text = presentPriestBlessTargetNotification({
      state: "completed",
      action: {
        id: "aid-1",
        actorCharacterId: "character-1",
        targetCharacterId: "character-2",
        actorTelegramUserId: 1001n,
        targetTelegramUserId: 1002n,
        actorName: "Zerg M",
        targetName: "Kyjivan BooksDragon",
        actionKind: "blessing",
        healAmount: 0,
        manaCost: 8,
        cooldownAvailableAt: new Date("2026-07-03T10:33:00.000Z"),
        completedAt: new Date("2026-07-03T09:00:00.000Z")
      },
      blessing: {
        id: "blessing-1",
        actorName: "Zerg M",
        targetName: "Kyjivan BooksDragon",
        expiresAt: new Date("2026-07-03T09:13:00.000Z"),
        bonusStat: "luck",
        bonusAmount: 1
      },
      actor: {
        id: "character-1",
        name: "Zerg M",
        activeCosmeticTitle: "Тлумач Підозрілих Благословень"
      },
      target: {
        id: "character-2",
        name: "Kyjivan BooksDragon"
      },
      created: true
    } as unknown as Extract<PriestBlessResult, { state: "completed" }>);

    expect(text).toContain("<b>Zerg M</b> (<i>«Тлумач Підозрілих Благословень»</i>) благословив вас.");
    expect(text).toContain("планувала.\n\nСтан діє ще");
  });

  it("formats Priest healing resource lines with visible icons", () => {
    const text = presentPriestHealResult({
      state: "completed",
      action: {
        id: "aid-1",
        actorCharacterId: "character-1",
        targetCharacterId: "character-1",
        actorTelegramUserId: 1001n,
        targetTelegramUserId: 1001n,
        actorName: "Жрець",
        targetName: "Жрець",
        actionKind: "heal",
        healAmount: 4,
        manaCost: 4,
        cooldownAvailableAt: new Date("2026-07-03T10:33:00.000Z"),
        completedAt: new Date("2026-07-03T09:00:00.000Z")
      },
      actor: {
        id: "character-1",
        name: "Жрець"
      },
      target: {
        id: "character-1",
        name: "Жрець",
        hpCurrent: 20,
        hpMax: 32
      },
      created: true
    } as unknown as PriestHealResult);

    expect(text).toContain("❤️ HP: <b>+4</b> · тепер <b>20/32</b>.");
    expect(text).toContain("💫 Мани витрачено: <b>4</b>.");
    expect(text).toContain("⚕️ <b>Лікування спрацювало</b>");
    expect(text).not.toContain("Відпочинок техніки");
    expect(text).not.toContain("🩹 <b>Лікування спрацювало</b>");
  });

  it("formats Rogue result target, spacing and next-attempt time clearly", () => {
    const text = presentRoguePickpocketResult({
      state: "completed",
      attempt: {
        id: "pickpocket-1",
        actorCharacterId: "rogue-1",
        targetCharacterId: "target-1",
        actorTelegramUserId: 1001n,
        targetTelegramUserId: 1002n,
        actorName: "Злодій",
        targetName: "Сусід",
        outcome: "empty",
        stolenGold: 0,
        actorHpAfter: null,
        cooldownAvailableAt: new Date("2026-07-03T10:33:00.000Z"),
        completedAt: new Date("2026-07-03T09:00:00.000Z")
      },
      actor: {
        id: "rogue-1",
        name: "Злодій"
      },
      target: {
        id: "target-1",
        name: "Сусід"
      },
      created: true,
      unlocks: []
    } as unknown as RoguePickpocketResult);

    expect(text).toContain("Ціль: <b>Сусід</b>");
    expect(text).toContain("Ціль: <b>Сусід</b>\n\nНічого.");
    expect(text).toContain("вихована.\n\nНаступна спроба");
    expect(text).toContain("Наступна спроба: <i>93 хвилини</i>.");
    expect(text).not.toContain("Ціль: Сусід");
  });

  it("explains that noticed Rogue theft notifications are successful but seen", () => {
    const text = presentRoguePickpocketTargetNotification({
      state: "completed",
      attempt: {
        id: "pickpocket-1",
        actorCharacterId: "rogue-1",
        targetCharacterId: "target-1",
        actorTelegramUserId: 1001n,
        targetTelegramUserId: 1002n,
        actorName: "Злодій",
        targetName: "Сусід",
        outcome: "noticed-success",
        stolenGold: 6,
        actorHpAfter: null,
        cooldownAvailableAt: new Date("2026-07-03T10:33:00.000Z"),
        completedAt: new Date("2026-07-03T09:00:00.000Z")
      },
      actor: {
        id: "rogue-1",
        name: "Злодій"
      },
      target: {
        id: "target-1",
        name: "Сусід"
      },
      created: true,
      unlocks: []
    } as unknown as RoguePickpocketResult);

    expect(text).toContain("Ви помітили успішну крадіжку");
    expect(text).toContain("<b>6</b> золота");
  });

  it("names Rogue cooldown blockers and bolds the wait", () => {
    const text = presentRoguePickpocketResult({
      state: "blocked",
      reason: "cooldown",
      availableAt: new Date("2026-07-03T10:32:00.000Z"),
      actor: {
        id: "rogue-1",
        name: "Злодій"
      },
      target: {
        id: "target-1",
        name: "Сусід"
      }
    } as unknown as RoguePickpocketResult);

    expect(text).toContain("🗡️ <b>Пальці ще відсапуються</b>");
    expect(text).toContain("Після попередньої кишенькової пригоди треба зачекати ще <b>92 хвилини</b>.");
    expect(text).not.toContain("Кишеня не піддалася");
    expect(text).not.toContain("Техніка відсапується");
  });

  it("does not ask the Rogue to choose a target when no active targets exist", () => {
    const text = presentClassNoncombatOpen({
      state: "ready",
      mode: "rogue",
      character: {
        id: "rogue-1",
        name: "Злодій",
        classId: "class.rogue"
      },
      targets: [],
      locationName: "Дошка корчми",
      roguePickpocketCooldownAvailableAt: null
    } as unknown as ClassNoncombatOpenResult);

    expect(text).toContain("Активних цілей поруч немає. Кишені теж мають графік роботи.");
    expect(text).not.toContain("Оберіть активну ціль поруч:");
  });

  it("uses reason-specific Priest blocked headings", () => {
    const healText = presentPriestHealResult({
      state: "blocked",
      reason: "full-hp",
      actor: {
        id: "character-1",
        name: "Жрець"
      },
      target: {
        id: "character-1",
        name: "Жрець"
      }
    } as unknown as PriestHealResult);
    const blessText = presentPriestBlessResult({
      state: "blocked",
      reason: "target-cooldown",
      availableAt: new Date("2026-07-03T10:19:00.000Z"),
      actor: {
        id: "character-1",
        name: "Жрець"
      },
      target: {
        id: "character-1",
        name: "Жрець"
      }
    } as unknown as PriestBlessResult);

    expect(healText).toContain("⚕️ <b>Лікування не потрібне</b>");
    expect(healText).toContain("HP уже повне. Мана лишається на місці.");
    expect(blessText).toContain("✨ <b>Ціль ще пам’ятає благословення</b>");
    expect(blessText).toContain("Цю саму ціль можна благословити знову через 79 хвилин.");
    expect(blessText).not.toContain("Благословення не лягло");
  });

  it("shows Rogue same-day targets before active pickpocket prompt", () => {
    const text = presentClassNoncombatOpen({
      state: "ready",
      mode: "rogue",
      character: {
        id: "rogue-1",
        name: "Злодій",
        classId: "class.rogue"
      },
      targets: [{
        telegramUserId: 1002n,
        characterId: "target-1",
        name: "Сусід",
        classId: "class.warrior",
        level: 3,
        hpCurrent: 10,
        hpMax: 20,
        gold: 3,
        remortCount: 0,
        rogueAttemptedToday: true,
        canRoguePickpocket: false
      }, {
        telegramUserId: 1003n,
        characterId: "target-2",
        name: "Нова кишеня",
        classId: "class.warrior",
        level: 3,
        hpCurrent: 10,
        hpMax: 20,
        gold: 3,
        remortCount: 0,
        rogueAttemptedToday: false,
        canRoguePickpocket: true
      }],
      locationName: "Дошка корчми",
      roguePickpocketCooldownAvailableAt: null
    } as unknown as ClassNoncombatOpenResult);

    expect(text).not.toContain("Інші цілі: готово");
    expect(text).toContain("📍 Дошка корчми\n\nРизик малий");
    expect(text).toContain("Сьогодні вже були:");
    expect(text).toContain("🗓️ Сусід — цю кишеню знову тільки завтра.");
    expect(text.indexOf("Сьогодні вже були:")).toBeLessThan(text.indexOf("Оберіть активну ціль поруч:"));
  });

  it("does not ask the Rogue to choose a target when only same-day targets remain", () => {
    const text = presentClassNoncombatOpen({
      state: "ready",
      mode: "rogue",
      character: {
        id: "rogue-1",
        name: "Злодій",
        classId: "class.rogue"
      },
      targets: [{
        telegramUserId: 1002n,
        characterId: "target-1",
        name: "Сусід",
        classId: "class.warrior",
        level: 3,
        hpCurrent: 10,
        hpMax: 20,
        gold: 3,
        remortCount: 0,
        rogueAttemptedToday: true,
        canRoguePickpocket: false
      }],
      locationName: "Дошка корчми",
      roguePickpocketCooldownAvailableAt: null
    } as unknown as ClassNoncombatOpenResult);

    expect(text).toContain("Сьогодні вже були:");
    expect(text).toContain("🗓️ Сусід — цю кишеню знову тільки завтра.");
    expect(text).toContain("Нових кишень поруч немає. Старі записи Корчма вже сховала до завтра.");
    expect(text).not.toContain("Оберіть активну ціль поруч:");
  });

  it("explains Rogue other-target cooldown without a ready filler line", () => {
    const text = presentClassNoncombatOpen({
      state: "ready",
      mode: "rogue",
      character: {
        id: "rogue-1",
        name: "Злодій",
        classId: "class.rogue"
      },
      targets: [{
        telegramUserId: 1002n,
        characterId: "target-1",
        name: "Сусід",
        classId: "class.warrior",
        level: 3,
        hpCurrent: 10,
        hpMax: 20,
        gold: 3,
        remortCount: 0,
        rogueAttemptedToday: false,
        canRoguePickpocket: false
      }],
      locationName: "Дошка корчми",
      roguePickpocketCooldownAvailableAt: new Date("2026-07-03T10:33:00.000Z")
    } as unknown as ClassNoncombatOpenResult);

    expect(text).toContain("🕯️ Нова спроба по іншій цілі: пальці відсапуються ще 93 хвилини.");
    expect(text).not.toContain("Інші цілі: готово");
    expect(text).not.toContain("Оберіть активну ціль поруч:");
  });
});
