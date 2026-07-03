import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { DENSE_BANDAGE_ITEM_ID, FIELD_KIT_ITEM_ID } from "../../domain/itemCraft";
import { YEGER_UNQUIET_TRIAL_SECOND_COMPLETED_KEY } from "../../services/dailyActionKeys";
import { YEGER_FIRST_NOTCH_ITEM_ID } from "../../services/itemGrant";
import { getIncludedRemortCount } from "./prismaRemortCount";
import type { CharacterRecord } from "./characterRepository";
import type {
  YegerNotchExchangeKind,
  YegerNotchExchangeLookupRepositoryResult,
  YegerNotchExchangeOptionRecord,
  YegerNotchExchangeRepository,
  YegerNotchExchangeRepositoryResult,
  YegerNotchExchangeSummaryRecord
} from "./yegerNotchExchangeRepository";

type TxClient = Prisma.TransactionClient;

const exchangeDefinitions: Record<YegerNotchExchangeKind, YegerNotchExchangeOptionRecord> = {
  "dense-bandage": {
    kind: "dense-bandage",
    requiredNotches: 1,
    outputItemId: DENSE_BANDAGE_ITEM_ID,
    outputQuantity: 1
  },
  "field-kit": {
    kind: "field-kit",
    requiredNotches: 2,
    outputItemId: FIELD_KIT_ITEM_ID,
    outputQuantity: 1
  }
};
const YEGER_UNQUIET_TRIAL_BUCKET = "once";

export class PrismaYegerNotchExchangeRepository implements YegerNotchExchangeRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getForTelegramUser(telegramUserId: bigint): Promise<YegerNotchExchangeLookupRepositoryResult> {
    return this.prisma.$transaction(async (tx) => {
      const context = await getExchangeContext(tx, telegramUserId);

      if (context.state !== "ready") {
        return context;
      }

      return {
        state: "ready",
        summary: buildExchangeSummary(context.availableNotches)
      };
    });
  }

  async exchangeForTelegramUser(
    telegramUserId: bigint,
    input: {
      kind: YegerNotchExchangeKind;
      expectedNotches: number;
      now: Date;
    }
  ): Promise<YegerNotchExchangeRepositoryResult> {
    return this.prisma.$transaction(async (tx) => {
      const context = await getExchangeContext(tx, telegramUserId);

      if (context.state === "no-character") {
        return { state: "no-character" };
      }

      if (context.state === "locked") {
        return { state: "locked", character: context.character };
      }

      const definition = exchangeDefinitions[input.kind];
      const currentNotches = context.availableNotches;
      if (currentNotches !== Math.max(0, Math.floor(input.expectedNotches))) {
        return {
          state: "stale",
          character: context.character,
          expectedNotches: input.expectedNotches,
          currentNotches,
          summary: buildExchangeSummary(currentNotches)
        };
      }

      if (currentNotches < definition.requiredNotches) {
        return {
          state: "not-enough",
          character: context.character,
          summary: buildExchangeSummary(currentNotches)
        };
      }

      const decremented = await tx.characterItem.updateMany({
        where: {
          characterId: context.character.id,
          itemId: YEGER_FIRST_NOTCH_ITEM_ID,
          quantity: currentNotches
        },
        data: {
          quantity: {
            decrement: definition.requiredNotches
          },
          updatedAt: input.now
        }
      });

      if (decremented.count !== 1) {
        const refreshedNotches = await getNotchQuantity(tx, context.character.id);

        return {
          state: "stale",
          character: context.character,
          expectedNotches: input.expectedNotches,
          currentNotches: refreshedNotches,
          summary: buildExchangeSummary(refreshedNotches)
        };
      }

      await tx.characterItem.deleteMany({
        where: {
          characterId: context.character.id,
          itemId: YEGER_FIRST_NOTCH_ITEM_ID,
          quantity: { lte: 0 }
        }
      });

      await tx.characterItem.upsert({
        where: {
          characterId_itemId: {
            characterId: context.character.id,
            itemId: definition.outputItemId
          }
        },
        create: {
          characterId: context.character.id,
          itemId: definition.outputItemId,
          quantity: definition.outputQuantity
        },
        update: {
          quantity: {
            increment: definition.outputQuantity
          },
          updatedAt: input.now
        }
      });

      const action = await tx.dailyAction.create({
        data: {
          characterId: context.character.id,
          key: "yeger.notch.exchange",
          localDate: `${input.kind}:${randomUUID()}`,
          rewardXp: 0,
          rewardGold: 0,
          spentGold: 0,
          resultJson: {
            kind: "yeger-notch-exchange",
            rulesVersion: "yeger-notch-exchange-v1",
            exchangeKind: input.kind,
            spent: {
              itemId: YEGER_FIRST_NOTCH_ITEM_ID,
              quantity: definition.requiredNotches
            },
            reward: {
              appliedItemGrants: [
                {
                  itemId: definition.outputItemId,
                  quantity: definition.outputQuantity
                }
              ]
            }
          }
        }
      });

      const remainingNotches = currentNotches - definition.requiredNotches;

      return {
        state: "exchanged",
        character: context.character,
        actionId: action.id,
        spentNotches: definition.requiredNotches,
        itemGrants: [{ itemId: definition.outputItemId, quantity: definition.outputQuantity }],
        summary: buildExchangeSummary(remainingNotches)
      };
    });
  }
}

type ExchangeContext =
  | { state: "no-character" }
  | { state: "locked"; character: CharacterRecord }
  | { state: "ready"; character: CharacterRecord; availableNotches: number };

async function getExchangeContext(tx: TxClient, telegramUserId: bigint): Promise<ExchangeContext> {
  const character = await tx.character.findFirst({
    where: {
      user: {
        telegramUserId
      }
    },
    include: {
      _count: {
        select: {
          remorts: true
        }
      }
    }
  });

  if (!character) {
    return { state: "no-character" };
  }

  const characterRecord = {
    ...character,
    remortCount: getIncludedRemortCount(character)
  };
  const completed = await tx.dailyAction.findUnique({
    where: {
      characterId_key_localDate: {
        characterId: character.id,
        key: YEGER_UNQUIET_TRIAL_SECOND_COMPLETED_KEY,
        localDate: YEGER_UNQUIET_TRIAL_BUCKET
      }
    }
  });

  if (!completed) {
    return { state: "locked", character: characterRecord };
  }

  return {
    state: "ready",
    character: characterRecord,
    availableNotches: await getNotchQuantity(tx, character.id)
  };
}

async function getNotchQuantity(tx: TxClient, characterId: string): Promise<number> {
  const stack = await tx.characterItem.findUnique({
    where: {
      characterId_itemId: {
        characterId,
        itemId: YEGER_FIRST_NOTCH_ITEM_ID
      }
    },
    select: {
      quantity: true
    }
  });

  return Math.max(0, Math.floor(stack?.quantity ?? 0));
}

function buildExchangeSummary(availableNotches: number): YegerNotchExchangeSummaryRecord {
  const normalized = Math.max(0, Math.floor(availableNotches));

  return {
    availableNotches: normalized,
    options: Object.values(exchangeDefinitions).filter((definition) => definition.requiredNotches <= normalized)
  };
}
