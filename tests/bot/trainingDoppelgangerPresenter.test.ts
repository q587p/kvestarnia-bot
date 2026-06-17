import { describe, expect, it } from "vitest";
import {
  presentTrainingDoppelganger,
  presentTrainingDoppelgangerNeedsRest,
  presentTrainingDoppelgangerNoCharacter,
  presentTrainingDoppelgangerTurn
} from "../../src/bot/presenters/trainingDoppelgangerPresenter";
import { summarizeCharacter } from "../../src/domain/characters/characterSummary";
import { TRAINING_DOPPELGANGER_MONSTER_ID } from "../../src/domain/trainingDoppelganger";

describe("training doppelganger presenter", () => {
  it("renders an active turn-based training fight", () => {
    const character = buildCharacter({ name: "<b>Мандрівник</b>" });
    const text = presentTrainingDoppelganger({
      state: "active",
      character,
      doppelganger: buildDoppelganger(character),
      session: buildSession()
    });

    expect(text).toContain("🥊 <b>Бійцівський куток</b>");
    expect(text).toContain("&lt;b&gt;Мандрівник&lt;/b&gt;");
    expect(text).toContain("Сумлінний Допельґанґер");
    expect(text).not.toContain("Титул копії");
    expect(text).toContain("❤️ Ви: 18/22 · мана 7/10");
    expect(text).toContain("🪞 Копія: 22/22");
    expect(text).toContain("Що робимо?");
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

  it("keeps no-character and needs-rest copy short and Ukrainian", () => {
    expect(presentTrainingDoppelgangerNoCharacter()).toContain("/start");

    const character = buildCharacter({ hpCurrent: 0 });
    const text = presentTrainingDoppelgangerNeedsRest({ state: "needs-rest", character });

    expect(text).toContain("Спершу віддихайтеся");
    expect(text).toContain("Бійцівський куток");
  });
});

function buildCharacter(overrides: { name?: string; hpCurrent?: number } = {}) {
  return summarizeCharacter({
    name: overrides.name ?? "Мандрівник",
    pronoun: "they",
    path: "path.sun",
    raceId: "race.human-ish",
    classId: "class.warrior",
    level: 3,
    xp: 25,
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

function buildDoppelganger(character: ReturnType<typeof buildCharacter>) {
  return {
    name: "Сумлінний Допельґанґер" as const,
    raceName: character.raceName,
    className: character.className,
    title: character.title,
    level: character.level
  };
}

function buildSession(overrides: { status?: "active" | "won"; monsterHp?: number } = {}) {
  const status = overrides.status ?? "active";

  return {
    id: "123e4567-e89b-12d3-a456-426614174000",
    characterId: "character-42",
    monsterId: TRAINING_DOPPELGANGER_MONSTER_ID,
    status,
    turn: status === "active" ? 1 : 4,
    state: {
      id: "123e4567-e89b-12d3-a456-426614174000",
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
        hp: overrides.monsterHp ?? 22,
        hpMax: 22
      }
    },
    reward: null,
    createdAt: new Date("2026-06-17T09:30:00.000Z"),
    updatedAt: new Date("2026-06-17T09:30:00.000Z"),
    expiresAt: new Date("2026-06-17T10:00:00.000Z")
  };
}
