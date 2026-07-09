import { describe, expect, it } from "vitest";
import {
  buildQuestOverviewRows,
  presentQuestOverview
} from "../../src/bot/presenters/questOverviewPresenter";
import type { QuestHubSnapshot } from "../../src/bot/presenters/questHubPresenter";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";

describe("quest overview presenter", () => {
  it("keeps only claimable and active rows, ordered by current work", () => {
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

    expect(rows.map((row) => row.priority)).toEqual(["claimable", "active", "active"]);
    expect(rows.map((row) => row.id)).toEqual(["daily-korchma-round", "problem-quest", "yeger"]);
    expect(rows[0]?.title).toContain("2/2");
  });

  it("hides locked, generic available, retired and completed-only rows", () => {
    const highLevel = characterAtLevel(13);
    const rows = buildQuestOverviewRows(makeSnapshot({
      character: highLevel,
      adventure: { state: "ready", character: highLevel, offer: { choices: [] } },
      starterAdventure: { state: "level-retired", character: highLevel, maxLevel: 2 },
      fight: {
        state: "persistent-ready",
        character: highLevel,
        questProgress: problemQuest({ issued: false, wins: 0 })
      },
      starterFight: { state: "level-retired", character: highLevel, maxLevel: 2 },
      problemQuest: problemQuest({ issued: false, wins: 0 }),
      yeger: { state: "offered", character: highLevel, progress: { wins: 0, target: 5 } },
      cellar: { state: "ready", character: highLevel },
      dailyKorchmaRound: {
        state: "not-issued",
        character: highLevel,
        dayToken: "20260709"
      },
      barrelBeerTutorial: {
        state: "level-retired",
        character: highLevel,
        maxLevel: 5,
        progress: barrelProgress(false)
      },
      itemUpgrades: {
        state: "unlock-required",
        character: highLevel,
        fieldKitQuantity: 1,
        rewardXp: 13
      }
    }));

    expect(rows).toEqual([]);
  });

  it("renders a compact empty state when no active or taken quests exist", () => {
    const text = presentQuestOverview(makeSnapshot({
      problemQuest: problemQuest({ completed: true, rewardClaimed: true, wins: 13 }),
      yeger: {
        state: "completed",
        character,
        progress: { wins: 5, target: 5 },
        reward: { xp: 80, gold: 120, itemGrants: [] }
      },
      cellar: { state: "ready", character }
    }));

    expect(text).toContain("🗺️ <b>Квести</b>");
    expect(text).toContain("Активних справ зараз немає.");
    expect(text).toContain("Нові папери, пригоди й дрібні катастрофи беруться за Столом зі справами.");
    expect(text).toContain("Журнал тільки показує вже взяте, щоб не тягнути вас за рукав.");
    expect(text).not.toContain("Підозріла шаурма");
    expect(text).not.toContain("Доступ до Чароковальні");
  });

  it("escapes dynamic active quest titles in the overview card", () => {
    const snapshot = makeSnapshot({
      problemQuest: problemQuest({
        title: "Папір <підозри> & печатка",
        wins: 5
      })
    });

    const text = presentQuestOverview(snapshot);

    expect(text).toContain("Папір &lt;підозри&gt; &amp; печатка");
    expect(text).not.toContain("Папір <підозри> & печатка");
  });

  it("shows active daily Korchma round progress, done step, next step and turn-in guidance", () => {
    const text = presentQuestOverview(makeSnapshot({
      dailyKorchmaRound: {
        state: "ready",
        character,
        offer: dailyOffer(["scene.sign"])
      },
      problemQuest: problemQuest({ completed: true, rewardClaimed: true, wins: 13 })
    }));

    expect(text).toContain("🧾 <b>Корчмарський обхід</b> — 1/2");
    expect(text).toContain("Зроблено: Вивіска сперечається з цвяхом.");
    expect(text).toContain("Далі: владнайте ще 1 дрібницю.");
    expect(text).toContain("Де: шукайте сьогоднішні сцени у відповідних місцинах корчми.");
    expect(text).toContain("Здати — за столом зі справами.");
  });

  it("shows turn-in-ready daily Korchma round as claimable", () => {
    const rows = buildQuestOverviewRows(makeSnapshot({
      dailyKorchmaRound: {
        state: "turn-in-ready",
        character,
        offer: dailyOffer(["scene.sign", "scene.well"])
      },
      problemQuest: problemQuest({ completed: true, rewardClaimed: true, wins: 13 })
    }));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "daily-korchma-round",
      priority: "claimable"
    });
    expect(rows[0]?.title).toContain("2/2");
    expect(rows[0]?.body).toContain("Далі: здайте обхід");
  });

  it("shows active and claimable problem quests, then hides reward-claimed problem quests", () => {
    const activeRows = buildQuestOverviewRows(makeSnapshot({
      problemQuest: problemQuest({ wins: 7 })
    }));
    const claimableRows = buildQuestOverviewRows(makeSnapshot({
      problemQuest: problemQuest({ completed: true, rewardClaimed: false, wins: 13 })
    }));
    const completedRows = buildQuestOverviewRows(makeSnapshot({
      problemQuest: problemQuest({ completed: true, rewardClaimed: true, wins: 13 })
    }));

    expect(activeRows.map((row) => row.id)).toContain("problem-quest");
    expect(activeRows.find((row) => row.id === "problem-quest")?.body).toContain("Далі: ще 6 проблем у Низу.");
    expect(claimableRows.find((row) => row.id === "problem-quest")?.priority).toBe("claimable");
    expect(completedRows.map((row) => row.id)).not.toContain("problem-quest");
  });

  it("shows active Yeger progress and claimable turn-in, while hiding not-started Yeger", () => {
    const activeRows = buildQuestOverviewRows(makeSnapshot({
      problemQuest: problemQuest({ completed: true, rewardClaimed: true, wins: 13 }),
      yeger: {
        state: "in-progress",
        character,
        progress: { stageId: "second", wins: 7, target: 17 }
      }
    }));
    const claimableRows = buildQuestOverviewRows(makeSnapshot({
      problemQuest: problemQuest({ completed: true, rewardClaimed: true, wins: 13 }),
      yeger: {
        state: "turn-in-ready",
        character,
        progress: { stageId: "first", wins: 5, target: 5 }
      }
    }));
    const offeredRows = buildQuestOverviewRows(makeSnapshot({
      problemQuest: problemQuest({ completed: true, rewardClaimed: true, wins: 13 }),
      yeger: {
        state: "offered",
        character,
        progress: { wins: 0, target: 5 }
      }
    }));

    expect(activeRows.find((row) => row.id === "yeger")?.body).toContain("Далі: ще 10 відповідних монстрів.");
    expect(claimableRows.find((row) => row.id === "yeger")?.priority).toBe("claimable");
    expect(offeredRows.map((row) => row.id)).not.toContain("yeger");
  });

  it("shows taken Barrel tutorial and claimable grownup cellar turn-in, while hiding merely available cellar", () => {
    const rows = buildQuestOverviewRows(makeSnapshot({
      problemQuest: problemQuest({ completed: true, rewardClaimed: true, wins: 13 }),
      cellar: { state: "level-retired", character, maxLevel: 3, completed: false },
      cellarGrownup: {
        state: "bottle-obtained",
        character,
        bottleQuantity: 1
      },
      barrelBeerTutorial: {
        state: "in-progress",
        character,
        progress: barrelProgress(false)
      }
    }));

    expect(rows.map((row) => row.id)).toEqual(["cellar-grownup", "barrel-beer-tutorial"]);
    expect(rows.find((row) => row.id === "cellar-grownup")?.priority).toBe("claimable");
    expect(rows.find((row) => row.id === "barrel-beer-tutorial")?.priority).toBe("active");
    expect(rows.map((row) => row.id)).not.toContain("cellar");
  });

  it("keeps route-button labels out of the text guidance", () => {
    const text = presentQuestOverview(makeSnapshot({
      dailyKorchmaRound: {
        state: "ready",
        character,
        offer: dailyOffer(["scene.sign"])
      },
      problemQuest: problemQuest({ wins: 7 }),
      yeger: {
        state: "in-progress",
        character,
        progress: { stageId: "second", wins: 7, target: 17 }
      }
    }));

    expect(text).toContain("🧾 <b>Тринадцять дрібних проблем</b> — 7/13");
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
    starterAdventure: { state: "already-completed", character, fightAvailable: false },
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
    barrelBeerTutorial: {
      state: "completed",
      character,
      progress: barrelProgress(true),
      reward: { xp: 6, gold: 0, itemGrants: [] }
    },
    ...overrides
  };
}

function problemQuest(overrides: Partial<ReturnType<typeof baseProblemQuest>> = {}) {
  return {
    ...baseProblemQuest(),
    ...overrides
  };
}

function baseProblemQuest() {
  return {
    stageId: "13" as const,
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

function characterAtLevel(level: 1 | 3 | 13): CharacterSummary {
  const xpByLevel = {
    1: 0,
    3: 25,
    13: 1300
  } satisfies Record<1 | 3 | 13, number>;
  const nextByLevel = {
    1: 10,
    3: 45,
    13: null
  } satisfies Record<1 | 3 | 13, number | null>;
  const nextLevelXp = nextByLevel[level];

  return {
    ...character,
    level,
    xp: xpByLevel[level],
    nextLevelXp,
    xpToNextLevel: nextLevelXp === null ? null : nextLevelXp - xpByLevel[level]
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
