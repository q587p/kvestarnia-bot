import { describe, expect, it } from "vitest";
import {
  presentHuntAlreadyCompleted,
  presentHuntBoard,
  presentHuntResult,
  presentHuntStalePeriod
} from "../../src/bot/presenters/huntPresenter";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";
import type { HuntLookupResult, HuntResult } from "../../src/services/huntService";

describe("hunt presenter", () => {
  it("shows the hunt board without exposing unsafe HTML", () => {
    const text = presentHuntBoard({
      state: "ready",
      character: {
        ...character,
        name: "<b>Мандрівник</b>",
        title: "Титул <i>підступу</i>"
      },
      contract: {
        localDate: "2026-06-14",
        monster: {
          id: "monster.test",
          name: "<script>Проблема</script>",
          description: "Опис із <b>зубами</b>.",
          level: 2,
          tags: ["test"]
        },
        startFlavor: "Флейвор із <b>теґом</b>."
      }
    });

    expect(text).toContain("&lt;b&gt;Мандрівник&lt;/b&gt;");
    expect(text).toContain("Титул &lt;i&gt;підступу&lt;/i&gt;");
    expect(text).toContain("&lt;script&gt;Проблема&lt;/script&gt;");
    expect(text).toContain("Опис із &lt;b&gt;зубами&lt;/b&gt;.");
    expect(text).toContain("Флейвор із &lt;b&gt;теґом&lt;/b&gt;.");
    expect(text).not.toContain("<script>Проблема</script>");
  });

  it("shows a completed hunt reward and at most owned item grant", () => {
    const text = presentHuntResult(completed("strike"));

    expect(text).toContain("Ви вдарили по проблемі");
    expect(text).toContain("Нагорода:\n<b>+5 XP\n+1 золота</b>");
    expect(text).toContain("Здобуто: <i>Кістяний ключ напівдоступу</i>");
    expect(text).not.toContain("×1");
  });

  it("does not show action buttons text for completed, stale, or already-completed states", () => {
    expect(presentHuntResult(completed("trick"))).not.toContain("Що робимо?");
    expect(presentHuntResult(alreadyCompleted())).not.toContain("Що робимо?");
    expect(presentHuntStalePeriod(stale())).not.toContain("Що робимо?");
  });

  it("escapes dynamic monster and item names in result states", () => {
    const text = presentHuntResult({
      ...completed("retreat"),
      contract: {
        ...contract,
        monster: {
          ...contract.monster,
          name: "<b>Проблема</b>"
        }
      },
      reward: {
        xp: 3,
        gold: 0,
        localDate: "2026-06-14",
        itemGrants: [
          {
            itemId: "item.unsafe",
            name: "<i>Манатка</i>",
            quantity: 1
          }
        ]
      }
    });

    expect(text).toContain("&lt;b&gt;Проблема&lt;/b&gt;");
    expect(text).toContain("&lt;i&gt;Манатка&lt;/i&gt;");
    expect(text).not.toContain("<b>Проблема</b>");
    expect(text).not.toContain("<i>Манатка</i>");
  });

  it("summarizes already-completed hunt without reward duplication", () => {
    const text = presentHuntAlreadyCompleted(alreadyCompleted());

    expect(text).toContain("вже зараховано");
    expect(text).toContain("Скелет-вахтер печаток");
    expect(text).not.toContain("+5 XP");
  });
});

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
  level: 1,
  xp: 0,
  nextLevelXp: 10,
  xpToNextLevel: 10,
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

const contract = {
  localDate: "2026-06-14",
  monster: {
    id: "monster.stamp-doorkeeper-skeleton",
    name: "Скелет-вахтер печаток",
    description: "Не пускає навіть смерть без пропуску.",
    level: 2,
    tags: ["undead"]
  },
  startFlavor: null
};

function completed(action: "strike" | "trick" | "retreat"): Extract<HuntResult, { state: "completed" }> {
  return {
    state: "completed",
    action,
    character,
    contract,
    reward: {
      xp: 5,
      gold: 1,
      localDate: "2026-06-14",
      itemGrants:
        action === "retreat"
          ? []
          : [
              {
                itemId: "item.bone-key-of-half-access",
                name: "Кістяний ключ напівдоступу",
                quantity: 1
              }
            ]
    },
    levelChange: {
      oldLevel: 1,
      newLevel: 1,
      leveledUp: false
    },
    outcomeFlavor: null
  };
}

function alreadyCompleted(): Extract<HuntLookupResult, { state: "already-completed" }> {
  return {
    state: "already-completed",
    character,
    contract
  };
}

function stale(): Extract<HuntResult, { state: "stale-period" }> {
  return {
    state: "stale-period",
    currentLocalDate: "2026-06-14",
    requestedLocalDate: "2026-06-13"
  };
}
