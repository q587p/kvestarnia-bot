import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  presentClassNoncombatOpen,
  presentPriestBlessResult
} from "../../src/bot/presenters/classNoncombatPresenter";
import type {
  ClassNoncombatOpenResult,
  PriestBlessResult
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
      priestHealCooldownAvailableAt: null,
      priestBlessCooldownAvailableAt: null
    } as unknown as ClassNoncombatOpenResult);

    expect(text).toContain("Поруч нікого активного немає, але себе можна підтримати без черги.");
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
      priestHealCooldownAvailableAt: null,
      priestBlessCooldownAvailableAt: null
    } as unknown as ClassNoncombatOpenResult);

    expect(text).toContain("Оберіть себе або когось активного поруч:");
    expect(text).not.toContain("Поруч нікого активного немає");
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
        manaCost: 7,
        cooldownAvailableAt: new Date("2026-07-03T10:33:00.000Z"),
        completedAt: new Date("2026-07-03T09:00:00.000Z")
      },
      blessing: {
        id: "blessing-1",
        actorName: "Жрець",
        targetName: "Жрець",
        expiresAt: new Date("2026-07-03T09:13:00.000Z"),
        bonusStat: null,
        bonusAmount: 0
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
    expect(text).toContain("Стан видно в персонажі поруч із бафами");
    expect(text).toContain("🌌 Мана витрачена: <b>7</b>.");
    expect(text).not.toContain("Бонус поки");
  });
});
