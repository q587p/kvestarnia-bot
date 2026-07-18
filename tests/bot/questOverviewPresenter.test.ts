import { describe, expect, it } from "vitest";
import {
  buildQuestOverviewRows,
  presentQuestOverview
} from "../../src/bot/presenters/questOverviewPresenter";
import {
  presentQuestHub,
  type QuestHubSnapshot
} from "../../src/bot/presenters/questHubPresenter";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";

describe("quest overview presenter", () => {
  it("shows Fighting Corner acceptance, progress and Quest Table claim guidance", () => {
    const baseProgress = {
      accepted: false,
      trainingCompleted: false,
      quickDuelCompleted: false,
      turnBasedDuelCompleted: false,
      completedObjectives: 0,
      requiredObjectives: 3 as const,
      readyToClaim: false,
      currentLocationId: "location.korchma.quest_table"
    };
    const active = buildQuestOverviewRows(makeSnapshot({
      fightingCornerQuest: {
        state: "in-progress",
        character,
        progress: {
          ...baseProgress,
          accepted: true,
          trainingCompleted: true,
          completedObjectives: 1
        }
      },
      problemQuest: problemQuest({ completed: true, rewardClaimed: true, wins: 13 })
    }));
    expect(active).toContainEqual(expect.objectContaining({
      id: "fighting-corner-onboarding",
      priority: "active"
    }));
    const activeRow = active.find((row) => row.id === "fighting-corner-onboarding");
    expect(activeRow?.body).toContain(
      "<i>Далі:</i> завершіть <s>тренування</s>, миттєву дуель і покрокову дуель в будь-якому порядку."
    );
    expect(activeRow?.body).not.toContain("<s>миттєву дуель</s>");
    expect(activeRow?.body).not.toContain("<s>покрокову дуель</s>");

    const ready = buildQuestOverviewRows(makeSnapshot({
      fightingCornerQuest: {
        state: "turn-in-ready",
        character,
        progress: {
          ...baseProgress,
          accepted: true,
          trainingCompleted: true,
          quickDuelCompleted: true,
          turnBasedDuelCompleted: true,
          completedObjectives: 3,
          readyToClaim: true
        }
      },
      problemQuest: problemQuest({ completed: true, rewardClaimed: true, wins: 13 })
    }));
    expect(ready).toContainEqual(expect.objectContaining({
      id: "fighting-corner-onboarding",
      priority: "claimable"
    }));
    const readyRow = ready.find((row) => row.id === "fighting-corner-onboarding");
    expect(readyRow?.title).toContain("3/3");
    expect(readyRow?.body).toContain(
      "<i>Зроблено:</i> <s>тренування</s>, <s>миттєву дуель</s> і <s>покрокову дуель</s>."
    );
    expect(readyRow?.body).toContain("фізичний стіл зі справами");
  });

  it("shows the first Korchma route quest as active guidance", () => {
    const rows = buildQuestOverviewRows(makeSnapshot({
      firstKorchmaQuest: {
        state: "active",
        character,
        progress: {
          enteredKorchma: false,
          reachedQuestTable: false,
          currentLocationId: "location.korchma.front"
        }
      },
      problemQuest: problemQuest({ completed: true, rewardClaimed: true, wins: 13 })
    }));

    expect(rows[0]).toMatchObject({
      id: "first-korchma",
      priority: "active",
      title: "📋 <b>Перший крок до столу</b> — 0/2"
    });
    expect(rows[0]?.body).toContain("<i>Далі:</i> зайдіть у Корчму.");

    const insideRows = buildQuestOverviewRows(makeSnapshot({
      firstKorchmaQuest: {
        state: "active",
        character,
        progress: {
          enteredKorchma: true,
          reachedQuestTable: false,
          currentLocationId: "location.korchma.hall"
        }
      },
      problemQuest: problemQuest({ completed: true, rewardClaimed: true, wins: 13 })
    }));

    expect(insideRows[0]?.title).toBe("📋 <b>Перший крок до столу</b> — 1/2");
    expect(insideRows[0]?.body).toContain("<i>Далі:</i> дійдіть до Столу зі справами.");
  });

  it("shows starter quests after the first Korchma route is completed", () => {
    const rows = buildQuestOverviewRows(makeSnapshot({
      firstKorchmaQuest: {
        state: "completed",
        character,
        progress: {
          enteredKorchma: true,
          reachedQuestTable: true,
          currentLocationId: "location.korchma.quest-table"
        },
        reward: { xp: 1, gold: 0 }
      },
      starterAdventure: { state: "ready", character },
      starterFight: { state: "ready", character },
      problemQuest: problemQuest({ completed: true, rewardClaimed: true, wins: 13 })
    }));

    expect(rows.map((row) => row.id)).toEqual(["starter-adventure", "starter-fight"]);
    expect(rows[0]).toMatchObject({
      priority: "active",
      title: "🌯 <b>Підозріла шаурма</b> — новачкова підозра"
    });
    expect(rows[0]?.body).toContain("<i>Зроблено:</i> перший шлях до столу пройдено");
    expect(rows[0]?.body).toContain("<i>Далі:</i> відкрийте підозрілу шаурму");
    expect(rows[0]?.body).toContain("<i>Де:</i> стіл зі справами.");
    expect(rows[1]).toMatchObject({
      priority: "active",
      title: "⚔️ <b>Новачкова сутичка</b> — чекає свідчень"
    });
    expect(rows[1]?.body).toContain("<i>Зроблено:</i> шаурма ще не дала свідчень");
    expect(rows[1]?.body).toContain("<i>Далі:</i> спершу розберіться з підозрілою шаурмою");
    expect(rows[1]?.body).toContain("<i>Де:</i> стіл зі справами.");
  });

  it("shows the cellar starter follow-up after the shawarma and starter fight are completed", () => {
    const rows = buildQuestOverviewRows(makeSnapshot({
      firstKorchmaQuest: {
        state: "completed",
        character,
        progress: {
          enteredKorchma: true,
          reachedQuestTable: true,
          currentLocationId: "location.korchma.quest-table"
        },
        reward: { xp: 1, gold: 0 }
      },
      starterAdventure: { state: "already-completed", character, fightAvailable: false },
      starterFight: { state: "already-completed", character },
      cellar: { state: "ready", character },
      problemQuest: problemQuest({ completed: true, rewardClaimed: true, wins: 13 })
    }));

    expect(rows.map((row) => row.id)).toEqual(["cellar"]);
    expect(rows[0]).toMatchObject({
      priority: "active",
      title: "🐭 <b>Льохова справа</b> — перший спуск"
    });
    expect(rows[0]?.body).toContain("<i>Зроблено:</i> підозріла шаурма дала свідчення");
    expect(rows[0]?.body).toContain("<i>Далі:</i> спустіться в льох");
    expect(rows[0]?.body).toContain("<i>Де:</i> льох корчми.");
  });

  it("shows repeat cellar follow-up copy after the mouse errand was already completed once", () => {
    const rows = buildQuestOverviewRows(makeSnapshot({
      firstKorchmaQuest: {
        state: "completed",
        character,
        progress: {
          enteredKorchma: true,
          reachedQuestTable: true,
          currentLocationId: "location.korchma.quest-table"
        },
        reward: { xp: 1, gold: 0 }
      },
      starterAdventure: { state: "already-completed", character, fightAvailable: false },
      starterFight: { state: "already-completed", character },
      cellar: { state: "ready", character, completed: true },
      problemQuest: problemQuest({ completed: true, rewardClaimed: true, wins: 13 })
    }));

    expect(rows[0]).toMatchObject({
      id: "cellar",
      priority: "active",
      title: "🐭 <b>Льохова справа</b> — не перший спуск"
    });
    expect(rows[0]?.body).toContain(
      "<i>Далі:</i> ще раз спустіться в льох і спробуйте ще раз владнати мишачу дрібницю."
    );
  });

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

    expect(rows.map((row) => row.priority)).toEqual(["claimable", "active", "active", "active"]);
    expect(rows.map((row) => row.id)).toEqual(["daily-korchma-round", "problem-quest", "adventure", "yeger"]);
    expect(rows[0]?.title).toContain("2/2");
    expect(rows.find((row) => row.id === "adventure")).toMatchObject({
      priority: "active",
      title: "🪧 <b>Три справи на найближчий час</b> — три проблеми чекають вибору"
    });
    expect(rows.find((row) => row.id === "adventure")?.body).toContain(
      "<i>Далі:</i> оберіть одну справу й метод, коли будете біля столу."
    );
  });

  it("hides locked, generic available, retired and completed-only rows", () => {
    const highLevel = characterAtLevel(13);
    const rows = buildQuestOverviewRows(makeSnapshot({
      character: highLevel,
      adventure: { state: "already-completed", character: highLevel },
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
        maxLevel: 7,
        progress: barrelProgress(false)
      }
    }));

    expect(rows).toEqual([]);
  });

  it("shows Charkokovalnia unlock details after the field-kit request is available", () => {
    const highLevel = characterAtLevel(13);
    const missingRows = buildQuestOverviewRows(makeSnapshot({
      character: highLevel,
      problemQuest: problemQuest({ completed: true, rewardClaimed: true, wins: 13 }),
      itemUpgrades: {
        state: "unlock-required",
        character: highLevel,
        fieldKitQuantity: 0,
        rewardXp: 13
      }
    }));
    const readyRows = buildQuestOverviewRows(makeSnapshot({
      character: highLevel,
      problemQuest: problemQuest({ completed: true, rewardClaimed: true, wins: 13 }),
      itemUpgrades: {
        state: "unlock-required",
        character: highLevel,
        fieldKitQuantity: 1,
        rewardXp: 13
      }
    }));

    expect(missingRows.find((row) => row.id === "charkokovalnia")).toMatchObject({
      priority: "active",
      title: "✨ <b>Доступ до Чароковальні</b> — потрібна Польова аптечка"
    });
    expect(missingRows.find((row) => row.id === "charkokovalnia")?.body).toContain(
      "<i>Далі:</i> добудьте Польову аптечку; єгер, як завжди, виглядає так, ніби знає, де її шукати."
    );
    expect(missingRows.find((row) => row.id === "charkokovalnia")?.body).toContain(
      "єгерський куток — за підказкою до аптечки."
    );
    expect(readyRows.find((row) => row.id === "charkokovalnia")?.body).toContain(
      "<i>Зроблено:</i> ельф-маг уже попросив Польову аптечку, і вона є в торбі."
    );
    expect(readyRows.find((row) => row.id === "charkokovalnia")?.body).toContain(
      "<i>Далі:</i> віднесіть аптечку до Чароковальні й запустіть іскри офіційно."
    );
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

  it("shows all daily Korchma round locations and crosses out only completed scenes", () => {
    const freshText = presentQuestOverview(makeSnapshot({
      dailyKorchmaRound: {
        state: "ready",
        character,
        offer: dailyOffer([])
      },
      problemQuest: problemQuest({ completed: true, rewardClaimed: true, wins: 13 })
    }));
    const text = presentQuestOverview(makeSnapshot({
      dailyKorchmaRound: {
        state: "ready",
        character,
        offer: dailyOffer(["scene.sign"])
      },
      problemQuest: problemQuest({ completed: true, rewardClaimed: true, wins: 13 })
    }));

    expect(freshText).toContain("<i>Далі:</i> владнайте дві дрібниці з трьох.");
    expect(freshText).toContain("<i>Де:</i> Задвірок корчми, Шинок, Зала корчми.");
    expect(freshText).not.toContain("<s>");
    expect(text).toContain("🧾 <b>Корчмарський обхід</b> — 1/2");
    expect(text).toContain("<i>Далі:</i> владнайте дві дрібниці з трьох.");
    expect(text).toContain("<i>Де:</i> Задвірок корчми, Шинок, <s>Зала корчми</s>.");
    expect(text).not.toContain("<s>Задвірок корчми</s>");
    expect(text).not.toContain("<s>Шинок</s>");
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
    expect(rows[0]?.body).toContain("<i>Далі:</i> здайте обхід");
    expect(rows[0]?.body).toContain(
      "<i>Де:</i> <s>Задвірок корчми</s>, Шинок, <s>Зала корчми</s>. Здати — за столом зі справами."
    );
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
    expect(activeRows.find((row) => row.id === "problem-quest")?.body).toContain("<i>Далі:</i> ще 6 проблем у Низу.");
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

    expect(activeRows.find((row) => row.id === "yeger")?.body).toContain("<i>Далі:</i> ще 10 відповідних монстрів.");
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

  it.each([
    {
      label: "before the round is offered",
      beerRoundOffered: false,
      overview: "проведіть пінну формальність (виставте пиво всім і випийте своє)",
      hub: "Тепер вистав пиво всім і випий своє",
      absent: "пиво всім уже виставлено"
    },
    {
      label: "after the round is offered",
      beerRoundOffered: true,
      overview: "<i>Далі:</i> випийте своє пиво.",
      hub: "пиво всім уже виставлено. Тепер випий своє",
      absent: "виставте пиво всім і випийте своє"
    }
  ])("distinguishes the Barrel own-drink instruction $label in both presenters", ({
    beerRoundOffered,
    overview,
    hub,
    absent
  }) => {
    const snapshot = makeSnapshot({
      barrelBeerTutorial: {
        state: "in-progress",
        character,
        progress: {
          ...barrelProgress(true),
          beerRoundOffered,
          beerDrunk: false,
          activeBeer: false
        }
      }
    });
    const rows = buildQuestOverviewRows(snapshot);
    const body = rows.find((row) => row.id === "barrel-beer-tutorial")?.body;
    const hubText = presentQuestHub(snapshot);

    expect(body).toContain(overview);
    expect(hubText).toContain(hub);
    expect(`${body}\n${hubText}`).not.toContain(absent);
  });

  it("shows available and paused grownup cellar stages in the quest overview", () => {
    const highLevel = characterAtLevel(13);
    const offeredRows = buildQuestOverviewRows(makeSnapshot({
      character: highLevel,
      problemQuest: problemQuest({ completed: true, rewardClaimed: true, wins: 13 }),
      cellar: { state: "level-retired", character: highLevel, maxLevel: 3, completed: false },
      cellarGrownup: {
        state: "offered",
        character: highLevel,
        price: 13
      }
    }));
    const pausedRows = buildQuestOverviewRows(makeSnapshot({
      character: highLevel,
      problemQuest: problemQuest({ completed: true, rewardClaimed: true, wins: 13 }),
      cellar: { state: "level-retired", character: highLevel, maxLevel: 3, completed: false },
      cellarGrownup: {
        state: "roleplay-cooldown",
        character: highLevel,
        now: new Date("2026-07-09T12:00:00.000Z"),
        availableAt: new Date("2026-07-09T12:23:00.000Z")
      }
    }));

    expect(offeredRows.find((row) => row.id === "cellar-grownup")).toMatchObject({
      priority: "active",
      title: "🐭 <b>Справа не до миші</b> — у льосі є інша справа для старших пригодників"
    });
    expect(offeredRows.find((row) => row.id === "cellar-grownup")?.body).toContain(
      "<i>Зроблено:</i> новачкова миша вже не єдина бюрократія в льосі."
    );
    expect(pausedRows.find((row) => row.id === "cellar-grownup")).toMatchObject({
      priority: "active",
      title: "🐭 <b>Справа не до миші</b> — пауза"
    });
    expect(pausedRows.find((row) => row.id === "cellar-grownup")?.body).toContain(
      "<i>Зроблено:</i> льохова дипломатія відсапується ще 23 хвилини."
    );
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
    expect(text).toContain("<i>Де:</i> спуск до Низу. Здати — Корчмарю в шинку.");
    expect(text).toContain("🏹 <b>Неспокійні справи 2.0</b> — 7/17");
    expect(text).toContain("<i>Де:</i> єгерський куток показує умови, але полювання лишається через звичайні маршрути.");
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
        id: "scene.well",
        icon: "🪣",
        title: "Криниця рахує відлуння",
        locationId: "location.korchma.yard",
        hook: "Криниця має бухгалтерський настрій.",
        actions: []
      },
      {
        id: "scene.mug",
        icon: "🍺",
        title: "Кухоль просить посаду",
        locationId: "location.korchma.bar",
        hook: "Шинок має кадровий настрій.",
        actions: []
      },
      {
        id: "scene.sign",
        icon: "🪧",
        title: "Вивіска сперечається з цвяхом",
        locationId: "location.korchma.hall",
        hook: "Вивіска має думку.",
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
