import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { Prisma, type PrismaClient } from "@prisma/client";
import { GROUP_COMBAT_LEASE_KIND } from "../../domain/combat/combatLeaseRegistry";
import {
  createLeftPassageGroupCombatState,
  buildGroupCombatTimeoutAction,
  buildGroupCombatSettlementPlan,
  buildGroupCombatSettlementReceipt,
  buildLeftPassageEncounterRewardBudget,
  createGroupCombatProofState,
  deriveLeftPassageEnemyCount,
  filterSupportedGroupCombatMonsterAbilityIds,
  GROUP_COMBAT_REPAIR_PARTICIPANT_LIMIT,
  GROUP_COMBAT_PROOF_ENCOUNTER_KEY,
  GROUP_COMBAT_LEFT_PASSAGE_ENCOUNTER_KEY,
  GROUP_COMBAT_PRODUCTION_RULES_VERSION,
  GROUP_COMBAT_RULES_VERSION,
  GROUP_COMBAT_SUPPORTED_ITEM_IDS,
  GROUP_COMBAT_TURN_LIMIT,
  getLeftPassageTierTwoDiscoveryMinutes,
  LEFT_PASSAGE_TIER_TWO_DISCOVERY_COOLDOWN_KEY,
  resolveGroupCombatTurn,
  stableGroupCombatSeed,
  sumGroupCombatSettlementRewards,
  validateGroupCombatAction,
  type GroupCombatAction,
  type GroupCombatActorSnapshot,
  type GroupCombatCommittedConsumable,
  type GroupCombatContribution,
  type GroupCombatResult,
  type GroupCombatSettlementPlan,
  type GroupCombatState,
  type GroupCombatStatus
} from "../../domain/groupCombat/groupCombat";
import { decideThreatEscalation } from "../../domain/combat/threatEscalation";
import type { ThreatEscalationDecision } from "../../domain/combat/threatEscalation";
import { deriveMonsterCombatStats } from "../../domain/combat/monsterCombatStats";
import { getLevelForXp } from "../../domain/progression/level";
import { recordLevelMilestones } from "./levelMilestoneRepository";
import { SeededRandomSource } from "../../shared/random";
import { monsters } from "../../content";
import {
  applyPersistentFightDifficulty,
  applyThreatSecondEnemyLevelBonus,
  getPersistentFightDifficultyConfig,
  selectSoloFightMonster,
  THREAT_ESCALATION_HISTORY_LIMIT,
  toThreatEscalationHistoryEntry
} from "../../services/fightService";
import { summarizeCharacter } from "../../domain/characters/characterSummary";
import type { CharacterSummary } from "../../domain/characters/characterSummary";
import {
  GroupCombatStateValidationError,
  parseGroupCombatResultStrict,
  parseGroupCombatSettlementPlanStrict,
  parseGroupCombatSettlementReceiptStrict,
  parseGroupCombatStateStrict
} from "../../domain/groupCombat/groupCombatStateValidation";
import { parseBardInspirationCombatState } from "../../domain/noncombat/bardSupport";
import { parseVarenykSatedCombatState } from "../../domain/noncombat/varenykSatedSupport";
import { createMonsterAbilityRuntime } from "../../domain/combat/monsterAbilityRuntime";
import type {
  GroupCombatActionResult,
  GroupCombatOperatorRepairRecord,
  GroupCombatParticipantRecord,
  GroupCombatQueuedActionRecord,
  GroupCombatRepository,
  GroupCombatSessionRecord,
  GroupCombatStartResult,
  LeftPassagePartyCreateResult
} from "./groupCombatRepository";
import { buildPartyBossCombatStats } from "./partyBossRepository";
import { getCombatMantokAbilityGrantsForEquippedItems } from "../../content/mantokAbilityGrants";
import { resolveActiveCosmeticTitleLabel } from "../../content/cosmeticTitles";
import { freezeBardInspirationFromCooldown } from "./prismaBardSupport";
import { freezeVarenykSatedFromCooldown, releaseCombatLeaseWithTimedStatuses } from "./prismaVarenykSated";
import { mapSoloCombatSessionRecord } from "./prismaSoloCombatSessionRepository";
import type { SoloCombatSessionCompletionRecord } from "./soloCombatSessionRepository";
import { PrismaPartySessionRepository } from "./prismaPartySessionRepository";
import {
  PRESENCE_ADVENTURE_SOLO_FIGHT,
  PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT
} from "../../services/presenceService";

type TxClient = Prisma.TransactionClient;
const MAX_MUTATION_ATTEMPTS = 4;
const LEFT_PASSAGE_PREVIEW_RULES_VERSION = "nyz-passage-preview-v1";
const LEFT_PASSAGE_PARTY_ORIGIN_KIND = GROUP_COMBAT_LEFT_PASSAGE_ENCOUNTER_KEY;
const LEFT_PASSAGE_PARTICIPANT_CAP = 3;
const LEFT_PASSAGE_MINIMUM_PARTICIPANTS = 1;

class GroupCombatMutationConflict extends Error {}
class GroupCombatInventoryDrift extends Error {
  constructor(readonly sessionId: string) {
    super("Committed group-combat item is no longer owned.");
  }
}

const partyCharacterInclude = {
  user: {
    select: {
      telegramUserId: true,
      lastSeenLocationId: true,
      currentAdventureId: true,
      currentRaidId: true
    }
  },
  equipment: { orderBy: { slot: "asc" as const } },
  items: {
    where: { itemId: { in: [...GROUP_COMBAT_SUPPORTED_ITEM_IDS] } },
    select: { itemId: true, quantity: true },
    orderBy: { itemId: "asc" as const }
  },
  _count: { select: { remorts: true } }
} satisfies Prisma.CharacterInclude;

const partyInclude = {
  participants: {
    include: { character: { include: partyCharacterInclude } },
    orderBy: [{ joinedAt: "asc" as const }, { id: "asc" as const }]
  }
} satisfies Prisma.PartySessionInclude;

const passageReservationInclude = {
  character: { select: { _count: { select: { remorts: true } } } }
} satisfies Prisma.PendingPassageEncounterInclude;

type LeftPassageReservationRow = Prisma.PendingPassageEncounterGetPayload<{
  include: typeof passageReservationInclude;
}>;
type PartyCharacterRow = Prisma.CharacterGetPayload<{
  include: typeof partyCharacterInclude;
}>;

function buildParticipantCombatStats(character: PartyCharacterRow, remortCount: number) {
  return buildPartyBossCombatStats({
    id: character.id,
    userId: character.userId,
    name: character.name,
    pronoun: character.pronoun,
    path: character.path,
    raceId: character.raceId,
    classId: character.classId,
    level: character.level,
    xp: character.xp,
    gold: character.gold,
    hpCurrent: character.hpCurrent,
    hpMax: character.hpMax,
    manaCurrent: character.manaCurrent,
    manaMax: character.manaMax,
    hpRegenAt: character.hpRegenAt,
    manaRegenAt: character.manaRegenAt,
    activeCosmeticTitleGrantId: character.activeCosmeticTitleGrantId,
    statsJson: character.statsJson,
    remortCount,
    equipment: character.equipment
  });
}

function getInvalidEffectiveResources(
  character: PartyCharacterRow,
  remortCount: number
): {
  hpCurrent: number;
  hpMax: number;
  manaCurrent: number;
  manaMax: number;
} | null {
  const effective = buildParticipantCombatStats(character, remortCount);
  return character.hpCurrent > effective.hpMax ||
    character.manaCurrent < 0 ||
    character.manaCurrent > effective.manaMax
    ? {
        hpCurrent: character.hpCurrent,
        hpMax: effective.hpMax,
        manaCurrent: character.manaCurrent,
        manaMax: effective.manaMax
      }
    : null;
}

const sessionInclude = {
  partySession: { select: { inviteToken: true } },
  participants: {
    include: {
      character: {
        include: {
          user: { select: { telegramUserId: true } },
          _count: { select: { remorts: true } }
        }
      }
    },
    orderBy: [{ rosterOrder: "asc" as const }, { id: "asc" as const }]
  }
} satisfies Prisma.GroupCombatSessionInclude;

type SessionRow = Prisma.GroupCombatSessionGetPayload<{ include: typeof sessionInclude }>;
type PersistedActionRow = {
  actorCharacterId: string;
  turn: number;
  actionKey: string;
  targetKind: string;
  targetId: string;
  payloadKey: string | null;
  origin: string;
};

interface FrozenParticipantPayload {
  actor: GroupCombatActorSnapshot;
  summary?: CharacterSummary;
  sated?: unknown;
  inspiration?: unknown;
}

export type GroupCombatSettlementStage =
  | "validated"
  | "claimed"
  | "resources"
  | "items"
  | "activity"
  | "receipt"
  | "lease";

export interface GroupCombatSettlementTestHooks {
  beforeRuntimeRead?(input: {
    operation: "action" | "timeout" | "settlement" | "delivery";
    sessionId?: string;
    partyInviteToken?: string;
  }): void | Promise<void>;
  afterStage?(input: {
    stage: GroupCombatSettlementStage;
    sessionId: string;
    characterId: string;
  }): void | Promise<void>;
}

export class PrismaGroupCombatRepository implements GroupCombatRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly settlementTestHooks?: GroupCombatSettlementTestHooks
  ) {}

  async createLeftPassagePartyForTelegramUser(input: {
    telegramUserId: bigint;
    encounterToken: string;
    inviteToken: string;
    originKind: string;
    locationId: string;
    now: Date;
    joinUntilAt: Date;
    chatId?: bigint | null;
    messageId?: number | null;
  }): Promise<LeftPassagePartyCreateResult> {
    const outcome = await this.prisma.$transaction(async (tx): Promise<
      | Exclude<LeftPassagePartyCreateResult, { session: unknown }>
      | { state: "created" | "already-created" | "live-membership"; inviteToken: string }
    > => {
      const character = await tx.character.findFirst({
        where: { user: { telegramUserId: input.telegramUserId } },
        include: partyCharacterInclude
      });
      if (!character) {
        return { state: "no-character" };
      }

      const encounter = await tx.pendingPassageEncounter.findFirst({
        where: {
          token: input.encounterToken,
          characterId: character.id
        }
      });
      if (!encounter || encounter.rulesVersion !== LEFT_PASSAGE_PREVIEW_RULES_VERSION) {
        return { state: "invalid-preview" };
      }
      if (
        encounter.originLocationId !== input.locationId ||
        encounter.passage !== "deep-left" ||
        encounter.difficulty !== "hard" ||
        character.user.lastSeenLocationId !== input.locationId
      ) {
        return { state: "wrong-location" };
      }
      if (
        character.user.currentAdventureId !== null &&
        character.user.currentAdventureId !== PRESENCE_ADVENTURE_SOLO_FIGHT
      ) {
        return { state: "active-adventure" };
      }
      if (character.user.currentRaidId !== null) {
        return { state: "active-raid" };
      }
      if (encounter.expiresAt <= input.now) {
        if (encounter.status === "pending") {
          await tx.pendingPassageEncounter.updateMany({
            where: { id: encounter.id, status: "pending", version: encounter.version },
            data: {
              status: "expired",
              activeKey: null,
              cancelledAt: input.now,
              version: { increment: 1 }
            }
          });
        }
        return { state: "expired-invitation" };
      }
      if (
        encounter.status === "reserved" &&
        encounter.reservationOrigin === input.originKind &&
        encounter.reservationRemortCount === character._count.remorts &&
        encounter.reservedPartySessionId
      ) {
        const reservedParty = await tx.partySession.findUnique({
          where: { id: encounter.reservedPartySessionId },
          select: { inviteToken: true }
        });
        if (reservedParty) {
          return { state: "already-created", inviteToken: reservedParty.inviteToken };
        }
      }
      if (encounter.status !== "pending") {
        return { state: "invalid-preview" };
      }
      if (character.hpCurrent <= 0) {
        return { state: "dead" };
      }
      const [combatLease, activeSearch, liveMembership] = await Promise.all([
        tx.activeCombatLease.findUnique({
          where: { characterId: character.id },
          select: { id: true }
        }),
        tx.passageSearchAction.findFirst({
          where: {
            characterId: character.id,
            status: "running",
            endsAt: { gt: input.now }
          },
          select: { id: true, endsAt: true }
        }),
        tx.partyParticipant.findFirst({
          where: {
            characterId: character.id,
            status: "joined",
            activeMembershipKey: `party-member:${character.id}`,
            session: { status: { in: ["recruiting", "active"] } }
          },
          select: {
            session: {
              select: { inviteToken: true }
            }
          }
        })
      ]);
      if (combatLease) {
        return { state: "active-combat" };
      }
      if (activeSearch) {
        return { state: "active-search", availableAt: activeSearch.endsAt, now: input.now };
      }
      if (liveMembership) {
        return { state: "live-membership", inviteToken: liveMembership.session.inviteToken };
      }
      const invalidResources = getInvalidEffectiveResources(
        character,
        character._count.remorts
      );
      if (invalidResources) {
        return { state: "invalid-resources", resources: invalidResources };
      }

      const partyId = randomUUID();
      await tx.partySession.create({
        data: {
          id: partyId,
          inviteToken: input.inviteToken,
          status: "recruiting",
          leaderCharacterId: character.id,
          periodId: null,
          originLocationId: input.locationId,
          originKind: input.originKind,
          participantCap: LEFT_PASSAGE_PARTICIPANT_CAP,
          minimumParticipants: LEFT_PASSAGE_MINIMUM_PARTICIPANTS,
          joinUntilAt: input.joinUntilAt,
          expiresAt: input.joinUntilAt,
          activeLeaderKey: `party-leader:${character.id}`,
          participants: {
            create: {
              characterId: character.id,
              remortCount: character._count.remorts,
              status: "joined",
              joinSource: "leader",
              joinedAt: input.now,
              snapshotJson: {
                characterId: character.id,
                displayName: character.name,
                level: character.level,
                raceId: character.raceId,
                classId: character.classId,
                remortCount: character._count.remorts,
                raidReadiness: "waiting"
              },
              chatId: input.chatId ?? null,
              messageId: input.messageId ?? null,
              activeMembershipKey: `party-member:${character.id}`
            }
          }
        }
      });
      const reserved = await tx.pendingPassageEncounter.updateMany({
        where: {
          id: encounter.id,
          status: "pending",
          version: encounter.version,
          activeKey: encounter.activeKey,
          expiresAt: { gt: input.now }
        },
        data: {
          status: "reserved",
          reservationOrigin: input.originKind,
          reservationRemortCount: character._count.remorts,
          reservedPartySessionId: partyId,
          reservedAt: input.now,
          version: { increment: 1 }
        }
      });
      if (reserved.count !== 1) {
        throw new GroupCombatMutationConflict();
      }
      return { state: "created", inviteToken: input.inviteToken };
    }).catch(async (error: unknown) => {
      if (!(error instanceof GroupCombatMutationConflict) && !isUniqueConflict(error)) {
        throw error;
      }
      const encounter = await this.prisma.pendingPassageEncounter.findFirst({
        where: {
          token: input.encounterToken,
          character: { user: { telegramUserId: input.telegramUserId } }
        },
        select: {
          reservationOrigin: true,
          reservedPartySession: {
            select: { inviteToken: true }
          }
        }
      });
      return encounter?.reservationOrigin === input.originKind && encounter.reservedPartySession
        ? { state: "already-created" as const, inviteToken: encounter.reservedPartySession.inviteToken }
        : { state: "reservation-conflict" as const };
    });

    if (!("inviteToken" in outcome)) {
      return outcome;
    }
    const session = await new PrismaPartySessionRepository(this.prisma).findByToken(outcome.inviteToken, input.now);
    return session
      ? { state: outcome.state, session }
      : { state: "invalid-preview" };
  }

  async startProofForTelegramUser(input: {
    telegramUserId: bigint;
    partyInviteToken: string;
    now: Date;
    turnExpiresAt: Date;
  }): Promise<GroupCombatStartResult> {
    return this.startCombat(input, input.telegramUserId, "proof");
  }

  async startDueProof(input: {
    partyInviteToken: string;
    now: Date;
    turnExpiresAt: Date;
  }): Promise<GroupCombatStartResult> {
    return this.startCombat(input, null, "proof");
  }

  async startLeftPassageForTelegramUser(input: {
    telegramUserId: bigint;
    partyInviteToken: string;
    now: Date;
    turnExpiresAt: Date;
  }): Promise<GroupCombatStartResult> {
    return this.startCombat(input, input.telegramUserId, "left-passage");
  }

  async startDueLeftPassage(input: {
    partyInviteToken: string;
    now: Date;
    turnExpiresAt: Date;
  }): Promise<GroupCombatStartResult> {
    return this.startCombat(input, null, "left-passage", "due");
  }

  async startReadyLeftPassage(input: {
    partyInviteToken: string;
    now: Date;
    turnExpiresAt: Date;
  }): Promise<GroupCombatStartResult> {
    return this.startCombat(input, null, "left-passage", "ready");
  }

  private async startCombat(
    input: {
      partyInviteToken: string;
      now: Date;
      turnExpiresAt: Date;
    },
    manualLeaderTelegramUserId: bigint | null,
    mode: "proof" | "left-passage",
    automaticStart: "due" | "ready" = "due"
  ): Promise<GroupCombatStartResult> {
    try {
      return await this.prisma.$transaction(async (tx): Promise<GroupCombatStartResult> => {
        const manualLeader = manualLeaderTelegramUserId === null
          ? null
          : await tx.character.findFirst({
              where: { user: { telegramUserId: manualLeaderTelegramUserId } },
              select: { id: true }
            });
        if (manualLeaderTelegramUserId !== null && !manualLeader) {
          return { state: "no-character" };
        }

        let party = await tx.partySession.findUnique({
          where: { inviteToken: input.partyInviteToken },
          include: partyInclude
        });
        if (!party) {
          return { state: "not-found" };
        }
        const existing = await tx.groupCombatSession.findUnique({
          where: { partySessionId: party.id },
          select: { id: true, status: true }
        });
        if (existing) {
          const session = await loadSession(tx, existing.id);
          if (!session) {
            return { state: "blocked" };
          }
          return { state: existing.status === "active" ? "already-active" : "terminal", session };
        }
        if (manualLeader && party.leaderCharacterId !== manualLeader.id) {
          return { state: "not-leader" };
        }
        if (party.status !== "recruiting") {
          return { state: "not-recruiting" };
        }
        if (
          mode === "left-passage" && (
            party.originLocationId !== PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT ||
            party.originKind !== LEFT_PASSAGE_PARTY_ORIGIN_KIND
          )
        ) {
          return { state: "blocked", partyVersion: party.version };
        }
        if (
          manualLeaderTelegramUserId === null &&
          automaticStart === "due" &&
          party.expiresAt.getTime() > input.now.getTime()
        ) {
          return { state: "not-recruiting" };
        }

        const joined = party.participants.filter((participant) => participant.status === "joined");
        if (
          manualLeaderTelegramUserId === null &&
          automaticStart === "ready" &&
          joined.some((participant) => !isReadyPartyParticipantSnapshot(participant.snapshotJson))
        ) {
          return { state: "not-recruiting" };
        }
        const minimumParticipants = mode === "left-passage" ? 1 : 2;
        if (joined.length < minimumParticipants || joined.length > 3) {
          return { state: "invalid-size", partyVersion: party.version };
        }
        const currentLeaderCharacterId = party.leaderCharacterId;
        if (!joined.some((participant) => participant.characterId === currentLeaderCharacterId)) {
          return { state: "invalid-roster", partyVersion: party.version };
        }
        if (new Set(joined.map((participant) => participant.characterId)).size !== joined.length) {
          return { state: "invalid-roster", partyVersion: party.version };
        }
        if (joined.some((participant) => participant.remortCount !== participant.character._count.remorts)) {
          return { state: "invalid-life", partyVersion: party.version };
        }
        if (joined.some((participant) => participant.character.hpCurrent <= 0)) {
          return { state: "invalid-roster", partyVersion: party.version };
        }
        if (joined.some((participant) =>
          getInvalidEffectiveResources(participant.character, participant.remortCount)
        )) {
          return { state: "invalid-roster", partyVersion: party.version };
        }
        if (
          mode === "left-passage" &&
          joined.some((participant) => (
            participant.character.user.lastSeenLocationId !== PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT ||
            (
              participant.character.user.currentAdventureId !== null &&
              participant.character.user.currentAdventureId !== PRESENCE_ADVENTURE_SOLO_FIGHT
            ) ||
            participant.character.user.currentRaidId !== null
          ))
        ) {
          return { state: "invalid-roster", partyVersion: party.version };
        }
        const participantIds = joined.map((participant) => participant.characterId);
        const [blocker, activeSearch] = await Promise.all([
          tx.activeCombatLease.findFirst({
            where: { characterId: { in: participantIds } },
            select: { id: true }
          }),
          mode === "left-passage"
            ? tx.passageSearchAction.findFirst({
              where: {
                characterId: { in: participantIds },
                status: "running",
                endsAt: { gt: input.now }
              },
                orderBy: [{ endsAt: "desc" }, { id: "asc" }],
                select: { id: true, endsAt: true }
              })
            : Promise.resolve(null)
        ]);
        if (blocker) {
          return manualLeaderTelegramUserId === null
            ? { state: "blocked", partyVersion: party.version }
            : { state: "blocked" };
        }
        if (activeSearch) {
          return manualLeaderTelegramUserId === null
            ? { state: "blocked", partyVersion: party.version }
            : {
                state: "active-search",
                availableAt: activeSearch.endsAt,
                now: input.now,
                partyVersion: party.version
              };
        }
        const reservation = mode === "left-passage"
          ? await tx.pendingPassageEncounter.findFirst({
              where: {
                reservedPartySessionId: party.id,
                reservationOrigin: LEFT_PASSAGE_PARTY_ORIGIN_KIND,
                status: "reserved"
              },
              include: passageReservationInclude
            })
          : null;
        if (
          mode === "left-passage" &&
          (
            !reservation ||
            reservation.originLocationId !== PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT ||
            reservation.passage !== "deep-left" ||
            reservation.difficulty !== "hard" ||
            reservation.rulesVersion !== LEFT_PASSAGE_PREVIEW_RULES_VERSION ||
            reservation.expiresAt <= input.now ||
            reservation.reservationRemortCount === null ||
            reservation.character._count.remorts !== reservation.reservationRemortCount
          )
        ) {
          return { state: "reservation-missing", partyVersion: party.version };
        }

        const claimed = await tx.partySession.updateMany({
          where: { id: party.id, status: "recruiting", version: party.version },
          data: { status: "active", version: { increment: 1 } }
        });
        if (claimed.count !== 1) {
          return { state: "blocked" };
        }
        const canonical = await tx.partySession.findUnique({ where: { id: party.id }, include: partyInclude });
        if (!canonical) {
          throw new Error("Claimed party disappeared before group-combat freeze.");
        }
        party = canonical;

        const sessionId = randomUUID();
        const frozen: FrozenParticipantPayload[] = [];
        for (const [rosterOrder, participant] of party.participants
          .filter((candidate) => candidate.status === "joined")
          .entries()) {
          const character = participant.character;
          const combatStats = buildParticipantCombatStats(character, participant.remortCount);
          const sated = await freezeVarenykSatedFromCooldown({
            tx,
            characterId: character.id,
            remortCount: participant.remortCount,
            resources: {
              hp: combatStats.hpCurrent,
              hpMax: combatStats.hpMax,
              mana: combatStats.manaCurrent,
              manaMax: combatStats.manaMax
            },
            now: input.now
          });
          const inspiration = await freezeBardInspirationFromCooldown({
            tx,
            characterId: character.id,
            remortCount: participant.remortCount,
            now: input.now
          });
          const activeCosmeticTitle = resolveActiveCosmeticTitleLabel(
            character.activeCosmeticTitleGrantId
          );
          const actor: GroupCombatActorSnapshot = {
            characterId: character.id,
            telegramUserId: character.user.telegramUserId.toString(),
            name: character.name,
            ...(activeCosmeticTitle ? { activeCosmeticTitle } : {}),
            remortCount: participant.remortCount,
            rosterOrder,
            hp: sated.resources.hp,
            hpMax: sated.resources.hpMax,
            mana: sated.resources.mana,
            manaMax: sated.resources.manaMax,
            attack: Math.max(2, combatStats.weaponDamage ?? 1, Math.floor(combatStats.strength / 2)),
            defense: Math.max(0, combatStats.armor ?? 0),
            support: Math.max(2, Math.floor((combatStats.intelligence + combatStats.charisma) / 3)),
            classId: character.classId,
            raceId: character.raceId,
            level: character.level,
            stats: {
              strength: combatStats.strength,
              dexterity: combatStats.dexterity,
              intelligence: combatStats.intelligence,
              charisma: combatStats.charisma,
              luck: combatStats.luck
            },
            equipmentItemIds: character.equipment.map((row) => row.itemId),
            gearAbilityIds: getCombatMantokAbilityGrantsForEquippedItems({
              itemIds: character.equipment.map((row) => row.itemId),
              characterLevel: character.level
            }).map((grant) => grant.combat!.profile.id),
            combatItemQuantities: Object.fromEntries(character.items.map((row) => [row.itemId, row.quantity])),
            threat: 0
          };
          frozen.push({
            actor,
            summary: summarizeCharacter({
              ...character,
              currentLocationId: character.user.lastSeenLocationId,
              remortCount: participant.remortCount
            }),
            ...(sated.sated ? { sated: sated.sated } : {}),
            ...(inspiration ? { inspiration } : {})
          });
        }

        const state = mode === "proof"
          ? createGroupCombatProofState({
              sessionId,
              partySessionId: party.id,
              deterministicSeed: stableGroupCombatSeed(`${party.id}:${sessionId}`),
              participants: frozen.map((row) => row.actor)
            })
          : await buildLeftPassageState({
              tx,
              sessionId,
              partySessionId: party.id,
              reservation: reservation!,
              frozen,
              now: input.now
            });
        await tx.activeCombatLease.createMany({
          data: frozen.map((row) => ({
            characterId: row.actor.characterId,
            kind: GROUP_COMBAT_LEASE_KIND,
            referenceId: sessionId,
            createdAt: input.now,
            updatedAt: input.now
          }))
        });
        await tx.groupCombatSession.create({
          data: {
            id: sessionId,
            partySessionId: party.id,
            encounterKey: state.encounterKey,
            rulesVersion: state.rulesVersion,
            status: "active",
            turn: state.turn,
            version: 1,
            stateJson: state as unknown as Prisma.InputJsonValue,
            turnExpiresAt: input.turnExpiresAt,
            participants: {
              create: frozen.map((row) => {
                const partyParticipant = party.participants.find(
                  (participant) => participant.characterId === row.actor.characterId
                );
                const telegramUserId = BigInt(row.actor.telegramUserId);
                const hasPrivateReference = partyParticipant?.chatId === telegramUserId && partyParticipant.messageId !== null;
                return {
                  characterId: row.actor.characterId,
                  remortCount: row.actor.remortCount,
                  rosterOrder: row.actor.rosterOrder,
                  chatId: hasPrivateReference ? partyParticipant.chatId : null,
                  messageId: hasPrivateReference ? partyParticipant.messageId : null,
                  snapshotJson: row as unknown as Prisma.InputJsonValue,
                  contributionJson: state.contributions[row.actor.rosterOrder] as unknown as Prisma.InputJsonValue
                };
              })
            }
          }
        });
        if (reservation) {
          const consumed = await tx.pendingPassageEncounter.updateMany({
            where: {
              id: reservation.id,
              status: "reserved",
              version: reservation.version,
              reservedPartySessionId: party.id,
              reservationOrigin: LEFT_PASSAGE_PARTY_ORIGIN_KIND,
              expiresAt: { gt: input.now }
            },
            data: {
              status: "consumed",
              activeKey: null,
              groupCombatSessionId: sessionId,
              consumedAt: input.now,
              version: { increment: 1 }
            }
          });
          if (consumed.count !== 1) {
            throw new GroupCombatMutationConflict();
          }
        }
        const session = await loadSession(tx, sessionId);
        if (!session) {
          throw new Error("Created group-combat session disappeared.");
        }
        return { state: "started", session };
      });
    } catch (error) {
      if (!isUniqueConflict(error)) {
        throw error;
      }
      const existing = await this.findByPartyInviteToken(input.partyInviteToken);
      return existing
        ? { state: existing.status === "active" ? "already-active" : "terminal", session: existing }
        : { state: "blocked" };
    }
  }

  async submitActionForTelegramUser(input: {
    telegramUserId: bigint;
    partyInviteToken: string;
    turn: number;
    action: GroupCombatAction["action"];
    targetKind: GroupCombatAction["targetKind"];
    targetId: string;
    payloadKey?: string;
    now: Date;
    nextTurnExpiresAt: Date;
  }): Promise<GroupCombatActionResult> {
    await this.settlementTestHooks?.beforeRuntimeRead?.({
      operation: "action",
      partyInviteToken: input.partyInviteToken
    });
    for (let attempt = 0; attempt < MAX_MUTATION_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
      const actor = await tx.character.findFirst({
        where: { user: { telegramUserId: input.telegramUserId } },
        select: { id: true }
      });
      if (!actor) {
        return { state: "no-character" } as const;
      }
      const row = await tx.groupCombatSession.findFirst({
        where: {
          partySession: { inviteToken: input.partyInviteToken },
          repairState: null
        },
        include: sessionInclude
      });
      if (!row) {
        return { state: "not-found" } as const;
      }
      if (!row.participants.some((participant) => participant.characterId === actor.id)) {
        return { state: "not-participant" } as const;
      }
      let state: GroupCombatState;
      try {
        state = parseRowState(row);
        if (state.status === "active") {
          await validateActiveOwnership(tx, row);
        }
      } catch (error) {
        if (!(error instanceof GroupCombatStateValidationError)) {
          throw error;
        }
        return actionResultAfterRepair(await repairMalformedSession(tx, row, input.now));
      }
      if (state.status !== "active") {
        const session = await loadSession(tx, row.id);
        return session ? { state: "terminal", session } : { state: "not-found" };
      }
      const action: GroupCombatAction = {
        actorCharacterId: actor.id,
        turn: input.turn,
        action: input.action,
        targetKind: input.targetKind,
        targetId: input.targetId,
        ...(input.payloadKey ? { payloadKey: input.payloadKey } : {}),
        origin: "manual"
      };
      const validation = validateGroupCombatAction(state, action);
      if (validation !== "ok") {
        return { state: validation };
      }

      const existingAction = await tx.groupCombatAction.findUnique({
        where: {
          sessionId_turn_actorCharacterId: {
            sessionId: row.id,
            turn: input.turn,
            actorCharacterId: actor.id
          }
        }
      });
      const writeState: "queued" | "replaced" | "duplicate" = existingAction
        ? existingAction.actionKey === input.action &&
          existingAction.targetKind === input.targetKind &&
          existingAction.targetId === input.targetId
          && existingAction.payloadKey === (input.payloadKey ?? null)
          ? "duplicate"
          : "replaced"
        : "queued";
      if (writeState === "duplicate") {
        const session = await loadSession(tx, row.id);
        return session ? { state: "duplicate", session } : { state: "not-found" };
      }
      const claimedRow = await claimActiveSessionMutation(tx, row);
      if (writeState === "queued") {
        await tx.groupCombatAction.create({
          data: {
            sessionId: row.id,
            actorCharacterId: actor.id,
            turn: input.turn,
            actionKey: input.action,
            targetKind: input.targetKind,
            targetId: input.targetId,
            payloadKey: input.payloadKey ?? null,
            origin: "manual",
            submittedAt: input.now
          }
        });
      } else if (writeState === "replaced") {
        const replaced = await tx.groupCombatAction.updateMany({
          where: {
            id: existingAction!.id,
            actionKey: existingAction!.actionKey,
            targetKind: existingAction!.targetKind,
            targetId: existingAction!.targetId,
            payloadKey: existingAction!.payloadKey,
            submittedAt: existingAction!.submittedAt,
            session: { repairState: null }
          },
          data: {
            actionKey: input.action,
            targetKind: input.targetKind,
            targetId: input.targetId,
            payloadKey: input.payloadKey ?? null,
            origin: "manual",
            submittedAt: input.now
          }
        });
        if (replaced.count !== 1) {
          throw new GroupCombatMutationConflict();
        }
      }
      const result = await resolveIfReady(tx, claimedRow, state, input.now, input.nextTurnExpiresAt);
      if (result) {
        return result;
      }
      const delivery = await tx.groupCombatSession.updateMany({
          where: {
            id: claimedRow.id,
            status: "active",
            turn: claimedRow.turn,
            version: claimedRow.version,
            repairState: null
          },
          data: {
            deliveryRevision: { increment: 1 },
            deliveryPending: true,
            deliveryAttemptedAt: null
          }
        });
      if (delivery.count !== 1) {
        throw new GroupCombatMutationConflict();
      }
      const session = await loadSession(tx, row.id);
      return session ? { state: writeState, session } : { state: "not-found" };
        });
      } catch (error) {
        if (error instanceof GroupCombatInventoryDrift) {
          return invalidateInventoryDrift(this.prisma, error.sessionId, input.now);
        }
        if (isUniqueConflict(error)) {
          const conflict = await this.classifyConcurrentAction(input);
          if (conflict) {
            return conflict;
          }
          continue;
        }
        if (error instanceof GroupCombatMutationConflict || isTransactionWriteConflict(error)) {
          continue;
        }
        throw error;
      }
    }
    const current = await this.findByPartyInviteToken(input.partyInviteToken);
    if (!current) {
      return { state: "not-found" };
    }
    return current.status === "active" ? { state: "stale" } : { state: "terminal", session: current };
  }

  private async classifyConcurrentAction(input: {
    telegramUserId: bigint;
    partyInviteToken: string;
    turn: number;
    action: GroupCombatAction["action"];
    targetKind: GroupCombatAction["targetKind"];
    targetId: string;
    payloadKey?: string;
  }): Promise<GroupCombatActionResult | null> {
    const session = await this.findByPartyInviteToken(input.partyInviteToken);
    if (!session) {
      return { state: "not-found" };
    }
    if (session.status !== "active") {
      return { state: "terminal", session };
    }
    if (session.turn !== input.turn) {
      return { state: "stale" };
    }
    const actor = session.participants.find((participant) => participant.telegramUserId === input.telegramUserId);
    if (!actor) {
      return { state: "not-participant" };
    }
    const winner = await this.prisma.groupCombatAction.findUnique({
      where: {
        sessionId_turn_actorCharacterId: {
          sessionId: session.id,
          turn: input.turn,
          actorCharacterId: actor.characterId
        }
      }
    });
    if (!winner) {
      return null;
    }
    return winner.actionKey === input.action &&
      winner.targetKind === input.targetKind &&
      winner.targetId === input.targetId &&
      winner.payloadKey === (input.payloadKey ?? null)
      ? { state: "duplicate", session }
      : null;
  }

  async resolveTimedOutSession(input: {
    sessionId: string;
    now: Date;
    nextTurnExpiresAt: Date;
  }): Promise<GroupCombatActionResult> {
    await this.settlementTestHooks?.beforeRuntimeRead?.({
      operation: "timeout",
      sessionId: input.sessionId
    });
    for (let attempt = 0; attempt < MAX_MUTATION_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
        const row = await tx.groupCombatSession.findFirst({
          where: { id: input.sessionId, repairState: null },
          include: sessionInclude
        });
        if (!row) {
          return { state: "not-found" } as const;
        }
        if (row.status !== "active" || row.turnExpiresAt > input.now) {
          try {
            const session = await loadSession(tx, row.id);
            return session ? { state: row.status === "active" ? "stale" : "terminal", session } : { state: "not-found" };
          } catch (error) {
            if (!(error instanceof GroupCombatStateValidationError)) {
              throw error;
            }
            return actionResultAfterRepair(await repairMalformedSession(tx, row, input.now));
          }
        }
        let state: GroupCombatState;
        try {
          state = parseRowState(row);
          await validateActiveOwnership(tx, row);
        } catch (error) {
          if (!(error instanceof GroupCombatStateValidationError)) {
            throw error;
          }
          return actionResultAfterRepair(await repairMalformedSession(tx, row, input.now));
        }
        const existing = await tx.groupCombatAction.findMany({
          where: { sessionId: row.id, turn: row.turn },
          orderBy: [{ submittedAt: "asc" }, { id: "asc" }]
        });
        let submitted: Set<string>;
        try {
          submitted = new Set(validatePersistedActions(state, existing).map((action) => action.actorCharacterId));
        } catch (error) {
          if (!(error instanceof GroupCombatStateValidationError)) {
            throw error;
          }
          return actionResultAfterRepair(await repairMalformedSession(tx, row, input.now));
        }
        const claimedRow = await claimActiveSessionMutation(tx, row);
        const missing = state.participants.filter((participant) => participant.hp > 0 && !submitted.has(participant.characterId));
        if (missing.length > 0) {
          await tx.groupCombatAction.createMany({
            data: missing.map((participant) => {
              const action = buildGroupCombatTimeoutAction(state, participant.characterId);
              return {
                sessionId: row.id,
                actorCharacterId: participant.characterId,
                turn: row.turn,
                actionKey: action.action,
                targetKind: action.targetKind,
                targetId: action.targetId,
                origin: action.origin,
                submittedAt: input.now
              };
            })
          });
        }
        const result = await resolveIfReady(tx, claimedRow, state, input.now, input.nextTurnExpiresAt);
        if (!result) {
          throw new GroupCombatMutationConflict();
        }
        return result;
        });
      } catch (error) {
        if (error instanceof GroupCombatInventoryDrift) {
          return invalidateInventoryDrift(this.prisma, error.sessionId, input.now);
        }
        if (error instanceof GroupCombatMutationConflict || isUniqueConflict(error) || isTransactionWriteConflict(error)) {
          continue;
        }
        throw error;
      }
    }
    const current = await loadSession(this.prisma, input.sessionId);
    return current
      ? { state: current.status === "active" ? "stale" : "terminal", session: current }
      : { state: "not-found" };
  }

  async findByPartyInviteToken(partyInviteToken: string): Promise<GroupCombatSessionRecord | null> {
    const row = await this.prisma.groupCombatSession.findFirst({
      where: { partySession: { inviteToken: partyInviteToken }, repairState: null },
      select: { id: true }
    });
    return row ? loadSession(this.prisma, row.id) : null;
  }

  findById(sessionId: string): Promise<GroupCombatSessionRecord | null> {
    return loadSession(this.prisma, sessionId);
  }

  async findActiveByTelegramUserId(telegramUserId: bigint): Promise<GroupCombatSessionRecord | null> {
    const row = await this.prisma.groupCombatSession.findFirst({
      where: {
        status: "active",
        repairState: null,
        participants: { some: { character: { user: { telegramUserId } } } }
      },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      select: { id: true }
    });
    return row ? loadSession(this.prisma, row.id) : null;
  }

  async inspectOperatorRepair(sessionId: string): Promise<GroupCombatOperatorRepairRecord | null> {
    const row = await this.prisma.groupCombatSession.findFirst({
      where: { id: sessionId, repairState: "operator-required" },
      include: {
        actions: {
          orderBy: [{ turn: "asc" }, { submittedAt: "asc" }, { id: "asc" }]
        },
        participants: {
          orderBy: [{ rosterOrder: "asc" }, { id: "asc" }]
        }
      }
    });
    if (!row || !row.repairReason) {
      return null;
    }
    return {
      id: row.id,
      encounterKey: row.encounterKey,
      rulesVersion: row.rulesVersion,
      status: row.status,
      turn: row.turn,
      version: row.version,
      repairState: "operator-required",
      repairReason: row.repairReason,
      state: row.stateJson,
      result: row.resultJson,
      settlementPlan: row.settlementPlanJson,
      actions: row.actions.map((action) => ({
        actorCharacterId: action.actorCharacterId,
        turn: action.turn,
        actionKey: action.actionKey,
        targetKind: action.targetKind,
        targetId: action.targetId,
        payloadKey: action.payloadKey,
        origin: action.origin,
        submittedAt: action.submittedAt
      })),
      participants: row.participants.map((participant) => ({
        characterId: participant.characterId,
        remortCount: participant.remortCount,
        rosterOrder: participant.rosterOrder,
        snapshot: participant.snapshotJson,
        contribution: participant.contributionJson,
        settlementStatus: participant.settlementStatus,
        settlementAttempts: participant.settlementAttempts,
        settlementReceipt: participant.settlementReceiptJson
      }))
    };
  }

  async listDueSessionIds(now: Date, limit: number): Promise<string[]> {
    const rows = await this.prisma.groupCombatSession.findMany({
      where: { status: "active", repairState: null, turnExpiresAt: { lte: now } },
      orderBy: [{ turnExpiresAt: "asc" }, { id: "asc" }],
      take: Math.min(93, Math.max(1, Math.floor(limit))),
      select: { id: true }
    });
    return rows.map((row) => row.id);
  }

  async listPendingDeliverySessionIds(limit: number): Promise<string[]> {
    const rows = await this.prisma.groupCombatSession.findMany({
      where: { deliveryPending: true, repairState: null },
      orderBy: [
        { deliveryAttemptedAt: "asc" },
        { updatedAt: "asc" },
        { id: "asc" }
      ],
      take: Math.min(93, Math.max(1, Math.floor(limit))),
      select: { id: true }
    });
    return rows.map((row) => row.id);
  }

  async listPendingSettlementParticipants(limit: number): Promise<Array<{
    sessionId: string;
    telegramUserId: bigint;
  }>> {
    const rows = await this.prisma.groupCombatParticipant.findMany({
      where: {
        settlementStatus: "pending",
        session: {
          status: { not: "active" },
          rulesVersion: GROUP_COMBAT_PRODUCTION_RULES_VERSION,
          repairState: null,
          settlementPlanJson: { not: Prisma.DbNull }
        }
      },
      orderBy: [{ session: { completedAt: "asc" } }, { rosterOrder: "asc" }, { id: "asc" }],
      take: Math.min(93, Math.max(1, Math.floor(limit))),
      select: {
        sessionId: true,
        character: { select: { user: { select: { telegramUserId: true } } } }
      }
    });
    return rows.map((row) => ({
      sessionId: row.sessionId,
      telegramUserId: row.character.user.telegramUserId
    }));
  }

  async repairInvalidOrOrphaned(now: Date, limit: number): Promise<number> {
    const boundedLimit = Math.min(93, Math.max(1, Math.floor(limit)));
    let repaired = 0;
    const sessionBatches = await Promise.all([
      this.prisma.groupCombatSession.findMany({
        where: { status: "active", repairState: null },
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
        take: boundedLimit,
        select: { id: true }
      }),
      this.prisma.groupCombatSession.findMany({
        where: {
          status: { not: "active" },
          repairState: null,
          OR: [
            { completedAt: null },
            { resultJson: { equals: Prisma.DbNull } }
          ]
        },
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
        take: boundedLimit,
        select: { id: true }
      }),
      this.prisma.groupCombatSession.findMany({
        where: {
          status: { not: "active" },
          repairState: null,
          terminalIntegrityCheckedAt: null
        },
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
        take: boundedLimit,
        select: { id: true }
      }),
      listChangedSettlementReceiptSessionIds(this.prisma, boundedLimit)
    ]);
    const sessions = [...new Map(sessionBatches.flat().map((row) => [row.id, row])).values()];
    for (const candidate of sessions) {
      const outcome = await this.prisma.$transaction(async (tx) => {
        const session = await tx.groupCombatSession.findFirst({
          where: { id: candidate.id, repairState: null },
          include: sessionInclude
        });
        if (!session) {
          return "unchanged" as const;
        }
        try {
          const state = parseRowState(session);
          if (state.status === "active") {
            await validateActiveOwnership(tx, session);
            const actions = await tx.groupCombatAction.findMany({
              where: { sessionId: session.id, turn: session.turn },
              orderBy: [{ submittedAt: "asc" }, { id: "asc" }]
            });
            validatePersistedActions(state, actions);
            return "unchanged" as const;
          }
          const validated = await tx.groupCombatSession.updateMany({
            where: {
              id: session.id,
              status: session.status,
              version: session.version,
              terminalIntegrityCheckedAt: session.terminalIntegrityCheckedAt,
              repairState: null
            },
            data: { terminalIntegrityCheckedAt: now }
          });
          return validated.count === 1 ? "validated" as const : "unchanged" as const;
        } catch (error) {
          if (!(error instanceof GroupCombatStateValidationError)) {
            throw error;
          }
          return repairMalformedSession(tx, session, now);
        }
      });
      repaired += outcome === "invalidated" ||
        outcome === "terminal-repaired" ||
        outcome === "operator-repair-required"
        ? 1
        : 0;
    }

    const leaseCandidates = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT leases."id"
      FROM "active_combat_leases" AS leases
      LEFT JOIN "group_combat_sessions" AS sessions
        ON sessions."id" = leases."reference_id"
      WHERE leases."kind" = ${GROUP_COMBAT_LEASE_KIND}
        AND (sessions."id" IS NULL OR sessions."repair_state" IS NULL)
      ORDER BY leases."updated_at" ASC, leases."id" ASC
      LIMIT ${boundedLimit}
    `);
    const unorderedLeases = await this.prisma.activeCombatLease.findMany({
      where: { id: { in: leaseCandidates.map((candidate) => candidate.id) } }
    });
    const leaseById = new Map(unorderedLeases.map((lease) => [lease.id, lease]));
    const leases = leaseCandidates.flatMap((candidate) => {
      const lease = leaseById.get(candidate.id);
      return lease ? [lease] : [];
    });
    for (const candidate of leases) {
      const didRepair = await this.prisma.$transaction(async (tx) => {
        const lease = await tx.activeCombatLease.findUnique({ where: { id: candidate.id } });
        if (!lease || lease.kind !== GROUP_COMBAT_LEASE_KIND) {
          return false;
        }
        const owner = await tx.groupCombatSession.findUnique({ where: { id: lease.referenceId }, include: sessionInclude });
        if (owner && owner.repairState !== null) {
          return false;
        }
        if (owner?.status === "active") {
          if (owner.participants.some((participant) => participant.characterId === lease.characterId)) {
            return false;
          }
          return (await invalidateSessionRewardlessly(tx, owner, now)) === "invalidated";
        }
        if (
          owner?.rulesVersion === GROUP_COMBAT_PRODUCTION_RULES_VERSION &&
          owner.participants.some((participant) => (
            participant.characterId === lease.characterId &&
            participant.settlementStatus === "pending"
          ))
        ) {
          return false;
        }
        await releaseGroupCombatLease(tx, lease, now);
        return true;
      });
      repaired += didRepair ? 1 : 0;
    }
    return repaired;
  }

  async settleParticipant(input: {
    sessionId: string;
    telegramUserId: bigint;
    now: Date;
  }) {
    await this.settlementTestHooks?.beforeRuntimeRead?.({
      operation: "settlement",
      sessionId: input.sessionId
    });
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.groupCombatSession.findFirst({
        where: { id: input.sessionId, repairState: null },
        include: sessionInclude
      });
      if (!row) {
        return { state: "not-found" } as const;
      }
      const participant = row.participants.find(
        (candidate) => candidate.character.user.telegramUserId === input.telegramUserId
      );
      if (!participant) {
        return { state: "not-participant" } as const;
      }
      if (row.status === "active" || row.settlementPlanJson === null) {
        return { state: "not-terminal" } as const;
      }
      let state: GroupCombatState;
      let plan: GroupCombatSettlementPlan;
      try {
        state = parseRowState(row);
        plan = parseGroupCombatSettlementPlanStrict(row.settlementPlanJson);
      } catch {
        await repairMalformedSession(tx, row, input.now);
        return { state: "invalid-plan" } as const;
      }
      if (participant.settlementReceiptJson !== null) {
        return replayValidatedReceipt(
          plan,
          participant.characterId,
          participant.settlementReceiptJson
        );
      }
      const receipt = buildGroupCombatSettlementReceipt(plan, participant.characterId);
      if (!receipt) {
        return { state: "invalid-plan" } as const;
      }
      const frozenParticipant = state.participants.find(
        (candidate) => candidate.characterId === participant.characterId
      );
      let character: PartyCharacterRow | null = null;
      let lease: Prisma.ActiveCombatLeaseGetPayload<Record<string, never>> | null = null;
      if (plan.policy === "left-passage-party") {
        character = await tx.character.findUnique({
          where: { id: participant.characterId },
          include: partyCharacterInclude
        });
        lease = await tx.activeCombatLease.findFirst({
          where: {
            characterId: participant.characterId,
            kind: GROUP_COMBAT_LEASE_KIND,
            referenceId: row.id
          }
        });
        if (
          !character ||
          character._count.remorts !== participant.remortCount ||
          !receipt.resources ||
          !receipt.effects ||
          !frozenParticipant ||
          !lease
        ) {
          return { state: "invalid-plan" } as const;
        }
      }
      await this.runSettlementTestHook("validated", row.id, participant.characterId);
      const claimed = await tx.groupCombatParticipant.updateMany({
        where: {
          id: participant.id,
          settlementStatus: "pending",
          settlementAttempts: 0,
          settlementReceiptJson: { equals: Prisma.DbNull },
          session: { repairState: null }
        },
        data: {
          settlementAttempts: { increment: 1 }
        }
      });
      if (claimed.count !== 1) {
        const winner = await tx.groupCombatParticipant.findUnique({
          where: { id: participant.id },
          select: { settlementReceiptJson: true }
        });
        return winner?.settlementReceiptJson
          ? replayValidatedReceipt(plan, participant.characterId, winner.settlementReceiptJson)
          : { state: "invalid-plan" } as const;
      }
      await this.runSettlementTestHook("claimed", row.id, participant.characterId);
      if (
        plan.policy === "left-passage-party" &&
        character &&
        receipt.resources &&
        frozenParticipant
      ) {
        const xp = Math.max(0, character.xp + receipt.rewards.xp);
        const oldLevel = character.level;
        const level = Math.max(
          oldLevel,
          getLevelForXp(
            xp,
            participant.remortCount > 0 ? { remortCount: participant.remortCount } : {}
          )
        );
        const effectiveAfterReward = buildParticipantCombatStats(
          { ...character, xp, level },
          participant.remortCount
        );
        const hpCurrent = Math.min(receipt.resources.hp, effectiveAfterReward.hpMax);
        const manaCurrent = Math.min(
          receipt.resources.mana,
          effectiveAfterReward.manaMax
        );
        await tx.character.update({
          where: { id: character.id },
          data: {
            hpCurrent,
            manaCurrent,
            hpRegenAt: hpCurrent >= effectiveAfterReward.hpMax ? null : input.now,
            manaRegenAt: manaCurrent >= effectiveAfterReward.manaMax ? null : input.now,
            xp,
            level,
            gold: { increment: receipt.rewards.gold }
          }
        });
        await recordLevelMilestones(
          tx,
          character.id,
          oldLevel,
          level,
          input.now,
          { remortCount: participant.remortCount }
        );
        await this.runSettlementTestHook("resources", row.id, participant.characterId);
        for (const item of receipt.rewards.items) {
          await tx.characterItem.upsert({
            where: {
              characterId_itemId: {
                characterId: character.id,
                itemId: item.itemId
              }
            },
            create: {
              characterId: character.id,
              itemId: item.itemId,
              quantity: item.quantity
            },
            update: { quantity: { increment: item.quantity } }
          });
        }
        await this.runSettlementTestHook("items", row.id, participant.characterId);
        if (state.status === "won" && row.completedAt) {
          const discoveryAvailableAt = new Date(
            row.completedAt.getTime() +
              getLeftPassageTierTwoDiscoveryMinutes(state.deterministicSeed) *
                60_000
          );
          await tx.characterCooldown.upsert({
            where: {
              characterId_key: {
                characterId: character.id,
                key: LEFT_PASSAGE_TIER_TWO_DISCOVERY_COOLDOWN_KEY
              }
            },
            create: {
              characterId: character.id,
              key: LEFT_PASSAGE_TIER_TWO_DISCOVERY_COOLDOWN_KEY,
              availableAt: discoveryAvailableAt,
              resultJson: {
                kind: "left-passage-tier-two-discovery",
                groupCombatSessionId: row.id
              }
            },
            update: {
              availableAt: discoveryAvailableAt,
              resultJson: {
                kind: "left-passage-tier-two-discovery",
                groupCombatSessionId: row.id
              }
            }
          });
        }
        if (receipt.effects?.activityKey) {
          await tx.activityEvent.upsert({
            where: { dedupeKey: receipt.effects.activityKey },
            create: {
              eventType: "party.encounter_won",
              category: "combat",
              severity: "normal",
              visibility: "public",
              actorCharacterId: character.id,
              actorDisplayName: character.name,
              relatedCharacterIds: plan.participants
                .filter((entry) => entry.contribution.committedActions > 0)
                .map((entry) => entry.characterId),
              subjectKind: "left-passage-encounter",
              subjectId: row.id,
              sourceType: GROUP_COMBAT_LEFT_PASSAGE_ENCOUNTER_KEY,
              sourceId: row.id,
              dedupeKey: receipt.effects.activityKey,
              payloadJson: {
                participantCount: plan.participants.filter(
                  (entry) => entry.contribution.committedActions > 0
                ).length,
                outcome: plan.outcome
              },
              occurredAt: input.now
            },
            update: {}
          });
        }
        await this.runSettlementTestHook("activity", row.id, participant.characterId);
      }
      const completed = await tx.groupCombatParticipant.updateMany({
        where: {
          id: participant.id,
          settlementStatus: "pending",
          settlementAttempts: 1,
          settlementReceiptJson: { equals: Prisma.DbNull },
          session: { repairState: null }
        },
        data: {
          settlementStatus: "completed",
          settlementReceiptJson: receipt as unknown as Prisma.InputJsonValue,
          settledAt: input.now
        }
      });
      if (completed.count !== 1) {
        throw new GroupCombatMutationConflict();
      }
      await this.runSettlementTestHook("receipt", row.id, participant.characterId);
      if (plan.policy === "left-passage-party" && lease) {
        await releaseGroupCombatLease(tx, lease, input.now);
        await this.runSettlementTestHook("lease", row.id, participant.characterId);
      }
      return {
        state: "settled",
        receipt,
        ...(plan.policy === "left-passage-party" && character
          ? {
              levelChange: {
                oldLevel: character.level,
                newLevel: Math.max(
                  character.level,
                  getLevelForXp(
                    Math.max(0, character.xp + receipt.rewards.xp),
                    participant.remortCount > 0 ? { remortCount: participant.remortCount } : {}
                  )
                ),
                leveledUp: getLevelForXp(
                  Math.max(0, character.xp + receipt.rewards.xp),
                  participant.remortCount > 0 ? { remortCount: participant.remortCount } : {}
                ) > character.level
              }
            }
          : {})
      } as const;
    });
  }

  private runSettlementTestHook(
    stage: GroupCombatSettlementStage,
    sessionId: string,
    characterId: string
  ): void | Promise<void> {
    return this.settlementTestHooks?.afterStage?.({ stage, sessionId, characterId });
  }

  async compareAndSetParticipantCard(input: {
    sessionId: string;
    telegramUserId: bigint;
    expectedReferenceVersion: number;
    chatId: bigint;
    messageId: number;
  }): Promise<boolean> {
    if (input.chatId !== input.telegramUserId) {
      return false;
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.groupCombatParticipant.updateMany({
        where: {
          sessionId: input.sessionId,
          referenceVersion: input.expectedReferenceVersion,
          session: { repairState: null },
          character: { user: { telegramUserId: input.telegramUserId } }
        },
        data: {
          chatId: input.chatId,
          messageId: input.messageId,
          referenceVersion: { increment: 1 },
          deliveredRevision: 0
        }
      });
      if (updated.count === 1) {
        await tx.groupCombatSession.updateMany({
          where: { id: input.sessionId, repairState: null },
          data: { deliveryPending: true, deliveryAttemptedAt: null }
        });
      }
      return updated.count === 1;
    });
  }

  async releaseParticipantCard(input: {
    sessionId: string;
    telegramUserId: bigint;
    expectedReferenceVersion: number;
    chatId: bigint;
    messageId: number;
  }): Promise<boolean> {
    if (input.chatId !== input.telegramUserId) {
      return false;
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.groupCombatParticipant.updateMany({
        where: {
          sessionId: input.sessionId,
          referenceVersion: input.expectedReferenceVersion,
          session: { repairState: null },
          chatId: input.chatId,
          messageId: input.messageId,
          character: { user: { telegramUserId: input.telegramUserId } }
        },
        data: {
          chatId: null,
          messageId: null,
          referenceVersion: { increment: 1 },
          deliveredRevision: 0
        }
      });
      if (updated.count === 1) {
        await tx.groupCombatSession.updateMany({
          where: { id: input.sessionId, repairState: null },
          data: { deliveryPending: true, deliveryAttemptedAt: null }
        });
      }
      return updated.count === 1;
    });
  }

  async markParticipantCardDelivered(input: {
    sessionId: string;
    telegramUserId: bigint;
    expectedDeliveryRevision: number;
    expectedReferenceVersion: number;
    chatId: bigint;
    messageId: number;
  }): Promise<boolean> {
    if (input.chatId !== input.telegramUserId) {
      return false;
    }
    const updated = await this.prisma.groupCombatParticipant.updateMany({
      where: {
        sessionId: input.sessionId,
        referenceVersion: input.expectedReferenceVersion,
        chatId: input.chatId,
        messageId: input.messageId,
        deliveredRevision: { lt: input.expectedDeliveryRevision },
        session: { deliveryRevision: input.expectedDeliveryRevision, repairState: null },
        character: { user: { telegramUserId: input.telegramUserId } }
      },
      data: { deliveredRevision: input.expectedDeliveryRevision }
    });
    return updated.count === 1;
  }

  async finalizeDeliveryAttempt(input: {
    sessionId: string;
    expectedDeliveryRevision: number;
    attemptedAt: Date;
  }): Promise<boolean> {
    await this.settlementTestHooks?.beforeRuntimeRead?.({
      operation: "delivery",
      sessionId: input.sessionId
    });
    return this.prisma.$transaction(async (tx) => {
      const session = await tx.groupCombatSession.findFirst({
        where: { id: input.sessionId, repairState: null },
        select: {
          deliveryRevision: true,
          participants: { select: { deliveredRevision: true } }
        }
      });
      if (
        !session ||
        session.deliveryRevision !== input.expectedDeliveryRevision
      ) {
        return false;
      }
      const complete = session.participants.every(
        (participant) => participant.deliveredRevision >= input.expectedDeliveryRevision
      );
      const updated = await tx.groupCombatSession.updateMany({
        where: {
          id: input.sessionId,
          deliveryRevision: input.expectedDeliveryRevision,
          repairState: null,
          deliveryPending: true
        },
        data: complete
          ? { deliveryPending: false }
          : { deliveryAttemptedAt: input.attemptedAt }
      });
      return updated.count === 1;
    });
  }
}

async function buildLeftPassageState(input: {
  tx: TxClient;
  sessionId: string;
  partySessionId: string;
  reservation: LeftPassageReservationRow;
  frozen: FrozenParticipantPayload[];
  now: Date;
}): Promise<GroupCombatState> {
  const primaryBase = monsters.find((monster) => monster.id === input.reservation.monsterId);
  if (!primaryBase) {
    throw new GroupCombatStateValidationError("Reserved left-passage monster no longer exists.");
  }
  const primary = { ...primaryBase, level: input.reservation.effectiveMonsterLevel };
  const primaryStats = deriveMonsterCombatStats(primary);
  const lifeClauses = input.frozen.map(({ actor }) => Prisma.sql`
    (
      session.character_id = ${actor.characterId}
      AND (
        CAST(json_extract(session.state_json, '$.life.remortCount') AS INTEGER) = ${actor.remortCount}
        OR (
          json_type(session.state_json, '$.life.remortCount') IS NULL
          AND ${actor.remortCount} = 0
        )
      )
    )
  `);
  const lifeRows = await input.tx.$queryRaw<Array<{ id: string; characterId: string }>>(Prisma.sql`
    SELECT ranked.id, ranked.character_id AS characterId
    FROM (
      SELECT
        session.id,
        session.character_id,
        ROW_NUMBER() OVER (
          PARTITION BY session.character_id
          ORDER BY session.updated_at DESC, session.id DESC
        ) AS history_rank
      FROM solo_combat_sessions AS session
      WHERE session.status <> 'active'
        AND (${Prisma.join(lifeClauses, " OR ")})
    ) AS ranked
    WHERE ranked.history_rank <= ${THREAT_ESCALATION_HISTORY_LIMIT}
  `);
  const historyRows = await input.tx.soloCombatSession.findMany({
    where: { id: { in: lifeRows.map((row) => row.id) } },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }]
  });
  const lifeIdsByCharacter = new Map<string, Set<string>>();
  for (const row of lifeRows) {
    const ids = lifeIdsByCharacter.get(row.characterId) ?? new Set<string>();
    ids.add(row.id);
    lifeIdsByCharacter.set(row.characterId, ids);
  }
  const threatParticipants = input.frozen.map(({ actor }) => {
    const lifeIds = lifeIdsByCharacter.get(actor.characterId) ?? new Set<string>();
    const rows = historyRows.filter((row) => lifeIds.has(row.id));
    const history = rows.flatMap((row): SoloCombatSessionCompletionRecord[] => {
      const session = mapSoloCombatSessionRecord(row);
      if (!session || session.status === "active") {
        return [];
      }
      return [{
        monsterId: session.monsterId,
        status: session.status,
        state: session.state,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        completedAt: session.state?.completedAt
          ? new Date(session.state.completedAt)
          : session.updatedAt
      }];
    });
    const decision = decideThreatEscalation(
      history.map(toThreatEscalationHistoryEntry),
      { remortCount: actor.remortCount }
    );
    return {
      characterId: actor.characterId,
      rosterOrder: actor.rosterOrder,
      remortCount: actor.remortCount,
      decision: {
        ...decision,
        secondEnemyLevelBonus: decision.enemyCount === 2
          ? decision.secondEnemyLevelBonus
          : 0
      }
    };
  });
  const threatSource = selectStrongestLeftPassageThreatSource(threatParticipants);
  const remortSource = selectStrongestLeftPassageRemortSource(
    input.frozen.map(({ actor }) => ({
      characterId: actor.characterId,
      rosterOrder: actor.rosterOrder,
      remortCount: actor.remortCount
    }))
  );
  const characterSummary = input.frozen[0]?.summary;
  if (!characterSummary) {
    throw new GroupCombatStateValidationError("Left-passage combat has no frozen participant summary.");
  }
  const difficulty = getPersistentFightDifficultyConfig("hard");
  const enemyCount = deriveLeftPassageEnemyCount({
    participants: input.frozen.map(({ actor }) => actor),
    threatParticipants,
    primaryEffectiveMonsterLevel: input.reservation.effectiveMonsterLevel
  });
  const rng = new SeededRandomSource(`${input.reservation.seedHash}:${input.partySessionId}:backups`);
  const primaryAbilityIds = createMonsterAbilityRuntime({
    monster: primaryStats,
    seed: `${input.reservation.seedHash}:${input.partySessionId}:enemy:0`
  })?.loadoutIds ?? [];
  const supportedPrimaryAbilityIds =
    filterSupportedGroupCombatMonsterAbilityIds(primaryAbilityIds);
  const enemies = [{
    id: `primary:${input.reservation.id}`,
    monsterId: primary.id,
    name: primary.name,
    order: 0,
    level: primary.level,
    hp: primaryStats.hpMax,
    hpMax: primaryStats.hpMax,
    attack: primaryStats.attack,
    defense: Math.max(primaryStats.armor, primaryStats.resist),
    ...(supportedPrimaryAbilityIds.length > 0
      ? { abilityIds: supportedPrimaryAbilityIds }
      : {})
  }];
  const backupAdjustments: Array<{
    enemyId: string;
    remortCount: number;
    hpMaxAdded: number;
    attackAdded: number;
  }> = [];
  let appliedSecondEnemyLevelBonus = 0;
  let boostedEnemyId: string | null = null;
  const usedMonsterIds = [primary.id];
  for (let index = 1; index < enemyCount; index += 1) {
    const base = selectSoloFightMonster(characterSummary, rng, difficulty, usedMonsterIds);
    let selected = applyPersistentFightDifficulty(base, characterSummary, difficulty);
    if (index === 1 && threatSource.decision.enemyCount === 2) {
      const boosted = applyThreatSecondEnemyLevelBonus({
        baseMonster: base,
        monster: selected,
        requestedLevelBonus: threatSource.decision.secondEnemyLevelBonus
      });
      selected = boosted.monster;
      appliedSecondEnemyLevelBonus = boosted.appliedLevelBonus;
    }
    usedMonsterIds.push(selected.id);
    const baseline = deriveMonsterCombatStats(selected);
    const pressured = deriveMonsterCombatStats(selected, {
      remortCount: remortSource.remortCount,
      remortPressureMode: "multi"
    });
    const enemyId = `backup:${index}:${selected.id}`;
    const abilityIds = filterSupportedGroupCombatMonsterAbilityIds(createMonsterAbilityRuntime({
      monster: pressured,
      seed: `${input.reservation.seedHash}:${input.partySessionId}:enemy:${index}`
    })?.loadoutIds ?? []);
    if (index === 1 && threatSource.decision.enemyCount === 2) {
      boostedEnemyId = enemyId;
    }
    enemies.push({
      id: enemyId,
      monsterId: selected.id,
      name: selected.name,
      order: index,
      level: selected.level,
      hp: pressured.hpMax,
      hpMax: pressured.hpMax,
      attack: pressured.attack,
      defense: Math.max(pressured.armor, pressured.resist),
      ...(abilityIds.length > 0 ? { abilityIds } : {})
    });
    backupAdjustments.push({
      enemyId,
      remortCount: remortSource.remortCount,
      hpMaxAdded: pressured.hpMax - baseline.hpMax,
      attackAdded: pressured.attack - baseline.attack
    });
  }
  const rewardBudget = buildLeftPassageEncounterRewardBudget({
    participantLevels: input.frozen.map((row) => row.actor.level),
    enemies: enemies.map((enemy) => ({
      baseLevel: enemy.id.startsWith("primary:")
        ? input.reservation.baseMonsterLevel
        : monsters.find((monster) => monster.id === enemy.monsterId)?.level ?? enemy.level ?? primary.level,
      effectiveLevel: enemy.level ?? primary.level
    })),
    deterministicKey: `${input.reservation.seedHash}:${input.partySessionId}:rewards`
  });
  return createLeftPassageGroupCombatState({
    sessionId: input.sessionId,
    partySessionId: input.partySessionId,
    deterministicSeed: stableGroupCombatSeed(`${input.partySessionId}:${input.reservation.seedHash}`),
    participants: input.frozen.map((row) => row.actor),
    enemies,
    difficulty: {
      version: 1,
      origin: LEFT_PASSAGE_PARTY_ORIGIN_KIND,
      locationId: input.reservation.originLocationId,
      encounterId: input.reservation.id,
      encounterToken: input.reservation.token,
      encounterSeed: input.reservation.seedHash,
      initiatingCharacterId: input.reservation.characterId,
      initiatingRemortCount: input.reservation.reservationRemortCount!,
      primaryMonsterId: input.reservation.monsterId,
      primaryBaseMonsterLevel: input.reservation.baseMonsterLevel,
      primaryEffectiveMonsterLevel: input.reservation.effectiveMonsterLevel,
      threat: {
        participants: threatParticipants.map((entry) => ({
          characterId: entry.characterId,
          rosterOrder: entry.rosterOrder,
          remortCount: entry.remortCount,
          decision: {
            enemyCount: entry.decision.enemyCount,
            reason: entry.decision.reason,
            eligibleWins: entry.decision.eligibleWins,
            secondEnemyLevelBonus: entry.decision.enemyCount === 2
              ? entry.decision.secondEnemyLevelBonus
              : 0
          }
        })),
        sourceCharacterId: threatSource.characterId,
        sourceRosterOrder: threatSource.rosterOrder,
        escalated: threatSource.decision.enemyCount === 2,
        requestedSecondEnemyLevelBonus: threatSource.decision.enemyCount === 2
          ? threatSource.decision.secondEnemyLevelBonus
          : 0,
        appliedSecondEnemyLevelBonus,
        boostedEnemyId,
        levelCap: 23
      },
      remort: {
        participants: input.frozen.map(({ actor }) => ({
          characterId: actor.characterId,
          rosterOrder: actor.rosterOrder,
          remortCount: actor.remortCount
        })),
        sourceCharacterId: remortSource.characterId,
        sourceRosterOrder: remortSource.rosterOrder,
        sourceRemortCount: remortSource.remortCount,
        backupAdjustments
      },
      rewards: {
        winXpTotal: rewardBudget.winXpTotal,
        winGoldTotal: rewardBudget.winGoldTotal,
        lossXpTotal: rewardBudget.lossXpTotal,
        lootVersion: 1
      }
    }
  });
}

function compareThreatSource(
  left: { rosterOrder: number; decision: ThreatEscalationDecision },
  right: { rosterOrder: number; decision: ThreatEscalationDecision }
): number {
  return right.decision.enemyCount - left.decision.enemyCount ||
    (right.decision.enemyCount === 2 ? right.decision.secondEnemyLevelBonus : 0) -
      (left.decision.enemyCount === 2 ? left.decision.secondEnemyLevelBonus : 0) ||
    right.decision.eligibleWins - left.decision.eligibleWins ||
    left.rosterOrder - right.rosterOrder;
}

export function selectStrongestLeftPassageThreatSource<T extends {
  rosterOrder: number;
  decision: ThreatEscalationDecision;
}>(participants: readonly T[]): T {
  const source = [...participants].sort(compareThreatSource)[0];
  if (!source) {
    throw new GroupCombatStateValidationError("Left-passage combat has no threat source.");
  }
  return source;
}

export function selectStrongestLeftPassageRemortSource<T extends {
  rosterOrder: number;
  remortCount: number;
}>(participants: readonly T[]): T {
  const source = [...participants]
    .sort((left, right) => right.remortCount - left.remortCount || left.rosterOrder - right.rosterOrder)[0];
  if (!source) {
    throw new GroupCombatStateValidationError("Left-passage combat has no remort source.");
  }
  return source;
}

async function resolveIfReady(
  tx: TxClient,
  row: SessionRow,
  state: GroupCombatState,
  now: Date,
  nextTurnExpiresAt: Date
): Promise<GroupCombatActionResult | null> {
  const livingCount = state.participants.filter((participant) => participant.hp > 0).length;
  const actionRows = await tx.groupCombatAction.findMany({
    where: { sessionId: row.id, turn: row.turn },
    orderBy: [{ submittedAt: "asc" }, { id: "asc" }]
  });
  let actions: GroupCombatQueuedActionRecord[];
  try {
    actions = validatePersistedActions(state, actionRows);
  } catch (error) {
    if (!(error instanceof GroupCombatStateValidationError)) {
      throw error;
    }
    return actionResultAfterRepair(await repairMalformedSession(tx, row, now));
  }
  if (actions.length < livingCount) {
    return null;
  }
  const livingIds = new Set(
    state.participants.filter((participant) => participant.hp > 0).map((participant) => participant.characterId)
  );
  const actionIds = new Set(actions.map((action) => action.actorCharacterId));
  if (actions.length !== livingCount || actionIds.size !== livingCount || [...livingIds].some((id) => !actionIds.has(id))) {
    return actionResultAfterRepair(await repairMalformedSession(tx, row, now));
  }
  const resolution = resolveGroupCombatTurn(state, actions);
  const terminal = resolution.result !== null;
  await consumeCommittedItems(tx, row.id, resolution.committedConsumables);
  const updated = await tx.groupCombatSession.updateMany({
    where: {
      id: row.id,
      status: "active",
      turn: row.turn,
      version: row.version,
      repairState: null
    },
    data: {
      status: resolution.state.status,
      turn: resolution.state.turn,
      version: { increment: 1 },
      deliveryRevision: { increment: 1 },
      deliveryPending: true,
      deliveryAttemptedAt: null,
      stateJson: resolution.state as unknown as Prisma.InputJsonValue,
      ...(resolution.result ? { resultJson: resolution.result as unknown as Prisma.InputJsonValue } : {}),
      ...(resolution.settlementPlan
        ? { settlementPlanJson: resolution.settlementPlan as unknown as Prisma.InputJsonValue }
        : {}),
      turnExpiresAt: terminal ? now : nextTurnExpiresAt,
      completedAt: terminal ? now : null
    }
  });
  if (updated.count !== 1) {
    throw new GroupCombatMutationConflict();
  }
  await updateContributions(tx, row.id, resolution.state.contributions);
  if (terminal) {
    if (resolution.settlementPlan?.policy === "rewardless-proof") {
      await releaseAllGroupCombatLeases(tx, row.id, now);
    }
    await completeParty(tx, row.partySessionId);
  }
  const session = await loadSession(tx, row.id);
  return session ? { state: terminal ? "terminal" : "resolved", session } : { state: "not-found" };
}

async function claimActiveSessionMutation(tx: TxClient, row: SessionRow): Promise<SessionRow> {
  const claimed = await tx.groupCombatSession.updateMany({
    where: {
      id: row.id,
      status: "active",
      turn: row.turn,
      version: row.version,
      repairState: null
    },
    data: { version: { increment: 1 } }
  });
  if (claimed.count !== 1) {
    throw new GroupCombatMutationConflict();
  }
  return { ...row, version: row.version + 1 };
}

type SessionRepairOutcome =
  | "unchanged"
  | "validated"
  | "invalidated"
  | "terminal-repaired"
  | "operator-repair-required";

async function listChangedSettlementReceiptSessionIds(
  prisma: PrismaClient,
  limit: number
): Promise<Array<{ id: string }>> {
  return prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT sessions."id" AS "id"
    FROM "group_combat_sessions" AS sessions
    INNER JOIN "group_combat_participants" AS participants
      ON participants."session_id" = sessions."id"
    WHERE sessions."repair_state" IS NULL
      AND sessions."rules_version" = ${GROUP_COMBAT_PRODUCTION_RULES_VERSION}
      AND sessions."status" <> 'active'
      AND participants."settlement_status" = 'completed'
      AND participants."updated_at" > sessions."updated_at"
    GROUP BY sessions."id"
    ORDER BY MIN(participants."updated_at") ASC, sessions."id" ASC
    LIMIT ${limit}
  `);
}

async function repairMalformedSession(tx: TxClient, row: SessionRow, now: Date): Promise<SessionRepairOutcome> {
  try {
    const state = parseRowStateCore(row);
    if (state.status !== "active") {
      if (
        state.rulesVersion === GROUP_COMBAT_PRODUCTION_RULES_VERSION &&
        row.participants.some((participant) => participant.settlementStatus === "completed")
      ) {
        return markProductionOperatorRepairRequired(
          tx,
          row,
          now,
          "terminal production artifacts include an already-completed participant"
        );
      }
      const result = buildCanonicalTerminalResult(state);
      const plan = buildGroupCombatSettlementPlan(state)!;
      const updated = await tx.groupCombatSession.updateMany({
        where: {
          id: row.id,
          status: row.status,
          version: row.version,
          repairState: null
        },
        data: {
          resultJson: result as unknown as Prisma.InputJsonValue,
          settlementPlanJson: plan as unknown as Prisma.InputJsonValue,
          completedAt: row.completedAt ?? now,
          version: { increment: 1 },
          deliveryRevision: { increment: 1 },
          deliveryPending: true,
          deliveryAttemptedAt: null,
          terminalIntegrityCheckedAt: null
        }
      });
      if (updated.count !== 1) {
        return "unchanged";
      }
      await rebuildTerminalParticipantArtifacts(tx, row, state, plan, now);
      if (plan.policy === "rewardless-proof") {
        await releaseAllGroupCombatLeases(tx, row.id, now);
      }
      await completeParty(tx, row.partySessionId);
      return "terminal-repaired";
    }
    if (state.rulesVersion === GROUP_COMBAT_PRODUCTION_RULES_VERSION) {
      return markProductionOperatorRepairRequired(
        tx,
        row,
        now,
        "active production state failed canonical ownership or action validation"
      );
    }
  } catch (error) {
    if (!(error instanceof GroupCombatStateValidationError)) {
      throw error;
    }
    if (row.rulesVersion === GROUP_COMBAT_PRODUCTION_RULES_VERSION) {
      return markProductionOperatorRepairRequired(
        tx,
        row,
        now,
        `production state cannot be recovered safely: ${error.message}`
      );
    }
  }
  return invalidateSessionRewardlessly(tx, row, now);
}

async function invalidateSessionRewardlessly(
  tx: TxClient,
  row: SessionRow,
  now: Date
): Promise<SessionRepairOutcome> {
  if (row.rulesVersion === GROUP_COMBAT_PRODUCTION_RULES_VERSION) {
    return markProductionOperatorRepairRequired(
      tx,
      row,
      now,
      "production state cannot be downgraded to rewardless repair"
    );
  }
  const repairRoster = selectInvalidRepairRoster(row);
  const state = buildInvalidFallbackState(row, repairRoster.preserved);
  const result = buildRewardlessResult("invalid", state.turn);
  const plan = buildGroupCombatSettlementPlan(state)!;
  const updated = await tx.groupCombatSession.updateMany({
    where: {
      id: row.id,
      status: row.status,
      version: row.version,
      repairState: null
    },
    data: {
      rulesVersion: GROUP_COMBAT_RULES_VERSION,
      encounterKey: GROUP_COMBAT_PROOF_ENCOUNTER_KEY,
      status: "invalid",
      turn: state.turn,
      version: { increment: 1 },
      deliveryRevision: { increment: 1 },
      deliveryPending: true,
      deliveryAttemptedAt: null,
      terminalIntegrityCheckedAt: null,
      stateJson: state as unknown as Prisma.InputJsonValue,
      resultJson: result as unknown as Prisma.InputJsonValue,
      settlementPlanJson: plan as unknown as Prisma.InputJsonValue,
      turnExpiresAt: now,
      completedAt: now
    }
  });
  if (updated.count !== 1) {
    return "unchanged";
  }
  if (repairRoster.discarded.length > 0) {
    await releaseAllGroupCombatLeases(tx, row.id, now);
    await tx.groupCombatParticipant.deleteMany({
      where: { id: { in: repairRoster.discarded.map((participant) => participant.id) } }
    });
  }
  await canonicalizeInvalidatedParticipantArtifacts(tx, repairRoster.preserved, state);
  const canonical = await tx.groupCombatSession.findUnique({
    where: { id: row.id },
    include: sessionInclude
  });
  if (!canonical) {
    throw new GroupCombatStateValidationError("Invalidated group combat disappeared before validation.");
  }
  parseRowState(canonical);
  const integrityChecked = await tx.groupCombatSession.updateMany({
    where: {
      id: row.id,
      status: "invalid",
      version: row.version + 1,
      terminalIntegrityCheckedAt: null,
      repairState: null
    },
    data: { terminalIntegrityCheckedAt: now }
  });
  if (integrityChecked.count !== 1) {
    throw new GroupCombatMutationConflict();
  }
  if (repairRoster.discarded.length === 0) {
    await releaseAllGroupCombatLeases(tx, row.id, now);
  }
  await completeParty(tx, row.partySessionId);
  return "invalidated";
}

async function markProductionOperatorRepairRequired(
  tx: TxClient,
  row: SessionRow,
  now: Date,
  reason: string
): Promise<SessionRepairOutcome> {
  const updated = await tx.groupCombatSession.updateMany({
    where: {
      id: row.id,
      version: row.version,
      rulesVersion: GROUP_COMBAT_PRODUCTION_RULES_VERSION,
      repairState: null
    },
    data: {
      repairState: "operator-required",
      repairReason: reason.slice(0, 587),
      terminalIntegrityCheckedAt: now,
      version: { increment: 1 }
    }
  });
  if (updated.count !== 1) {
    return "unchanged";
  }
  console.error("GroupCombat production repair requires operator disposition", {
    sessionId: row.id,
    reason
  });
  return "operator-repair-required";
}

function selectInvalidRepairRoster(row: SessionRow): {
  preserved: SessionRow["participants"];
  discarded: SessionRow["participants"];
} {
  const preserved: SessionRow["participants"] = [];
  const discarded: SessionRow["participants"] = [];
  for (const participant of row.participants) {
    if (preserved.length >= GROUP_COMBAT_REPAIR_PARTICIPANT_LIMIT) {
      discarded.push(participant);
      continue;
    }
    const candidate = [...preserved, participant];
    try {
      parseGroupCombatStateStrict(buildInvalidFallbackState(row, candidate), {
        sessionId: row.id,
        partySessionId: row.partySessionId
      });
      preserved.push(participant);
    } catch (error) {
      if (!(error instanceof GroupCombatStateValidationError)) {
        throw error;
      }
      discarded.push(participant);
    }
  }
  return { preserved, discarded };
}

function buildInvalidFallbackState(
  row: SessionRow,
  repairParticipants: SessionRow["participants"]
): GroupCombatState {
  const participants = repairParticipants.map((participant): GroupCombatActorSnapshot => ({
    characterId: participant.characterId,
    telegramUserId: participant.character.user.telegramUserId.toString(),
    name: participant.character.name.slice(0, 93) || "Невідомий пригодник",
    remortCount: participant.remortCount,
    rosterOrder: participant.rosterOrder,
    hp: Math.min(Math.max(0, participant.character.hpCurrent), Math.max(1, participant.character.hpMax)),
    hpMax: Math.max(1, participant.character.hpMax),
    mana: Math.min(Math.max(0, participant.character.manaCurrent), Math.max(0, participant.character.manaMax)),
    manaMax: Math.max(0, participant.character.manaMax),
    attack: 1,
    defense: 0,
    support: 1,
    classId: "class.unknown",
    raceId: "race.unknown",
    level: 1,
    stats: { strength: 1, dexterity: 1, intelligence: 1, charisma: 1, luck: 1 },
    equipmentItemIds: [],
    gearAbilityIds: [],
    combatItemQuantities: {},
    threat: 0
  }));
  return {
    rulesVersion: GROUP_COMBAT_RULES_VERSION,
    sessionId: row.id,
    partySessionId: row.partySessionId,
    encounterKey: GROUP_COMBAT_PROOF_ENCOUNTER_KEY,
    deterministicSeed: 0,
    status: "invalid",
    turn: Math.min(GROUP_COMBAT_TURN_LIMIT, Math.max(1, row.turn)),
    participants,
    enemies: [
      { id: "invalid-enemy-1", name: "Загублений запис", order: 0, hp: 0, hpMax: 1, attack: 1, defense: 0 },
      { id: "invalid-enemy-2", name: "Зайвий запис", order: 1, hp: 0, hpMax: 1, attack: 1, defense: 0 }
    ],
    contributions: participants.map((participant) => ({
      characterId: participant.characterId,
      damage: 0,
      healing: 0,
      guardPrevented: 0,
      control: 0,
      damageTaken: 0,
      committedActions: 0,
      guardedTurns: 0,
      specialActions: 0
    })),
    statuses: [],
    recap: []
  };
}

function buildRewardlessResult(
  outcome: Exclude<GroupCombatStatus, "active">,
  completedTurn: number
): GroupCombatResult {
  return {
    kind: "rewardless-proof",
    outcome,
    completedTurn,
    rewards: { xp: 0, gold: 0, items: [] }
  };
}

function actionResultAfterRepair(outcome: SessionRepairOutcome): GroupCombatActionResult {
  return { state: outcome === "invalidated" ? "invalidated" : "stale" };
}

async function validateActiveOwnership(tx: TxClient, row: SessionRow): Promise<void> {
  if (row.status !== "active") {
    throw new GroupCombatStateValidationError("Group-combat ownership exists for a non-active session.");
  }
  if (row.participants.some((participant) => participant.character._count.remorts !== participant.remortCount)) {
    throw new GroupCombatStateValidationError("Current character life does not match the group-combat roster.");
  }
  const participantIds = row.participants.map((participant) => participant.characterId);
  const participantIdSet = new Set(participantIds);
  const leases = await tx.activeCombatLease.findMany({
    where: {
      OR: [
        { characterId: { in: participantIds } },
        { kind: GROUP_COMBAT_LEASE_KIND, referenceId: row.id }
      ]
    }
  });
  for (const participantId of participantIds) {
    const lease = leases.find((candidate) => candidate.characterId === participantId);
    if (!lease || lease.kind !== GROUP_COMBAT_LEASE_KIND || lease.referenceId !== row.id) {
      throw new GroupCombatStateValidationError("Participant group-combat lease is missing or mismatched.");
    }
  }
  if (leases.some((lease) => (
    lease.kind === GROUP_COMBAT_LEASE_KIND &&
    lease.referenceId === row.id &&
    !participantIdSet.has(lease.characterId)
  ))) {
    throw new GroupCombatStateValidationError("Group-combat lease belongs to a non-participant.");
  }
}

function validatePersistedActions(
  state: GroupCombatState,
  rows: readonly PersistedActionRow[]
): GroupCombatQueuedActionRecord[] {
  return rows.map((row) => {
    const action = mapAction(row);
    if (validateGroupCombatAction(state, action) !== "ok") {
      throw new GroupCombatStateValidationError("Persisted group-combat action is not canonical for the current roster and turn.");
    }
    return action;
  });
}

async function releaseAllGroupCombatLeases(tx: TxClient, sessionId: string, now: Date): Promise<void> {
  const leases = await tx.activeCombatLease.findMany({
    where: { kind: GROUP_COMBAT_LEASE_KIND, referenceId: sessionId }
  });
  for (const lease of leases) {
    await releaseGroupCombatLease(tx, lease, now);
  }
}

async function releaseGroupCombatLease(
  tx: TxClient,
  lease: Prisma.ActiveCombatLeaseGetPayload<Record<string, never>>,
  now: Date
): Promise<void> {
  const participant = await tx.groupCombatParticipant.findFirst({
    where: { sessionId: lease.referenceId, characterId: lease.characterId },
    select: { snapshotJson: true }
  });
  const payload = readFrozenPayload(participant?.snapshotJson);
  const sated = parseVarenykSatedCombatState(payload?.sated);
  const inspiration = parseBardInspirationCombatState(payload?.inspiration);
  await releaseCombatLeaseWithTimedStatuses({
    tx,
    lease,
    releasedAt: now,
    ...(sated ? { sated } : {}),
    ...(inspiration ? { inspiration } : {})
  });
}

async function completeParty(tx: TxClient, partySessionId: string): Promise<void> {
  await tx.partySession.updateMany({
    where: { id: partySessionId, status: "active" },
    data: { status: "completed", activeLeaderKey: null, version: { increment: 1 } }
  });
  await tx.partyParticipant.updateMany({
    where: { sessionId: partySessionId, status: "joined" },
    data: { activeMembershipKey: null }
  });
}

async function updateContributions(tx: TxClient, sessionId: string, contributions: GroupCombatContribution[]): Promise<void> {
  for (const contribution of contributions) {
    await tx.groupCombatParticipant.updateMany({
      where: {
        sessionId,
        characterId: contribution.characterId,
        session: { repairState: null }
      },
      data: { contributionJson: contribution as unknown as Prisma.InputJsonValue }
    });
  }
}

async function canonicalizeInvalidatedParticipantArtifacts(
  tx: TxClient,
  participants: SessionRow["participants"],
  state: GroupCombatState
): Promise<void> {
  const contributions = new Map(state.contributions.map((contribution) => [contribution.characterId, contribution]));
  for (const participant of participants) {
    const contribution = contributions.get(participant.characterId);
    if (!contribution) {
      throw new GroupCombatStateValidationError("Invalidated participant is missing its contribution.");
    }
    await tx.groupCombatParticipant.update({
      where: { id: participant.id },
      data: {
        contributionJson: contribution as unknown as Prisma.InputJsonValue,
        settlementStatus: "pending",
        settlementAttempts: 0,
        settlementReceiptJson: Prisma.DbNull,
        settledAt: null
      }
    });
  }
}

async function rebuildTerminalParticipantArtifacts(
  tx: TxClient,
  row: SessionRow,
  state: GroupCombatState,
  plan: GroupCombatSettlementPlan,
  now: Date
): Promise<void> {
  const contributions = new Map(state.contributions.map((contribution) => [contribution.characterId, contribution]));
  for (const participant of row.participants) {
    const contribution = contributions.get(participant.characterId);
    if (!contribution) {
      throw new GroupCombatStateValidationError("Terminal participant is missing its contribution.");
    }
    const completed = participant.settlementStatus === "completed";
    const receipt = completed
      ? buildGroupCombatSettlementReceipt(plan, participant.characterId)
      : null;
    if (completed && !receipt) {
      throw new GroupCombatStateValidationError("Terminal participant is missing its plan entry.");
    }
    await tx.groupCombatParticipant.update({
      where: { id: participant.id },
      data: {
        contributionJson: contribution as unknown as Prisma.InputJsonValue,
        settlementStatus: completed ? "completed" : "pending",
        settlementAttempts: completed ? Math.max(1, participant.settlementAttempts) : 0,
        settlementReceiptJson: receipt
          ? receipt as unknown as Prisma.InputJsonValue
          : Prisma.DbNull,
        settledAt: completed ? participant.settledAt ?? now : null
      }
    });
  }
}

function replayValidatedReceipt(
  plan: GroupCombatSettlementPlan,
  characterId: string,
  value: unknown
): { state: "replayed"; receipt: ReturnType<typeof parseGroupCombatSettlementReceiptStrict> } |
  { state: "invalid-plan" } {
  try {
    const receipt = parseGroupCombatSettlementReceiptStrict(value);
    const expected = buildGroupCombatSettlementReceipt(plan, characterId);
    return expected && isDeepStrictEqual(receipt, expected)
      ? { state: "replayed", receipt }
      : { state: "invalid-plan" };
  } catch {
    return { state: "invalid-plan" };
  }
}

async function consumeCommittedItems(
  tx: TxClient,
  sessionId: string,
  items: readonly GroupCombatCommittedConsumable[]
): Promise<void> {
  if (items.length === 0) {
    return;
  }
  const required = new Map<string, GroupCombatCommittedConsumable & { quantity: number }>();
  for (const item of items) {
    const key = `${item.characterId}\0${item.itemId}`;
    const current = required.get(key);
    required.set(key, { ...item, quantity: (current?.quantity ?? 0) + 1 });
  }
  const rows = await tx.characterItem.findMany({
    where: {
      OR: [...required.values()].map((item) => ({
        characterId: item.characterId,
        itemId: item.itemId
      }))
    },
    select: { characterId: true, itemId: true, quantity: true }
  });
  if ([...required.values()].some((item) =>
    (rows.find((row) => row.characterId === item.characterId && row.itemId === item.itemId)?.quantity ?? 0) <
      item.quantity
  )) {
    throw new GroupCombatInventoryDrift(sessionId);
  }
  for (const item of required.values()) {
    const consumed = await tx.characterItem.updateMany({
      where: {
        characterId: item.characterId,
        itemId: item.itemId,
        quantity: { gte: item.quantity }
      },
      data: { quantity: { decrement: item.quantity } }
    });
    if (consumed.count !== 1) {
      throw new GroupCombatInventoryDrift(sessionId);
    }
    await tx.characterItem.deleteMany({
      where: {
        characterId: item.characterId,
        itemId: item.itemId,
        quantity: { lte: 0 }
      }
    });
  }
}

async function invalidateInventoryDrift(
  prisma: PrismaClient,
  sessionId: string,
  now: Date
): Promise<GroupCombatActionResult> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.groupCombatSession.findFirst({
      where: { id: sessionId, repairState: null },
      include: sessionInclude
    });
    if (!row) {
      return { state: "not-found" } as const;
    }
    if (row.status === "active") {
      const outcome = await invalidateSessionRewardlessly(tx, row, now);
      if (outcome === "invalidated") {
        const session = await loadSession(tx, row.id);
        return session ? { state: "invalidated", session } as const : { state: "not-found" } as const;
      }
    }
    const session = await loadSession(tx, row.id);
    return session ? { state: "terminal", session } as const : { state: "not-found" } as const;
  });
}

async function loadSession(
  client: TxClient | PrismaClient,
  sessionId: string
): Promise<GroupCombatSessionRecord | null> {
  const row = await client.groupCombatSession.findFirst({
    where: { id: sessionId, repairState: null },
    include: sessionInclude
  });
  if (!row) {
    return null;
  }
  const state = parseRowState(row);
  const actions = state.status === "active"
    ? await client.groupCombatAction.findMany({
        where: { sessionId: row.id, turn: row.turn },
        orderBy: [{ submittedAt: "asc" }, { id: "asc" }]
      })
    : [];
  const stillPublic = await client.groupCombatSession.findFirst({
    where: {
      id: row.id,
      version: row.version,
      repairState: null
    },
    select: { id: true }
  });
  if (!stillPublic) {
    return null;
  }
  return mapSession(row, state, validatePersistedActions(state, actions));
}

function mapSession(
  row: SessionRow,
  state: GroupCombatState,
  actions: GroupCombatQueuedActionRecord[]
): GroupCombatSessionRecord {
  return {
    id: row.id,
    partySessionId: row.partySessionId,
    partyInviteToken: row.partySession.inviteToken,
    status: state.status,
    turn: row.turn,
    version: row.version,
    deliveryRevision: row.deliveryRevision,
    deliveryPending: row.deliveryPending,
    deliveryAttemptedAt: row.deliveryAttemptedAt,
    state,
    result: row.resultJson === null ? null : parseGroupCombatResultStrict(row.resultJson),
    settlementPlan: row.settlementPlanJson === null
      ? null
      : parseGroupCombatSettlementPlanStrict(row.settlementPlanJson),
    turnExpiresAt: row.turnExpiresAt,
    completedAt: row.completedAt,
    participants: row.participants.map((participant): GroupCombatParticipantRecord => ({
      characterId: participant.characterId,
      telegramUserId: participant.character.user.telegramUserId,
      name: participant.character.name,
      currentLevel: participant.character.level,
      remortCount: participant.remortCount,
      rosterOrder: participant.rosterOrder,
      chatId: participant.chatId,
      messageId: participant.messageId,
      referenceVersion: participant.referenceVersion,
      deliveredRevision: participant.deliveredRevision
      ,
      settlementStatus: participant.settlementStatus === "completed" ? "completed" : "pending",
      settlementAttempts: participant.settlementAttempts,
      settlementReceipt: participant.settlementReceiptJson === null
        ? null
        : parseGroupCombatSettlementReceiptStrict(participant.settlementReceiptJson),
      settledAt: participant.settledAt
    })),
    queuedActions: actions
  };
}

function parseRowState(row: SessionRow): GroupCombatState {
  const state = parseRowStateCore(row);
  const terminal = state.status !== "active";
  if (!terminal) {
    if (row.resultJson !== null || row.settlementPlanJson !== null || row.completedAt !== null) {
      throw new GroupCombatStateValidationError("Active group combat has terminal result metadata.");
    }
    validateSettlementRows(row, state, null);
    return state;
  }
  if (row.resultJson === null || row.settlementPlanJson === null || row.completedAt === null) {
    throw new GroupCombatStateValidationError("Terminal group combat is missing result metadata.");
  }
  const result = parseGroupCombatResultStrict(row.resultJson);
  const expectedResult = buildCanonicalTerminalResult(state);
  if (!isDeepStrictEqual(result, expectedResult)) {
    throw new GroupCombatStateValidationError("Terminal group-combat result does not match state.");
  }
  const plan = parseGroupCombatSettlementPlanStrict(row.settlementPlanJson);
  const expectedPlan = buildGroupCombatSettlementPlan(state);
  if (!expectedPlan || !isDeepStrictEqual(plan, expectedPlan)) {
    throw new GroupCombatStateValidationError("Terminal group-combat settlement plan does not match state.");
  }
  validateSettlementRows(row, state, plan);
  return state;
}

function buildCanonicalTerminalResult(state: GroupCombatState): GroupCombatResult {
  const plan = buildGroupCombatSettlementPlan(state);
  if (!plan) {
    throw new GroupCombatStateValidationError("Active group combat has no terminal result.");
  }
  return {
    kind: plan.policy,
    outcome: plan.outcome,
    completedTurn: plan.completedTurn,
    rewards: plan.policy === "left-passage-party"
      ? sumGroupCombatSettlementRewards(plan.participants)
      : { xp: 0, gold: 0, items: [] }
  };
}

function parseRowStateCore(row: SessionRow): GroupCombatState {
  if (row.repairState !== null) {
    throw new GroupCombatStateValidationError("Group combat requires operator repair.");
  }
  const proof = row.rulesVersion === GROUP_COMBAT_RULES_VERSION &&
    row.encounterKey === GROUP_COMBAT_PROOF_ENCOUNTER_KEY;
  const leftPassage = row.rulesVersion === GROUP_COMBAT_PRODUCTION_RULES_VERSION &&
    row.encounterKey === GROUP_COMBAT_LEFT_PASSAGE_ENCOUNTER_KEY;
  if (!proof && !leftPassage) {
    throw new GroupCombatStateValidationError("Unknown group-combat rules or encounter version.");
  }
  const state = parseGroupCombatStateStrict(row.stateJson, {
    sessionId: row.id,
    partySessionId: row.partySessionId,
    turn: row.turn
  });
  if (!isGroupCombatStatus(row.status) || state.status !== row.status) {
    throw new GroupCombatStateValidationError("Stored group-combat status does not match state.");
  }
  if (
    state.rulesVersion !== row.rulesVersion ||
    state.encounterKey !== row.encounterKey
  ) {
    throw new GroupCombatStateValidationError("Stored group-combat identity does not match state.");
  }
  validateRelationalRoster(row, state);
  return state;
}

function validateRelationalRoster(row: SessionRow, state: GroupCombatState): void {
  if (row.participants.length !== state.participants.length) {
    throw new GroupCombatStateValidationError("Relational participant cardinality does not match state.");
  }
  const stateByCharacterId = new Map(state.participants.map((participant) => [participant.characterId, participant]));
  for (const participant of row.participants) {
    const actor = stateByCharacterId.get(participant.characterId);
    if (
      !actor ||
      actor.telegramUserId !== participant.character.user.telegramUserId.toString() ||
      actor.remortCount !== participant.remortCount ||
      actor.rosterOrder !== participant.rosterOrder
    ) {
      throw new GroupCombatStateValidationError("Relational participant identity does not match state.");
    }
  }
}

function validateSettlementRows(
  row: SessionRow,
  state: GroupCombatState,
  plan: GroupCombatSettlementPlan | null
): void {
  const contributions = new Map(state.contributions.map((contribution) => [contribution.characterId, contribution]));
  for (const participant of row.participants) {
    const contribution = contributions.get(participant.characterId);
    if (!contribution || !isDeepStrictEqual(participant.contributionJson, contribution)) {
      throw new GroupCombatStateValidationError("Relational contribution does not match terminal state.");
    }
    if (participant.settlementStatus === "pending") {
      if (
        participant.settlementAttempts !== 0
        || participant.settlementReceiptJson !== null
        || participant.settledAt !== null
      ) {
        throw new GroupCombatStateValidationError("Pending settlement row is not canonical.");
      }
      continue;
    }
    if (participant.settlementStatus !== "completed" || !plan) {
      throw new GroupCombatStateValidationError("Settlement status is invalid for group-combat state.");
    }
    if (
      participant.settlementAttempts < 1 ||
      participant.settlementReceiptJson === null ||
      participant.settledAt === null
    ) {
      throw new GroupCombatStateValidationError("Completed settlement row is missing receipt metadata.");
    }
    const expectedReceipt = buildGroupCombatSettlementReceipt(plan, participant.characterId);
    const receipt = parseGroupCombatSettlementReceiptStrict(participant.settlementReceiptJson);
    if (!expectedReceipt || !isDeepStrictEqual(receipt, expectedReceipt)) {
      throw new GroupCombatStateValidationError("Settlement receipt does not match its immutable plan entry.");
    }
  }
}

function isGroupCombatStatus(value: string): value is GroupCombatStatus {
  return value === "active" || value === "won" || value === "lost" || value === "invalid";
}

function isGroupCombatActionKey(value: string): value is GroupCombatAction["action"] {
  return value === "attack" ||
    value === "guard" ||
    value === "class" ||
    value === "race" ||
    value === "gear" ||
    value === "item";
}

function mapAction(row: PersistedActionRow): GroupCombatQueuedActionRecord {
  if (
    !isGroupCombatActionKey(row.actionKey) ||
    (row.targetKind !== "self" && row.targetKind !== "ally" && row.targetKind !== "enemy") ||
    (row.origin !== "manual" && row.origin !== "timeout") ||
    ((row.actionKey === "gear" || row.actionKey === "item") && !row.payloadKey) ||
    (row.actionKey !== "gear" && row.actionKey !== "item" && row.payloadKey !== null)
  ) {
    throw new GroupCombatStateValidationError("Malformed persisted group-combat action.");
  }
  return {
    actorCharacterId: row.actorCharacterId,
    turn: row.turn,
    action: row.actionKey,
    targetKind: row.targetKind,
    targetId: row.targetId,
    ...(row.payloadKey ? { payloadKey: row.payloadKey } : {}),
    origin: row.origin
  };
}

function readFrozenPayload(value: unknown): FrozenParticipantPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const actor = (value as Record<string, unknown>).actor;
  if (!actor || typeof actor !== "object" || Array.isArray(actor)) {
    return null;
  }
  return value as unknown as FrozenParticipantPayload;
}

function isReadyPartyParticipantSnapshot(value: unknown): boolean {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).raidReadiness === "ready"
  );
}

function isUniqueConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function isTransactionWriteConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}
