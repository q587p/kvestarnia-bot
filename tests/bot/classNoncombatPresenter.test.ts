import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  presentClassNoncombatOpen,
  presentPriestBlessResult,
  presentPriestHealResult,
  presentRoguePickpocketResult
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
        manaCost: 15,
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
    expect(text).toContain("💫 Мана витрачена: <b>15</b>.");
    expect(text).not.toContain("Бонус поки");
    expect(text).not.toContain("не складається в стос");
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
        manaCost: 10,
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
    expect(text).toContain("💫 Мана витрачена: <b>10</b>.");
    expect(text).toContain("⚕️ <b>Лікування спрацювало</b>");
    expect(text).not.toContain("Відпочинок техніки");
    expect(text).not.toContain("🩹 <b>Лікування спрацювало</b>");
  });

  it("formats Rogue next-attempt time in italics", () => {
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
        outcome: "clean-success",
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

    expect(text).toContain("Наступна спроба: <i>93 хвилини</i>.");
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

  it("shows Rogue same-day targets and other-target cooldown separately", () => {
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
      roguePickpocketCooldownAvailableAt: new Date("2026-07-03T10:33:00.000Z")
    } as unknown as ClassNoncombatOpenResult);

    expect(text).toContain("🕯️ Інші цілі: пальці відсапуються ще 93 хвилини.");
    expect(text).toContain("Сьогодні вже були:");
    expect(text).toContain("🗓️ Сусід — цю кишеню знову тільки завтра.");
  });
});
