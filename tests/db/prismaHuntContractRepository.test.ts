import { describe, expect, it } from "vitest";
import { PrismaHuntContractRepository } from "../../src/db/repositories/prismaHuntContractRepository";

describe("PrismaHuntContractRepository", () => {
  it("serializes and deserializes ledger item grants", async () => {
    const prisma = new FakeHuntContractPrisma();
    const repository = new PrismaHuntContractRepository(prisma.client);

    const posted = await repository.upsertPostedContractForTelegramUser(42n, {
      localPeriodId: "2026-06-14T08",
      monsterId: "monster.deadline-spider",
      contractToken: "abc1234"
    });
    const completed = await repository.markCompletedForTelegramUser(42n, {
      localPeriodId: "2026-06-14T08",
      action: "strike",
      rewardXp: 5,
      rewardGold: 1,
      itemGrants: [{ itemId: "item.web-of-tomorrow-promise", quantity: 1 }]
    });
    const found = await repository.findByTelegramUserIdAndPeriod(42n, "2026-06-14T08");

    expect(posted).toMatchObject({
      status: "posted",
      monsterId: "monster.deadline-spider"
    });
    expect(completed).toMatchObject({
      status: "completed",
      completedAction: "strike",
      rewardXp: 5,
      rewardGold: 1,
      rewardItems: [{ itemId: "item.web-of-tomorrow-promise", quantity: 1 }]
    });
    expect(found?.rewardItems).toEqual([{ itemId: "item.web-of-tomorrow-promise", quantity: 1 }]);
  });
});

class FakeHuntContractPrisma {
  private readonly character = {
    id: "character-1"
  };

  private record: FakeHuntContractRecord | null = null;

  readonly client = {
    character: {
      findFirst: () => Promise.resolve(this.character)
    },
    huntContract: {
      findFirst: (input: { where: { localPeriodId: string } }) =>
        Promise.resolve(
          this.record?.localPeriodId === input.where.localPeriodId ? this.record : null
        ),
      upsert: (input: {
        create: {
          characterId: string;
          localPeriodId: string;
          monsterId: string;
          contractToken: string;
        };
      }) => {
        if (!this.record) {
          this.record = {
            id: "hunt-contract-1",
            characterId: input.create.characterId,
            localPeriodId: input.create.localPeriodId,
            monsterId: input.create.monsterId,
            contractToken: input.create.contractToken,
            status: "posted",
            completedAction: null,
            rewardXp: null,
            rewardGold: null,
            rewardItemsJson: null,
            createdAt: new Date("2026-06-14T08:00:00.000Z"),
            completedAt: null,
            updatedAt: new Date("2026-06-14T08:00:00.000Z")
          };
        }

        return Promise.resolve(this.record);
      },
      update: (input: {
        data: {
          status: string;
          completedAction: string;
          rewardXp: number;
          rewardGold: number;
          rewardItemsJson: unknown;
          completedAt: Date;
        };
      }) => {
        if (!this.record) {
          throw new Error("Missing fake hunt contract.");
        }

        this.record = {
          ...this.record,
          status: input.data.status,
          completedAction: input.data.completedAction,
          rewardXp: input.data.rewardXp,
          rewardGold: input.data.rewardGold,
          rewardItemsJson: input.data.rewardItemsJson,
          completedAt: input.data.completedAt,
          updatedAt: input.data.completedAt
        };

        return Promise.resolve(this.record);
      }
    }
  } as unknown as ConstructorParameters<typeof PrismaHuntContractRepository>[0];
}

interface FakeHuntContractRecord {
  id: string;
  characterId: string;
  localPeriodId: string;
  monsterId: string;
  contractToken: string;
  status: string;
  completedAction: string | null;
  rewardXp: number | null;
  rewardGold: number | null;
  rewardItemsJson: unknown;
  createdAt: Date;
  completedAt: Date | null;
  updatedAt: Date;
}
