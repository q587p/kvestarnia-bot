import { describe, expect, it } from "vitest";
import type { GiftCampaignContent } from "../../src/content/giftCampaigns";
import {
  calculateGiftCampaignGrantQuantity,
  runGiftCampaignGrant,
  type GiftCampaignCharacterClaimResult,
  type GiftCampaignGrantStore
} from "../../src/services/giftCampaignGrant";

const campaign = {
  id: "gift.test.once",
  key: "gift.test.once",
  localDate: "once",
  title: "Тестовий набір",
  description: "Для перевірки.",
  rewardXp: 0,
  rewardGold: 0,
  itemGrants: [
    {
      itemId: "item.test-a",
      quantity: 1,
      maxOwnedQuantity: 1
    },
    {
      itemId: "item.test-b",
      quantity: 2,
      maxOwnedQuantity: 3
    }
  ]
} satisfies GiftCampaignContent;

describe("gift campaign grant service", () => {
  it("plans dry-runs without mutating claims or inventory", async () => {
    const store = new FakeGiftCampaignGrantStore(["character-a", "character-b"]);

    const summary = await runGiftCampaignGrant({
      campaign,
      apply: false,
      store
    });

    expect(summary).toMatchObject({
      dryRun: true,
      charactersScanned: 2,
      grantsCreated: 2,
      skippedAlreadyClaimed: 0
    });
    expect(summary.itemQuantities).toEqual({
      "item.test-a": 2,
      "item.test-b": 4
    });
    expect(store.claims.size).toBe(0);
    expect(store.getQuantity("character-a", "item.test-a")).toBe(0);
  });

  it("applies a campaign once and skips repeated grants", async () => {
    const store = new FakeGiftCampaignGrantStore(["character-a"]);

    const first = await runGiftCampaignGrant({
      campaign,
      apply: true,
      store
    });
    const second = await runGiftCampaignGrant({
      campaign,
      apply: true,
      store
    });

    expect(first).toMatchObject({
      dryRun: false,
      grantsCreated: 1,
      skippedAlreadyClaimed: 0
    });
    expect(first.itemQuantities).toEqual({
      "item.test-a": 1,
      "item.test-b": 2
    });
    expect(second).toMatchObject({
      grantsCreated: 0,
      skippedAlreadyClaimed: 1
    });
    expect(second.itemQuantities).toEqual({});
    expect(store.getQuantity("character-a", "item.test-a")).toBe(1);
    expect(store.getQuantity("character-a", "item.test-b")).toBe(2);
  });

  it("respects maxOwnedQuantity while planning and applying grants", async () => {
    const store = new FakeGiftCampaignGrantStore(["character-a"]);

    store.setQuantity("character-a", "item.test-a", 1);
    store.setQuantity("character-a", "item.test-b", 2);

    const summary = await runGiftCampaignGrant({
      campaign,
      apply: true,
      store
    });

    expect(summary.itemQuantities).toEqual({
      "item.test-b": 1
    });
    expect(store.getQuantity("character-a", "item.test-a")).toBe(1);
    expect(store.getQuantity("character-a", "item.test-b")).toBe(3);
  });

  it("calculates capped grant quantities", () => {
    expect(calculateGiftCampaignGrantQuantity({ itemId: "item.a", quantity: 2 }, 999)).toBe(2);
    expect(
      calculateGiftCampaignGrantQuantity(
        { itemId: "item.a", quantity: 2, maxOwnedQuantity: 3 },
        1
      )
    ).toBe(2);
    expect(
      calculateGiftCampaignGrantQuantity(
        { itemId: "item.a", quantity: 2, maxOwnedQuantity: 3 },
        2
      )
    ).toBe(1);
    expect(
      calculateGiftCampaignGrantQuantity(
        { itemId: "item.a", quantity: 2, maxOwnedQuantity: 3 },
        3
      )
    ).toBe(0);
  });
});

class FakeGiftCampaignGrantStore implements GiftCampaignGrantStore {
  readonly claims = new Set<string>();
  private readonly inventory = new Map<string, number>();

  constructor(private readonly characterIds: string[]) {}

  async listCharacters(): Promise<Array<{ id: string }>> {
    await Promise.resolve();

    return this.characterIds.map((id) => ({ id }));
  }

  async claimForCharacter(input: {
    characterId: string;
    campaign: GiftCampaignContent;
    apply: boolean;
  }): Promise<GiftCampaignCharacterClaimResult> {
    await Promise.resolve();

    const claimKey = this.claimKey(input.characterId, input.campaign);

    if (this.claims.has(claimKey)) {
      return {
        state: "existing",
        itemGrants: []
      };
    }

    const itemGrants = input.campaign.itemGrants
      .map((grant) => ({
        itemId: grant.itemId,
        quantity: calculateGiftCampaignGrantQuantity(
          grant,
          this.getQuantity(input.characterId, grant.itemId)
        )
      }))
      .filter((grant) => grant.quantity > 0);

    if (input.apply) {
      this.claims.add(claimKey);

      for (const grant of itemGrants) {
        this.setQuantity(
          input.characterId,
          grant.itemId,
          this.getQuantity(input.characterId, grant.itemId) + grant.quantity
        );
      }
    }

    return {
      state: "created",
      itemGrants
    };
  }

  getQuantity(characterId: string, itemId: string): number {
    return this.inventory.get(this.itemKey(characterId, itemId)) ?? 0;
  }

  setQuantity(characterId: string, itemId: string, quantity: number): void {
    this.inventory.set(this.itemKey(characterId, itemId), quantity);
  }

  private claimKey(characterId: string, campaign: GiftCampaignContent): string {
    return `${characterId}:${campaign.key}:${campaign.localDate}`;
  }

  private itemKey(characterId: string, itemId: string): string {
    return `${characterId}:${itemId}`;
  }
}
