import type { GiftCampaignContent, GiftCampaignItemGrant } from "../content/giftCampaigns";

export interface GiftCampaignCharacterRef {
  id: string;
}

export interface AppliedGiftCampaignItemGrant {
  itemId: string;
  quantity: number;
}

export type GiftCampaignCharacterClaimResult =
  | {
      state: "created";
      itemGrants: AppliedGiftCampaignItemGrant[];
    }
  | {
      state: "existing";
      itemGrants: [];
    };

export interface GiftCampaignGrantStore {
  listCharacters(): Promise<GiftCampaignCharacterRef[]>;
  claimForCharacter(input: {
    characterId: string;
    campaign: GiftCampaignContent;
    apply: boolean;
  }): Promise<GiftCampaignCharacterClaimResult>;
}

export interface GiftCampaignGrantSummary {
  campaignId: string;
  title: string;
  dryRun: boolean;
  charactersScanned: number;
  grantsCreated: number;
  skippedAlreadyClaimed: number;
  itemQuantities: Record<string, number>;
}

export async function runGiftCampaignGrant(input: {
  campaign: GiftCampaignContent;
  apply: boolean;
  store: GiftCampaignGrantStore;
}): Promise<GiftCampaignGrantSummary> {
  const characters = await input.store.listCharacters();
  const summary: GiftCampaignGrantSummary = {
    campaignId: input.campaign.id,
    title: input.campaign.title,
    dryRun: !input.apply,
    charactersScanned: characters.length,
    grantsCreated: 0,
    skippedAlreadyClaimed: 0,
    itemQuantities: {}
  };

  for (const character of characters) {
    const claim = await input.store.claimForCharacter({
      characterId: character.id,
      campaign: input.campaign,
      apply: input.apply
    });

    if (claim.state === "existing") {
      summary.skippedAlreadyClaimed += 1;
      continue;
    }

    summary.grantsCreated += 1;

    for (const grant of claim.itemGrants) {
      summary.itemQuantities[grant.itemId] =
        (summary.itemQuantities[grant.itemId] ?? 0) + grant.quantity;
    }
  }

  return summary;
}

export function calculateGiftCampaignGrantQuantity(
  grant: GiftCampaignItemGrant,
  existingQuantity: number
): number {
  const requestedQuantity = Math.max(0, Math.floor(grant.quantity));

  if (requestedQuantity <= 0) {
    return 0;
  }

  if (grant.maxOwnedQuantity === undefined) {
    return requestedQuantity;
  }

  const remaining = Math.max(0, grant.maxOwnedQuantity - Math.max(0, existingQuantity));

  return Math.min(requestedQuantity, remaining);
}
