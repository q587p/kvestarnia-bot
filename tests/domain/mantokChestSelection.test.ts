import { describe, expect, it } from "vitest";
import { items } from "../../src/content";
import {
  buildMantokChestEligibleStacks,
  expandMantokChestStacks,
  selectCheapestMantokChestUnits,
  summarizeMantokChestUnits
} from "../../src/domain/mantokChest";

describe("mantok chest selection", () => {
  it("selects the same cheapest units from stack quantities without requiring callers to expand every unit", () => {
    const stacks = buildMantokChestEligibleStacks({
      stacks: [
        { itemId: "item.suspicious-shawarma-wrapper", quantity: 93 },
        { itemId: "item.cheese-of-procedural-doubt", quantity: 2 },
        { itemId: "item.bristle-of-basement-order", quantity: 3 }
      ],
      itemContents: items
    });
    const expectedUnits = expandMantokChestStacks(stacks)
      .sort((left, right) => left.score - right.score || left.itemId.localeCompare(right.itemId))
      .slice(0, 5);

    const selection = selectCheapestMantokChestUnits(stacks);

    expect(selection).not.toBeNull();
    expect(selection?.units).toEqual(expectedUnits);
    expect(selection?.items).toEqual(summarizeMantokChestUnits(expectedUnits));
  });
});
