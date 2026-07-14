import { describe, expect, it } from "vitest";
import { buildClassNoncombatKeyboard } from "../../src/bot/keyboards/classNoncombatKeyboard";
import type { ClassNoncombatOpenResult } from "../../src/services/classNoncombatService";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";

describe("class noncombat keyboard", () => {
  it("hides Priest self-heal when the character is already at full HP", () => {
    const keyboard = buildClassNoncombatKeyboard(priestOpenResult({
      hpCurrent: 20,
      hpMax: 20
    }));

    expect(buttonTexts(keyboard)).not.toContain("⚕️ Полікувати себе");
    expect(buttonTexts(keyboard)).toContain("✨ Благословити себе");
    expect(buttonTexts(keyboard)).toContain("🔄 Оновити");
  });

  it("shows Priest self-heal when the character is wounded", () => {
    const keyboard = buildClassNoncombatKeyboard(priestOpenResult({
      hpCurrent: 13,
      hpMax: 20
    }));

    expect(buttonTexts(keyboard)).toContain("⚕️ Полікувати себе");
    expect(buttonTexts(keyboard)).toContain("✨ Благословити себе");
  });

  it("hides Priest self-blessing while the self-blessing wait is active", () => {
    const keyboard = buildClassNoncombatKeyboard(priestOpenResult({}, {
      priestSelfBlessAvailableAt: new Date("2026-07-03T10:33:00.000Z"),
      targets: [target()]
    }));

    expect(buttonTexts(keyboard)).not.toContain("✨ Благословити себе");
    expect(buttonTexts(keyboard)).toContain("✨");
    expect(buttonTexts(keyboard)).toContain("🔄 Оновити");
  });

  it("hides Priest action buttons when the actor is busy with another active flow", () => {
    const keyboard = buildClassNoncombatKeyboard(priestOpenResult({
      hpCurrent: 13,
      hpMax: 20
    }, {
      actorBlocked: true,
      targets: [target({ name: "Поранений Сусід", hpCurrent: 7, hpMax: 20 })]
    }));

    expect(buttonTexts(keyboard)).toEqual(["🔄 Оновити"]);
  });

  it("hides Priest target healing when the target is already at full HP", () => {
    const keyboard = buildClassNoncombatKeyboard(priestOpenResult({}, {
      targets: [target({ name: "Повний Сусід", hpCurrent: 20, hpMax: 20 })]
    }));

    expect(buttonTexts(keyboard)).not.toContain("⚕️ Повний Сусід");
    expect(buttonTexts(keyboard)).toContain("✨ Повний Сусід");
  });

  it("uses Priest heal icon for wounded targets and paginates target lists", () => {
    const keyboard = buildClassNoncombatKeyboard(priestOpenResult({}, {
      targetPage: 1,
      targetTotalPages: 3,
      targets: [target({ name: "Поранений Сусід", hpCurrent: 7, hpMax: 20 })]
    }));

    expect(buttonTexts(keyboard)).toEqual(expect.arrayContaining([
      "⚕️ Поранений Сусід",
      "✨",
      "⬅️",
      "2/3",
      "➡️"
    ]));
    expect(buttonTexts(keyboard)).not.toContain("🩹 Поранений Сусід");
  });

  it("shows same-day Rogue targets as tomorrow rows instead of pickpocket actions", () => {
    const keyboard = buildClassNoncombatKeyboard({
      state: "ready",
      mode: "rogue",
      character: character({ classId: "class.rogue" }),
      actorBlocked: false,
      locationName: "Дошка корчми",
      targets: [
        target({
          name: "Сьогоднішній Сусід",
          canPriestAid: false,
          canRoguePickpocket: false,
          rogueAttemptedToday: true
        }),
        target({
          name: "Новий Сусід",
          canPriestAid: false,
          canRoguePickpocket: true
        })
      ],
      targetPage: 0,
      targetTotalPages: 1,
      priestBlessCooldownAvailableAt: null,
      priestSelfBlessAvailableAt: null,
      roguePickpocketCooldownAvailableAt: null
    });

    expect(buttonTexts(keyboard)).toContain("🗓️ Сьогоднішній Сусід завтра");
    expect(buttonTexts(keyboard)).toContain("🗡️ Новий Сусід");
    expect(buttonTexts(keyboard)).not.toContain("🗡️ Сьогоднішній Сусід");
  });

  it("shows other Rogue targets as later rows while the actor cooldown is active", () => {
    const keyboard = buildClassNoncombatKeyboard({
      state: "ready",
      mode: "rogue",
      character: character({ classId: "class.rogue" }),
      actorBlocked: false,
      locationName: "Дошка корчми",
      targets: [
        target({
          name: "Новий Сусід",
          canPriestAid: false,
          canRoguePickpocket: false
        })
      ],
      targetPage: 0,
      targetTotalPages: 1,
      priestBlessCooldownAvailableAt: null,
      priestSelfBlessAvailableAt: null,
      roguePickpocketCooldownAvailableAt: new Date("2026-07-03T10:33:00.000Z")
    });

    expect(buttonTexts(keyboard)).toContain("🕯️ Новий Сусід пізніше");
    expect(buttonTexts(keyboard)).not.toContain("🗡️ Новий Сусід");
  });

  it("exposes Varenyk self and nearby feeding without hiding cooldown recipients", () => {
    const keyboard = buildClassNoncombatKeyboard({
      state: "ready",
      mode: "varenyk",
      character: character({ classId: "class.varenyk-mancer", className: "Вареник-мант" }),
      actorBlocked: false,
      locationName: "Перед Корчмою",
      targets: [
        target({ name: "Голодний", canVarenykFeed: true }),
        target({
          name: "Ситий Сусід",
          canVarenykFeed: false,
          varenykSatedAvailableAt: new Date("2026-07-03T10:33:00.000Z")
        })
      ],
      targetPage: 0,
      targetTotalPages: 1,
      priestBlessCooldownAvailableAt: null,
      priestSelfBlessAvailableAt: null,
      roguePickpocketCooldownAvailableAt: null,
      varenykSatedSelfAvailableAt: null,
      varenykSatedSelf: null,
      varenykPlan: { rank: 1, manaCost: 8, immediateHp: 3, immediateMana: 1 }
    });

    expect(buttonTexts(keyboard)).toEqual(expect.arrayContaining([
      "🍽️ Нагодувати себе",
      "🍽️ Голодний",
      "🍽️ Ситий Сусід — пауза"
    ]));
  });

  it("does not expose feeding while an active status survives a cleared wait", () => {
    const keyboard = buildClassNoncombatKeyboard({
      state: "ready",
      mode: "varenyk",
      character: character({ classId: "class.varenyk-mancer", className: "Вареник-мант" }),
      actorBlocked: false,
      locationName: "Перед Корчмою",
      targets: [target({
        name: "Ще Ситий",
        canVarenykFeed: false,
        varenykSatedAvailableAt: null,
        varenykSated: {} as never
      })],
      targetPage: 0,
      targetTotalPages: 1,
      priestBlessCooldownAvailableAt: null,
      priestSelfBlessAvailableAt: null,
      roguePickpocketCooldownAvailableAt: null,
      varenykSatedSelfAvailableAt: null,
      varenykSatedSelf: {} as never,
      varenykPlan: { rank: 1, manaCost: 8, immediateHp: 3, immediateMana: 1 }
    });

    expect(buttonTexts(keyboard)).not.toContain("🍽️ Нагодувати себе");
    expect(buttonTexts(keyboard)).not.toContain("🍽️ Ще Ситий");
    expect(buttonTexts(keyboard)).toContain("😋 Ще Ситий — Ситий");
  });
});

function priestOpenResult(
  overrides: Partial<CharacterSummary>,
  options: {
    actorBlocked?: boolean;
    targets?: Extract<ClassNoncombatOpenResult, { state: "ready" }>["targets"];
    targetPage?: number;
    targetTotalPages?: number;
    priestSelfBlessAvailableAt?: Date | null;
  } = {}
): ClassNoncombatOpenResult {
  return {
    state: "ready",
    mode: "priest",
    character: character(overrides),
    actorBlocked: options.actorBlocked ?? false,
    locationName: "Стіл зі справами",
    targets: options.targets ?? [],
    targetPage: options.targetPage ?? 0,
    targetTotalPages: options.targetTotalPages ?? 1,
    priestBlessCooldownAvailableAt: null,
    priestSelfBlessAvailableAt: options.priestSelfBlessAvailableAt ?? null,
    roguePickpocketCooldownAvailableAt: null
  };
}

function target(
  overrides: Partial<Extract<ClassNoncombatOpenResult, { state: "ready" }>["targets"][number]> = {}
): Extract<ClassNoncombatOpenResult, { state: "ready" }>["targets"][number] {
  return {
    telegramUserId: 1002n,
    characterId: "target",
    name: "Сусід",
    classId: "class.warrior",
    level: 3,
    hpCurrent: 10,
    hpMax: 20,
    gold: 13,
    remortCount: 0,
    priestBlessAvailableAt: null,
    rogueAttemptedToday: false,
    canPriestAid: true,
    canRoguePickpocket: false,
    ...overrides
  };
}

function character(overrides: Partial<CharacterSummary> = {}): CharacterSummary {
  return {
    name: "Жрець",
    pronoun: "they",
    pronounLabel: "Вони",
    path: "boundary",
    raceId: "race.human-ish",
    raceName: "Людисько",
    classId: "class.priest",
    className: "Жрець",
    title: "Пересічні Пригодники",
    level: 3,
    xp: 25,
    nextLevelXp: 45,
    xpToNextLevel: 20,
    gold: 13,
    hpCurrent: 10,
    hpMax: 20,
    manaCurrent: 20,
    manaMax: 20,
    stats: {
      strength: 8,
      dexterity: 8,
      intelligence: 8,
      charisma: 8,
      luck: 8
    },
    levelBonus: {
      hpMax: 0,
      manaMax: 0,
      primaryStat: {
        stat: "strength",
        bonus: 0
      }
    },
    ...overrides
  };
}

function buttonTexts(keyboard: { inline_keyboard: Array<Array<{ text: string }>> } | undefined): string[] {
  return keyboard?.inline_keyboard.flat().map((button) => button.text) ?? [];
}
