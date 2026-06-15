import { Prisma, PrismaClient } from "@prisma/client";
import { findGiftCampaign, type GiftCampaignContent } from "../src/content/giftCampaigns";
import {
  calculateGiftCampaignGrantQuantity,
  runGiftCampaignGrant,
  type AppliedGiftCampaignItemGrant,
  type GiftCampaignCharacterClaimResult,
  type GiftCampaignGrantStore
} from "../src/services/giftCampaignGrant";

interface CliOptions {
  campaignId: string;
  apply: boolean;
}

class PrismaGiftCampaignGrantStore implements GiftCampaignGrantStore {
  constructor(private readonly prisma: PrismaClient) {}

  async listCharacters(): Promise<Array<{ id: string }>> {
    return this.prisma.character.findMany({
      select: {
        id: true
      },
      orderBy: {
        createdAt: "asc"
      }
    });
  }

  async claimForCharacter(input: {
    characterId: string;
    campaign: GiftCampaignContent;
    apply: boolean;
  }): Promise<GiftCampaignCharacterClaimResult> {
    if (!input.apply) {
      return this.previewClaim(input.characterId, input.campaign);
    }

    try {
      return await this.applyClaim(input.characterId, input.campaign);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return {
          state: "existing",
          itemGrants: []
        };
      }

      throw error;
    }
  }

  private async previewClaim(
    characterId: string,
    campaign: GiftCampaignContent
  ): Promise<GiftCampaignCharacterClaimResult> {
    const existingClaim = await this.prisma.dailyAction.findUnique({
      where: {
        characterId_key_localDate: {
          characterId,
          key: campaign.key,
          localDate: campaign.localDate
        }
      }
    });

    if (existingClaim) {
      return {
        state: "existing",
        itemGrants: []
      };
    }

    const itemGrants = await this.planItemGrants(characterId, campaign);

    return {
      state: "created",
      itemGrants
    };
  }

  private async applyClaim(
    characterId: string,
    campaign: GiftCampaignContent
  ): Promise<GiftCampaignCharacterClaimResult> {
    return this.prisma.$transaction(async (tx) => {
      const existingClaim = await tx.dailyAction.findUnique({
        where: {
          characterId_key_localDate: {
            characterId,
            key: campaign.key,
            localDate: campaign.localDate
          }
        }
      });

      if (existingClaim) {
        return {
          state: "existing",
          itemGrants: []
        };
      }

      await tx.dailyAction.create({
        data: {
          characterId,
          key: campaign.key,
          localDate: campaign.localDate,
          rewardXp: campaign.rewardXp,
          rewardGold: campaign.rewardGold
        }
      });

      if (campaign.rewardXp !== 0 || campaign.rewardGold !== 0) {
        await tx.character.update({
          where: {
            id: characterId
          },
          data: {
            xp: {
              increment: campaign.rewardXp
            },
            gold: {
              increment: campaign.rewardGold
            }
          }
        });
      }

      const itemGrants = await this.planItemGrants(characterId, campaign, tx);

      for (const grant of itemGrants) {
        await tx.characterItem.upsert({
          where: {
            characterId_itemId: {
              characterId,
              itemId: grant.itemId
            }
          },
          create: {
            characterId,
            itemId: grant.itemId,
            quantity: grant.quantity
          },
          update: {
            quantity: {
              increment: grant.quantity
            }
          }
        });
      }

      return {
        state: "created",
        itemGrants
      };
    });
  }

  private async planItemGrants(
    characterId: string,
    campaign: GiftCampaignContent,
    client: Prisma.TransactionClient | PrismaClient = this.prisma
  ): Promise<AppliedGiftCampaignItemGrant[]> {
    const itemGrants: AppliedGiftCampaignItemGrant[] = [];

    for (const grant of campaign.itemGrants) {
      const existingItem = await client.characterItem.findUnique({
        where: {
          characterId_itemId: {
            characterId,
            itemId: grant.itemId
          }
        },
        select: {
          quantity: true
        }
      });
      const quantity = calculateGiftCampaignGrantQuantity(grant, existingItem?.quantity ?? 0);

      if (quantity <= 0) {
        continue;
      }

      itemGrants.push({
        itemId: grant.itemId,
        quantity
      });
    }

    return itemGrants;
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const campaign = findGiftCampaign(options.campaignId);

  if (!campaign) {
    throw new Error(`Unknown gift campaign: ${options.campaignId}`);
  }

  const prisma = new PrismaClient();

  try {
    const summary = await runGiftCampaignGrant({
      campaign,
      apply: options.apply,
      store: new PrismaGiftCampaignGrantStore(prisma)
    });

    printSummary(summary);
  } finally {
    await prisma.$disconnect();
  }
}

function parseArgs(args: string[]): CliOptions {
  const campaignId = readArg(args, "--campaign");

  if (!campaignId) {
    throw new Error("Missing required --campaign <campaign-id> argument.");
  }

  return {
    campaignId,
    apply: args.includes("--apply")
  };
}

function readArg(args: string[], name: string): string | undefined {
  const exact = args.find((arg) => arg.startsWith(`${name}=`));

  if (exact) {
    return exact.slice(name.length + 1);
  }

  const index = args.indexOf(name);

  return index >= 0 ? args[index + 1] : undefined;
}

function printSummary(summary: Awaited<ReturnType<typeof runGiftCampaignGrant>>): void {
  console.log(`${summary.dryRun ? "Dry run" : "Applied"}: ${summary.title}`);
  console.log(`Campaign: ${summary.campaignId}`);
  console.log(`Characters scanned: ${summary.charactersScanned}`);
  console.log(`Grants ${summary.dryRun ? "planned" : "created"}: ${summary.grantsCreated}`);
  console.log(`Skipped already claimed: ${summary.skippedAlreadyClaimed}`);

  const itemLines = Object.entries(summary.itemQuantities)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([itemId, quantity]) => `- ${itemId}: ${quantity}`);

  console.log("Items:");
  console.log(itemLines.length > 0 ? itemLines.join("\n") : "- none");
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
