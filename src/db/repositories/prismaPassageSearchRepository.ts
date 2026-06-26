import { Prisma, type Character, type PrismaClient } from "@prisma/client";
import { applyXpReward, getLevelForXp } from "../../domain/progression/level";
import type { PassageSearchLoot, PassageSearchSnapshot } from "../../domain/passageSearch";
import type { CharacterRecord } from "./characterRepository";
import { recordLevelMilestones } from "./levelMilestoneRepository";
import type {
  PassageSearchActionRecord,
  PassageSearchActionStatus,
  PassageSearchLookupResult,
  PassageSearchRepository,
  PassageSearchResolutionResult,
  PassageSearchStartResult,
  PassageSearchStoredResult
} from "./passageSearchRepository";
import type { RewardLevelChange } from "./dailyActionRepository";
import { countCharacterRemorts, getIncludedRemortCount } from "./prismaRemortCount";

type TxClient = Prisma.TransactionClient;
type PrismaPassageSearchActionRecord = Awaited<
  ReturnType<PrismaClient["passageSearchAction"]["findFirst"]>
>;

export class PrismaPassageSearchRepository implements PassageSearchRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async startForTelegramUser(
    telegramUserId: bigint,
    input: {
      now: Date;
      token: string;
      nodeKey: string;
      nodeKind: "passage" | "location";
      cooldownKey: string;
      cooldownAvailableAt: Date;
      snapshot: PassageSearchSnapshot;
    }
  ): Promise<PassageSearchStartResult> {
    const result = await this.prisma.$transaction(async (tx): Promise<PassageSearchStartResult> => {
      const character = await tx.character.findFirst({
        where: { user: { telegramUserId } },
        include: remortCountInclude
      });

      if (!character) {
        return { state: "no-character" };
      }

      const characterRecord = toCharacterRecord(character);
      if (character.hpCurrent <= 0) {
        return { state: "needs-rest", character: characterRecord };
      }

      const active = await tx.passageSearchAction.findFirst({
        where: {
          characterId: character.id,
          status: "running"
        },
        orderBy: { createdAt: "desc" }
      });
      const activeRecord = mapAction(active);
      if (activeRecord) {
        return { state: "active", character: characterRecord, action: activeRecord };
      }

      const cooldown = await tx.characterCooldown.findUnique({
        where: {
          characterId_key: {
            characterId: character.id,
            key: input.cooldownKey
          }
        }
      });

      if (cooldown && cooldown.availableAt > input.now) {
        return { state: "cooldown", character: characterRecord, availableAt: cooldown.availableAt };
      }

      await tx.characterCooldown.upsert({
        where: {
          characterId_key: {
            characterId: character.id,
            key: input.cooldownKey
          }
        },
        create: {
          characterId: character.id,
          key: input.cooldownKey,
          availableAt: input.cooldownAvailableAt,
          resultJson: { kind: "passage-search", nodeKey: input.nodeKey }
        },
        update: {
          availableAt: input.cooldownAvailableAt,
          resultJson: { kind: "passage-search", nodeKey: input.nodeKey }
        }
      });

      const action = await tx.passageSearchAction.create({
        data: {
          token: input.token,
          characterId: character.id,
          nodeKey: input.nodeKey,
          nodeKind: input.nodeKind,
          status: "running",
          activeKey: `${character.id}:passage-search`,
          startedAt: input.now,
          endsAt: new Date(input.snapshot.endsAt),
          payloadJson: input.snapshot as unknown as Prisma.InputJsonValue
        }
      });

      return {
        state: "started",
        character: characterRecord,
        action: mapAction(action)!
      };
    }).catch(async (error: unknown): Promise<PassageSearchStartResult> => {
      if (isUniqueConstraintError(error)) {
        const lookup = await this.findActiveForTelegramUser(telegramUserId);
        if (lookup.state === "found") {
          return { state: "active", character: lookup.character, action: lookup.action };
        }
      }

      throw error;
    });

    return result;
  }

  async findByTokenForTelegramUser(
    telegramUserId: bigint,
    token: string
  ): Promise<PassageSearchLookupResult> {
    const character = await this.prisma.character.findFirst({
      where: { user: { telegramUserId } },
      include: remortCountInclude
    });

    if (!character) {
      return { state: "no-character" };
    }

    const action = await this.prisma.passageSearchAction.findFirst({
      where: {
        token,
        characterId: character.id
      }
    });
    const mapped = mapAction(action);

    return mapped
      ? { state: "found", character: toCharacterRecord(character), action: mapped }
      : { state: "not-found", character: toCharacterRecord(character) };
  }

  async findRunningForTelegramUser(
    telegramUserId: bigint
  ): Promise<PassageSearchLookupResult> {
    return this.findActiveForTelegramUser(telegramUserId);
  }

  async cancelByTokenForTelegramUser(
    telegramUserId: bigint,
    token: string,
    now: Date
  ): Promise<PassageSearchResolutionResult> {
    return this.resolveByTokenForTelegramUser(telegramUserId, token, {
      now,
      result: { outcome: "cancelled" }
    });
  }

  async resolveByTokenForTelegramUser(
    telegramUserId: bigint,
    token: string,
    input: {
      now: Date;
      result: PassageSearchStoredResult;
      loot?: PassageSearchLoot;
    }
  ): Promise<PassageSearchResolutionResult> {
    return this.prisma.$transaction(async (tx): Promise<PassageSearchResolutionResult> => {
      const character = await tx.character.findFirst({
        where: { user: { telegramUserId } },
        include: remortCountInclude
      });

      if (!character) {
        return { state: "no-character" };
      }

      const action = await tx.passageSearchAction.findFirst({
        where: {
          token,
          characterId: character.id
        }
      });
      const mapped = mapAction(action);
      const characterRecord = toCharacterRecord(character);

      if (!action || !mapped) {
        return { state: "not-found", character: characterRecord };
      }

      if (mapped.status !== "running") {
        return { state: "already-handled", character: characterRecord, action: mapped };
      }

      const update = await tx.passageSearchAction.updateMany({
        where: {
          id: action.id,
          status: "running"
        },
        data: {
          status: input.result.outcome === "cancelled" ? "cancelled" : "resolved",
          activeKey: null,
          resultJson: input.result as unknown as Prisma.InputJsonValue
        }
      });

      if (update.count !== 1) {
        const current = mapAction(await tx.passageSearchAction.findUnique({ where: { id: action.id } }));
        return current
          ? { state: "already-handled", character: characterRecord, action: current }
          : { state: "not-found", character: characterRecord };
      }

      const levelChange = input.loot && (input.loot.gold > 0 || input.loot.itemGrants.length > 0)
        ? await grantLoot(tx, characterRecord, input.loot)
        : null;
      const current = mapAction(await tx.passageSearchAction.findUnique({ where: { id: action.id } }))!;
      const updatedCharacter = await tx.character.findUniqueOrThrow({
        where: { id: character.id },
        include: remortCountInclude
      });

      return {
        state: "resolved",
        character: toCharacterRecord(updatedCharacter),
        action: current,
        levelChange
      };
    });
  }

  async clearSearchStateForTelegramUser(
    telegramUserId: bigint,
    now: Date
  ): Promise<{ state: "cleared"; character: CharacterRecord; actions: number; cooldowns: number } | { state: "no-character" }> {
    return this.prisma.$transaction(async (tx) => {
      const character = await tx.character.findFirst({
        where: { user: { telegramUserId } },
        include: remortCountInclude
      });

      if (!character) {
        return { state: "no-character" };
      }

      const actions = await tx.passageSearchAction.updateMany({
        where: {
          characterId: character.id,
          status: "running"
        },
        data: {
          status: "cancelled",
          activeKey: null,
          resultJson: { outcome: "cancelled", devResetAt: now.toISOString() }
        }
      });
      const cooldowns = await tx.characterCooldown.deleteMany({
        where: {
          characterId: character.id,
          key: { startsWith: "passage-search:" }
        }
      });

      return {
        state: "cleared",
        character: toCharacterRecord(character),
        actions: actions.count,
        cooldowns: cooldowns.count
      };
    });
  }

  private async findActiveForTelegramUser(
    telegramUserId: bigint
  ): Promise<PassageSearchLookupResult> {
    const character = await this.prisma.character.findFirst({
      where: { user: { telegramUserId } },
      include: remortCountInclude
    });

    if (!character) {
      return { state: "no-character" };
    }

    const action = await this.prisma.passageSearchAction.findFirst({
      where: {
        characterId: character.id,
        status: "running"
      },
      orderBy: { createdAt: "desc" }
    });
    const mapped = mapAction(action);

    return mapped
      ? { state: "found", character: toCharacterRecord(character), action: mapped }
      : { state: "not-found", character: toCharacterRecord(character) };
  }
}

const remortCountInclude = {
  _count: {
    select: {
      remorts: true
    }
  }
} satisfies Prisma.CharacterInclude;

async function grantLoot(
  tx: TxClient,
  character: CharacterRecord,
  loot: PassageSearchLoot
): Promise<RewardLevelChange> {
  const updated = loot.gold > 0
    ? await tx.character.update({
        where: { id: character.id },
        data: { gold: { increment: Math.max(0, Math.floor(loot.gold)) } }
      })
    : await tx.character.findUniqueOrThrow({ where: { id: character.id } });

  for (const grant of loot.itemGrants) {
    const quantity = Math.max(0, Math.floor(grant.quantity));
    if (quantity <= 0) {
      continue;
    }

    await tx.characterItem.upsert({
      where: {
        characterId_itemId: {
          characterId: character.id,
          itemId: grant.itemId
        }
      },
      create: {
        characterId: character.id,
        itemId: grant.itemId,
        quantity
      },
      update: {
        quantity: { increment: quantity }
      }
    });
  }

  const remortCount = await countCharacterRemorts(tx, character.id);
  const rewardProgress = applyXpReward(character.xp, 0, { remortCount });
  const oldLevel = Math.max(character.level, rewardProgress.oldLevel);
  const newLevel = Math.max(updated.level, getLevelForXp(updated.xp, { remortCount }));
  await recordLevelMilestones(tx, character.id, oldLevel, newLevel, undefined, { remortCount });

  return {
    oldLevel,
    newLevel,
    leveledUp: newLevel > oldLevel
  };
}

function mapAction(record: PrismaPassageSearchActionRecord): PassageSearchActionRecord | null {
  if (!record) {
    return null;
  }

  const payload = parsePayload(record.payloadJson);
  if (!payload) {
    return null;
  }

  return {
    id: record.id,
    token: record.token,
    characterId: record.characterId,
    nodeKey: record.nodeKey,
    nodeKind: record.nodeKind === "location" ? "location" : "passage",
    status: normalizeStatus(record.status),
    startedAt: record.startedAt,
    endsAt: record.endsAt,
    payload,
    result: parseResult(record.resultJson),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

function parsePayload(value: Prisma.JsonValue): PassageSearchSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const input = value as Record<string, unknown>;
  if (typeof input.nodeKey !== "string" || (input.nodeKind !== "passage" && input.nodeKind !== "location")) {
    return null;
  }

  return input as unknown as PassageSearchSnapshot;
}

function parseResult(value: Prisma.JsonValue | null): PassageSearchStoredResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const input = value as Record<string, unknown>;
  if (typeof input.outcome !== "string") {
    return null;
  }

  return input as unknown as PassageSearchStoredResult;
}

function normalizeStatus(value: string): PassageSearchActionStatus {
  return value === "resolved" || value === "cancelled" || value === "running" ? value : "cancelled";
}

function toCharacterRecord(character: Character & { _count?: { remorts?: number } }): CharacterRecord {
  const remortCount = getIncludedRemortCount(character);
  const record = { ...character };
  delete (record as { _count?: unknown })._count;

  return {
    ...record,
    remortCount
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
