import { describe, expect, it } from "vitest";
import {
  presentDailyKorchmaRound,
  presentDailyKorchmaRoundClaim,
  presentDailyKorchmaRoundScene
} from "../../src/bot/presenters/dailyKorchmaRoundPresenter";
import { summarizeCharacter } from "../../src/domain/characters/characterSummary";
import type {
  DailyKorchmaRoundClaimResult,
  DailyKorchmaRoundOffer,
  DailyKorchmaRoundLookupResult,
  DailyKorchmaRoundSceneLookupResult
} from "../../src/services/dailyKorchmaRoundService";
import { ISKROKAMIN_ITEM_ID } from "../../src/services/itemGrant";

describe("daily Korchma round presenter", () => {
  it("renders an opt-in card before the daily Korchma round is issued", () => {
    const text = presentDailyKorchmaRound({
      state: "not-issued",
      character: dailyRoundCharacter(),
      dayToken: "20260628"
    });

    expect(text).toContain("🧾 Корчмарський обхід");
    expect(text).toContain("Візьмете обхід");
    expect(text).toContain("локації працюватимуть як завжди");
  });

  it("renders the turn-in location as an italic lower-case place name", () => {
    const text = presentDailyKorchmaRound(turnInReadyRound());

    expect(text).not.toContain("<b>Shannar de Kassal</b>");
    expect(text).not.toContain("Шахтна Іскрознавиця");
    expect(text).toContain("Поверніться до <i>столу зі справами</i> й здайте обхід Корчмарю.");
    expect(text).toContain("— не сьогоднішня катастрофа");
    expect(text).not.toContain("— Не сьогоднішня катастрофа");
    expect(text).not.toContain("Поверніться до Столу зі справами");
  });

  it("renders active scene action prompt without duplicating button labels or pre-spoiling details", () => {
    const text = presentDailyKorchmaRoundScene(stoolScene());

    expect(text).not.toContain("<b>Shannar de Kassal</b>");
    expect(text).not.toContain("Шахтна Іскрознавиця");
    expect(text).toContain("<i>Оберіть одну дію. Вона спрацює тільки тут:</i>");
    expect(text).not.toContain("ніжкам, що вертикальність має межі.\n\n\n<i>Оберіть одну дію. Вона спрацює тільки тут:</i>");
    expect(text).not.toContain("🧺 Запропонувати подушку");
    expect(text).not.toContain("📐 Вирівняти ніжки");
    expect(text).not.toContain("🗓️ Записати перерву");
    expect(text).not.toContain("Мʼяка дипломатія");
    expect(text).not.toContain("Подушка додала табурету гідності");
  });

  it("renders active scene action descriptions in help mode", () => {
    const text = presentDailyKorchmaRoundScene(stoolScene(), { mode: "help" });

    expect(text).not.toContain("<b>Shannar de Kassal</b>");
    expect(text).not.toContain("Шахтна Іскрознавиця");
    expect(text).toContain("Детальніше про дії:");
    expect(text).toContain("🧺 Запропонувати подушку\n<i>Мʼяка дипломатія без героїчного ремонту.</i>");
    expect(text).toContain("📐 Вирівняти ніжки\n<i>Практичний ремонт, який може зачепити меблеву гідність.</i>");
    expect(text).not.toContain("<i>Оберіть одну дію. Вона спрацює тільки тут:</i>");
    expect(text).not.toContain("Подушка додала табурету гідності");
  });

  it("renders quest Iskrokamin grants on reward cards", () => {
    const text = presentDailyKorchmaRoundClaim(rewardClaimWithIskrokamin());

    expect(text).toContain("<i>Отримано:</i>");
    expect(text).toContain("Здобуто: <i>Іскрокамінь</i>");
  });
});

function turnInReadyRound(): DailyKorchmaRoundLookupResult {
  return {
    state: "turn-in-ready",
    character: dailyRoundCharacter(),
    offer: dailyRoundOffer()
  };
}

function dailyRoundOffer(): DailyKorchmaRoundOffer {
  const completedSceneIds = ["scene.cellar.inventory-bottle", "scene.yeger.map-sneeze"];

  return {
    dayKey: "2026-06-28",
    dayToken: "20260628",
    lifeToken: 0,
    requiredSteps: 2,
    completedSceneIds,
    omittedSceneId: "scene.yard.rope",
    scenes: [
      {
        id: completedSceneIds[0],
        icon: "🍾",
        title: "Пляшка шепоче інвентаризацію",
        locationId: "location.korchma.cellar",
        zone: "interior",
        hook: "У льосі пляшка шепоче номери.",
        actions: []
      },
      {
        id: completedSceneIds[1],
        icon: "🗺️",
        title: "Мапа чхнула не в той бік",
        locationId: "location.korchma.ranger_corner",
        zone: "interior",
        hook: "У єгерському кутку мапа має думку.",
        actions: []
      },
      {
        id: "scene.yard.rope",
        icon: "🪢",
        title: "Мотузка завʼязала питання",
        locationId: "location.korchma.yard",
        zone: "yard",
        hook: "У задвірку мотузка має думку.",
        actions: []
      }
    ]
  };
}

function stoolScene(): DailyKorchmaRoundSceneLookupResult {
  const scene = {
    id: "hall-stool-union",
    icon: "🪑",
    title: "Табурет оголосив перерву",
    locationId: "location.korchma.hall",
    zone: "interior" as const,
    hook: "Серед зали табурет стоїть набік і пояснює всім ніжкам, що вертикальність має межі.",
    actions: [
      {
        id: "offer-cushion",
        label: "🧺 Запропонувати подушку",
        description: "Мʼяка дипломатія без героїчного ремонту.",
        outcome: "Подушка додала табурету гідності. Він погодився стояти, але тільки з новим поглядом на працю."
      },
      {
        id: "align-legs",
        label: "📐 Вирівняти ніжки",
        description: "Практичний ремонт, який може зачепити меблеву гідність.",
        outcome: "Ви вирівняли ніжки. Табурет буркнув, що це технічна, а не ідеологічна перемога."
      },
      {
        id: "schedule-break",
        label: "🗓️ Записати перерву",
        description: "Бюрократичний мир: перерва існує, але не заважає залу.",
        outcome: "Перерву внесено в уявний графік. Табурет відчув себе почутим і знову став меблями."
      }
    ]
  };

  return {
    state: "scene",
    character: dailyRoundCharacter(),
    offer: {
      dayKey: "2026-06-28",
      dayToken: "20260628",
      lifeToken: 0,
      requiredSteps: 2,
      completedSceneIds: [],
      omittedSceneId: null,
      scenes: [scene]
    },
    scene,
    sceneIndex: 0,
    alreadyCompleted: false,
    locked: false
  };
}

function rewardClaimWithIskrokamin(): DailyKorchmaRoundClaimResult {
  return {
    state: "reward-claimed",
    character: dailyRoundCharacter(),
    offer: dailyRoundOffer(),
    reward: {
      xp: 8,
      gold: 5,
      localDate: "2026-06-28",
      itemGrants: [
        {
          itemId: ISKROKAMIN_ITEM_ID,
          name: "Іскрокамінь",
          quantity: 1
        }
      ]
    },
    levelChange: null,
    achievementUnlocks: []
  };
}

function dailyRoundCharacter() {
  return summarizeCharacter({
    name: "Shannar de Kassal",
    pronoun: "they",
    raceId: "race.human",
    classId: "class.ranger",
    level: 3,
    xp: 0,
    gold: 0,
    hpCurrent: 24,
    hpMax: 24,
    manaCurrent: 12,
    manaMax: 12,
    statsJson: {
      strength: 6,
      dexterity: 7,
      intelligence: 6,
      charisma: 6,
      luck: 6
    }
  });
}
