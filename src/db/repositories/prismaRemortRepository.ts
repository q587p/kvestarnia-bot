import type {
  Character,
  CharacterItem,
  CharacterRemort,
  CharacterRemortDraft,
  Prisma,
  PrismaClient
} from "@prisma/client";
import type { CharacterRecord } from "./characterRepository";
import type { CharacterItemRecord } from "./inventoryRepository";
import type { StatKey } from "../../domain/characters/starterStats";
import type {
  RemortBoard,
  RemortCompletionInput,
  RemortCompletionResult,
  RemortDraftRecord,
  RemortIdentityRecord,
  RemortRecord,
  RemortRepository,
  RemortSnapshot
} from "./remortRepository";
import { mapSoloCombatSessionRecord } from "./prismaSoloCombatSessionRepository";
import {
  expireCombat,
  markCombatSettlementForfeitedByRemort,
  type CombatState
} from "../../domain/combat";

type TxClient = Prisma.TransactionClient;
type CharacterWithLocation = Character & { user: { lastSeenLocationId: string | null } };
const SUPPORTED_REMORT_COMBAT_LEASE_KIND = "solo-combat";
const TRAINING_DOPPELGANGER_COOLDOWN_KEY = "training.doppelganger.spar";

export class PrismaRemortRepository implements RemortRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getSnapshotForTelegramUser(telegramUserId: bigint, now: Date): Promise<RemortSnapshot | null> {
    return this.prisma.$transaction(async (tx) => {
      await cancelExpiredDrafts(tx, now);
      return getSnapshot(tx, telegramUserId);
    });
  }

  async createOrUpdateDraftForTelegramUser(
    telegramUserId: bigint,
    input: {
      token: string;
      identity: RemortIdentityRecord;
      selectedItems: Array<{ itemId: string }>;
      expiresAt: Date;
      now: Date;
    }
  ): Promise<RemortDraftRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const character = await tx.character.findFirst({
        where: {
          user: {
            telegramUserId
          }
        },
        select: {
          id: true
        }
      });

      if (!character) {
        return null;
      }

      await cancelExpiredDrafts(tx, input.now);
      await tx.characterRemortDraft.updateMany({
        where: {
          characterId: character.id,
          status: "pending",
          token: {
            not: input.token
          }
        },
        data: {
          status: "cancelled",
          updatedAt: input.now
        }
      });

      const record = await tx.characterRemortDraft.upsert({
        where: {
          token: input.token
        },
        create: {
          characterId: character.id,
          token: input.token,
          status: "pending",
          selectedIdentityJson: input.identity as unknown as Prisma.InputJsonValue,
          selectedItemsJson: input.selectedItems,
          expiresAt: input.expiresAt,
          createdAt: input.now,
          updatedAt: input.now
        },
        update: {
          status: "pending",
          selectedIdentityJson: input.identity as unknown as Prisma.InputJsonValue,
          selectedItemsJson: input.selectedItems,
          expiresAt: input.expiresAt,
          updatedAt: input.now
        }
      });

      return mapDraft(record);
    });
  }

  async updateDraftForTelegramUser(
    telegramUserId: bigint,
    input: {
      token: string;
      identity?: RemortIdentityRecord;
      selectedItems?: Array<{ itemId: string }>;
      expiresAt: Date;
      now: Date;
    }
  ): Promise<RemortDraftRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const character = await tx.character.findFirst({
        where: {
          user: {
            telegramUserId
          }
        },
        select: {
          id: true
        }
      });

      if (!character) {
        return null;
      }

      await cancelExpiredDrafts(tx, input.now);
      const current = await tx.characterRemortDraft.findFirst({
        where: {
          characterId: character.id,
          token: input.token,
          status: "pending"
        }
      });

      if (!current) {
        return null;
      }

      const updated = await tx.characterRemortDraft.update({
        where: {
          id: current.id
        },
        data: {
          ...(input.identity ? { selectedIdentityJson: input.identity as unknown as Prisma.InputJsonValue } : {}),
          ...(input.selectedItems ? { selectedItemsJson: input.selectedItems } : {}),
          expiresAt: input.expiresAt,
          updatedAt: input.now
        }
      });

      return mapDraft(updated);
    });
  }

  async completeDraftForTelegramUser(
    telegramUserId: bigint,
    input: RemortCompletionInput
  ): Promise<RemortCompletionResult> {
    return this.prisma.$transaction(async (tx) => {
      const character = await tx.character.findFirst({
        where: {
          user: {
            telegramUserId
          }
        },
        include: {
          user: {
            select: {
              id: true,
              lastSeenLocationId: true
            }
          }
        }
      });

      if (!character) {
        return { state: "no-character" };
      }

      const replay = await tx.characterRemort.findFirst({
        where: {
          characterId: character.id,
          token: input.token
        }
      });

      if (replay) {
        return {
          state: "replayed",
          character: toCharacterRecord(character),
          remort: mapRemort(replay)
        };
      }

      await cancelExpiredDrafts(tx, input.now);
      const draftRecord = await tx.characterRemortDraft.findFirst({
        where: {
          characterId: character.id,
          token: input.token,
          status: "pending"
        }
      });

      if (!draftRecord) {
        return { state: "invalid-token" };
      }

      if (draftRecord.expiresAt <= input.now) {
        return { state: "invalid-draft", reason: "Чернетка реморту вже встигла припасти пилом." };
      }

      const snapshot = await getSnapshotForCharacter(tx, character.id, toCharacterRecord(character), draftRecord);
      const validation = input.validate(snapshot);

      if (validation.state === "locked") {
        return validation;
      }

      if (validation.state === "invalid-draft") {
        return validation;
      }

      const activeCombat = await prepareActiveCombatForRemort(tx, character.id, input.now);
      if (activeCombat.state === "locked") {
        return { state: "active-combat" };
      }

      const remort = await tx.characterRemort.create({
        data: {
          characterId: character.id,
          token: input.token,
          remortNumber: validation.remortNumber,
          previousLevel: character.level,
          previousXp: character.xp,
          previousGold: character.gold,
          displayNameSnapshot: character.name,
          preservedPayloadJson: {
            identity: validation.identity,
            items: validation.keptItems,
            memoryRank: validation.memoryRank,
            hpBonus: validation.hpBonus,
            manaBonus: validation.manaBonus,
            statBonuses: validation.statBonuses,
            statBonus: validation.statBonus
          } as unknown as Prisma.InputJsonValue,
          createdAt: input.now
        }
      });

      await tx.character.update({
        where: {
          id: character.id
        },
        data: {
          pronoun: validation.identity.pronoun,
          raceId: validation.identity.raceId,
          classId: validation.identity.classId,
          path: getPathForRemortPronoun(validation.identity.pronoun),
          level: 1,
          xp: 0,
          gold: 0,
          hpCurrent: validation.hpCurrent,
          hpMax: validation.hpMax,
          manaCurrent: validation.manaCurrent,
          manaMax: validation.manaMax,
          hpRegenAt: null,
          manaRegenAt: null,
          statsJson: validation.statsJson as Prisma.InputJsonValue
        }
      });

      await tx.characterEquipment.deleteMany({
        where: {
          characterId: character.id
        }
      });

      await tx.characterItem.deleteMany({
        where: {
          characterId: character.id
        }
      });

      if (input.resetDailyActionKeys?.length) {
        await tx.dailyAction.deleteMany({
          where: {
            characterId: character.id,
            key: {
              in: [...input.resetDailyActionKeys]
            }
          }
        });
      }

      for (const item of validation.keptItems) {
        await tx.characterItem.create({
          data: {
            characterId: character.id,
            itemId: item.itemId,
            quantity: item.quantity
          }
        });
      }

      await cancelLivePendingPassageEncountersForRemort(tx, character.id, input.now);
      await cancelShynokLifecycleForRemort(tx, character.id, input.now);

      await tx.mantokChestRun.updateMany({
        where: {
          characterId: character.id,
          status: "pending"
        },
        data: {
          status: "cancelled",
          updatedAt: input.now
        }
      });

      await tx.levelBarterExchange.updateMany({
        where: {
          characterId: character.id,
          status: "pending"
        },
        data: {
          status: "cancelled",
          updatedAt: input.now
        }
      });

      await tx.characterRemortDraft.updateMany({
        where: {
          characterId: character.id,
          status: "pending"
        },
        data: {
          status: "cancelled",
          updatedAt: input.now
        }
      });

      await tx.characterRemortDraft.update({
        where: {
          id: draftRecord.id
        },
        data: {
          status: "completed",
          completedAt: input.now,
          updatedAt: input.now
        }
      });

      await tx.user.update({
        where: {
          id: character.user.id
        },
        data: {
          currentRaidId: null,
          currentAdventureId: null
        }
      });

      const updated = await tx.character.findUnique({
        where: {
          id: character.id
        },
        include: {
          user: {
            select: {
              lastSeenLocationId: true
            }
          }
        }
      });

      if (!updated) {
        return { state: "no-character" };
      }

      return {
        state: "completed",
        character: toCharacterRecord(updated),
        remort: mapRemort(remort)
      };
    });
  }

  async countByTelegramUserId(telegramUserId: bigint): Promise<number> {
    return this.prisma.characterRemort.count({
      where: {
        character: {
          user: {
            telegramUserId
          }
        }
      }
    });
  }

  async listBoard(input: { maxGroups?: number; maxEntriesPerGroup?: number } = {}): Promise<RemortBoard> {
    const maxGroups = input.maxGroups ?? Number.POSITIVE_INFINITY;
    const maxEntries = input.maxEntriesPerGroup ?? 3;
    const rows = await this.prisma.characterRemort.findMany({
      orderBy: [
        {
          remortNumber: "desc"
        },
        {
          createdAt: "asc"
        }
      ]
    });
    const grouped = new Map<number, CharacterRemort[]>();

    for (const row of rows) {
      if (!grouped.has(row.remortNumber)) {
        if (grouped.size >= maxGroups) {
          continue;
        }
        grouped.set(row.remortNumber, []);
      }

      const entries = grouped.get(row.remortNumber);
      if (entries && entries.length < maxEntries) {
        entries.push(row);
      }
    }

    return {
      remorts: [...grouped.entries()].map(([remortNumber, entries]) => ({
        remortNumber,
        entries: entries.map((entry, index) => ({
          rank: index + 1,
          characterId: entry.characterId,
          name: entry.displayNameSnapshot,
          remortNumber: entry.remortNumber,
          reachedAt: entry.createdAt
        }))
      }))
    };
  }
}

async function prepareActiveCombatForRemort(
  tx: TxClient,
  characterId: string,
  now: Date
): Promise<{ state: "ready" } | { state: "locked" }> {
  const lease = await tx.activeCombatLease.findUnique({
    where: {
      characterId
    }
  });

  if (!lease) {
    return { state: "ready" };
  }

  if (lease.kind !== SUPPORTED_REMORT_COMBAT_LEASE_KIND) {
    return { state: "locked" };
  }

  const session = await tx.soloCombatSession.findFirst({
    where: {
      id: lease.referenceId,
      characterId
    }
  });

  if (!session) {
    await tx.activeCombatLease.deleteMany({
      where: {
        characterId,
        kind: lease.kind,
        referenceId: lease.referenceId
      }
    });
    return { state: "ready" };
  }

  const mapped = mapSoloCombatSessionRecord(session);

  if (session.status === "active") {
    const state = mapped?.state ? expireRemortCombatState(mapped.state, now) : null;
    await tx.soloCombatSession.update({
      where: {
        id: session.id
      },
      data: {
        status: "expired",
        turn: state?.turn ?? session.turn,
        ...(state ? { stateJson: state as unknown as Prisma.InputJsonValue } : {})
      }
    });
  } else if (
    mapped?.state &&
    mapped.state.settlement?.status !== "completed" &&
    mapped.state.settlement?.status !== "forfeited-by-remort"
  ) {
    const state = markCombatSettlementForfeitedByRemort(mapped.state, now, "remort");
    await tx.soloCombatSession.update({
      where: {
        id: session.id
      },
      data: {
        stateJson: state as unknown as Prisma.InputJsonValue,
        turn: state.turn
      }
    });
    await deleteOwnedPendingTrainingCooldown(tx, characterId, session.id, mapped.state.life?.remortCount ?? 0);
  }

  await tx.activeCombatLease.deleteMany({
    where: {
      characterId,
      kind: lease.kind,
      referenceId: lease.referenceId
    }
  });

  return { state: "ready" };
}

async function deleteOwnedPendingTrainingCooldown(
  tx: TxClient,
  characterId: string,
  sessionId: string,
  remortCount: number
): Promise<void> {
  const cooldown = await tx.characterCooldown.findUnique({
    where: {
      characterId_key: {
        characterId,
        key: TRAINING_DOPPELGANGER_COOLDOWN_KEY
      }
    },
    select: {
      id: true,
      resultJson: true
    }
  });

  if (!cooldown) {
    return;
  }

  const owner = parseTrainingCooldownOwner(cooldown.resultJson);

  if (owner?.sessionId !== sessionId || owner.remortCount !== remortCount) {
    return;
  }

  await tx.characterCooldown.delete({
    where: {
      id: cooldown.id
    }
  });
}

function expireRemortCombatState(state: CombatState, now: Date): CombatState {
  const expired = expireCombat(state);
  const completedAt = expired.completedAt ?? now.toISOString();
  const next = markCombatSettlementForfeitedByRemort({
    ...expired,
    completedAt
  }, now, "remort");
  delete next.turnExpiresAt;

  return next;
}

async function cancelLivePendingPassageEncountersForRemort(
  tx: TxClient,
  characterId: string,
  now: Date
): Promise<void> {
  await tx.pendingPassageEncounter.updateMany({
    where: {
      characterId,
      status: {
        in: ["pending", "consumed"]
      },
      expiresAt: {
        gt: now
      }
    },
    data: {
      status: "cancelled",
      activeKey: null,
      cancelledAt: now,
      version: {
        increment: 1
      }
    }
  });
}

async function cancelShynokLifecycleForRemort(
  tx: TxClient,
  characterId: string,
  now: Date
): Promise<void> {
  await tx.characterDrinkState.deleteMany({
    where: { characterId }
  });

  await tx.korchmaDrinkOrder.updateMany({
    where: {
      characterId,
      status: {
        in: ["pending", "processing", "pending-round", "processing-round"]
      }
    },
    data: {
      status: "cancelled",
      updatedAt: now
    }
  });

  await tx.korchmaRoundRecipient.updateMany({
    where: {
      characterId,
      status: "offered"
    },
    data: {
      status: "expired",
      respondedAt: now,
      updatedAt: now,
      resultJson: {
        kind: "remort-expired-round-offer"
      }
    }
  });

  await tx.korchmaMantokSale.updateMany({
    where: {
      characterId,
      status: {
        in: ["pending", "processing"]
      }
    },
    data: {
      status: "cancelled",
      updatedAt: now
    }
  });

  await tx.itemTransfer.updateMany({
    where: {
      OR: [
        { senderCharacterId: characterId },
        { receiverCharacterId: characterId }
      ],
      status: {
        in: ["pending", "processing"]
      }
    },
    data: {
      status: "cancelled",
      reservationKey: null,
      respondedAt: now,
      updatedAt: now,
      resultJson: {
        kind: "remort-cancelled-gift"
      }
    }
  });

  await tx.itemUseOrder.updateMany({
    where: {
      characterId,
      status: {
        in: ["pending", "processing"]
      }
    },
    data: {
      status: "cancelled",
      reservationKey: null,
      cancelledAt: now,
      updatedAt: now,
      resultJson: {
        kind: "remort-cancelled-item-use"
      }
    }
  });
}

async function getSnapshot(
  tx: TxClient,
  telegramUserId: bigint
): Promise<RemortSnapshot | null> {
  const character = await tx.character.findFirst({
    where: {
      user: {
        telegramUserId
      }
    },
    include: {
      user: {
        select: {
          lastSeenLocationId: true
        }
      }
    }
  });

  if (!character) {
    return null;
  }

  const draft = await tx.characterRemortDraft.findFirst({
    where: {
      characterId: character.id,
      status: "pending"
    },
    orderBy: {
      updatedAt: "desc"
    }
  });

  return getSnapshotForCharacter(tx, character.id, toCharacterRecord(character), draft);
}

async function getSnapshotForCharacter(
  tx: TxClient,
  characterId: string,
  character: CharacterRecord,
  draft: CharacterRemortDraft | null
): Promise<RemortSnapshot> {
  const [items, equipment, remortCount] = await Promise.all([
    tx.characterItem.findMany({
      where: {
        characterId
      },
      orderBy: [
        {
          createdAt: "asc"
        },
        {
          itemId: "asc"
        }
      ]
    }),
    tx.characterEquipment.findMany({
      where: {
        characterId
      },
      select: {
        itemId: true
      }
    }),
    tx.characterRemort.count({
      where: {
        characterId
      }
    })
  ]);

  return {
    character,
    remortCount,
    items: items.map(toCharacterItemRecord),
    equippedItemIds: equipment.map((row) => row.itemId),
    draft: mapDraft(draft)
  };
}

async function cancelExpiredDrafts(tx: TxClient, now: Date): Promise<void> {
  await tx.characterRemortDraft.updateMany({
    where: {
      status: "pending",
      expiresAt: {
        lte: now
      }
    },
    data: {
      status: "cancelled",
      updatedAt: now
    }
  });
}

function mapDraft(record: CharacterRemortDraft | null): RemortDraftRecord | null {
  if (!record) {
    return null;
  }

  return {
    id: record.id,
    characterId: record.characterId,
    token: record.token,
    status: parseDraftStatus(record.status),
    identity: parseIdentity(record.selectedIdentityJson),
    selectedItems: parseSelectedItems(record.selectedItemsJson),
    expiresAt: record.expiresAt,
    completedAt: record.completedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

function mapRemort(record: CharacterRemort): RemortRecord {
  return {
    id: record.id,
    characterId: record.characterId,
    token: record.token,
    remortNumber: record.remortNumber,
    previousLevel: record.previousLevel,
    previousXp: record.previousXp,
    previousGold: record.previousGold,
    displayNameSnapshot: record.displayNameSnapshot,
    preservedPayload: parsePreservedPayload(record.preservedPayloadJson),
    createdAt: record.createdAt
  };
}

function parseDraftStatus(status: string): RemortDraftRecord["status"] {
  if (status === "completed" || status === "cancelled") {
    return status;
  }

  return "pending";
}

function parseIdentity(value: unknown): RemortIdentityRecord {
  if (!isRecord(value)) {
    return { pronoun: "they", raceId: "race.human-ish", classId: "class.warrior" };
  }

  return {
    pronoun: typeof value.pronoun === "string" ? value.pronoun : "they",
    raceId: typeof value.raceId === "string" ? value.raceId : "race.human-ish",
    classId: typeof value.classId === "string" ? value.classId : "class.warrior"
  };
}

function parseSelectedItems(value: unknown): Array<{ itemId: string }> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.itemId !== "string") {
      return [];
    }

    return [{ itemId: entry.itemId }];
  });
}

function parsePreservedPayload(value: unknown): RemortRecord["preservedPayload"] {
  if (!isRecord(value)) {
    return {
      identity: { pronoun: "they", raceId: "race.human-ish", classId: "class.warrior" },
      items: [],
      memoryRank: 0,
      hpBonus: 0,
      manaBonus: 0,
      statBonuses: [],
      statBonus: null
    };
  }

  const statBonus = parseStatBonus(value.statBonus);
  const statBonuses = parseStatBonuses(value.statBonuses);

  return {
    identity: parseIdentity(value.identity),
    items: parseKeptItems(value.items),
    memoryRank: intOrZero(value.memoryRank),
    hpBonus: intOrZero(value.hpBonus),
    manaBonus: intOrZero(value.manaBonus),
    statBonuses: statBonuses.length > 0 ? statBonuses : statBonus ? [statBonus] : [],
    statBonus
  };
}

function parseStatBonus(value: unknown): { stat: StatKey; bonus: number } | null {
  if (!isRecord(value) || !isStatKey(value.stat)) {
    return null;
  }

  const bonus = intOrZero(value.bonus);
  return bonus > 0 ? { stat: value.stat, bonus } : null;
}

function parseStatBonuses(value: unknown): Array<{ stat: StatKey; bonus: number }> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    const parsed = parseStatBonus(entry);
    return parsed ? [parsed] : [];
  });
}

function parseKeptItems(value: unknown): Array<{ itemId: string; quantity: number }> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.itemId !== "string") {
      return [];
    }

    const quantity = intOrZero(entry.quantity);

    return quantity > 0 ? [{ itemId: entry.itemId, quantity }] : [];
  });
}

function toCharacterRecord(
  character: CharacterWithLocation
): CharacterRecord {
  const { user, ...record } = character;

  return {
    ...record,
    currentLocationId: user.lastSeenLocationId
  };
}

function toCharacterItemRecord(record: CharacterItem): CharacterItemRecord {
  return {
    id: record.id,
    characterId: record.characterId,
    itemId: record.itemId,
    quantity: record.quantity,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

function getPathForRemortPronoun(pronoun: string): string {
  if (pronoun === "he") {
    return "sun";
  }

  if (pronoun === "she") {
    return "moon";
  }

  return "boundary";
}

function intOrZero(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) ? value : 0;
}

function intOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function parseTrainingCooldownOwner(value: unknown): { sessionId: string; remortCount: number } | null {
  if (!isRecord(value) || !isRecord(value.trainingSettlement)) {
    return null;
  }

  const sessionId = value.trainingSettlement.sessionId;
  const remortCount = intOrNull(value.trainingSettlement.remortCount);

  return typeof sessionId === "string" && remortCount !== null && remortCount >= 0
    ? { sessionId, remortCount }
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStatKey(value: unknown): value is StatKey {
  return (
    value === "strength" ||
    value === "dexterity" ||
    value === "intelligence" ||
    value === "charisma" ||
    value === "luck"
  );
}
