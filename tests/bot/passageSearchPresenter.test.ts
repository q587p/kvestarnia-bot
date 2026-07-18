import { describe, expect, it } from "vitest";
import { presentPassageSearch } from "../../src/bot/presenters/passageSearchPresenter";
import type { PassageSearchActionRecord } from "../../src/db/repositories/passageSearchRepository";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";

const character: CharacterSummary = {
  name: "Shannar de Kassal",
  pronoun: "they",
  pronounLabel: "Вони",
  path: "boundary",
  raceId: "race.human-ish",
  raceName: "Людисько",
  classId: "class.ranger",
  className: "Єгер",
  title: "Шахтна Іскрознавиця",
  level: 3,
  xp: 0,
  nextLevelXp: 50,
  xpToNextLevel: 50,
  gold: 0,
  hpCurrent: 24,
  hpMax: 24,
  manaCurrent: 12,
  manaMax: 12,
  stats: {
    strength: 6,
    dexterity: 7,
    intelligence: 6,
    charisma: 6,
    luck: 6
  },
  levelBonus: {
    hpMax: 4,
    manaMax: 2,
    primaryStat: {
      stat: "dexterity",
      bonus: 1
    }
  }
};

describe("passage search presenter", () => {
  it("renders running passage search without a character header", () => {
    const text = presentPassageSearch({
      state: "running",
      character,
      action: passageSearchAction(),
      remainingSeconds: 23
    });

    expect(text).toContain("🔎 <b>Пошук триває</b>");
    expect(text).not.toContain("<b>Shannar de Kassal</b>");
    expect(text).not.toContain("Шахтна Іскрознавиця");
  });

  it("separates found Iskrokamin from gold as an actual item grant", () => {
    const text = presentPassageSearch({
      state: "completed",
      character,
      action: passageSearchAction(),
      loot: {
        gold: 1,
        itemGrants: [{
          itemId: "item.iskrokamin",
          name: "Іскрокамінь",
          quantity: 1
        }]
      }
    });

    expect(text).toContain([
      "💰 Золото: <b>1</b>",
      "",
      "Здобуто: <i>Іскрокамінь</i>"
    ].join("\n"));
  });
});

function passageSearchAction(): PassageSearchActionRecord {
  const startedAt = new Date("2026-06-29T12:00:00.000Z");
  const endsAt = new Date("2026-06-29T12:00:42.000Z");

  return {
    id: "search-1",
    token: "token13",
    characterId: "character-1",
    nodeKey: "passage:deep-straight",
    nodeKind: "passage",
    status: "running",
    startedAt,
    endsAt,
    payload: {
      nodeKey: "passage:deep-straight",
      nodeKind: "passage",
      originLocationId: "location.korchma.deep.level1.straight",
      passage: "deep-straight",
      encounterToken: "token13",
      durationMs: 42_000,
      safeAtStart: false,
      dangerTier: 3,
      searchTier: 3,
      monsterIdAtStart: "monster.deadline-spider",
      monsterNameAtStart: "Павук дедлайнів",
      monsterLevelAtStart: 3,
      playerLuckSnapshot: 6,
      startedAt: startedAt.toISOString(),
      endsAt: endsAt.toISOString()
    },
    result: null,
    createdAt: startedAt,
    updatedAt: startedAt
  };
}
