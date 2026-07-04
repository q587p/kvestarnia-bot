import type { Character, Prisma, PrismaClient } from "@prisma/client";
import { items } from "../../content";
import { monsters } from "../../content/monsters";
import { summarizeCharacter } from "../../domain/characters/characterSummary";
import type { CombatState } from "../../domain/combat";
import type { PartyBossState } from "../../domain/partyBoss/partyBoss";
import type { TurnBasedDuelState } from "../../domain/duels/turnBasedDuel";
import { getLevelForXp } from "../../domain/progression/level";
import type { CharacterRecord } from "./characterRepository";
import type {
  DevGrantCharacterResult,
  DevGrantCooldownMatchInput,
  DevGrantCooldownResult,
  DevGrantDailyActionResetResult,
  DevGrantItemResult,
  DevGrantProgressResult,
  DevGrantRepository,
  DevGrantYegerQuestProgressResult,
  DevGrantYegerQuestStage
} from "./devGrantRepository";
import type { ItemGrant } from "./dailyActionRepository";
import {
  YEGER_UNQUIET_TRIAL_COMPLETED_KEY,
  YEGER_UNQUIET_TRIAL_SECOND_COMPLETED_KEY,
  YEGER_UNQUIET_TRIAL_SECOND_STARTED_KEY,
  YEGER_UNQUIET_TRIAL_STARTED_KEY
} from "../../services/dailyActionKeys";
import {
  isYegerUnquietTarget,
  YEGER_UNQUIET_TRIAL_BUCKET,
  YEGER_UNQUIET_TRIAL_SECOND_TARGET,
  YEGER_UNQUIET_TRIAL_TARGET
} from "../../services/yegerQuestService";
import { recordLevelMilestones } from "./levelMilestoneRepository";
import { countCharacterRemorts } from "./prismaRemortCount";
import { parseCombatState } from "./prismaSoloCombatSessionRepository";

export class PrismaDevGrantRepository implements DevGrantRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async addLevelForTelegramUser(
    telegramUserId: bigint,
    amount: number
  ): Promise<DevGrantProgressResult | null> {
    return this.prisma.$transaction(async (tx) => {
      const character = await findCharacterByTelegramUserId(tx, telegramUserId);

      if (!character) {
        return null;
      }

      const oldLevel = character.level;
      const newLevel = oldLevel + amount;
      const updated = await tx.character.update({
        where: {
          id: character.id
        },
        data: {
          level: newLevel
        },
        include: currentLocationInclude
      });
      const remortCount = await countCharacterRemorts(tx, character.id);

      await recordLevelMilestones(tx, character.id, oldLevel, newLevel, undefined, {
        remortCount
      });

      return {
        character: toCharacterRecord(updated),
        levelChange: {
          oldLevel,
          newLevel,
          leveledUp: newLevel > oldLevel
        }
      };
    });
  }

  async addXpForTelegramUser(
    telegramUserId: bigint,
    amount: number
  ): Promise<DevGrantProgressResult | null> {
    return this.prisma.$transaction(async (tx) => {
      const character = await findCharacterByTelegramUserId(tx, telegramUserId);

      if (!character) {
        return null;
      }

      const remortCount = await countCharacterRemorts(tx, character.id);
      const oldLevel = character.level;
      const nextXp = character.xp + amount;
      const nextLevel = Math.max(oldLevel, getLevelForXp(nextXp, { remortCount }));
      const updated = await tx.character.update({
        where: {
          id: character.id
        },
        data: {
          xp: nextXp,
          level: nextLevel
        },
        include: currentLocationInclude
      });
      await recordLevelMilestones(tx, character.id, oldLevel, nextLevel, undefined, {
        remortCount
      });

      return {
        character: toCharacterRecord(updated),
        levelChange: {
          oldLevel,
          newLevel: nextLevel,
          leveledUp: nextLevel > oldLevel
        }
      };
    });
  }

  async addGoldForTelegramUser(
    telegramUserId: bigint,
    amount: number
  ): Promise<DevGrantCharacterResult | null> {
    const updated = await this.prisma.character.updateMany({
      where: {
        user: {
          telegramUserId
        }
      },
      data: {
        gold: {
          increment: amount
        }
      }
    });

    if (updated.count !== 1) {
      return null;
    }

    const character = await this.prisma.character.findFirst({
      where: {
        user: {
          telegramUserId
        }
      },
      include: currentLocationInclude
    });

    return character ? { character: toCharacterRecord(character) } : null;
  }

  async healForTelegramUser(
    telegramUserId: bigint,
    amount?: number
  ): Promise<DevGrantCharacterResult | null> {
    return this.prisma.$transaction(async (tx) => {
      const character = await findCharacterByTelegramUserId(tx, telegramUserId);

      if (!character) {
        return null;
      }

      const hpCurrent = Math.max(0, Math.floor(character.hpCurrent));
      const hpMax = await getEffectiveHpMax(tx, character);
      const nextHp = amount === undefined
        ? hpMax
        : Math.min(hpMax, hpCurrent + Math.max(0, Math.floor(amount)));
      const updated = await tx.character.update({
        where: {
          id: character.id
        },
        data: {
          hpCurrent: nextHp,
          hpRegenAt: null
        },
        include: currentLocationInclude
      });
      const combat = await healActiveCombatForCharacter(tx, character.id, amount);

      return {
        character: {
          ...toCharacterRecord(updated),
          hpCurrent: Math.min(nextHp, hpMax),
          hpMax
        },
        ...(combat ? { combat } : {})
      };
    });
  }

  async restoreManaForTelegramUser(
    telegramUserId: bigint,
    amount?: number
  ): Promise<DevGrantCharacterResult | null> {
    return this.prisma.$transaction(async (tx) => {
      const character = await findCharacterByTelegramUserId(tx, telegramUserId);

      if (!character) {
        return null;
      }

      const manaCurrent = Math.max(0, Math.floor(character.manaCurrent));
      const manaMax = await getEffectiveManaMax(tx, character);
      const nextMana = amount === undefined
        ? manaMax
        : Math.min(manaMax, manaCurrent + Math.max(0, Math.floor(amount)));
      const updated = await tx.character.update({
        where: {
          id: character.id
        },
        data: {
          manaCurrent: nextMana,
          manaRegenAt: null
        },
        include: currentLocationInclude
      });

      return {
        character: {
          ...toCharacterRecord(updated),
          manaCurrent: Math.min(nextMana, manaMax),
          manaMax
        }
      };
    });
  }

  async addItemsForTelegramUser(
    telegramUserId: bigint,
    itemGrants: ItemGrant[]
  ): Promise<DevGrantItemResult | null> {
    return this.prisma.$transaction(async (tx) => {
      const character = await findCharacterByTelegramUserId(tx, telegramUserId);

      if (!character) {
        return null;
      }

      const normalizedGrants = mergeItemGrants(itemGrants);

      for (const grant of normalizedGrants) {
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
        character: toCharacterRecord(character),
        itemGrants: normalizedGrants
      };
    });
  }

  async clearCooldownForTelegramUser(
    telegramUserId: bigint,
    key: string
  ): Promise<DevGrantCooldownResult | null> {
    return this.clearCooldownsForTelegramUser(telegramUserId, { keys: [key] });
  }

  async clearCooldownsForTelegramUser(
    telegramUserId: bigint,
    input: DevGrantCooldownMatchInput
  ): Promise<DevGrantCooldownResult | null> {
    return this.prisma.$transaction(async (tx) => {
      const character = await findCharacterByTelegramUserId(tx, telegramUserId);

      if (!character) {
        return null;
      }

      const cooldownKeyWhere = buildCooldownKeyWhere(input);
      const deleted = await tx.characterCooldown.deleteMany({
        where: {
          characterId: character.id,
          ...(cooldownKeyWhere ? { OR: cooldownKeyWhere } : { key: "__no_dev_cooldown_match__" })
        }
      });

      return {
        character: toCharacterRecord(character),
        cleared: deleted.count > 0
      };
    });
  }

  async finishCooldownForTelegramUser(
    telegramUserId: bigint,
    key: string,
    now: Date
  ): Promise<DevGrantCooldownResult | null> {
    return this.prisma.$transaction(async (tx) => {
      const character = await findCharacterByTelegramUserId(tx, telegramUserId);

      if (!character) {
        return null;
      }

      const updated = await tx.characterCooldown.updateMany({
        where: {
          characterId: character.id,
          key,
          availableAt: {
            gt: now
          }
        },
        data: {
          availableAt: now,
          updatedAt: now
        }
      });

      return {
        character: toCharacterRecord(character),
        cleared: updated.count > 0
      };
    });
  }

  async deleteDailyActionsForTelegramUser(
    telegramUserId: bigint,
    keys: readonly string[]
  ): Promise<DevGrantDailyActionResetResult | null> {
    return this.prisma.$transaction(async (tx) => {
      const character = await findCharacterByTelegramUserId(tx, telegramUserId);

      if (!character) {
        return null;
      }

      const deleted = await tx.dailyAction.deleteMany({
        where: {
          characterId: character.id,
          key: {
            in: [...keys]
          }
        }
      });

      return {
        character: toCharacterRecord(character),
        deleted: deleted.count
      };
    });
  }

  async completeYegerQuestProgressForTelegramUser(
    telegramUserId: bigint,
    stage: DevGrantYegerQuestStage,
    now: Date
  ): Promise<DevGrantYegerQuestProgressResult | null> {
    return this.prisma.$transaction(async (tx) => {
      const character = await findCharacterByTelegramUserId(tx, telegramUserId);

      if (!character) {
        return null;
      }

      const config = getDevYegerQuestStageConfig(stage);
      const completed = await tx.dailyAction.findFirst({
        where: {
          characterId: character.id,
          key: config.completedKey,
          localDate: YEGER_UNQUIET_TRIAL_BUCKET
        }
      });

      if (completed) {
        return {
          state: "ready",
          character: toCharacterRecord(character),
          stage,
          addedWins: 0,
          wins: config.target,
          target: config.target,
          started: false
        };
      }

      if (stage === "second") {
        const firstCompleted = await tx.dailyAction.findFirst({
          where: {
            characterId: character.id,
            key: YEGER_UNQUIET_TRIAL_COMPLETED_KEY,
            localDate: YEGER_UNQUIET_TRIAL_BUCKET
          }
        });

        if (!firstCompleted) {
          return {
            state: "blocked",
            character: toCharacterRecord(character),
            stage,
            reason: "first-board-not-completed"
          };
        }
      }

      const started = await ensureYegerQuestStarted(tx, character.id, config.startedKey, now);
      const currentWins = await countDevYegerWinsSince(tx, character.id, started.createdAt);
      const addedWins = Math.max(0, config.target - currentWins);
      const monster = getDevYegerMonster();

      for (let index = 0; index < addedWins; index += 1) {
        const completedAt = new Date(Math.max(now.getTime(), started.createdAt.getTime()) + index + 1);
        await tx.soloCombatSession.create({
          data: {
            characterId: character.id,
            monsterId: monster.id,
            status: "won",
            turn: 1,
            stateJson: buildDevYegerWinState(monster, character, completedAt) as unknown as Prisma.InputJsonValue,
            expiresAt: completedAt,
            createdAt: completedAt
          }
        });
      }

      return {
        state: "ready",
        character: toCharacterRecord(character),
        stage,
        addedWins,
        wins: Math.min(config.target, currentWins + addedWins),
        target: config.target,
        started: !started.existed
      };
    });
  }
}

function getDevYegerQuestStageConfig(stage: DevGrantYegerQuestStage): {
  startedKey: string;
  completedKey: string;
  target: number;
} {
  return stage === "second"
    ? {
        startedKey: YEGER_UNQUIET_TRIAL_SECOND_STARTED_KEY,
        completedKey: YEGER_UNQUIET_TRIAL_SECOND_COMPLETED_KEY,
        target: YEGER_UNQUIET_TRIAL_SECOND_TARGET
      }
    : {
        startedKey: YEGER_UNQUIET_TRIAL_STARTED_KEY,
        completedKey: YEGER_UNQUIET_TRIAL_COMPLETED_KEY,
        target: YEGER_UNQUIET_TRIAL_TARGET
    };
}

function buildCooldownKeyWhere(input: DevGrantCooldownMatchInput): Prisma.CharacterCooldownWhereInput[] | null {
  const keys = [...new Set(input.keys ?? [])].filter((key) => key.length > 0);
  const keyPrefixes = [...new Set(input.keyPrefixes ?? [])].filter((prefix) => prefix.length > 0);
  const conditions: Prisma.CharacterCooldownWhereInput[] = [
    ...(keys.length > 0 ? [{ key: { in: keys } }] : []),
    ...keyPrefixes.map((prefix) => ({ key: { startsWith: prefix } }))
  ];

  return conditions.length > 0 ? conditions : null;
}

async function ensureYegerQuestStarted(
  tx: Prisma.TransactionClient,
  characterId: string,
  key: string,
  now: Date
): Promise<{ createdAt: Date; existed: boolean }> {
  const existing = await tx.dailyAction.findFirst({
    where: {
      characterId,
      key,
      localDate: YEGER_UNQUIET_TRIAL_BUCKET
    }
  });

  if (existing) {
    return { createdAt: existing.createdAt, existed: true };
  }

  const created = await tx.dailyAction.create({
    data: {
      characterId,
      key,
      localDate: YEGER_UNQUIET_TRIAL_BUCKET,
      rewardXp: 0,
      rewardGold: 0,
      resultJson: {
        kind: "dev-yeger-quest-start",
        stageKey: key
      },
      createdAt: now
    }
  });

  return { createdAt: created.createdAt, existed: false };
}

async function countDevYegerWinsSince(
  tx: Prisma.TransactionClient,
  characterId: string,
  since: Date
): Promise<number> {
  const rows = await tx.soloCombatSession.findMany({
    where: {
      OR: [{ updatedAt: { gte: since } }, { createdAt: { gte: since } }],
      characterId
    },
    select: {
      monsterId: true,
      status: true,
      stateJson: true,
      createdAt: true
    }
  });

  return rows.filter((row) => {
    if (row.status !== "won") {
      return false;
    }

    const monster = monsters.find((candidate) => candidate.id === row.monsterId);
    if (!monster || !isYegerUnquietTarget(monster)) {
      return false;
    }

    const state = parseCombatState(row.stateJson);
    const completedAt = parseDevYegerCompletedAt(state?.completedAt) ?? row.createdAt;
    if (completedAt < since) {
      return false;
    }

    return !state?.settlement || state.settlement.status === "completed";
  }).length;
}

function getDevYegerMonster(): (typeof monsters)[number] {
  const monster = monsters.find((candidate) => isYegerUnquietTarget(candidate));

  if (!monster) {
    throw new Error("No Yeger unquiet monster is configured.");
  }

  return monster;
}

function buildDevYegerWinState(
  monster: (typeof monsters)[number],
  character: Character,
  completedAt: Date
): CombatState {
  const hpMax = Math.max(1, Math.floor(character.hpMax));
  const manaMax = Math.max(0, Math.floor(character.manaMax));
  const monsterHpMax = Math.max(1, monster.level * 5);

  return {
    source: "yeger",
    completedAt: completedAt.toISOString(),
    turn: 1,
    status: "won",
    hero: {
      hp: Math.max(1, Math.min(hpMax, Math.floor(character.hpCurrent))),
      hpMax,
      mana: Math.max(0, Math.min(manaMax, Math.floor(character.manaCurrent))),
      manaMax
    },
    monster: {
      id: monster.id,
      name: monster.name,
      level: monster.level,
      hp: 0,
      hpMax: monsterHpMax
    }
  };
}

function parseDevYegerCompletedAt(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function healActiveCombatForCharacter(
  tx: Prisma.TransactionClient,
  characterId: string,
  amount?: number
): Promise<DevGrantCharacterResult["combat"] | null> {
  const lease = await tx.activeCombatLease.findUnique({
    where: { characterId }
  });

  if (!lease) {
    return null;
  }

  if (lease.kind === "solo-combat") {
    return healActiveSoloCombat(tx, lease.referenceId, amount);
  }

  if (lease.kind === "party-boss") {
    return healActivePartyBossCombat(tx, lease.referenceId, characterId, amount);
  }

  if (lease.kind === "turn-based-duel") {
    return healActiveTurnBasedDuelCombat(tx, lease.referenceId, characterId, amount);
  }

  return null;
}

async function healActiveSoloCombat(
  tx: Prisma.TransactionClient,
  sessionId: string,
  amount?: number
): Promise<DevGrantCharacterResult["combat"] | null> {
  const session = await tx.soloCombatSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      status: true,
      stateJson: true
    }
  });
  const state = session?.status === "active" ? parseCombatState(session.stateJson) : null;

  if (!session || !state || state.status !== "active") {
    return null;
  }

  const nextHp = applyDevHealAmount(state.hero.hp, state.hero.hpMax, amount);
  const nextState: CombatState = {
    ...state,
    hero: {
      ...state.hero,
      hp: nextHp
    }
  };

  await tx.soloCombatSession.update({
    where: { id: session.id },
    data: {
      stateJson: nextState as unknown as Prisma.InputJsonValue
    }
  });

  return {
    kind: "solo-combat",
    hpCurrent: nextHp,
    hpMax: state.hero.hpMax
  };
}

async function healActivePartyBossCombat(
  tx: Prisma.TransactionClient,
  partySessionId: string,
  characterId: string,
  amount?: number
): Promise<DevGrantCharacterResult["combat"] | null> {
  const session = await tx.partyBossSession.findUnique({
    where: { partySessionId },
    select: {
      id: true,
      status: true,
      version: true,
      stateJson: true
    }
  });
  const state = session?.status === "active"
    ? parsePartyBossStateForDevHeal(session.stateJson)
    : null;
  const participant = state?.participants.find((candidate) => candidate.characterId === characterId);

  if (!session || !state || !participant) {
    return null;
  }

  const nextHp = applyDevHealAmount(participant.resources.hp, participant.resources.hpMax, amount);
  const nextState: PartyBossState = {
    ...state,
    participants: state.participants.map((candidate) =>
      candidate.characterId === characterId
        ? {
            ...candidate,
            status: nextHp > 0 ? "active" : candidate.status,
            resources: {
              ...candidate.resources,
              hp: nextHp
            }
          }
        : candidate
    )
  };

  await tx.partyBossSession.update({
    where: { id: session.id },
    data: {
      version: session.version + 1,
      stateJson: nextState as unknown as Prisma.InputJsonValue
    }
  });

  return {
    kind: "party-boss",
    hpCurrent: nextHp,
    hpMax: participant.resources.hpMax
  };
}

async function healActiveTurnBasedDuelCombat(
  tx: Prisma.TransactionClient,
  sessionId: string,
  characterId: string,
  amount?: number
): Promise<DevGrantCharacterResult["combat"] | null> {
  const session = await tx.duelCombatSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      status: true,
      version: true,
      stateJson: true
    }
  });
  const state = session?.status === "active"
    ? parseTurnBasedDuelStateForDevHeal(session.stateJson)
    : null;
  const side = state ? findDuelParticipantSide(state, characterId) : null;

  if (!session || !state || !side) {
    return null;
  }

  const participant = state.participants[side];
  const nextHp = applyDevHealAmount(participant.hp, participant.hpMax, amount);
  const nextState: TurnBasedDuelState = {
    ...state,
    participants: {
      ...state.participants,
      [side]: {
        ...participant,
        hp: nextHp
      }
    }
  };

  await tx.duelCombatSession.update({
    where: { id: session.id },
    data: {
      version: session.version + 1,
      stateJson: nextState as unknown as Prisma.InputJsonValue
    }
  });

  return {
    kind: "turn-based-duel",
    hpCurrent: nextHp,
    hpMax: participant.hpMax
  };
}

function applyDevHealAmount(current: number, max: number, amount?: number): number {
  const safeMax = Math.max(1, Math.floor(max));
  const safeCurrent = Math.max(0, Math.floor(current));

  return amount === undefined
    ? safeMax
    : Math.min(safeMax, safeCurrent + Math.max(0, Math.floor(amount)));
}

function parsePartyBossStateForDevHeal(value: Prisma.JsonValue): PartyBossState | null {
  if (!isRecord(value) || value.status !== "active" || !Array.isArray(value.participants)) {
    return null;
  }

  return value as unknown as PartyBossState;
}

function parseTurnBasedDuelStateForDevHeal(value: Prisma.JsonValue): TurnBasedDuelState | null {
  if (!isRecord(value) || value.status !== "active" || !isRecord(value.participants)) {
    return null;
  }

  return value as unknown as TurnBasedDuelState;
}

function findDuelParticipantSide(
  state: TurnBasedDuelState,
  characterId: string
): "challenger" | "target" | null {
  if (state.participants.challenger.characterId === characterId) {
    return "challenger";
  }

  return state.participants.target.characterId === characterId ? "target" : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const currentLocationInclude = {
  user: {
    select: {
      lastSeenLocationId: true
    }
  }
} satisfies Prisma.CharacterInclude;

async function findCharacterByTelegramUserId(
  tx: Prisma.TransactionClient,
  telegramUserId: bigint
): Promise<(Character & { user: { lastSeenLocationId: string | null } }) | null> {
  return tx.character.findFirst({
    where: {
      user: {
        telegramUserId
      }
    },
    include: currentLocationInclude
  });
}

async function getEffectiveHpMax(
  tx: Prisma.TransactionClient,
  character: Character & { user: { lastSeenLocationId: string | null } }
): Promise<number> {
  const [equipment, remortCount] = await Promise.all([
    tx.characterEquipment.findMany({
      where: {
        characterId: character.id
      },
      select: {
        itemId: true
      }
    }),
    countCharacterRemorts(tx, character.id)
  ]);
  const equippedItems = equipment.flatMap((row) => {
    const item = items.find((candidate) => candidate.id === row.itemId);

    return item ? [item] : [];
  });

  return summarizeCharacter(toCharacterRecord(character), {
    equippedItems,
    remortCount
  }).hpMax;
}

async function getEffectiveManaMax(
  tx: Prisma.TransactionClient,
  character: Character & { user: { lastSeenLocationId: string | null } }
): Promise<number> {
  const [equipment, remortCount] = await Promise.all([
    tx.characterEquipment.findMany({
      where: {
        characterId: character.id
      },
      select: {
        itemId: true
      }
    }),
    countCharacterRemorts(tx, character.id)
  ]);
  const equippedItems = equipment.flatMap((row) => {
    const item = items.find((candidate) => candidate.id === row.itemId);

    return item ? [item] : [];
  });

  return summarizeCharacter(toCharacterRecord(character), {
    equippedItems,
    remortCount
  }).manaMax;
}

function mergeItemGrants(itemGrants: ItemGrant[]): ItemGrant[] {
  const quantitiesByItemId = new Map<string, number>();

  for (const grant of itemGrants) {
    const quantity = Math.floor(grant.quantity);

    if (quantity <= 0) {
      continue;
    }

    quantitiesByItemId.set(grant.itemId, (quantitiesByItemId.get(grant.itemId) ?? 0) + quantity);
  }

  return [...quantitiesByItemId.entries()].map(([itemId, quantity]) => ({
    itemId,
    quantity
  }));
}

function toCharacterRecord(
  character: Character & { user: { lastSeenLocationId: string | null } }
): CharacterRecord {
  const { user, ...record } = character;

  return {
    ...record,
    currentLocationId: user.lastSeenLocationId
  };
}
