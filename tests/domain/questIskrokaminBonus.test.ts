import { describe, expect, it } from "vitest";
import {
  QUEST_ISKROKAMIN_ITEM_ID,
  rollQuestIskrokaminBonusQuantity,
  buildQuestIskrokaminBonusGrant
} from "../../src/domain/quests/questIskrokaminBonus";

describe("quest Iskrokamin bonus", () => {
  it("gates bonus drops to level four and higher", () => {
    expect(rollQuestIskrokaminBonusQuantity({ characterLevel: 3, roll: 0 })).toBe(0);
    expect(rollQuestIskrokaminBonusQuantity({ characterLevel: 4, roll: 0 })).toBe(3);
  });

  it("maps the requested quantity chances to one deterministic roll", () => {
    expect(rollQuestIskrokaminBonusQuantity({ characterLevel: 4, roll: 0.049 })).toBe(3);
    expect(rollQuestIskrokaminBonusQuantity({ characterLevel: 4, roll: 0.05 })).toBe(2);
    expect(rollQuestIskrokaminBonusQuantity({ characterLevel: 4, roll: 0.179 })).toBe(2);
    expect(rollQuestIskrokaminBonusQuantity({ characterLevel: 4, roll: 0.18 })).toBe(1);
    expect(rollQuestIskrokaminBonusQuantity({ characterLevel: 4, roll: 0.409 })).toBe(1);
    expect(rollQuestIskrokaminBonusQuantity({ characterLevel: 4, roll: 0.41 })).toBe(0);
  });

  it("builds a replay-stable Iskrokamin item grant from claim identity", () => {
    const input = {
      characterId: "character-1",
      characterLevel: 4,
      sourceIdentity: "quest.example:12026-07-10"
    };

    expect(buildQuestIskrokaminBonusGrant(input)).toEqual(buildQuestIskrokaminBonusGrant(input));
    const grant = buildQuestIskrokaminBonusGrant({
      characterId: "character-1",
      characterLevel: 4,
      sourceIdentity: "quest.example:0"
    });

    expect(grant).toEqual({
      itemId: QUEST_ISKROKAMIN_ITEM_ID,
      quantity: 1
    });
  });
});
