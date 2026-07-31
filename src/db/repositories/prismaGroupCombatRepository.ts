import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { Prisma, type PrismaClient } from "@prisma/client";
import {
  GROUP_COMBAT_EXIT_NAVIGATION_LEASE_KIND,
  GROUP_COMBAT_LEASE_KIND
} from "../../domain/combat/combatLeaseRegistry";
import {
  createLeftPassageGroupCombatState,
  buildGroupCombatFleeExitReceipt,
  buildGroupCombatTimeoutAction,
  buildGroupCombatSettlementPlan,
  buildGroupCombatSettlementReceipt,
  buildLeftPassageEncounterRewardBudget,
  createGroupCombatProofState,
  deriveLeftPassageEnemyCount,
  GROUP_COMBAT_REPAIR_PARTICIPANT_LIMIT,
  GROUP_COMBAT_PROOF_ENCOUNTER_KEY,
  GROUP_COMBAT_LEFT_PASSAGE_ENCOUNTER_KEY,
  GROUP_COMBAT_PRODUCTION_RULES_VERSION,
  GROUP_COMBAT_RULES_VERSION,
  GROUP_COMBAT_SUPPORTED_ITEM_IDS,
  GROUP_COMBAT_TURN_LIMIT,
  getLeftPassageTierTwoDiscoveryMinutes,
  isGroupCombatManualRewardParticipant,
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
import {
  deriveGroupCombatProductionV1MonsterStats,
  findGroupCombatProductionV1Monster,
  getGroupCombatProductionV1BackupEffectiveLevel,
  resolveGroupCombatProductionV1MonsterAbilities,
  selectGroupCombatProductionV1BackupMonster
} from "../../domain/groupCombat/groupCombatProductionV1Resolver";
import { decideThreatEscalation } from "../../domain/combat/threatEscalation";
import type { ThreatEscalationDecision } from "../../domain/combat/threatEscalation";
import { getLevelForXp } from "../../domain/progression/level";
import { recordLevelMilestones } from "./levelMilestoneRepository";
import {
  THREAT_ESCALATION_HISTORY_LIMIT,
  toThreatEscalationHistoryEntry
} from "../../services/fightService";
import { summarizeCharacter } from "../../domain/characters/characterSummary";
import type { CharacterSummary } from "../../domain/characters/characterSummary";
import {
  GroupCombatStateValidationError,
  parseGroupCombatActorSnapshotStrict,
  parseFrozenGroupCombatActorSnapshotStrict,
  parseGroupCombatResultStrict,
  parseGroupCombatSettlementPlanStrict,
  parseGroupCombatSettlementReceiptStrict,
  parseGroupCombatStateStrict
} from "../../domain/groupCombat/groupCombatStateValidation";
import { parseBardInspirationCombatState } from "../../domain/noncombat/bardSupport";
import { parseVarenykSatedCombatState } from "../../domain/noncombat/varenykSatedSupport";
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
const MAX_MUTATION_ATTEMPTS = 13;
const UI_PUBLICATION_RETRY_DELAY_MS = 23;
const LEFT_PASSAGE_PREVIEW_RULES_VERSION = "nyz-passage-preview-v1";
const LEFT_PASSAGE_PARTY_ORIGIN_KIND = GROUP_COMBAT_LEFT_PASSAGE_ENCOUNTER_KEY;
const LEFT_PASSAGE_PARTICIPANT_CAP = 3;
const LEFT_PASSAGE_MINIMUM_PARTICIPANTS = 1;
const GROUP_COMBAT_UI_PUBLICATION_CLAIM_MS = 23_000;
const GROUP_COMBAT_NAVIGATION_FENCE_PREFIX = "navigation:";

class GroupCombatMutationConflict extends Error {}
class GroupCombatUiPublicationBusy extends GroupCombatMutationConflict {}
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
  passageEncounter: {
    select: {
      id: true,
      token: true,
      characterId: true,
      originLocationId: true,
      monsterId: true,
      baseMonsterLevel: true,
      effectiveMonsterLevel: true,
      seedHash: true,
      reservationRemortCount: true,
      reservedPartySessionId: true,
      groupCombatSessionId: true
    }
  },
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
  },
  actions: {
    where: { origin: "manual-item-committed" },
    select: {
      actorCharacterId: true,
      turn: true,
      actionKey: true,
      targetKind: true,
      targetId: true,
      payloadKey: true,
      origin: true
    },
    orderBy: [{ turn: "asc" as const }, { actorCharacterId: "asc" as const }]
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
  | "lease"
  | "flee-resources"
  | "flee-evidence"
  | "flee-lease";

export interface GroupCombatSettlementTestHooks {
  beforeRuntimeRead?(input: {
    operation: "action" | "timeout" | "settlement" | "delivery";
    sessionId?: string;
    partyInviteToken?: string;
  }): void | Promise<void>;
  afterActionPersisted?(input: {
    sessionId: string;
    actorCharacterId: string;
    turn: number;
    writeState: "queued" | "replaced" | "duplicate";
    readyToResolve: boolean;
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
    let mutationAttempt = 0;
    let persisted:
      | {
          kind: "persisted";
          sessionId: string;
          session: GroupCombatSessionRecord | null;
          actorCharacterId: string;
          writeState: "queued" | "replaced" | "duplicate";
          readyToResolve: boolean;
        }
      | { kind: "result"; result: GroupCombatActionResult }
      | null = null;
    while (mutationAttempt < MAX_MUTATION_ATTEMPTS) {
      try {
        persisted = await this.prisma.$transaction(async (tx) => {
          const actor = await tx.character.findFirst({
            where: { user: { telegramUserId: input.telegramUserId } },
            select: { id: true }
          });
          if (!actor) {
            return {
              kind: "result",
              result: { state: "no-character" }
            } as const;
          }
          const row = await tx.groupCombatSession.findFirst({
            where: {
              partySession: { inviteToken: input.partyInviteToken },
              repairState: null
            },
            include: sessionInclude
          });
          if (!row) {
            return {
              kind: "result",
              result: { state: "not-found" }
            } as const;
          }
          if (
            !row.participants.some(
              (participant) => participant.characterId === actor.id
            )
          ) {
            return {
              kind: "result",
              result: { state: "not-participant" }
            } as const;
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
            return {
              kind: "result",
              result: actionResultAfterRepair(
                await repairMalformedSession(tx, row, input.now)
              )
            } as const;
          }
          if (state.status !== "active") {
            const session = await loadSession(tx, row.id);
            return {
              kind: "result",
              result: session
                ? { state: "terminal", session }
                : { state: "not-found" }
            } as const;
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
            return {
              kind: "result",
              result: { state: validation }
            } as const;
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
          const writeState: "queued" | "replaced" | "duplicate" =
            existingAction
              ? existingAction.actionKey === input.action &&
                existingAction.targetKind === input.targetKind &&
                existingAction.targetId === input.targetId &&
                existingAction.payloadKey === (input.payloadKey ?? null)
                ? "duplicate"
                : "replaced"
              : "queued";
          let claimedRow = row;
          if (writeState !== "duplicate") {
            claimedRow = await claimActiveSessionMutation(tx, row);
          }
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
            return {
              kind: "result",
              result: actionResultAfterRepair(
                await repairMalformedSession(tx, row, input.now)
              )
            } as const;
          }
          const livingCount = state.participants.filter(
            (participant) =>
              participant.hp > 0 && participant.fledAtTurn === undefined
          ).length;
          const readyToResolve = actions.length >= livingCount;
          if (!readyToResolve && writeState !== "duplicate") {
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
          }
          const session = readyToResolve
            ? null
            : await loadSession(tx, row.id);
          if (!readyToResolve && !session) {
            return {
              kind: "result",
              result: { state: "not-found" }
            } as const;
          }
          return {
            kind: "persisted",
            sessionId: row.id,
            session,
            actorCharacterId: actor.id,
            writeState,
            readyToResolve
          } as const;
        });
        break;
      } catch (error) {
        if (error instanceof GroupCombatInventoryDrift) {
          return invalidateInventoryDrift(
            this.prisma,
            error.sessionId,
            input.now
          );
        }
        if (
          error instanceof GroupCombatMutationConflict ||
          isUniqueConflict(error) ||
          isTransactionWriteConflict(error)
        ) {
          mutationAttempt += 1;
          continue;
        }
        throw error;
      }
    }
    if (!persisted) {
      const current = await this.findByPartyInviteToken(input.partyInviteToken);
      if (!current) {
        return { state: "not-found" };
      }
      return current.status === "active"
        ? { state: "stale" }
        : { state: "terminal", session: current };
    }
    if (persisted.kind === "result") {
      return persisted.result;
    }
    await this.settlementTestHooks?.afterActionPersisted?.({
      sessionId: persisted.sessionId,
      actorCharacterId: persisted.actorCharacterId,
      turn: input.turn,
      writeState: persisted.writeState,
      readyToResolve: persisted.readyToResolve
    });
    if (!persisted.readyToResolve) {
      if (!persisted.session) {
        return { state: "not-found" };
      }
      return {
        state: persisted.writeState,
        session: persisted.session
      };
    }
    return this.resolvePersistedReadyTurn({
      sessionId: persisted.sessionId,
      turn: input.turn,
      now: input.now,
      nextTurnExpiresAt: input.nextTurnExpiresAt,
      writeState: persisted.writeState
    });
  }

  private async resolvePersistedReadyTurn(input: {
    sessionId: string;
    turn: number;
    now: Date;
    nextTurnExpiresAt: Date;
    writeState: "queued" | "replaced" | "duplicate";
  }): Promise<GroupCombatActionResult> {
    const publicationWaitStartedAt = Date.now();
    let mutationAttempt = 0;
    let publicationBusyAttempt = 0;
    while (
      mutationAttempt < MAX_MUTATION_ATTEMPTS &&
      publicationBusyAttempt < MAX_MUTATION_ATTEMPTS
    ) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const row = await tx.groupCombatSession.findFirst({
            where: { id: input.sessionId, repairState: null },
            include: sessionInclude
          });
          if (!row) {
            return { state: "not-found" } as const;
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
            return actionResultAfterRepair(
              await repairMalformedSession(tx, row, input.now)
            );
          }
          if (state.status !== "active") {
            const session = await loadSession(tx, row.id);
            return session
              ? { state: "terminal", session }
              : { state: "not-found" };
          }
          if (row.turn !== input.turn) {
            const session = await loadSession(tx, row.id);
            return session
              ? { state: "resolved", session }
              : { state: "not-found" };
          }
          const claimedRow = await claimActiveSessionMutation(tx, row);
          const result = await resolveIfReady(
            tx,
            claimedRow,
            state,
            input.now,
            input.nextTurnExpiresAt,
            uiPublicationTime(input.now, publicationWaitStartedAt),
            this.settlementTestHooks?.afterStage?.bind(
              this.settlementTestHooks
            )
          );
          if (result) {
            return result;
          }
          const session = await loadSession(tx, row.id);
          return session
            ? { state: input.writeState, session }
            : { state: "not-found" };
        });
      } catch (error) {
        if (error instanceof GroupCombatInventoryDrift) {
          return invalidateInventoryDrift(
            this.prisma,
            error.sessionId,
            input.now
          );
        }
        if (error instanceof GroupCombatUiPublicationBusy) {
          publicationBusyAttempt += 1;
          await waitForUiPublicationRetry();
          continue;
        }
        if (
          error instanceof GroupCombatMutationConflict ||
          isUniqueConflict(error) ||
          isTransactionWriteConflict(error)
        ) {
          mutationAttempt += 1;
          continue;
        }
        throw error;
      }
    }
    const current = await loadSession(this.prisma, input.sessionId);
    if (!current) {
      return { state: "not-found" };
    }
    if (current.status !== "active") {
      return { state: "terminal", session: current };
    }
    if (current.turn !== input.turn) {
      return { state: "resolved", session: current };
    }
    return { state: input.writeState, session: current };
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
    const publicationWaitStartedAt = Date.now();
    let mutationAttempt = 0;
    let publicationBusyAttempt = 0;
    while (
      mutationAttempt < MAX_MUTATION_ATTEMPTS &&
      publicationBusyAttempt < MAX_MUTATION_ATTEMPTS
    ) {
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
        const missing = state.participants.filter((participant) =>
          participant.hp > 0 &&
          participant.fledAtTurn === undefined &&
          !submitted.has(participant.characterId)
        );
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
        const result = await resolveIfReady(
          tx,
          claimedRow,
          state,
          input.now,
          input.nextTurnExpiresAt,
          uiPublicationTime(input.now, publicationWaitStartedAt),
          this.settlementTestHooks?.afterStage?.bind(this.settlementTestHooks)
        );
        if (!result) {
          throw new GroupCombatMutationConflict();
        }
        return result;
        });
      } catch (error) {
        if (error instanceof GroupCombatInventoryDrift) {
          return invalidateInventoryDrift(this.prisma, error.sessionId, input.now);
        }
        if (error instanceof GroupCombatUiPublicationBusy) {
          publicationBusyAttempt += 1;
          await waitForUiPublicationRetry();
          continue;
        }
        if (error instanceof GroupCombatMutationConflict || isUniqueConflict(error) || isTransactionWriteConflict(error)) {
          mutationAttempt += 1;
          continue;
        }
        throw error;
      }
    }
    const current = await loadSession(this.prisma, input.sessionId);
    return current
      ? {
          state:
            current.status === "active" && publicationBusyAttempt > 0
              ? "queued"
              : current.status === "active"
                ? "stale"
                : "terminal",
          session: current
        }
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
    const session = row ? await loadSession(this.prisma, row.id) : null;
    const actor = session?.state.participants.find(
      (participant) => participant.telegramUserId === telegramUserId.toString()
    );
    return actor?.fledAtTurn === undefined ? session : null;
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
          const state = parseRowState(owner);
          const actor = state.participants.find(
            (participant) => participant.characterId === lease.characterId
          );
          if (actor && actor.fledAtTurn === undefined) {
            return false;
          }
          if (actor?.fledAtTurn !== undefined) {
            await releaseGroupCombatLease(tx, lease, now);
            return true;
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
                .filter((entry) =>
                  isGroupCombatManualRewardParticipant(state, entry.characterId)
                )
                .map((entry) => entry.characterId),
              subjectKind: "left-passage-encounter",
              subjectId: row.id,
              sourceType: GROUP_COMBAT_LEFT_PASSAGE_ENCOUNTER_KEY,
              sourceId: row.id,
              dedupeKey: receipt.effects.activityKey,
              payloadJson: {
                participantCount: plan.participants.filter(
                  (entry) =>
                    isGroupCombatManualRewardParticipant(state, entry.characterId)
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
          settledAt: input.now,
          ...(plan.policy === "left-passage-party"
            ? {
                exitDeliveryState: "pending",
                exitDeliveryClaimToken: null,
                exitDeliveryClaimedAt: null,
                exitDeliveryMessageId: null
              }
            : {})
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
    publishedKeyboardFingerprint?: string | null;
  }): Promise<boolean> {
    if (input.chatId !== input.telegramUserId) {
      return false;
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.groupCombatParticipant.updateMany({
        where: {
          sessionId: input.sessionId,
          referenceVersion: input.expectedReferenceVersion,
          exitDeliveryState: "none",
          session: { repairState: null },
          character: { user: { telegramUserId: input.telegramUserId } }
        },
        data: {
          chatId: input.chatId,
          messageId: input.messageId,
          referenceVersion: { increment: 1 },
          deliveredRevision: 0,
          ...(input.publishedKeyboardFingerprint
            ? {
                replyKeyboardFingerprint: input.publishedKeyboardFingerprint,
                replyKeyboardGeneration: { increment: 1 }
              }
            : {})
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
          exitDeliveryState: "none",
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
        exitDeliveryState: "none",
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

  async claimParticipantUiPublication(input: {
    sessionId: string;
    telegramUserId: bigint;
    expectedDeliveryRevision: number;
    keyboardFingerprint: string;
    claimToken: string;
    claimedAt: Date;
    staleBefore: Date;
  }): Promise<
    | {
        state: "claimed";
        publishReplyKeyboard: boolean;
        keyboardGeneration: number;
      }
    | { state: "busy" | "stale" | "superseded" | "not-found" }
  > {
    return this.prisma.$transaction(async (tx) => {
      const participant = await tx.groupCombatParticipant.findFirst({
        where: {
          sessionId: input.sessionId,
          exitDeliveryState: "none",
          session: { repairState: null },
          character: { user: { telegramUserId: input.telegramUserId } }
        },
        select: {
          id: true,
          replyKeyboardFingerprint: true,
          replyKeyboardGeneration: true,
          characterId: true,
          character: { select: { activeCombatLease: true } },
          session: { select: { status: true, deliveryRevision: true } }
        }
      });
      if (!participant) {
        return { state: "not-found" as const };
      }
      if (
        participant.session.status !== "active" ||
        participant.character.activeCombatLease?.kind !== GROUP_COMBAT_LEASE_KIND ||
        participant.character.activeCombatLease.referenceId !== input.sessionId
      ) {
        return { state: "superseded" as const };
      }
      if (participant.session.deliveryRevision !== input.expectedDeliveryRevision) {
        return { state: "stale" as const };
      }
      const claimed = await tx.groupCombatUiPublicationClaim.updateMany({
        where: {
          characterId: participant.characterId,
          OR: [
            {
              sessionId: input.sessionId,
              claimToken: input.claimToken
            },
            { claimedAt: { lte: input.staleBefore } }
          ]
        },
        data: {
          sessionId: input.sessionId,
          claimToken: input.claimToken,
          claimedAt: input.claimedAt
        }
      });
      if (claimed.count === 0) {
        try {
          await tx.groupCombatUiPublicationClaim.create({
            data: {
              characterId: participant.characterId,
              sessionId: input.sessionId,
              claimToken: input.claimToken,
              claimedAt: input.claimedAt
            }
          });
        } catch (error) {
          if (isUniqueConflict(error)) {
            return { state: "busy" as const };
          }
          throw error;
        }
      }
      return {
        state: "claimed" as const,
        publishReplyKeyboard:
          participant.replyKeyboardFingerprint !== input.keyboardFingerprint,
        keyboardGeneration: participant.replyKeyboardGeneration
      };
    });
  }

  async acknowledgeParticipantUiPublication(input: {
    sessionId: string;
    telegramUserId: bigint;
    expectedDeliveryRevision: number;
    publishedKeyboardFingerprint: string | null;
    claimToken: string;
  }): Promise<"acknowledged" | "stale" | "not-owner"> {
    return this.prisma.$transaction(async (tx) => {
      const participant = await tx.groupCombatParticipant.findFirst({
        where: {
          sessionId: input.sessionId,
          exitDeliveryState: "none",
          session: { repairState: null },
          character: { user: { telegramUserId: input.telegramUserId } }
        },
        select: {
          id: true,
          characterId: true,
          replyKeyboardFingerprint: true,
          session: { select: { status: true, deliveryRevision: true } },
          character: { select: { activeCombatLease: true } }
        }
      });
      const lease = participant?.character.activeCombatLease;
      const claim = participant
        ? await tx.groupCombatUiPublicationClaim.findUnique({
            where: { characterId: participant.characterId }
          })
        : null;
      if (
        !participant ||
        !lease ||
        lease.kind !== GROUP_COMBAT_LEASE_KIND ||
        lease.referenceId !== input.sessionId ||
        claim?.sessionId !== input.sessionId ||
        claim.claimToken !== input.claimToken
      ) {
        return "not-owner";
      }
      if (
        participant.session.status !== "active" ||
        participant.session.deliveryRevision !== input.expectedDeliveryRevision
      ) {
        return "stale";
      }
      if (input.publishedKeyboardFingerprint !== null) {
        const participantUpdated = await tx.groupCombatParticipant.updateMany({
          where: {
            id: participant.id,
            exitDeliveryState: "none",
            session: {
              status: "active",
              deliveryRevision: input.expectedDeliveryRevision,
              repairState: null
            }
          },
          data: {
            replyKeyboardFingerprint: input.publishedKeyboardFingerprint,
            ...(participant.replyKeyboardFingerprint ===
            input.publishedKeyboardFingerprint
              ? {}
              : { replyKeyboardGeneration: { increment: 1 } })
          }
        });
        if (participantUpdated.count !== 1) {
          return "stale";
        }
      }
      const released = await tx.groupCombatUiPublicationClaim.deleteMany({
        where: {
          characterId: participant.characterId,
          sessionId: input.sessionId,
          claimToken: input.claimToken
        }
      });
      return released.count === 1 ? "acknowledged" : "not-owner";
    });
  }

  async renewParticipantUiPublicationClaim(input: {
    sessionId: string;
    telegramUserId: bigint;
    expectedDeliveryRevision: number;
    claimToken: string;
    claimedAt: Date;
  }): Promise<boolean> {
    const renewed = await this.prisma.groupCombatUiPublicationClaim.updateMany({
      where: {
        sessionId: input.sessionId,
        claimToken: input.claimToken,
        session: {
          status: "active",
          deliveryRevision: input.expectedDeliveryRevision,
          repairState: null
        },
        character: {
          user: { telegramUserId: input.telegramUserId },
          activeCombatLease: {
            is: {
              kind: GROUP_COMBAT_LEASE_KIND,
              referenceId: input.sessionId
            }
          }
        }
      },
      data: { claimedAt: input.claimedAt }
    });
    return renewed.count === 1;
  }

  async releaseParticipantUiPublicationClaim(input: {
    sessionId: string;
    telegramUserId: bigint;
    claimToken: string;
  }): Promise<boolean> {
    const participant = await this.prisma.groupCombatParticipant.findFirst({
      where: {
        sessionId: input.sessionId,
        character: { user: { telegramUserId: input.telegramUserId } }
      },
      select: { characterId: true }
    });
    if (!participant) {
      return false;
    }
    const released = await this.prisma.groupCombatUiPublicationClaim.deleteMany({
      where: {
        characterId: participant.characterId,
        sessionId: input.sessionId,
        claimToken: input.claimToken
      }
    });
    return released.count === 1;
  }

  async requestParticipantUiRefresh(input: {
    sessionId: string;
    telegramUserId: bigint;
  }): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const participant = await tx.groupCombatParticipant.updateMany({
        where: {
          sessionId: input.sessionId,
          exitDeliveryState: "none",
          session: { status: "active", repairState: null },
          character: {
            user: { telegramUserId: input.telegramUserId },
            activeCombatLease: {
              is: {
                kind: GROUP_COMBAT_LEASE_KIND,
                referenceId: input.sessionId
              }
            }
          }
        },
        data: { replyKeyboardFingerprint: null }
      });
      if (participant.count !== 1) {
        return false;
      }
      const session = await tx.groupCombatSession.updateMany({
        where: {
          id: input.sessionId,
          status: "active",
          repairState: null
        },
        data: {
          deliveryPending: true,
          deliveryAttemptedAt: null
        }
      });
      return session.count === 1;
    });
  }

  async claimParticipantFleeExitDelivery(input: {
    sessionId: string;
    telegramUserId: bigint;
    claimToken: string;
    claimedAt: Date;
    staleBefore: Date;
  }): Promise<
    | { state: "claimed"; locationId: string | null; menuDelivered: boolean }
    | { state: "busy" | "superseded" | "not-found" }
  > {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const participant = await tx.groupCombatParticipant.findFirst({
            where: {
              sessionId: input.sessionId,
              settlementStatus: "completed",
              exitDeliveryState: { in: ["pending", "claimed", "menu-delivered"] },
              session: { repairState: null },
              character: { user: { telegramUserId: input.telegramUserId } }
            },
            select: {
              id: true,
              characterId: true,
              exitDeliveryState: true,
              character: {
                select: {
                  activeCombatLease: true,
                  user: { select: { lastSeenLocationId: true } }
                }
              }
            }
          });
          if (!participant) {
            return { state: "not-found" as const };
          }
          const guardReference = `${input.sessionId}:${participant.characterId}`;
          const lease = participant.character.activeCombatLease;
          const ownsGuard =
            lease?.kind === GROUP_COMBAT_EXIT_NAVIGATION_LEASE_KIND &&
            lease.referenceId === guardReference;
          if (lease && !ownsGuard) {
            const superseded = await tx.groupCombatParticipant.updateMany({
              where: {
                id: participant.id,
                settlementStatus: "completed",
                exitDeliveryState: { in: ["pending", "claimed", "menu-delivered"] },
                session: { repairState: null },
                character: { activeCombatLease: { is: { id: lease.id } } }
              },
              data: {
                exitDeliveryState: "superseded",
                exitDeliveryClaimToken: null,
                exitDeliveryClaimedAt: null,
                exitDeliveryMessageId: null,
                chatId: null,
                messageId: null,
                referenceVersion: { increment: 1 }
              }
            });
            return {
              state: superseded.count === 1 ? "superseded" as const : "busy" as const
            };
          }
          let createdGuard = false;
          if (!ownsGuard) {
            await tx.activeCombatLease.create({
              data: {
                characterId: participant.characterId,
                kind: GROUP_COMBAT_EXIT_NAVIGATION_LEASE_KIND,
                referenceId: guardReference
              }
            });
            createdGuard = true;
          }
          const claimed = await tx.groupCombatParticipant.updateMany({
            where: {
              id: participant.id,
              settlementStatus: "completed",
              session: { repairState: null },
              OR: [
                { exitDeliveryState: "pending" },
                {
                  exitDeliveryState: "claimed",
                  exitDeliveryClaimedAt: { lte: input.staleBefore }
                },
                {
                  exitDeliveryState: "menu-delivered",
                  OR: [
                    { exitDeliveryClaimToken: null },
                    { exitDeliveryClaimedAt: { lte: input.staleBefore } }
                  ]
                }
              ]
            },
            data: {
              exitDeliveryClaimToken: input.claimToken,
              exitDeliveryClaimedAt: input.claimedAt,
              ...(participant.exitDeliveryState === "menu-delivered"
                ? {}
                : {
                    exitDeliveryState: "claimed",
                    exitDeliveryMessageId: null
                  })
            }
          });
          if (claimed.count !== 1) {
            if (createdGuard) {
              await tx.activeCombatLease.deleteMany({
                where: {
                  characterId: participant.characterId,
                  kind: GROUP_COMBAT_EXIT_NAVIGATION_LEASE_KIND,
                  referenceId: guardReference
                }
              });
            }
            return { state: "busy" as const };
          }
          return {
            state: "claimed" as const,
            locationId: participant.character.user.lastSeenLocationId,
            menuDelivered: participant.exitDeliveryState === "menu-delivered"
          };
        });
      } catch (error) {
        if (!isUniqueConflict(error) || attempt === 1) {
          throw error;
        }
      }
    }
    return { state: "busy" };
  }

  async releaseParticipantFleeExitDeliveryClaim(input: {
    sessionId: string;
    telegramUserId: bigint;
    claimToken: string;
  }): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const participant = await tx.groupCombatParticipant.findFirst({
        where: {
          sessionId: input.sessionId,
          exitDeliveryState: { in: ["claimed", "menu-delivered"] },
          exitDeliveryClaimToken: input.claimToken,
          session: { repairState: null },
          character: { user: { telegramUserId: input.telegramUserId } }
        },
        select: { id: true, characterId: true, exitDeliveryState: true }
      });
      if (!participant) {
        return false;
      }
      const updated = await tx.groupCombatParticipant.updateMany({
        where: {
          id: participant.id,
          exitDeliveryState: participant.exitDeliveryState,
          exitDeliveryClaimToken: input.claimToken,
          session: { repairState: null }
        },
        data: {
          ...(participant.exitDeliveryState === "claimed"
            ? {
                exitDeliveryState: "pending",
                exitDeliveryMessageId: null
              }
            : {}),
          exitDeliveryClaimToken: null,
          exitDeliveryClaimedAt: null
        }
      });
      if (updated.count !== 1) {
        return false;
      }
      if (participant.exitDeliveryState === "claimed") {
        await tx.activeCombatLease.deleteMany({
          where: {
            characterId: participant.characterId,
            kind: GROUP_COMBAT_EXIT_NAVIGATION_LEASE_KIND,
            referenceId: `${input.sessionId}:${participant.characterId}`
          }
        });
      }
      return true;
    });
  }

  async renewParticipantFleeExitDeliveryClaim(input: {
    sessionId: string;
    telegramUserId: bigint;
    claimToken: string;
    claimedAt: Date;
  }): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const participant = await tx.groupCombatParticipant.findFirst({
        where: {
          sessionId: input.sessionId,
          settlementStatus: "completed",
          exitDeliveryState: { in: ["claimed", "menu-delivered"] },
          exitDeliveryClaimToken: input.claimToken,
          session: { repairState: null },
          character: { user: { telegramUserId: input.telegramUserId } }
        },
        select: { id: true, characterId: true }
      });
      if (!participant) {
        return false;
      }
      const renewed = await tx.groupCombatParticipant.updateMany({
        where: {
          id: participant.id,
          settlementStatus: "completed",
          exitDeliveryState: { in: ["claimed", "menu-delivered"] },
          exitDeliveryClaimToken: input.claimToken,
          session: { repairState: null },
          character: {
            activeCombatLease: {
              is: {
                kind: GROUP_COMBAT_EXIT_NAVIGATION_LEASE_KIND,
                referenceId: `${input.sessionId}:${participant.characterId}`
              }
            }
          }
        },
        data: { exitDeliveryClaimedAt: input.claimedAt }
      });
      return renewed.count === 1;
    });
  }

  async markParticipantFleeExitMenuDelivered(input: {
    sessionId: string;
    telegramUserId: bigint;
    claimToken: string;
    messageId: number;
  }): Promise<boolean> {
    if (!Number.isSafeInteger(input.messageId) || input.messageId <= 0) {
      return false;
    }
    return this.prisma.$transaction(async (tx) => {
      const participant = await tx.groupCombatParticipant.findFirst({
        where: {
          sessionId: input.sessionId,
          exitDeliveryState: "claimed",
          exitDeliveryClaimToken: input.claimToken,
          session: { repairState: null },
          character: { user: { telegramUserId: input.telegramUserId } }
        },
        select: { id: true, characterId: true }
      });
      if (!participant) {
        return false;
      }
      const updated = await tx.groupCombatParticipant.updateMany({
        where: {
          id: participant.id,
          exitDeliveryState: "claimed",
          exitDeliveryClaimToken: input.claimToken,
          session: { repairState: null }
        },
        data: {
          exitDeliveryState: "menu-delivered",
          exitDeliveryClaimToken: input.claimToken,
          exitDeliveryMessageId: input.messageId
        }
      });
      if (updated.count !== 1) {
        return false;
      }
      return true;
    });
  }

  async completeParticipantFleeExitDelivery(input: {
    sessionId: string;
    telegramUserId: bigint;
    claimToken: string;
    expectedReferenceVersion: number;
    chatId: bigint | null;
    messageId: number | null;
    retainReference: boolean;
  }): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const participant = await tx.groupCombatParticipant.findFirst({
        where: {
          sessionId: input.sessionId,
          exitDeliveryState: "menu-delivered",
          exitDeliveryClaimToken: input.claimToken,
          referenceVersion: input.expectedReferenceVersion,
          chatId: input.chatId,
          messageId: input.messageId,
          session: { repairState: null },
          character: { user: { telegramUserId: input.telegramUserId } }
        },
        select: {
          id: true,
          characterId: true,
          character: { select: { activeCombatLease: true } }
        }
      });
      if (
        !participant ||
        participant.character.activeCombatLease?.kind !==
          GROUP_COMBAT_EXIT_NAVIGATION_LEASE_KIND ||
        participant.character.activeCombatLease.referenceId !==
          `${input.sessionId}:${participant.characterId}`
      ) {
        return false;
      }
      const updated = await tx.groupCombatParticipant.updateMany({
        where: {
          id: participant.id,
          exitDeliveryState: "menu-delivered",
          exitDeliveryClaimToken: input.claimToken,
          referenceVersion: input.expectedReferenceVersion,
          chatId: input.chatId,
          messageId: input.messageId,
          session: { repairState: null }
        },
        data: {
          exitDeliveryState: "completed",
          exitDeliveryClaimToken: null,
          exitDeliveryClaimedAt: null,
          ...(input.retainReference ? {} : { chatId: null, messageId: null }),
          referenceVersion: { increment: 1 }
        }
      });
      if (updated.count !== 1) {
        return false;
      }
      await tx.activeCombatLease.deleteMany({
        where: {
          characterId: participant.characterId,
          kind: GROUP_COMBAT_EXIT_NAVIGATION_LEASE_KIND,
          referenceId: `${input.sessionId}:${participant.characterId}`
        }
      });
      return true;
    });
  }

  async adoptParticipantFleeExitTerminalCard(input: {
    sessionId: string;
    telegramUserId: bigint;
    claimToken: string;
    expectedReferenceVersion: number;
    chatId: bigint | null;
    messageId: number | null;
    terminalCard: {
      chatId: bigint;
      messageId: number;
      deliveryRevision: number;
    };
  }): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const participant = await tx.groupCombatParticipant.findFirst({
        where: {
          sessionId: input.sessionId,
          exitDeliveryState: "menu-delivered",
          exitDeliveryClaimToken: input.claimToken,
          referenceVersion: input.expectedReferenceVersion,
          chatId: input.chatId,
          messageId: input.messageId,
          session: {
            status: { not: "active" },
            repairState: null,
            deliveryRevision: input.terminalCard.deliveryRevision
          },
          character: { user: { telegramUserId: input.telegramUserId } }
        },
        select: {
          id: true,
          characterId: true,
          character: { select: { activeCombatLease: true } }
        }
      });
      if (
        !participant ||
        participant.character.activeCombatLease?.kind !==
          GROUP_COMBAT_EXIT_NAVIGATION_LEASE_KIND ||
        participant.character.activeCombatLease.referenceId !==
          `${input.sessionId}:${participant.characterId}`
      ) {
        return false;
      }
      const updated = await tx.groupCombatParticipant.updateMany({
        where: {
          id: participant.id,
          exitDeliveryState: "menu-delivered",
          exitDeliveryClaimToken: input.claimToken,
          referenceVersion: input.expectedReferenceVersion,
          chatId: input.chatId,
          messageId: input.messageId,
          session: { repairState: null }
        },
        data: {
          chatId: input.terminalCard.chatId,
          messageId: input.terminalCard.messageId,
          deliveredRevision: input.terminalCard.deliveryRevision,
          referenceVersion: { increment: 1 }
        }
      });
      return updated.count === 1;
    });
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
          partySessionId: true,
          turn: true,
          stateJson: true,
          participants: {
            select: {
              characterId: true,
              deliveredRevision: true,
              replyKeyboardFingerprint: true,
              exitDeliveryState: true
            }
          }
        }
      });
      if (
        !session ||
        session.deliveryRevision !== input.expectedDeliveryRevision
      ) {
        return false;
      }
      const state = parseGroupCombatStateStrict(session.stateJson, {
        sessionId: input.sessionId,
        partySessionId: session.partySessionId,
        turn: session.turn
      });
      const complete = session.participants.every(
        (participant) => {
          const actor = state.participants.find(
            (candidate) => candidate.characterId === participant.characterId
          );
          const exitComplete =
            participant.exitDeliveryState === "completed" ||
            participant.exitDeliveryState === "superseded";
          return actor?.fledAtTurn !== undefined
            ? exitComplete
            : (
                exitComplete ||
                (
                  (state.rulesVersion !== GROUP_COMBAT_PRODUCTION_RULES_VERSION ||
                    state.status === "active") &&
                  participant.deliveredRevision >= input.expectedDeliveryRevision &&
                  (
                    state.status !== "active" ||
                    participant.replyKeyboardFingerprint !== null
                  )
                )
              );
        }
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
  const primaryBase = findGroupCombatProductionV1Monster(
    input.reservation.monsterId
  );
  if (!primaryBase) {
    throw new GroupCombatStateValidationError(
      "Reserved left-passage monster is outside the immutable production-v1 catalog."
    );
  }
  const primaryStats = deriveGroupCombatProductionV1MonsterStats({
    monsterId: primaryBase.id,
    effectiveLevel: input.reservation.effectiveMonsterLevel
  });
  if (!primaryStats) {
    throw new GroupCombatStateValidationError(
      "Reserved left-passage monster has no production-v1 combat profile."
    );
  }
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
  const enemyCount = deriveLeftPassageEnemyCount({
    participants: input.frozen.map(({ actor }) => actor),
    threatParticipants,
    primaryEffectiveMonsterLevel: input.reservation.effectiveMonsterLevel
  });
  const supportedPrimaryAbilityIds = resolveGroupCombatProductionV1MonsterAbilities({
    monsterId: primaryBase.id,
    effectiveLevel: input.reservation.effectiveMonsterLevel
  }).map((ability) => ability.id);
  const enemies = [{
    id: `primary:${input.reservation.id}`,
    monsterId: primaryBase.id,
    name: primaryBase.name,
    order: 0,
    level: input.reservation.effectiveMonsterLevel,
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
  const usedMonsterIds = [primaryBase.id];
  for (let index = 1; index < enemyCount; index += 1) {
    const base = selectGroupCombatProductionV1BackupMonster({
      participantLevel: characterSummary.level,
      encounterSeed: input.reservation.seedHash,
      partySessionId: input.partySessionId,
      index,
      usedMonsterIds
    });
    const baseEffectiveLevel =
      getGroupCombatProductionV1BackupEffectiveLevel(characterSummary.level);
    let selectedLevel = baseEffectiveLevel;
    if (index === 1 && threatSource.decision.enemyCount === 2) {
      selectedLevel = Math.min(
        23,
        baseEffectiveLevel + threatSource.decision.secondEnemyLevelBonus
      );
      appliedSecondEnemyLevelBonus = selectedLevel - baseEffectiveLevel;
    }
    usedMonsterIds.push(base.id);
    const baseline = deriveGroupCombatProductionV1MonsterStats({
      monsterId: base.id,
      effectiveLevel: selectedLevel
    });
    const pressured = deriveGroupCombatProductionV1MonsterStats({
      monsterId: base.id,
      effectiveLevel: selectedLevel,
      remortCount: remortSource.remortCount,
      remortPressureMode: "multi"
    });
    if (!baseline || !pressured) {
      throw new GroupCombatStateValidationError(
        `Production-v1 backup ${base.id} has no combat profile.`
      );
    }
    const enemyId = `backup:${index}:${base.id}`;
    const abilityIds = resolveGroupCombatProductionV1MonsterAbilities({
      monsterId: base.id,
      effectiveLevel: selectedLevel
    }).map((ability) => ability.id);
    if (index === 1 && threatSource.decision.enemyCount === 2) {
      boostedEnemyId = enemyId;
    }
    enemies.push({
      id: enemyId,
      monsterId: base.id,
      name: base.name,
      order: index,
      level: selectedLevel,
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
        : findGroupCombatProductionV1Monster(enemy.monsterId ?? "")?.level ??
          enemy.level ??
          input.reservation.effectiveMonsterLevel,
      effectiveLevel: enemy.level ?? input.reservation.effectiveMonsterLevel
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
  nextTurnExpiresAt: Date,
  uiPublicationNow: Date,
  afterStage?: GroupCombatSettlementTestHooks["afterStage"]
): Promise<GroupCombatActionResult | null> {
  const livingCount = state.participants.filter(
    (participant) => participant.hp > 0 && participant.fledAtTurn === undefined
  ).length;
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
    state.participants
      .filter((participant) => participant.hp > 0 && participant.fledAtTurn === undefined)
      .map((participant) => participant.characterId)
  );
  const actionIds = new Set(actions.map((action) => action.actorCharacterId));
  if (actions.length !== livingCount || actionIds.size !== livingCount || [...livingIds].some((id) => !actionIds.has(id))) {
    return actionResultAfterRepair(await repairMalformedSession(tx, row, now));
  }
  const resolution = resolveGroupCombatTurn(state, actions);
  const terminal = resolution.result !== null;
  const previouslyFled = new Set(
    state.participants
      .filter((participant) => participant.fledAtTurn !== undefined)
      .map((participant) => participant.characterId)
  );
  const newlyFled = resolution.state.participants.filter(
    (participant) =>
      participant.fledAtTurn !== undefined &&
      !previouslyFled.has(participant.characterId)
  );
  if (terminal || newlyFled.length > 0) {
    await claimParticipantNavigationFences(
      tx,
      row.id,
      [
        ...(terminal
          ? state.participants
              .filter((participant) => participant.fledAtTurn === undefined)
              .map((participant) => participant.characterId)
          : []),
        ...newlyFled.map((participant) => participant.characterId)
      ],
      uiPublicationNow
    );
  }
  await consumeCommittedItems(tx, row.id, resolution.committedConsumables);
  await markCommittedItemActions(
    tx,
    row.id,
    row.turn,
    resolution.committedConsumables
  );
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
  if (resolution.state.rulesVersion === GROUP_COMBAT_PRODUCTION_RULES_VERSION) {
    for (const participant of newlyFled) {
      await commitSuccessfulGroupCombatFlee(
        tx,
        row,
        resolution.state,
        participant,
        now,
        afterStage
      );
    }
  }
  if (terminal) {
    if (
      resolution.state.rulesVersion === GROUP_COMBAT_PRODUCTION_RULES_VERSION &&
      resolution.state.status === "won"
    ) {
      await applyLeftPassageDiscoveryToMatchingLives(
        tx,
        row.id,
        resolution.state,
        now
      );
    }
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
        row.participants.some((participant) =>
          participant.settlementStatus === "completed" &&
          state.participants.find(
            (actor) => actor.characterId === participant.characterId
          )?.fledAtTurn === undefined
        )
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
  const committedItemsByCharacter = collectCommittedItemEvidence(row.actions);
  const participants = repairParticipants.map((participant): GroupCombatActorSnapshot => {
    const frozen = readFrozenPayload(participant.snapshotJson)?.actor;
    if (!frozen) {
      throw new GroupCombatStateValidationError(
        "Invalid fallback cannot recover a malformed relational participant snapshot."
      );
    }
    const combatItemQuantities = subtractCommittedCombatItems(
      frozen.combatItemQuantities,
      committedItemsByCharacter.get(participant.characterId)
    );
    if (!combatItemQuantities) {
      throw new GroupCombatStateValidationError(
        "Invalid fallback cannot recover forged committed item evidence."
      );
    }
    return {
      ...frozen,
      hp: Math.min(Math.max(0, participant.character.hpCurrent), frozen.hpMax),
      mana: Math.min(Math.max(0, participant.character.manaCurrent), frozen.manaMax),
      combatItemQuantities,
      threat: 0
    };
  });
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
  const state = parseRowStateCore(row);
  const ownedIds = state.participants
    .filter((participant) => participant.fledAtTurn === undefined)
    .map((participant) => participant.characterId);
  const ownedIdSet = new Set(ownedIds);
  if (row.participants.some((participant) =>
    ownedIdSet.has(participant.characterId) &&
    participant.character._count.remorts !== participant.remortCount
  )) {
    throw new GroupCombatStateValidationError("Current character life does not match the group-combat roster.");
  }
  const leases = await tx.activeCombatLease.findMany({
    where: {
      OR: [
        { characterId: { in: ownedIds } },
        { kind: GROUP_COMBAT_LEASE_KIND, referenceId: row.id }
      ]
    }
  });
  for (const participantId of ownedIds) {
    const lease = leases.find((candidate) => candidate.characterId === participantId);
    if (!lease || lease.kind !== GROUP_COMBAT_LEASE_KIND || lease.referenceId !== row.id) {
      throw new GroupCombatStateValidationError("Participant group-combat lease is missing or mismatched.");
    }
  }
  if (leases.some((lease) => (
    lease.kind === GROUP_COMBAT_LEASE_KIND &&
    lease.referenceId === row.id &&
    !ownedIdSet.has(lease.characterId)
  ))) {
    throw new GroupCombatStateValidationError("Group-combat lease belongs to a participant who already fled.");
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

async function requireIdleParticipantUiPublications(
  tx: TxClient,
  characterIds: readonly string[],
  now: Date
): Promise<void> {
  const uniqueCharacterIds = [...new Set(characterIds)];
  if (uniqueCharacterIds.length === 0) {
    return;
  }
  const staleBefore = new Date(
    now.getTime() - GROUP_COMBAT_UI_PUBLICATION_CLAIM_MS
  );
  await tx.groupCombatUiPublicationClaim.deleteMany({
    where: {
      characterId: { in: uniqueCharacterIds },
      claimedAt: { lte: staleBefore }
    }
  });
  const liveClaim = await tx.groupCombatUiPublicationClaim.findFirst({
    where: {
      characterId: { in: uniqueCharacterIds }
    },
    select: { characterId: true }
  });
  if (liveClaim) {
    throw new GroupCombatUiPublicationBusy();
  }
}

async function claimParticipantNavigationFences(
  tx: TxClient,
  sessionId: string,
  characterIds: readonly string[],
  now: Date
): Promise<void> {
  const uniqueCharacterIds = [...new Set(characterIds)];
  if (uniqueCharacterIds.length === 0) {
    return;
  }
  const staleBefore = new Date(
    now.getTime() - GROUP_COMBAT_UI_PUBLICATION_CLAIM_MS
  );
  await tx.groupCombatUiPublicationClaim.deleteMany({
    where: {
      characterId: { in: uniqueCharacterIds },
      claimedAt: { lte: staleBefore }
    }
  });
  const fenceToken = `${GROUP_COMBAT_NAVIGATION_FENCE_PREFIX}${sessionId}`;
  try {
    await tx.groupCombatUiPublicationClaim.createMany({
      data: uniqueCharacterIds.map((characterId) => ({
        characterId,
        sessionId,
        claimToken: fenceToken,
        claimedAt: now
      }))
    });
  } catch (error) {
    if (!isUniqueConflict(error)) {
      throw error;
    }
    throw new GroupCombatUiPublicationBusy();
  }
}

function waitForUiPublicationRetry(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, UI_PUBLICATION_RETRY_DELAY_MS);
  });
}

function uiPublicationTime(base: Date, startedAtMs: number): Date {
  return new Date(base.getTime() + Math.max(0, Date.now() - startedAtMs));
}

async function commitSuccessfulGroupCombatFlee(
  tx: TxClient,
  row: SessionRow,
  state: GroupCombatState,
  actor: GroupCombatActorSnapshot,
  now: Date,
  afterStage?: GroupCombatSettlementTestHooks["afterStage"]
): Promise<void> {
  const participant = row.participants.find(
    (candidate) => candidate.characterId === actor.characterId
  );
  const receipt = buildGroupCombatFleeExitReceipt(state, actor.characterId);
  const lease = await tx.activeCombatLease.findFirst({
    where: {
      characterId: actor.characterId,
      kind: GROUP_COMBAT_LEASE_KIND,
      referenceId: row.id
    }
  });
  if (
    !participant ||
    participant.settlementStatus !== "pending" ||
    participant.settlementAttempts !== 0 ||
    participant.settlementReceiptJson !== null ||
    participant.character._count.remorts !== actor.remortCount ||
    !receipt ||
    !lease
  ) {
    throw new GroupCombatStateValidationError(
      "Successful flee could not commit its canonical participant exit."
    );
  }
  await tx.character.update({
    where: { id: actor.characterId },
    data: {
      hpCurrent: actor.hp,
      manaCurrent: actor.mana,
      hpRegenAt: actor.hp >= actor.hpMax ? null : now,
      manaRegenAt: actor.mana >= actor.manaMax ? null : now
    }
  });
  await afterStage?.({
    stage: "flee-resources",
    sessionId: row.id,
    characterId: actor.characterId
  });
  const exited = await tx.groupCombatParticipant.updateMany({
    where: {
      id: participant.id,
      settlementStatus: "pending",
      settlementAttempts: 0,
      settlementReceiptJson: { equals: Prisma.DbNull },
      session: { repairState: null }
    },
    data: {
      settlementStatus: "completed",
      settlementAttempts: 1,
      settlementReceiptJson: receipt as unknown as Prisma.InputJsonValue,
      settledAt: now,
      exitDeliveryState: "pending",
      exitDeliveryClaimToken: null,
      exitDeliveryClaimedAt: null,
      exitDeliveryMessageId: null
    }
  });
  if (exited.count !== 1) {
    throw new GroupCombatMutationConflict();
  }
  await afterStage?.({
    stage: "flee-evidence",
    sessionId: row.id,
    characterId: actor.characterId
  });
  await releaseGroupCombatLease(tx, lease, now);
  await afterStage?.({
    stage: "flee-lease",
    sessionId: row.id,
    characterId: actor.characterId
  });
}

async function applyLeftPassageDiscoveryToMatchingLives(
  tx: TxClient,
  sessionId: string,
  state: GroupCombatState,
  completedAt: Date
): Promise<void> {
  const discoveryAvailableAt = new Date(
    completedAt.getTime() +
      getLeftPassageTierTwoDiscoveryMinutes(state.deterministicSeed) * 60_000
  );
  for (const participant of state.participants) {
    const character = await tx.character.findUnique({
      where: { id: participant.characterId },
      select: { id: true, _count: { select: { remorts: true } } }
    });
    if (!character || character._count.remorts !== participant.remortCount) {
      continue;
    }
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
          groupCombatSessionId: sessionId
        }
      },
      update: {
        availableAt: discoveryAvailableAt,
        resultJson: {
          kind: "left-passage-tier-two-discovery",
          groupCombatSessionId: sessionId
        }
      }
    });
  }
}

async function releaseGroupCombatLease(
  tx: TxClient,
  lease: Prisma.ActiveCombatLeaseGetPayload<Record<string, never>>,
  now: Date
): Promise<void> {
  const currentClaim = await tx.groupCombatUiPublicationClaim.findUnique({
    where: { characterId: lease.characterId }
  });
  if (
    currentClaim &&
    (
      currentClaim.sessionId !== lease.referenceId ||
      currentClaim.claimToken !==
        `${GROUP_COMBAT_NAVIGATION_FENCE_PREFIX}${lease.referenceId}`
    )
  ) {
    await requireIdleParticipantUiPublications(tx, [lease.characterId], now);
  }
  const releasableLease = await tx.activeCombatLease.findUnique({
    where: { id: lease.id }
  });
  if (
    !releasableLease ||
    releasableLease.characterId !== lease.characterId ||
    releasableLease.kind !== lease.kind ||
    releasableLease.referenceId !== lease.referenceId
  ) {
    throw new GroupCombatMutationConflict();
  }
  const participant = await tx.groupCombatParticipant.findFirst({
    where: { sessionId: lease.referenceId, characterId: lease.characterId },
    select: { snapshotJson: true }
  });
  const payload = readFrozenPayload(participant?.snapshotJson);
  const sated = parseVarenykSatedCombatState(payload?.sated);
  const inspiration = parseBardInspirationCombatState(payload?.inspiration);
  await releaseCombatLeaseWithTimedStatuses({
    tx,
    lease: releasableLease,
    releasedAt: now,
    ...(sated ? { sated } : {}),
    ...(inspiration ? { inspiration } : {})
  });
  await tx.groupCombatUiPublicationClaim.deleteMany({
    where: {
      characterId: lease.characterId,
      sessionId: lease.referenceId,
      claimToken: `${GROUP_COMBAT_NAVIGATION_FENCE_PREFIX}${lease.referenceId}`
    }
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
    const fleeReceipt =
      participant.settlementStatus === "completed" && participant.settledAt
      ? buildGroupCombatFleeExitReceipt(state, participant.characterId)
      : null;
    await tx.groupCombatParticipant.update({
      where: { id: participant.id },
      data: {
        contributionJson: contribution as unknown as Prisma.InputJsonValue,
        settlementStatus: fleeReceipt ? "completed" : "pending",
        settlementAttempts: fleeReceipt
          ? Math.max(1, participant.settlementAttempts)
          : 0,
        settlementReceiptJson: fleeReceipt
          ? fleeReceipt as unknown as Prisma.InputJsonValue
          : Prisma.DbNull,
        settledAt: fleeReceipt ? participant.settledAt : null
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

const COMMITTED_ITEM_ACTION_ORIGIN = "manual-item-committed";

async function markCommittedItemActions(
  tx: TxClient,
  sessionId: string,
  turn: number,
  items: readonly GroupCombatCommittedConsumable[]
): Promise<void> {
  for (const item of items) {
    const updated = await tx.groupCombatAction.updateMany({
      where: {
        sessionId,
        turn,
        actorCharacterId: item.characterId,
        actionKey: "item",
        payloadKey: item.itemId,
        origin: "manual"
      },
      data: { origin: COMMITTED_ITEM_ACTION_ORIGIN }
    });
    if (updated.count !== 1) {
      throw new GroupCombatStateValidationError(
        "Committed item action is missing its relational evidence."
      );
    }
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
      deliveredRevision: participant.deliveredRevision,
      replyKeyboardFingerprint: participant.replyKeyboardFingerprint,
      replyKeyboardGeneration: participant.replyKeyboardGeneration,
      exitDeliveryState: parseGroupCombatExitDeliveryState(
        participant.exitDeliveryState
      ),
      exitDeliveryClaimToken: participant.exitDeliveryClaimToken,
      exitDeliveryClaimedAt: participant.exitDeliveryClaimedAt,
      exitDeliveryMessageId: participant.exitDeliveryMessageId,
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
  validateRelationalFrozenParticipantsBeforeStateParse(row);
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
  if (leftPassage) {
    const encounter = row.passageEncounter;
    const production = state.production;
    if (
      !encounter ||
      !production ||
      encounter.id !== production.encounterId ||
      encounter.token !== production.encounterToken ||
      encounter.characterId !== production.initiatingCharacterId ||
      encounter.originLocationId !== production.locationId ||
      encounter.monsterId !== production.primaryMonsterId ||
      encounter.baseMonsterLevel !== production.primaryBaseMonsterLevel ||
      encounter.effectiveMonsterLevel !== production.primaryEffectiveMonsterLevel ||
      encounter.seedHash !== production.encounterSeed ||
      encounter.reservationRemortCount !== production.initiatingRemortCount ||
      encounter.reservedPartySessionId !== row.partySessionId ||
      encounter.groupCombatSessionId !== row.id
    ) {
      throw new GroupCombatStateValidationError(
        "Production encounter evidence does not match its relational reservation."
      );
    }
  }
  validateRelationalRoster(row, state);
  return state;
}

function validateRelationalRoster(row: SessionRow, state: GroupCombatState): void {
  validateRelationalActors(row, state.participants);
}

function validateRelationalFrozenParticipantsBeforeStateParse(
  row: SessionRow
): void {
  if (
    !row.stateJson ||
    typeof row.stateJson !== "object" ||
    Array.isArray(row.stateJson)
  ) {
    return;
  }
  const participants = (row.stateJson as Record<string, unknown>).participants;
  if (!Array.isArray(participants)) {
    return;
  }
  let actors: GroupCombatActorSnapshot[];
  try {
    actors = participants.map(parseGroupCombatActorSnapshotStrict);
  } catch {
    return;
  }
  validateRelationalActors(row, actors);
}

function validateRelationalActors(
  row: SessionRow,
  actors: readonly GroupCombatActorSnapshot[]
): void {
  if (row.participants.length !== actors.length) {
    throw new GroupCombatStateValidationError("Relational participant cardinality does not match state.");
  }
  const stateByCharacterId = new Map(actors.map((participant) => [participant.characterId, participant]));
  const committedItemsByCharacter = collectCommittedItemEvidence(row.actions);
  for (const participant of row.participants) {
    const actor = stateByCharacterId.get(participant.characterId);
    const frozen = readFrozenPayload(participant.snapshotJson);
    const frozenActor = frozen?.actor;
    const expectedCombatItems = frozenActor
      ? subtractCommittedCombatItems(
          frozenActor.combatItemQuantities,
          committedItemsByCharacter.get(participant.characterId)
        )
      : null;
    if (
      !actor ||
      !frozenActor ||
      actor.telegramUserId !== participant.character.user.telegramUserId.toString() ||
      actor.remortCount !== participant.remortCount ||
      actor.rosterOrder !== participant.rosterOrder ||
      !sameFrozenParticipantGameplayInputs(actor, frozenActor) ||
      expectedCombatItems === null ||
      !isDeepStrictEqual(actor.combatItemQuantities, expectedCombatItems)
    ) {
      throw new GroupCombatStateValidationError(
        "Relational frozen participant does not match state."
      );
    }
  }
  if ([...committedItemsByCharacter.keys()].some((characterId) => !stateByCharacterId.has(characterId))) {
    throw new GroupCombatStateValidationError(
      "Relational committed item evidence references an unknown participant."
    );
  }
}

function collectCommittedItemEvidence(
  actions: readonly PersistedActionRow[]
): Map<string, Map<string, number>> {
  const committedItemsByCharacter = new Map<string, Map<string, number>>();
  for (const action of actions) {
    if (action.origin !== COMMITTED_ITEM_ACTION_ORIGIN) {
      continue;
    }
    if (
      action.actionKey !== "item" ||
      action.targetKind !== "self" ||
      action.targetId !== action.actorCharacterId ||
      !action.payloadKey ||
      !(GROUP_COMBAT_SUPPORTED_ITEM_IDS as readonly string[]).includes(action.payloadKey)
    ) {
      throw new GroupCombatStateValidationError(
        "Relational committed item evidence is not canonical."
      );
    }
    const quantities = committedItemsByCharacter.get(action.actorCharacterId) ??
      new Map<string, number>();
    quantities.set(
      action.payloadKey,
      (quantities.get(action.payloadKey) ?? 0) + 1
    );
    committedItemsByCharacter.set(action.actorCharacterId, quantities);
  }
  return committedItemsByCharacter;
}

function sameFrozenParticipantGameplayInputs(
  actor: GroupCombatActorSnapshot,
  frozen: GroupCombatActorSnapshot
): boolean {
  return actor.characterId === frozen.characterId &&
    actor.telegramUserId === frozen.telegramUserId &&
    actor.name === frozen.name &&
    actor.activeCosmeticTitle === frozen.activeCosmeticTitle &&
    actor.remortCount === frozen.remortCount &&
    actor.rosterOrder === frozen.rosterOrder &&
    actor.classId === frozen.classId &&
    actor.raceId === frozen.raceId &&
    actor.level === frozen.level &&
    actor.hpMax === frozen.hpMax &&
    actor.manaMax === frozen.manaMax &&
    actor.attack === frozen.attack &&
    actor.defense === frozen.defense &&
    actor.support === frozen.support &&
    isDeepStrictEqual(actor.stats, frozen.stats) &&
    isDeepStrictEqual(
      [...actor.equipmentItemIds].sort(),
      [...frozen.equipmentItemIds].sort()
    ) &&
    isDeepStrictEqual(
      [...actor.gearAbilityIds].sort(),
      [...frozen.gearAbilityIds].sort()
    );
}

function subtractCommittedCombatItems(
  frozen: Readonly<Record<string, number>>,
  committed: ReadonlyMap<string, number> | undefined
): Record<string, number> | null {
  const remaining = { ...frozen };
  for (const [itemId, quantity] of committed ?? []) {
    const frozenQuantity = remaining[itemId] ?? 0;
    if (quantity > frozenQuantity) {
      return null;
    }
    const next = frozenQuantity - quantity;
    if (next === 0) {
      delete remaining[itemId];
    } else {
      remaining[itemId] = next;
    }
  }
  return remaining;
}

function validateSettlementRows(
  row: SessionRow,
  state: GroupCombatState,
  plan: GroupCombatSettlementPlan | null
): void {
  const contributions = new Map(state.contributions.map((contribution) => [contribution.characterId, contribution]));
  for (const participant of row.participants) {
    const contribution = contributions.get(participant.characterId);
    const actor = state.participants.find(
      (candidate) => candidate.characterId === participant.characterId
    );
    const exitState = parseGroupCombatExitDeliveryState(
      participant.exitDeliveryState
    );
    const hasClaimToken = participant.exitDeliveryClaimToken !== null;
    const hasClaimTimestamp = participant.exitDeliveryClaimedAt !== null;
    const claimCanonical = exitState === "claimed"
      ? hasClaimToken && hasClaimTimestamp
      : exitState === "menu-delivered"
        ? hasClaimToken === hasClaimTimestamp
        : !hasClaimToken && !hasClaimTimestamp;
    const messageCanonical =
      exitState === "menu-delivered" || exitState === "completed"
        ? participant.exitDeliveryMessageId !== null &&
          participant.exitDeliveryMessageId > 0
        : participant.exitDeliveryMessageId === null;
    const productionExitCanonical =
      state.rulesVersion === GROUP_COMBAT_PRODUCTION_RULES_VERSION
        ? state.status === "active"
          ? (
              (actor?.fledAtTurn === undefined && exitState === "none") ||
              (actor?.fledAtTurn !== undefined && exitState !== "none")
            )
          : participant.settlementStatus === "completed"
            ? exitState !== "none"
            : exitState === "none"
        : exitState === "none";
    if (
      !actor ||
      !claimCanonical ||
      !messageCanonical ||
      !productionExitCanonical
    ) {
      throw new GroupCombatStateValidationError(
        "Participant flee exit-delivery evidence is not canonical."
      );
    }
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
    if (participant.settlementStatus !== "completed") {
      throw new GroupCombatStateValidationError("Settlement status is invalid for group-combat state.");
    }
    if (
      participant.settlementAttempts < 1 ||
      participant.settlementReceiptJson === null ||
      participant.settledAt === null
    ) {
      throw new GroupCombatStateValidationError("Completed settlement row is missing receipt metadata.");
    }
    const expectedReceipt = plan
      ? buildGroupCombatSettlementReceipt(plan, participant.characterId)
      : buildGroupCombatFleeExitReceipt(state, participant.characterId);
    const receipt = parseGroupCombatSettlementReceiptStrict(participant.settlementReceiptJson);
    if (!expectedReceipt || !isDeepStrictEqual(receipt, expectedReceipt)) {
      throw new GroupCombatStateValidationError("Settlement receipt does not match its immutable plan entry.");
    }
  }
}

function isGroupCombatStatus(value: string): value is GroupCombatStatus {
  return value === "active" || value === "won" || value === "lost" || value === "invalid";
}

function parseGroupCombatExitDeliveryState(
  value: string
): GroupCombatParticipantRecord["exitDeliveryState"] {
  if (
    value === "none" ||
    value === "pending" ||
    value === "claimed" ||
    value === "menu-delivered" ||
    value === "completed" ||
    value === "superseded"
  ) {
    return value;
  }
  throw new GroupCombatStateValidationError(
    "Group-combat participant has an invalid flee exit-delivery state."
  );
}

function isGroupCombatActionKey(value: string): value is GroupCombatAction["action"] {
  return value === "attack" ||
    value === "guard" ||
    value === "class" ||
    value === "race" ||
    value === "gear" ||
    value === "item" ||
    value === "flee";
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
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (
    keys.some((key) => key !== "actor" && key !== "summary" && key !== "sated" && key !== "inspiration") ||
    !("actor" in record)
  ) {
    return null;
  }
  try {
    return {
      actor: parseFrozenGroupCombatActorSnapshotStrict(record.actor),
      ...("summary" in record ? { summary: record.summary as CharacterSummary } : {}),
      ...("sated" in record ? { sated: record.sated } : {}),
      ...("inspiration" in record ? { inspiration: record.inspiration } : {})
    };
  } catch {
    return null;
  }
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
