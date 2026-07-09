import { describe, expect, it } from "vitest";
import {
  buildQuestOverviewRows,
  presentQuestOverview
} from "../../src/bot/presenters/questOverviewPresenter";
import type { QuestHubSnapshot } from "../../src/bot/presenters/questHubPresenter";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";

describe("quest overview presenter", () => {
  it("orders claimable, active progress, available, locked and completed rows", () => {
    const rows = buildQuestOverviewRows(makeSnapshot({
      dailyKorchmaRound: {
        state: "turn-in-ready",
        character,
        offer: dailyOffer(["scene.cellar", "scene.yeger"])
      },
      yeger: {
        state: "in-progress",
        character,
        progress: { stageId: "second", wins: 7, target: 17 }
      },
      adventure: { state: "ready", character, offer: { choices: [] } },
      cellar: { state: "level-locked", character, requiredLevel: 2 },
      barrelBeerTutorial: {
        state: "completed",
        character,
        progress: barrelProgress(true),
        reward: { xp: 6, gold: 0, itemGrants: [] }
      }
    }));

    expect(rows.map((row) => row.priority)).toEqual([
      "claimable",
      "active",
      "active",
      "available",
      "locked",
      "completed",
      "completed"
    ]);
    expect(rows[0]?.id).toBe("daily-korchma-round");
    expect(rows[0]?.title).toContain("2/2");
    expect(rows[1]?.id).toBe("problem-quest");
    expect(rows[2]?.id).toBe("yeger");
    expect(rows[3]?.id).toBe("adventure");
  });

  it("shows a useful fresh level one overview without opening locked grownup routes", () => {
    const levelOne = { ...character, level: 1 };
    const rows = buildQuestOverviewRows(makeSnapshot({
      character: levelOne,
      adventure: { state: "level-locked", character: levelOne, requiredLevel: 3 },
      starterAdventure: { state: "ready", character: levelOne },
      fight: { state: "ready", character: levelOne },
      starterFight: { state: "ready", character: levelOne },
      problemQuest: {
        stageId: "13",
        title: "Тринадцять дрібних проблем",
        wins: 0,
        target: 13,
        completed: false,
        rewardClaimed: false,
        issued: true,
        branchComplete: false
      },
      cellar: { state: "level-locked", character: levelOne, requiredLevel: 2 },
      dailyKorchmaRound: { state: "level-locked", character: levelOne, requiredLevel: 3 },
      yeger: { state: "level-locked", character: levelOne, requiredLevel: 4 }
    }));

    expect(rows.map((row) => row.id)).toEqual([
      "starter-adventure",
      "starter-fight",
      "daily-korchma-round",
      "problem-quest",
      "cellar",
      "yeger"
    ]);
    expect(rows.map((row) => row.title).join("\n")).toContain("Підозріла шаурма");
    expect(rows.map((row) => row.title).join("\n")).toContain("Новачкова сутичка");
  });

  it("escapes dynamic quest titles in the overview card", () => {
    const snapshot = makeSnapshot({
      problemQuest: {
        stageId: "13",
        title: "Папір <підозри> & печатка",
        wins: 5,
        target: 13,
        completed: false,
        rewardClaimed: false,
        issued: true,
        branchComplete: false
      }
    });

    const text = presentQuestOverview(snapshot);

    expect(text).toContain("Папір &lt;підозри&gt; &amp; печатка");
    expect(text).not.toContain("Папір <підозри> & печатка");
  });

  it("renders progress, done, next-step and location hints without route-button labels", () => {
    const text = presentQuestOverview(makeSnapshot({
      dailyKorchmaRound: {
        state: "ready",
        character,
        offer: dailyOffer(["scene.sign"])
      },
      problemQuest: {
        stageId: "13",
        title: "Тринадцять дрібних проблем",
        wins: 7,
        target: 13,
        completed: false,
        rewardClaimed: false,
        issued: true,
        branchComplete: false
      },
      yeger: {
        state: "in-progress",
        character,
        progress: { stageId: "second", wins: 7, target: 17 }
      }
    }));

    expect(text).toContain("🧾 <b>Корчмарський обхід</b> — 1/2");
    expect(text).toContain("Зроблено: Вивіска сперечається з цвяхом.");
    expect(text).toContain("Далі: владнайте ще 1 дрібницю.");
    expect(text).toContain("Де: шукайте сьогоднішні сцени у відповідних місцинах корчми.");
    expect(text).toContain("🧾 <b>Тринадцять дрібних проблем</b> — 7/13");
    expect(text).toContain("Зроблено: 7 перемог.");
    expect(text).toContain("Далі: ще 6 проблем у Низу.");
    expect(text).toContain("Де: Спуск до Низу. Здати — Корчмарю в шинку.");
    expect(text).toContain("🏹 <b>Неспокійні справи 2.0</b> — 7/17");
    expect(text).toContain("Де: Єгерський куток показує умови, але полювання лишається через звичайні маршрути.");
    expect(text).not.toContain("До обходу");
    expect(text).not.toContain("До Трьох справ");
    expect(text).not.toContain("До Корчмаря");
    expect(text).not.toContain("До Низу");
    expect(text).not.toContain("До Єгеря");
    expect(text).not.toContain("До льоху");
    expect(text).not.toContain("До бочки");
    expect(text).not.toContain("До шинку");
    expect(text).not.toContain("До задвірка");
  });
});

function makeSnapshot(overrides: Partial<QuestHubSnapshot> = {}): QuestHubSnapshot {
  return {
    character,
    currentLocationId: "location.korchma.hall",
    adventure: { state: "already-completed", character },
    fight: {
      state: "persistent-ready",
      character,
      questProgress: problemQuest()
    },
    starterFight: { state: "level-retired", character, maxLevel: 2 },
    problemQuest: problemQuest(),
    problemQuestArchive: [],
    yeger: {
      state: "completed",
      character,
      progress: { wins: 5, target: 5 },
      reward: { xp: 80, gold: 120, itemGrants: [] }
    },
    cellar: { state: "ready", character },
    ...overrides
  } as QuestHubSnapshot;
}

function problemQuest() {
  return {
    stageId: "13",
    title: "Тринадцять дрібних проблем",
    wins: 3,
    target: 13,
    completed: false,
    rewardClaimed: false,
    issued: true,
    branchComplete: false
  };
}

function dailyOffer(completedSceneIds: string[]) {
  return {
    dayKey: "2026-07-09",
    dayToken: "20260709",
    lifeToken: 0,
    requiredSteps: 2,
    completedSceneIds,
    omittedSceneId: null,
    scenes: [
      {
        id: "scene.sign",
        icon: "🪧",
        title: "Вивіска сперечається з цвяхом",
        locationId: "location.korchma.hall",
        hook: "Вивіска має думку.",
        actions: []
      },
      {
        id: "scene.well",
        icon: "🪣",
        title: "Криниця рахує відлуння",
        locationId: "location.korchma.yard",
        hook: "Криниця має бухгалтерський настрій.",
        actions: []
      }
    ]
  };
}

function barrelProgress(done: boolean) {
  return {
    accepted: done,
    stipendGranted: done,
    visitedBarrel: done,
    raidCompleted: done,
    beerRoundOffered: done,
    beerDrunk: done,
    activeBeer: done,
    currentLocationId: "location.korchma.quest-table"
  };
}

const character: CharacterSummary = {
  name: "Мандрівник",
  pronoun: "they",
  pronounLabel: "Вони",
  path: "boundary",
  raceId: "race.human-ish",
  raceName: "Людисько",
  classId: "class.warrior",
  className: "Воїн",
  title: "Пересічні Пригодники",
  level: 3,
  xp: 25,
  nextLevelXp: 45,
  xpToNextLevel: 20,
  gold: 0,
  hpCurrent: 20,
  hpMax: 20,
  manaCurrent: 10,
  manaMax: 10,
  stats: {
    strength: 8,
    dexterity: 6,
    intelligence: 6,
    charisma: 6,
    luck: 6
  },
  levelBonus: {
    hpMax: 0,
    manaMax: 0,
    primaryStat: {
      stat: "strength",
      bonus: 0
    }
  }
};
