import { describe, expect, it } from "vitest";
import {
  presentTrainingDoppelganger,
  presentTrainingDoppelgangerIntro,
  presentTrainingDoppelgangerLevelGate,
  presentTrainingDoppelgangerNeedsRest,
  presentTrainingDoppelgangerNoCharacter,
  presentTrainingDoppelgangerTurn
} from "../../src/bot/presenters/trainingDoppelgangerPresenter";
import type { CombatDebugTrace, CombatTurnSummary } from "../../src/domain/combat";
import { summarizeCharacter } from "../../src/domain/characters/characterSummary";
import { TRAINING_DOPPELGANGER_MONSTER_ID } from "../../src/domain/trainingDoppelganger";

describe("training doppelganger presenter", () => {
  it("renders the separate training fight intro", () => {
    const character = buildCharacter({ name: "<b>Мандрівник</b>" });
    const text = presentTrainingDoppelgangerIntro({
      state: "active",
      character,
      doppelganger: buildDoppelganger(character),
      session: buildSession()
    });

    expect(text).toContain("🥊 <b>Бійцівський куток</b>");
    expect(text).toContain("&lt;b&gt;Мандрівник&lt;/b&gt;");
    expect(text).toContain("Проти вас: <b>Сумлінний Допельґанґер</b>");
    expect(text).not.toContain("{targetName}");
    expect(text).not.toContain("undefined");
    expect(text).not.toContain("❤️ Ви:");
    expect(text).not.toContain("що робимо?");
  });

  it("renders an active turn-based training fight", () => {
    const character = buildCharacter({ name: "<b>Мандрівник</b>" });
    const text = presentTrainingDoppelganger({
      state: "active",
      character,
      doppelganger: buildDoppelganger(character),
      session: buildSession()
    });

    expect(text).not.toContain("🥊 <b>Бійцівський куток</b>");
    expect(text).toContain("&lt;b&gt;Мандрівник&lt;/b&gt;");
    expect(text).not.toContain("Сумлінний Допельґанґер");
    expect(text).not.toContain("Титул копії");
    expect(text).toContain("❤️ Ви: 18/22 · мана 7/10");
    expect(text).toContain("🪞 Копія: 22/22");
    expect(text).toContain("<b>&lt;b&gt;Мандрівник&lt;/b&gt;</b>, що робимо?");
    expect(text).not.toContain("Нагород немає");
    expect(text).not.toContain("<b>Мандрівник</b>");
  });

  it("renders terminal XP without gold or manatky", () => {
    const character = buildCharacter();
    const text = presentTrainingDoppelgangerTurn({
      state: "updated",
      character,
      doppelganger: buildDoppelganger(character),
      session: buildSession({ status: "won", monsterHp: 0 }),
      reward: {
        state: "claimed",
        reward: {
          xp: 6,
          gold: 0,
          localDate: "session-1"
        },
        availableAt: new Date("2026-06-17T09:36:00.000Z"),
        now: new Date("2026-06-17T09:30:00.000Z"),
        levelChange: {
          oldLevel: 3,
          newLevel: 3,
          leveledUp: false
        }
      }
    });

    expect(text).toContain("Тренувальний досвід:");
    expect(text).toContain("+6 XP");
    expect(text).toContain("Золота й манаток немає");
    expect(text).toContain("Допельґанґер буде готовий знову за <b>6 хв</b>");
    expect(text).not.toContain("+0 золота");
    expect(text).not.toContain("Здобуто");
  });

  it("renders class-aware counter flavor after a doppelganger response", () => {
    const character = buildCharacter({ classId: "class.bureaucramancer" });
    const text = presentTrainingDoppelgangerTurn({
      state: "updated",
      character,
      doppelganger: buildDoppelganger(character),
      session: buildSession({
        lastTurn: {
          action: "skill",
          heroOutcome: "hit",
          heroDamage: 4,
          monsterDamage: 2,
          manaSpent: 2,
          critical: false,
          skillId: "skill.form-thirteen-b",
          damageKind: "spell"
        }
      }),
      reward: null
    });

    expect(text).toContain("<i>");
    expect(text).toContain("</i>");
    expect(text).not.toContain("undefined");
    expect(text).not.toContain("Останній хід");
  });

  it("uses stored random mage identity for counter flavor after a hero basic attack", () => {
    const character = buildCharacter({ classId: "class.warrior" });
    const doppelganger = buildDoppelganger(character, {
      source: "random-build",
      spawnMode: "RANDOM_BUILD",
      raceName: "Ельф",
      className: "Маг",
      title: "Підпалювач віддзеркалень"
    });
    const text = presentTrainingDoppelgangerTurn({
      state: "updated",
      character,
      doppelganger,
      session: buildSession({
        id: "123e4567-e89b-12d3-a456-426614174011",
        monster: {
          name: doppelganger.name,
          raceId: "race.elf",
          raceName: doppelganger.raceName,
          classId: "class.mage",
          className: doppelganger.className,
          title: doppelganger.title
        },
        lastTurn: {
          action: "attack",
          heroOutcome: "hit",
          heroDamage: 4,
          monsterOutcome: "hit",
          monsterDamage: 3,
          manaSpent: 0,
          critical: false,
          monsterAction: "skill",
          monsterSkillId: "skill.hot-spell",
          monsterDamageKind: "spell"
        }
      }),
      reward: null
    });
    const flavor = extractItalicFlavor(text);

    expect(text).toContain("«гаряче закляття»");
    expect(flavor).toContain("гаряче закляття");
    expect(flavor).not.toContain("переконливий удар");
  });

  it("uses monster basic counter category after a hero skill", () => {
    const character = buildCharacter({ classId: "class.warrior" });
    const doppelganger = buildDoppelganger(character, {
      source: "random-build",
      spawnMode: "RANDOM_BUILD",
      raceName: "Ельф",
      className: "Маг",
      title: "Підпалювач віддзеркалень"
    });
    const text = presentTrainingDoppelgangerTurn({
      state: "updated",
      character,
      doppelganger,
      session: buildSession({
        id: "123e4567-e89b-12d3-a456-426614174012",
        monster: {
          name: doppelganger.name,
          raceId: "race.elf",
          raceName: doppelganger.raceName,
          classId: "class.mage",
          className: doppelganger.className,
          title: doppelganger.title
        },
        lastTurn: {
          action: "skill",
          heroOutcome: "hit",
          heroDamage: 6,
          monsterOutcome: "hit",
          monsterDamage: 2,
          manaSpent: 2,
          critical: false,
          skillId: "skill.forceful-strike",
          damageKind: "physical",
          monsterAction: "attack"
        }
      }),
      reward: null
    });
    const flavor = extractItalicFlavor(text);

    expect(flavor).not.toContain("гаряче закляття");
    expect(flavor).not.toContain("переконливий удар");
    expect(flavor).not.toContain("прийом");
  });

  it("uses champion intro copy instead of current-hero copy", () => {
    const character = buildCharacter({ classId: "class.warrior" });
    const doppelganger = buildDoppelganger(character, {
      source: "champion-fallback",
      championPeriod: "week",
      championName: "Боривітер",
      raceName: "Людисько",
      className: "Бард",
      title: "Переможець тижня"
    });
    const text = presentTrainingDoppelgangerIntro({
      state: "active",
      character,
      doppelganger,
      session: buildSession({
        id: "123e4567-e89b-12d3-a456-426614174013",
        monster: {
          name: doppelganger.name,
          raceId: "race.human-ish",
          raceName: doppelganger.raceName,
          classId: "class.bard",
          className: doppelganger.className,
          title: doppelganger.title,
          debugTrace: {
            source: "champion-fallback",
            championPeriod: "week",
            championName: "Боривітер"
          }
        }
      })
    });

    expect(text).toMatch(/чемпіон|Титул|чужа перемога/i);
    expect(text).not.toContain("власну копію");
    expect(text).not.toContain("твою поставу");
  });

  it("does not call random or champion terminal opponents the hero's own copy", () => {
    const character = buildCharacter();
    const randomText = presentTrainingDoppelgangerTurn({
      state: "updated",
      character,
      doppelganger: buildDoppelganger(character, {
        source: "random-build",
        spawnMode: "RANDOM_BUILD",
        raceName: "Ельф",
        className: "Маг"
      }),
      session: buildSession({ status: "won", monsterHp: 0 }),
      reward: null
    });
    const championText = presentTrainingDoppelgangerTurn({
      state: "updated",
      character,
      doppelganger: buildDoppelganger(character, {
        source: "champion-fallback",
        championPeriod: "month",
        championName: "Варта",
        raceName: "Людисько",
        className: "Маг"
      }),
      session: buildSession({ status: "won", monsterHp: 0 }),
      reward: null
    });

    expect(randomText).not.toContain("власну копію");
    expect(championText).not.toContain("власну копію");
    expect(randomText).toContain("дзеркального пригодника");
    expect(championText).toContain("чемпіонську подобу");
  });

  it("keeps no-character and needs-rest copy short and Ukrainian", () => {
    expect(presentTrainingDoppelgangerNoCharacter()).toContain("/start");

    const character = buildCharacter({ hpCurrent: 0 });
    const text = presentTrainingDoppelgangerNeedsRest({ state: "needs-rest", character });

    expect(text).toContain("Спершу віддихайтеся");
    expect(text).toContain("Бійцівський куток");
  });

  it("renders a level 3 gate before sparring starts", () => {
    const character = buildCharacter({ level: 2, xp: 13 });
    const text = presentTrainingDoppelgangerLevelGate({
      character,
      minLevel: 3
    });

    expect(text).toContain("Бійцівський куток ще не підписав вашу довідку");
    expect(text).toContain("<b>3 рівня</b>");
    expect(text).toContain("шаурма, льох");
    expect(text).not.toContain("Що робимо?");
  });
});

function buildCharacter(
  overrides: {
    name?: string;
    hpCurrent?: number;
    level?: number;
    xp?: number;
    classId?: string;
  } = {}
) {
  return summarizeCharacter({
    name: overrides.name ?? "Мандрівник",
    pronoun: "they",
    path: "path.sun",
    raceId: "race.human-ish",
    classId: overrides.classId ?? "class.warrior",
    level: overrides.level ?? 3,
    xp: overrides.xp ?? 25,
    gold: 0,
    hpCurrent: overrides.hpCurrent ?? 22,
    hpMax: 22,
    manaCurrent: 10,
    manaMax: 10,
    statsJson: {
      strength: 8,
      dexterity: 6,
      intelligence: 6,
      charisma: 6,
      luck: 6
    }
  });
}

function buildDoppelganger(
  character: ReturnType<typeof buildCharacter>,
  overrides: Partial<ReturnType<typeof buildDoppelgangerShape>> = {}
) {
  return {
    ...buildDoppelgangerShape(character),
    ...overrides
  };
}

function buildDoppelgangerShape(character: ReturnType<typeof buildCharacter>) {
  return {
    name: "Сумлінний Допельґанґер" as const,
    raceName: character.raceName,
    className: character.className,
    title: character.title,
    level: character.level,
    spawnMode: "COPY_TARGET" as const,
    source: "target" as const,
    copiedEquipmentCount: 0
  };
}

function buildSession(
  overrides: {
    id?: string;
    status?: "active" | "won";
    monsterHp?: number;
    lastTurn?: CombatTurnSummary;
    monster?: {
      name?: string;
      raceId?: string;
      raceName?: string;
      classId?: string;
      className?: string;
      title?: string;
      debugTrace?: CombatDebugTrace;
    };
  } = {}
) {
  const status = overrides.status ?? "active";
  const id = overrides.id ?? "123e4567-e89b-12d3-a456-426614174000";

  return {
    id,
    characterId: "character-42",
    monsterId: TRAINING_DOPPELGANGER_MONSTER_ID,
    status,
    turn: status === "active" ? 1 : 4,
    state: {
      id,
      turn: status === "active" ? 1 : 4,
      status,
      hero: {
        hp: 18,
        hpMax: 22,
        mana: 7,
        manaMax: 10
      },
      monster: {
        id: TRAINING_DOPPELGANGER_MONSTER_ID,
        ...(overrides.monster?.name ? { name: overrides.monster.name } : {}),
        hp: overrides.monsterHp ?? 22,
        hpMax: 22,
        ...(overrides.monster?.raceId ? { raceId: overrides.monster.raceId } : {}),
        ...(overrides.monster?.raceName ? { raceName: overrides.monster.raceName } : {}),
        ...(overrides.monster?.classId ? { classId: overrides.monster.classId } : {}),
        ...(overrides.monster?.className ? { className: overrides.monster.className } : {}),
        ...(overrides.monster?.title ? { title: overrides.monster.title } : {}),
        ...(overrides.monster?.debugTrace ? { debugTrace: overrides.monster.debugTrace } : {})
      },
      ...(overrides.lastTurn ? { lastTurn: overrides.lastTurn } : {})
    },
    reward: null,
    createdAt: new Date("2026-06-17T09:30:00.000Z"),
    updatedAt: new Date("2026-06-17T09:30:00.000Z"),
    expiresAt: new Date("2026-06-17T10:00:00.000Z")
  };
}

function extractItalicFlavor(text: string): string {
  return text.match(/<i>(.*?)<\/i>/s)?.[1] ?? "";
}
