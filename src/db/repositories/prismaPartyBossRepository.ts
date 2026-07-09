import { Prisma, type PrismaClient } from "@prisma/client";
import {
  BIG_BARREL_BROTHER_LOSS_RETRY_COOLDOWN_KEY,
  BIG_BARREL_BROTHER_LOSS_RETRY_COOLDOWN_MS,
  BIG_BARREL_BROTHER_RULES_VERSION,
  buildBigBarrelLossXp,
  buildResult,
  calculatePartyBossCombatItemHealing,
  createPartyBossState,
  getPartyBossCombatItemAvailability,
  isBigBarrelEligible,
  isBigBarrelBrotherState,
  isMeaningfulBigBarrelParticipant,
  resolvePartyBossRound,
  type PartyBossActionKey,
  type PartyBossCombatItemInput,
  type PartyBossParticipantActionSummary,
  type PartyBossResult,
  type PartyBossRewardSnapshot,
  type PartyBossState
} from "../../domain/partyBoss/partyBoss";
import { getCombatMantokAbilityGrantsByIds, getCombatMantokAbilityGrantsForEquippedItems, items } from "../../content";
import { getCombatGearActionAvailabilityForActor, type CombatGearAbilityInput } from "../../domain/combat";
import { getLevelForXp } from "../../domain/progression/level";
import {
  buildPartyBossCombatStats,
  type PartyBossAchievementEventRecord,
  type PartyBossActionResult,
  type PartyBossDevWinResult,
  type PartyBossParticipantSnapshot,
  type PartyBossRepository,
  type PartyBossResolveInput,
  type PartyBossSessionRecord,
  type PartyBossSessionStatus,
  type PartyBossStartInput,
  type PartyBossStartResult,
  type PartyBossTimeoutMode
} from "./partyBossRepository";
import {
  buildBigBarrelBrotherItemGrants,
  FRIDAY_BARREL_RAID_KEY
} from "../../services/tavernRaidService";
import { recordLevelMilestones } from "./levelMilestoneRepository";
import { countCharacterRemorts } from "./prismaRemortCount";
import { findActiveItemUseReservedItems } from "./itemUseReservations";
import { findActiveTransferReservedItems } from "./itemTransferReservations";
import { isMedicalCombatItemId } from "../../services/combatItemUse";

type TxClient = Prisma.TransactionClient;
type PartyBossRow = Prisma.PartyBossSessionGetPayload<{ include: typeof partyBossInclude }>;
type PartyRow = Prisma.PartySessionGetPayload<{ include: typeof partyInclude }>;
type CharacterRow = PartyRow["participants"][number]["character"];

const PARTY_BOSS_LEASE_KIND = "party-boss";
const ACTIVE_PARTY_STATUS = "active";
const RECRUITING_PARTY_STATUS = "recruiting";
const BIG_BARREL_PARTY_ORIGIN_LOCATION_ID = "barrel.big-brother";
const KHARAKTERNYK_WARD_SUPPORT_CAP = 7;
const KHARAKTERNYK_WARD_SIGN_SNAPSHOT_KEY = "kharakternykWardSign";
const KHARAKTERNYK_WARD_SUPPORT_SNAPSHOT_KEY = "kharakternykWardSupport";
class PartyBossItemUseRollback extends Error {
  constructor(readonly reason: Extract<PartyBossActionResult, { state: "item-unavailable" }>["reason"]) {
    super(reason);
  }
}

type QueuedPartyBossActionState = Extract<PartyBossActionResult["state"], "queued" | "updated" | "duplicate">;
type QueuedPartyBossActionInput = {
  id: string;
  characterId: string;
  action: PartyBossActionKey;
  origin: "manual";
  item?: PartyBossCombatItemInput;
  gearAbility?: CombatGearAbilityInput;
};

const partyCharacterInclude = {
  user: {
    select: {
      telegramUserId: true,
      lastSeenLocationId: true
    }
  },
  equipment: {
    orderBy: {
      slot: "asc" as const
    }
  },
  _count: {
    select: {
      remorts: true
    }
  }
} satisfies Prisma.CharacterInclude;

const partyInclude = {
  participants: {
    include: {
      character: {
        include: partyCharacterInclude
      }
    },
    orderBy: [
      { joinedAt: "asc" as const },
      { id: "asc" as const }
    ]
  },
  bossSessions: {
    orderBy: {
      updatedAt: "desc" as const
    },
    take: 1
  }
} satisfies Prisma.PartySessionInclude;

const partyBossInclude = {
  partySession: {
    include: {
      participants: {
        include: {
          character: {
            include: partyCharacterInclude
          }
        },
        orderBy: [
          { joinedAt: "asc" as const },
          { id: "asc" as const }
        ]
      }
    }
  },
  actions: {
    orderBy: [
      { turn: "asc" as const },
      { submittedAt: "asc" as const }
    ]
  }
} satisfies Prisma.PartyBossSessionInclude;

export class PrismaPartyBossRepository implements PartyBossRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async startFromRecruitingPartyForTelegramUser(
    telegramUserId: bigint,
    input: PartyBossStartInput
  ): Promise<PartyBossStartResult> {
    return this.prisma.$transaction(async (tx): Promise<PartyBossStartResult> => {
      const character = await findCharacterByTelegramUser(tx, telegramUserId);
      if (!character) {
        return { state: "no-character" };
      }

      await expireRecruitingPartyIfNeeded(tx, input.partyInviteToken, input.now, {
        allowBigBarrelExpiredRecruiting: input.allowExpiredRecruiting === true
      });
      const party = await tx.partySession.findUnique({
        where: { inviteToken: input.partyInviteToken },
        include: partyInclude
      });

      if (!party) {
        return { state: "not-found" };
      }

      const existingBoss = await tx.partyBossSession.findUnique({
        where: { partySessionId: party.id },
        include: partyBossInclude
      });

      if (existingBoss) {
        return {
          state: existingBoss.status === "active" ? "already-active" : "terminal",
          session: mapSession(existingBoss)
        };
      }

      if (party.leaderCharacterId !== character.id) {
        return { state: "not-leader" };
      }

      if (
        party.status === RECRUITING_PARTY_STATUS &&
        party.expiresAt <= input.now &&
        !(input.allowExpiredRecruiting === true && party.originLocationId === BIG_BARREL_PARTY_ORIGIN_LOCATION_ID)
      ) {
        return { state: "expired" };
      }

      if (party.status === "expired") {
        return { state: "expired" };
      }

      if (party.status !== RECRUITING_PARTY_STATUS) {
        return { state: "not-recruiting" };
      }

      const joined = party.participants.filter((participant) => participant.status === "joined");
      if (joined.length < party.minimumParticipants) {
        return { state: "too-small" };
      }

      const isBigBarrelParty = party.originLocationId === BIG_BARREL_PARTY_ORIGIN_LOCATION_ID;
      if (isBigBarrelParty && await hasIneligibleBigBarrelParticipant(tx, party, joined, input.now)) {
        return { state: "ineligible" };
      }

      const blocker = await tx.activeCombatLease.findFirst({
        where: {
          characterId: {
            in: joined.map((participant) => participant.characterId)
          }
        },
        select: {
          characterId: true
        }
      });
      if (blocker) {
        const blocked = joined.find((participant) => participant.characterId === blocker.characterId);
        return blocked
          ? { state: "blocked", blockerName: blocked.character.name }
          : { state: "blocked" };
      }

      const wardSign = isBigBarrelParty ? buildKharakternykWardSignForStartedParty(joined) : undefined;
      const state = createPartyBossState({
        partySessionId: party.id,
        variant: isBigBarrelParty ? "big-barrel" : "proof",
        leaderCharacterId: party.leaderCharacterId,
        now: input.now,
        ...(wardSign ? { wardSign } : {}),
        participants: joined.map((participant) => {
          const combatCharacter = mapCharacterForCombat(participant.character);
          const combatStats = buildPartyBossCombatStats(combatCharacter);
          const equipmentAbilityGrantIds = getCombatMantokAbilityGrantsForEquippedItems({
            itemIds: participant.character.equipment.map((equipment) => equipment.itemId),
            characterLevel: combatStats.level
          }).map((grant) => grant.id);

          return {
            characterId: participant.characterId,
            name: participant.character.name,
            remortCount: participant.character._count.remorts,
            combatStats,
            ...(equipmentAbilityGrantIds.length > 0 ? { equipmentAbilityGrantIds } : {})
          };
        })
      });

      await tx.activeCombatLease.createMany({
        data: joined.map((participant) => ({
          characterId: participant.characterId,
          kind: PARTY_BOSS_LEASE_KIND,
          referenceId: party.id
        }))
      });

      await tx.partySession.update({
        where: { id: party.id },
        data: {
          status: ACTIVE_PARTY_STATUS,
          version: { increment: 1 }
        }
      });

      const boss = await tx.partyBossSession.create({
        data: {
          partySessionId: party.id,
          leaderCharacterId: party.leaderCharacterId,
          status: "active",
          turn: state.turn,
          version: 1,
          rulesVersion: state.rulesVersion,
          bossKey: state.boss.monsterId,
          stateJson: state as unknown as Prisma.InputJsonValue,
          turnExpiresAt: input.turnExpiresAt
        },
        include: partyBossInclude
      });

      return { state: "started", session: mapSession(boss) };
    }).catch(async (error: unknown): Promise<PartyBossStartResult> => {
      if (!isUniqueConflict(error)) {
        throw error;
      }

      const existing = await this.findByPartyInviteToken(input.partyInviteToken);
      return existing
        ? { state: existing.status === "active" ? "already-active" : "terminal", session: existing }
        : { state: "blocked" };
    });
  }

  async submitActionForTelegramUser(
    telegramUserId: bigint,
    partyInviteToken: string,
    turn: number,
    action: PartyBossActionKey,
    input: PartyBossResolveInput,
    options: { gearAbility?: CombatGearAbilityInput } = {}
  ): Promise<PartyBossActionResult> {
    const inserted = await this.prisma.$transaction(async (tx): Promise<PartyBossActionResult> => {
      const character = await findCharacterByTelegramUser(tx, telegramUserId);
      if (!character) {
        return { state: "no-character" };
      }

      const session = await findByInviteToken(tx, partyInviteToken);
      if (!session) {
        return { state: "not-found" };
      }

      if (!isParticipant(session, character.id)) {
        return { state: "not-participant", session: mapSession(session) };
      }

      if (session.status !== "active") {
        return { state: "terminal", session: mapSession(session) };
      }

      if (session.turn !== turn || parseState(session).turn !== turn) {
        return { state: "stale", session: mapSession(session) };
      }

      const state = parseState(session);
      const actor = state.participants.find((participant) => participant.characterId === character.id);
      if (!actor || actor.status !== "active" || actor.resources.hp <= 0) {
        return { state: "stale", session: mapSession(session) };
      }

      if (action === "gear" && options.gearAbility) {
        const matchingGrant = getCombatMantokAbilityGrantsByIds({
          grantIds: actor.equipmentAbilityGrantIds ?? [],
          characterLevel: actor.combatStats.level
        }).some((grant) => grant.combat?.profile.id === options.gearAbility?.profile.id);
        if (!matchingGrant) {
          return { state: "stale", session: mapSession(session) };
        }

        const availability = getCombatGearActionAvailabilityForActor(
          actor.resources,
          options.gearAbility.profile
        );
        if (!availability.available) {
          return {
            state: "gear-unavailable",
            reason: availability.reason === "cooldown" ? "skill-on-cooldown" : "not-enough-mana",
            session: mapSession(session)
          };
        }
      }

      const queuedState = await writePartyBossActionChoice(tx, {
        sessionId: session.id,
        actorCharacterId: character.id,
        turn,
        action,
        submittedAt: input.now,
        ...(options.gearAbility ? { gearAbility: options.gearAbility } : {})
      });

      const current = await tx.partyBossSession.findUnique({
        where: { id: session.id },
        include: partyBossInclude
      });

      if (!current) {
        return { state: "not-found" };
      }

      return { state: queuedState, session: mapSession(current) };
    });

    if (!("session" in inserted)) {
      return inserted;
    }

    if (inserted.state === "queued" || inserted.state === "updated" || inserted.state === "duplicate") {
      const resolved = await this.resolveIfReady(inserted.session.id, "all-actions", input);
      return resolved ? { state: "resolved", ...resolved } : inserted;
    }

    return inserted;
  }

  async submitItemForTelegramUser(
    telegramUserId: bigint,
    partyInviteToken: string,
    turn: number,
    item: PartyBossCombatItemInput,
    input: PartyBossResolveInput
  ): Promise<PartyBossActionResult> {
    const inserted = await this.prisma.$transaction(async (tx): Promise<PartyBossActionResult> => {
      const character = await findCharacterByTelegramUser(tx, telegramUserId);
      if (!character) {
        return { state: "no-character" };
      }

      const session = await findByInviteToken(tx, partyInviteToken);
      if (!session) {
        return { state: "not-found" };
      }

      if (!isParticipant(session, character.id)) {
        return { state: "not-participant", session: mapSession(session) };
      }

      if (session.status !== "active") {
        return { state: "terminal", session: mapSession(session) };
      }

      if (session.turn !== turn || parseState(session).turn !== turn) {
        return { state: "stale", session: mapSession(session) };
      }

      const state = parseState(session);
      const actor = state.participants.find((participant) => participant.characterId === character.id);
      if (!actor || actor.status !== "active" || actor.resources.hp <= 0) {
        return { state: "stale", session: mapSession(session) };
      }

      const itemAvailability = getPartyBossCombatItemAvailability(actor, item.id);
      if (!itemAvailability.available) {
        return { state: "item-unavailable", reason: itemAvailability.reason, session: mapSession(session) };
      }

      if (calculatePartyBossCombatItemHealing(actor.resources, item.effect) <= 0) {
        return { state: "item-unavailable", reason: "full-hp", session: mapSession(session) };
      }

      const lease = await tx.activeCombatLease.findUnique({
        where: { characterId: character.id },
        select: { kind: true, referenceId: true }
      });
      if (!lease || lease.kind !== PARTY_BOSS_LEASE_KIND || lease.referenceId !== session.partySessionId) {
        return { state: "stale", session: mapSession(session) };
      }

      await tx.characterItem.updateMany({
        where: { characterId: character.id, itemId: item.id },
        data: { updatedAt: input.now }
      });

      await cancelPendingCombatItemUseOrders(tx, character.id, item.id, input.now);

      const [stack, equipped, reservedItemIds] = await Promise.all([
        tx.characterItem.findUnique({
          where: {
            characterId_itemId: {
              characterId: character.id,
              itemId: item.id
            }
          }
        }),
        tx.characterEquipment.findFirst({
          where: { characterId: character.id, itemId: item.id },
          select: { id: true }
        }),
        getCombatItemReservedItemIds(tx, character.id, input.now, {
          includeItemUseReservations: false
        })
      ]);

      if (!stack || stack.quantity < 1) {
        return { state: "item-unavailable", reason: "not-owned", session: mapSession(session) };
      }

      if (equipped || reservedItemIds.includes(item.id)) {
        return { state: "item-unavailable", reason: "reserved", session: mapSession(session) };
      }

      const queuedState = await writePartyBossActionChoice(tx, {
        sessionId: session.id,
        actorCharacterId: character.id,
        turn,
        action: "item",
        submittedAt: input.now,
        item
      });

      const current = await tx.partyBossSession.findUnique({
        where: { id: session.id },
        include: partyBossInclude
      });

      if (!current) {
        return { state: "not-found" };
      }

      return {
        state: queuedState,
        session: mapSession(current)
      };
    }).catch(async (error: unknown): Promise<PartyBossActionResult> => {
      if (!(error instanceof PartyBossItemUseRollback)) {
        throw error;
      }

      const current = await this.findByPartyInviteToken(partyInviteToken);
      return {
        state: "item-unavailable",
        reason: error.reason,
        ...(current ? { session: current } : {})
      };
    });

    if (!("session" in inserted)) {
      return inserted;
    }

    if (inserted.state === "queued" || inserted.state === "updated" || inserted.state === "duplicate") {
      const resolved = await this.resolveIfReady(inserted.session.id, "all-actions", input);
      return resolved
        ? {
            state: "resolved",
            ...resolved
          }
        : inserted;
    }

    return inserted;
  }

  async resolveTimedOutByToken(
    partyInviteToken: string,
    input: PartyBossResolveInput,
    mode: PartyBossTimeoutMode
  ): Promise<PartyBossActionResult> {
    const session = await findByInviteToken(this.prisma, partyInviteToken);
    if (!session) {
      return { state: "not-found" };
    }

    if (session.status !== "active") {
      return { state: "terminal", session: mapSession(session) };
    }

    const resolved = await this.resolveIfReady(
      session.id,
      mode === "force-dev" ? "timeout-force-dev" : "timeout-due",
      input
    );
    return resolved
      ? { state: "resolved", ...resolved }
      : { state: "queued", session: mapSession(session) };
  }

  async findActiveByTelegramUserId(telegramUserId: bigint): Promise<PartyBossSessionRecord | null> {
    const session = await this.prisma.partyBossSession.findFirst({
      where: {
        status: "active",
        partySession: {
          participants: {
            some: {
              status: "joined",
              character: {
                user: {
                  telegramUserId
                }
              }
            }
          }
        }
      },
      orderBy: {
        updatedAt: "desc"
      },
      include: partyBossInclude
    });

    return session ? mapSession(session) : null;
  }

  async findByPartyInviteToken(partyInviteToken: string): Promise<PartyBossSessionRecord | null> {
    const session = await findByInviteToken(this.prisma, partyInviteToken);
    return session ? mapSession(session) : null;
  }

  async listDueTimedOutSessions(now: Date, options: { limit?: number } = {}): Promise<PartyBossSessionRecord[]> {
    const sessions = await this.prisma.partyBossSession.findMany({
      where: {
        status: "active",
        turnExpiresAt: {
          lte: now
        }
      },
      orderBy: [
        { turnExpiresAt: "asc" },
        { id: "asc" }
      ],
      take: options.limit ?? 25,
      include: partyBossInclude
    });

    return sessions.map(mapSession);
  }

  async forceBigBarrelWinForTelegramUser(telegramUserId: bigint, now: Date): Promise<PartyBossDevWinResult> {
    return this.prisma.$transaction(async (tx): Promise<PartyBossDevWinResult> => {
      const session = await tx.partyBossSession.findFirst({
        where: {
          status: "active",
          partySession: {
            participants: {
              some: {
                status: "joined",
                character: {
                  user: {
                    telegramUserId
                  }
                }
              }
            }
          }
        },
        orderBy: {
          updatedAt: "desc"
        },
        include: partyBossInclude
      });

      if (!session) {
        return { state: "no-active" };
      }

      const state = parseState(session);
      if (!isBigBarrelBrotherState(state)) {
        return { state: "not-big", session: mapSession(session) };
      }

      const nextState: PartyBossState = {
        ...state,
        boss: {
          ...state.boss,
          hp: 0
        }
      };
      const updated = await tx.partyBossSession.updateMany({
        where: {
          id: session.id,
          status: "active",
          version: session.version
        },
        data: {
          version: session.version + 1,
          stateJson: nextState as unknown as Prisma.InputJsonValue,
          turnExpiresAt: now
        }
      });

      if (updated.count !== 1) {
        const current = await tx.partyBossSession.findUnique({
          where: { id: session.id },
          include: partyBossInclude
        });

        return current ? { state: "stale", session: mapSession(current) } : { state: "no-active" };
      }

      const current = await tx.partyBossSession.findUnique({
        where: { id: session.id },
        include: partyBossInclude
      });

      return current ? { state: "primed", session: mapSession(current) } : { state: "no-active" };
    });
  }

  private async resolveIfReady(
    sessionId: string,
    mode: "all-actions" | "timeout-due" | "timeout-force-dev",
    input: PartyBossResolveInput
  ): Promise<{ session: PartyBossSessionRecord; achievementEvents?: PartyBossAchievementEventRecord[] } | null> {
    return this.prisma.$transaction(async (tx): Promise<{
      session: PartyBossSessionRecord;
      achievementEvents?: PartyBossAchievementEventRecord[];
    } | null> => {
      const session = await tx.partyBossSession.findUnique({
        where: { id: sessionId },
        include: partyBossInclude
      });

      if (!session || session.status !== "active") {
        return session ? { session: mapSession(session) } : null;
      }

      const state = parseState(session);
      const requiredIds = state.participants
        .filter((participant) => participant.status === "active" && participant.resources.hp > 0)
        .map((participant) => participant.characterId);
      const actions = session.actions.filter((entry) => entry.turn === session.turn);
      const hasAllActions = requiredIds.every((characterId) =>
        actions.some((action) => action.actorCharacterId === characterId)
      );

      if (mode === "all-actions" && !hasAllActions) {
        return null;
      }

      if (mode === "timeout-due" && !hasAllActions && session.turnExpiresAt > input.now) {
        return null;
      }

      const actionInputs: QueuedPartyBossActionInput[] = actions.map((entry) => {
        const item = parseActionItem(entry.resultJson);
        const gearAbility = parseActionGearAbility(entry.resultJson);

        return {
          id: entry.id,
          characterId: entry.actorCharacterId,
          action: parseActionKey(entry.actionKey),
          origin: "manual" as const,
          ...(item ? { item } : {}),
          ...(gearAbility ? { gearAbility } : {})
        };
      });
      const resolved = resolvePartyBossRound({
        state,
        now: input.now,
        seed: session.id,
        actions: actionInputs.map((entry) => ({
          characterId: entry.characterId,
          action: entry.action,
          origin: entry.origin,
          ...(entry.item ? { item: entry.item } : {}),
          ...(entry.gearAbility ? { gearAbility: entry.gearAbility } : {})
        }))
      });
      const nextVersion = session.version + 1;
      const status = resolved.state.status;
      const result = resolved.result;
      const updated = await tx.partyBossSession.updateMany({
        where: {
          id: session.id,
          status: "active",
          turn: session.turn,
          version: session.version
        },
        data: {
          status,
          turn: resolved.state.turn,
          version: nextVersion,
          stateJson: resolved.state as unknown as Prisma.InputJsonValue,
          resultJson: result as unknown as Prisma.InputJsonValue,
          turnExpiresAt: status === "active" ? input.nextTurnExpiresAt : input.now,
          ...(status === "active" ? {} : { completedAt: input.now })
        }
      });

      if (updated.count !== 1) {
        return null;
      }

      for (const action of actionInputs) {
        if (action.action === "item" && action.item) {
          await consumePartyBossCombatItem(tx, action.characterId, action.item.id);
        }
      }

      for (const action of actions) {
        const summary = resolved.round.actions.find((entry) => entry.characterId === action.actorCharacterId);
        if (summary) {
          await tx.partyBossAction.update({
            where: { id: action.id },
            data: { resultJson: summary as unknown as Prisma.InputJsonValue }
          });
        }
      }

      let achievementEvents: PartyBossAchievementEventRecord[] = actionInputs.flatMap((action) =>
        action.action === "item" && action.item
          ? buildPartyBossItemActionAchievementEvents(session, action, action.item, input.now)
          : buildPartyBossGearActionAchievementEvents(
              session,
              action,
              resolved.round.actions.find((entry) => entry.characterId === action.characterId),
              input.now
            )
      );
      if (status !== "active") {
        achievementEvents = [
          ...achievementEvents,
          ...await settleTerminalPartyBoss(tx, session, resolved.state, input.now)
        ];
        await releasePartyBossLocks(tx, session.partySessionId);
      }

      const current = await tx.partyBossSession.findUnique({
        where: { id: session.id },
        include: partyBossInclude
      });

      return current
        ? {
            session: mapSession(current),
            ...(achievementEvents.length > 0 ? { achievementEvents } : {})
          }
        : null;
    });
  }
}

function buildPartyBossGearActionAchievementEvents(
  session: PartyBossRow,
  action: QueuedPartyBossActionInput,
  summary: PartyBossParticipantActionSummary | undefined,
  occurredAt: Date
): PartyBossAchievementEventRecord[] {
  if (
    action.action !== "gear" ||
    !action.gearAbility ||
    summary?.action !== "gear" ||
    summary.outcome === "not-enough-mana" ||
    summary.outcome === "skill-on-cooldown"
  ) {
    return [];
  }

  return [{
    type: "mantok.gear-action.used",
    characterId: action.characterId,
    sourceId: `${session.id}:turn:${session.turn}:gear:${action.id}`,
    occurredAt
  }];
}

async function settleTerminalPartyBoss(
  tx: TxClient,
  session: PartyBossRow,
  state: PartyBossState,
  now: Date
): Promise<PartyBossAchievementEventRecord[]> {
  const achievementEvents: PartyBossAchievementEventRecord[] = [];
  if (!isBigBarrelBrotherState(state)) {
    return achievementEvents;
  }

  const periodId = session.partySession.periodId;
  const rewardSnapshots = new Map<string, PartyBossRewardSnapshot>();
  const attemptXpSnapshots = new Map<string, number>();

  for (const participant of state.participants) {
    const remortCount = await countCharacterRemorts(tx, participant.characterId);
    const current = await tx.character.findUnique({
      where: {
        id: participant.characterId
      }
    });
    if (!current) {
      continue;
    }

    const remortMatches = remortCount === participant.remortCount;
    if (state.status === "lost") {
      const lossXp = remortMatches && isBigBarrelEligible(current.level, remortCount)
        ? buildBigBarrelLossXp(state, participant)
        : 0;
      const appliedLossXp = await settleBigParticipantAttempt(tx, current, participant, now, remortCount, lossXp, {
        partyBossSessionId: session.id,
        partySessionId: session.partySessionId
      });
      if (appliedLossXp > 0) {
        attemptXpSnapshots.set(participant.characterId, appliedLossXp);
      }
      if (appliedLossXp > 0) {
        achievementEvents.push({
          type: "barrel.raid.lost",
          characterId: participant.characterId,
          sourceId: session.id,
          occurredAt: now
        });
      }
      continue;
    }

    if (!periodId || state.status !== "won") {
      await settleBigParticipantResources(tx, participant, now);
      continue;
    }

    if (!remortMatches || !isBigBarrelEligible(current.level, remortCount)) {
      if (remortMatches) {
        await settleBigParticipantResources(tx, participant, now);
      }
      continue;
    }

    const existing = await tx.dailyAction.findUnique({
      where: {
        characterId_key_localDate: {
          characterId: participant.characterId,
          key: FRIDAY_BARREL_RAID_KEY,
          localDate: periodId
        }
      }
    });
    if (existing) {
      await settleBigParticipantResources(tx, participant, now);
      continue;
    }

    const reward = buildBigBarrelReward(state, participant);
    if (!reward.meaningful) {
      await settleBigParticipantResources(tx, participant, now);
      continue;
    }

    const itemGrants = reward.meaningful
      ? buildBigBarrelBrotherItemGrants({
          periodId,
          characterId: participant.characterId,
          level: participant.combatStats.level,
          luck: participant.combatStats.luck,
          ...(participant.combatStats.classId ? { classId: participant.combatStats.classId } : {}),
          ...(participant.combatStats.raceId ? { raceId: participant.combatStats.raceId } : {})
        })
      : [];
    const oldLevel = Math.max(current.level, getLevelForXp(current.xp, { remortCount }));
    const nextXp = current.xp + reward.xp;
    const newLevel = Math.max(current.level, getLevelForXp(nextXp, { remortCount }));

    const action = await tx.dailyAction.create({
      data: {
        characterId: participant.characterId,
        key: FRIDAY_BARREL_RAID_KEY,
        localDate: periodId,
        rewardXp: reward.xp,
        rewardGold: reward.gold,
        spentGold: 0,
        resultJson: {
          kind: "big-barrel-brother-victory",
          rulesVersion: BIG_BARREL_BROTHER_RULES_VERSION,
          partyBossSessionId: session.id,
          partySessionId: session.partySessionId,
          reward,
          resources: {
            hp: participant.resources.hp,
            mana: participant.resources.mana
          }
        }
      }
    });
    achievementEvents.push({
      type: "barrel.raid.claimed",
      characterId: participant.characterId,
      sourceId: action.id,
      occurredAt: now
    });

    await tx.character.update({
      where: {
        id: participant.characterId
      },
      data: {
        xp: nextXp,
        gold: {
          increment: reward.gold
        },
        level: newLevel,
        hpCurrent: Math.max(0, Math.floor(participant.resources.hp)),
        manaCurrent: Math.max(0, Math.floor(participant.resources.mana)),
        hpRegenAt: now,
        manaRegenAt: now
      }
    });
    await recordLevelMilestones(tx, participant.characterId, oldLevel, newLevel, undefined, {
      remortCount
    });

    const appliedItemGrants = [];
    for (const grant of itemGrants) {
      if (grant.quantity <= 0) {
        continue;
      }

      await tx.characterItem.upsert({
        where: {
          characterId_itemId: {
            characterId: participant.characterId,
            itemId: grant.itemId
          }
        },
        create: {
          characterId: participant.characterId,
          itemId: grant.itemId,
          quantity: grant.quantity
        },
        update: {
          quantity: {
            increment: grant.quantity
          }
        }
      });
      appliedItemGrants.push(grant);
    }

    if (appliedItemGrants.length > 0) {
      await tx.dailyAction.update({
        where: {
          id: action.id
        },
        data: {
          resultJson: {
            kind: "big-barrel-brother-victory",
            rulesVersion: BIG_BARREL_BROTHER_RULES_VERSION,
            partyBossSessionId: session.id,
            partySessionId: session.partySessionId,
            reward: {
              ...reward,
              appliedItemGrants
            },
            resources: {
              hp: participant.resources.hp,
              mana: participant.resources.mana
            }
          }
        }
      });
    }
    rewardSnapshots.set(participant.characterId, {
      xp: reward.xp,
      gold: reward.gold,
      itemGrants: appliedItemGrants.map((grant) => ({
        itemId: grant.itemId,
        name: getItemName(grant.itemId),
        quantity: grant.quantity
      }))
    });
  }

  const result = buildResult(state, now);
  if (result) {
    await tx.partyBossSession.update({
      where: { id: session.id },
      data: {
        resultJson: enrichBigBarrelResult(result, {
          rewards: rewardSnapshots,
          attemptXp: attemptXpSnapshots
        }) as unknown as Prisma.InputJsonValue
      }
    });
  }

  return achievementEvents;
}

async function hasIneligibleBigBarrelParticipant(
  tx: TxClient,
  party: PartyRow,
  joined: PartyRow["participants"],
  now: Date
): Promise<boolean> {
  const characterIds = joined.map((participant) => participant.characterId);
  if (!party.periodId || characterIds.length === 0) {
    return true;
  }

  if (joined.some((participant) =>
    !isBigBarrelEligible(participant.character.level, participant.character._count.remorts) ||
    participant.character._count.remorts !== participant.remortCount
  )) {
    return true;
  }

  const [activeLease, existingSuccess, activeLossCooldown] = await Promise.all([
    tx.activeCombatLease.findFirst({
      where: {
        characterId: {
          in: characterIds
        }
      },
      select: {
        id: true
      }
    }),
    tx.dailyAction.findFirst({
      where: {
        characterId: {
          in: characterIds
        },
        key: FRIDAY_BARREL_RAID_KEY,
        localDate: party.periodId
      },
      select: {
        id: true
      }
    }),
    tx.characterCooldown.findFirst({
      where: {
        characterId: {
          in: characterIds
        },
        key: BIG_BARREL_BROTHER_LOSS_RETRY_COOLDOWN_KEY,
        availableAt: {
          gt: now
        }
      },
      select: {
        id: true
      }
    })
  ]);

  return Boolean(activeLease || existingSuccess || activeLossCooldown);
}

async function settleBigParticipantResources(
  tx: TxClient,
  participant: PartyBossState["participants"][number],
  now: Date
): Promise<void> {
  await tx.character.updateMany({
    where: {
      id: participant.characterId
    },
    data: {
      hpCurrent: Math.max(0, Math.floor(participant.resources.hp)),
      manaCurrent: Math.max(0, Math.floor(participant.resources.mana)),
      hpRegenAt: now,
      manaRegenAt: now
    }
  });
}

async function settleBigParticipantAttempt(
  tx: TxClient,
  current: { id: string; level: number; xp: number },
  participant: PartyBossState["participants"][number],
  now: Date,
  remortCount: number,
  xp: number,
  source: { partyBossSessionId: string; partySessionId: string }
): Promise<number> {
  const safeXp = Math.max(0, Math.floor(xp));
  if (safeXp <= 0) {
    await settleBigParticipantResources(tx, participant, now);
    return 0;
  }

  const existingCooldown = await tx.characterCooldown.findUnique({
    where: {
      characterId_key: {
        characterId: participant.characterId,
        key: BIG_BARREL_BROTHER_LOSS_RETRY_COOLDOWN_KEY
      }
    },
    select: {
      availableAt: true
    }
  });
  if (existingCooldown && existingCooldown.availableAt > now) {
    await settleBigParticipantResources(tx, participant, now);
    return 0;
  }

  const oldLevel = Math.max(current.level, getLevelForXp(current.xp, { remortCount }));
  const nextXp = current.xp + safeXp;
  const newLevel = Math.max(current.level, getLevelForXp(nextXp, { remortCount }));

  await tx.character.update({
    where: {
      id: participant.characterId
    },
    data: {
      xp: nextXp,
      level: newLevel,
      hpCurrent: Math.max(0, Math.floor(participant.resources.hp)),
      manaCurrent: Math.max(0, Math.floor(participant.resources.mana)),
      hpRegenAt: now,
      manaRegenAt: now
    }
  });
  await tx.characterCooldown.upsert({
    where: {
      characterId_key: {
        characterId: participant.characterId,
        key: BIG_BARREL_BROTHER_LOSS_RETRY_COOLDOWN_KEY
      }
    },
    create: {
      characterId: participant.characterId,
      key: BIG_BARREL_BROTHER_LOSS_RETRY_COOLDOWN_KEY,
      availableAt: new Date(now.getTime() + BIG_BARREL_BROTHER_LOSS_RETRY_COOLDOWN_MS),
      resultJson: {
        kind: "big-barrel-brother-loss-retry-cooldown",
        rulesVersion: BIG_BARREL_BROTHER_RULES_VERSION,
        partyBossSessionId: source.partyBossSessionId,
        partySessionId: source.partySessionId,
        awardedXp: safeXp
      }
    },
    update: {
      availableAt: new Date(now.getTime() + BIG_BARREL_BROTHER_LOSS_RETRY_COOLDOWN_MS),
      resultJson: {
        kind: "big-barrel-brother-loss-retry-cooldown",
        rulesVersion: BIG_BARREL_BROTHER_RULES_VERSION,
        partyBossSessionId: source.partyBossSessionId,
        partySessionId: source.partySessionId,
        awardedXp: safeXp
      }
    }
  });

  if (newLevel > oldLevel) {
    await recordLevelMilestones(tx, participant.characterId, oldLevel, newLevel, undefined, {
      remortCount
    });
  }

  return safeXp;
}

function buildBigBarrelReward(
  state: PartyBossState,
  participant: PartyBossState["participants"][number]
): { meaningful: boolean; tier: "none" | "partial" | "full"; xp: number; gold: number } {
  const meaningful = isMeaningfulBigBarrelParticipant(participant);
  const availableRounds = Math.max(1, state.roundLog.length);
  const full =
    meaningful &&
    participant.contribution.submittedActions >= Math.ceil(availableRounds / 2) &&
    (participant.contribution.damageDealt > 0 || participant.contribution.damageTaken > 0);
  const tier = full ? "full" : meaningful ? "partial" : "none";
  const raidLevel = clamp(state.boss.level, 8, 13);
  const tierXp = tier === "full" ? 13 : tier === "partial" ? 5 : 0;
  const tierGold = tier === "full" ? 8 : tier === "partial" ? 3 : 0;

  return {
    meaningful,
    tier,
    xp: meaningful ? 23 + 3 * (raidLevel - 8) + tierXp : 0,
    gold: meaningful ? 13 + 2 * (raidLevel - 8) + tierGold : 0
  };
}

async function releasePartyBossLocks(tx: TxClient, partySessionId: string): Promise<void> {
  await tx.activeCombatLease.deleteMany({
    where: {
      kind: PARTY_BOSS_LEASE_KIND,
      referenceId: partySessionId
    }
  });
  await tx.partySession.updateMany({
    where: {
      id: partySessionId,
      status: ACTIVE_PARTY_STATUS
    },
    data: {
      status: "completed",
      activeLeaderKey: null,
      version: { increment: 1 }
    }
  });
  await tx.partyParticipant.updateMany({
    where: {
      sessionId: partySessionId,
      activeMembershipKey: {
        not: null
      }
    },
    data: {
      activeMembershipKey: null
    }
  });
}

async function expireRecruitingPartyIfNeeded(
  tx: TxClient,
  inviteToken: string,
  now: Date,
  options: { allowBigBarrelExpiredRecruiting?: boolean } = {}
): Promise<void> {
  const party = await tx.partySession.findUnique({
    where: { inviteToken },
    select: {
      id: true,
      status: true,
      originLocationId: true,
      expiresAt: true
    }
  });

  if (
    party?.status === RECRUITING_PARTY_STATUS &&
    party.expiresAt <= now &&
    !(options.allowBigBarrelExpiredRecruiting === true &&
      party.originLocationId === BIG_BARREL_PARTY_ORIGIN_LOCATION_ID)
  ) {
    await tx.partySession.update({
      where: { id: party.id },
      data: {
        status: "expired",
        activeLeaderKey: null,
        version: { increment: 1 }
      }
    });
    await tx.partyParticipant.updateMany({
      where: {
        sessionId: party.id,
        activeMembershipKey: {
          not: null
        }
      },
      data: {
        activeMembershipKey: null
      }
    });
  }
}

async function findCharacterByTelegramUser(
  prisma: Pick<PrismaClient, "character"> | TxClient,
  telegramUserId: bigint
): Promise<CharacterRow | null> {
  return prisma.character.findFirst({
    where: {
      user: {
        telegramUserId
      }
    },
    include: partyCharacterInclude
  });
}

async function findByInviteToken(
  prisma: Pick<PrismaClient, "partyBossSession"> | TxClient,
  partyInviteToken: string
): Promise<PartyBossRow | null> {
  return prisma.partyBossSession.findFirst({
    where: {
      partySession: {
        inviteToken: partyInviteToken
      }
    },
    include: partyBossInclude,
    orderBy: {
      updatedAt: "desc"
    }
  });
}

function mapSession(row: PartyBossRow): PartyBossSessionRecord {
  const state = parseState(row);

  return {
    id: row.id,
    partySessionId: row.partySessionId,
    partyInviteToken: row.partySession.inviteToken,
    leaderCharacterId: row.leaderCharacterId,
    status: parseStatus(row.status),
    turn: row.turn,
    version: row.version,
    rulesVersion: row.rulesVersion,
    bossKey: row.bossKey,
    state,
    result: parseResult(row.resultJson, state),
    turnExpiresAt: row.turnExpiresAt,
    completedAt: row.completedAt,
    queuedActions: row.actions.map((action) => {
      const item = parseActionItem(action.resultJson);
      const gearAbility = parseActionGearAbility(action.resultJson);

      return {
        characterId: action.actorCharacterId,
        turn: action.turn,
        action: parseActionKey(action.actionKey),
        ...(item ? { item } : {}),
        ...(gearAbility ? { gearAbility } : {})
      };
    }),
    participants: row.partySession.participants
      .filter((participant) => participant.status === "joined")
      .map((participant) => mapCharacter(participant.character))
  };
}

function mapCharacter(row: CharacterRow): PartyBossParticipantSnapshot {
  return {
    id: row.id,
    userId: row.userId,
    currentLocationId: row.user.lastSeenLocationId,
    name: row.name,
    pronoun: row.pronoun,
    path: row.path,
    raceId: row.raceId,
    classId: row.classId,
    level: row.level,
    xp: row.xp,
    gold: row.gold,
    hpCurrent: row.hpCurrent,
    hpMax: row.hpMax,
    manaCurrent: row.manaCurrent,
    manaMax: row.manaMax,
    hpRegenAt: row.hpRegenAt,
    manaRegenAt: row.manaRegenAt,
    activeCosmeticTitleGrantId: row.activeCosmeticTitleGrantId,
    statsJson: row.statsJson,
    telegramUserId: row.user.telegramUserId,
    remortCount: row._count.remorts
  };
}

function mapCharacterForCombat(
  row: CharacterRow
): PartyBossParticipantSnapshot & { equipment: CharacterRow["equipment"] } {
  return {
    ...mapCharacter(row),
    equipment: row.equipment
  };
}

function parseState(row: Pick<PartyBossRow, "stateJson">): PartyBossState {
  return row.stateJson as unknown as PartyBossState;
}

function parseResult(value: Prisma.JsonValue, state: PartyBossState) {
  return value
    ? value as unknown as ReturnType<typeof buildResult>
    : buildResult(state, new Date());
}

function parseStatus(value: string): PartyBossSessionStatus {
  return value === "won" || value === "lost" || value === "cancelled" ? value : "active";
}

function parseActionKey(value: string): PartyBossActionKey {
  return value === "defend" || value === "skill" || value === "race" || value === "gear" || value === "item" ? value : "attack";
}

function buildKharakternykWardSignForStartedParty(
  joined: PartyRow["participants"]
): { kind: "kharakternyk"; placerCharacterId: string; supportCount: number } | undefined {
  const placer = joined.find((participant) => {
    const wardSign = parseWardSignSnapshot(participant.snapshotJson);
    return (
      wardSign?.placerCharacterId === participant.characterId &&
      wardSign.remortCount === participant.remortCount
    );
  });
  if (!placer) {
    return undefined;
  }

  const supportCount = joined.filter((participant) => {
    if (participant.characterId === placer.characterId) {
      return false;
    }

    const support = parseWardSupportSnapshot(participant.snapshotJson);
    return (
      support?.placerCharacterId === placer.characterId &&
      support.supporterCharacterId === participant.characterId &&
      support.remortCount === participant.remortCount
    );
  }).length;

  return {
    kind: "kharakternyk",
    placerCharacterId: placer.characterId,
    supportCount: Math.min(KHARAKTERNYK_WARD_SUPPORT_CAP, supportCount)
  };
}

function parseWardSignSnapshot(snapshotJson: Prisma.JsonValue | null): {
  placerCharacterId: string;
  remortCount: number;
} | null {
  const value = getSnapshotObject(snapshotJson, KHARAKTERNYK_WARD_SIGN_SNAPSHOT_KEY);
  if (!value || value.kind !== "kharakternyk") {
    return null;
  }

  return typeof value.placerCharacterId === "string" && typeof value.remortCount === "number"
    ? {
        placerCharacterId: value.placerCharacterId,
        remortCount: Math.max(0, Math.floor(value.remortCount))
      }
    : null;
}

function parseWardSupportSnapshot(snapshotJson: Prisma.JsonValue | null): {
  placerCharacterId: string;
  supporterCharacterId: string;
  remortCount: number;
} | null {
  const value = getSnapshotObject(snapshotJson, KHARAKTERNYK_WARD_SUPPORT_SNAPSHOT_KEY);
  if (!value || value.kind !== "kharakternyk") {
    return null;
  }

  return (
    typeof value.placerCharacterId === "string" &&
    typeof value.supporterCharacterId === "string" &&
    typeof value.remortCount === "number"
  )
    ? {
        placerCharacterId: value.placerCharacterId,
        supporterCharacterId: value.supporterCharacterId,
        remortCount: Math.max(0, Math.floor(value.remortCount))
      }
    : null;
}

function getSnapshotObject(snapshotJson: Prisma.JsonValue | null, key: string): Record<string, unknown> | null {
  if (!snapshotJson || typeof snapshotJson !== "object" || Array.isArray(snapshotJson)) {
    return null;
  }

  const value = (snapshotJson as Record<string, unknown>)[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseActionItem(value: Prisma.JsonValue): PartyBossCombatItemInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as { kind?: unknown; item?: unknown };
  if (record.kind !== "combat-item" || !record.item || typeof record.item !== "object" || Array.isArray(record.item)) {
    return null;
  }

  const item = record.item as {
    id?: unknown;
    name?: unknown;
    effect?: unknown;
  };
  if (typeof item.id !== "string" || typeof item.name !== "string") {
    return null;
  }

  if (!item.effect || typeof item.effect !== "object" || Array.isArray(item.effect)) {
    return null;
  }

  const effect = item.effect as { kind?: unknown; amount?: unknown; percent?: unknown };
  if (effect.kind === "heal-hp" && typeof effect.amount === "number") {
    return {
      id: item.id,
      name: item.name,
      effect: {
        kind: "heal-hp",
        amount: effect.amount
      }
    };
  }

  if (effect.kind === "heal-hp-to-min-percent" && typeof effect.percent === "number") {
    return {
      id: item.id,
      name: item.name,
      effect: {
        kind: "heal-hp-to-min-percent",
        percent: effect.percent
      }
    };
  }

  return null;
}

function parseActionGearAbility(value: Prisma.JsonValue): CombatGearAbilityInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as { kind?: unknown; gearAbility?: unknown };
  if (record.kind !== "gear-action" || !record.gearAbility || typeof record.gearAbility !== "object" || Array.isArray(record.gearAbility)) {
    return null;
  }

  const gearAbility = record.gearAbility as { profile?: { id?: unknown } };
  return typeof gearAbility.profile?.id === "string"
    ? gearAbility as unknown as CombatGearAbilityInput
    : null;
}

async function writePartyBossActionChoice(
  tx: TxClient,
  input: {
    sessionId: string;
    actorCharacterId: string;
    turn: number;
    action: PartyBossActionKey;
    submittedAt: Date;
    item?: PartyBossCombatItemInput;
    gearAbility?: CombatGearAbilityInput;
  }
): Promise<QueuedPartyBossActionState> {
  const resultJson = input.item
    ? {
        kind: "combat-item",
        item: input.item
      } as unknown as Prisma.InputJsonValue
    : input.gearAbility
    ? {
        kind: "gear-action",
        gearAbility: input.gearAbility
      } as unknown as Prisma.InputJsonValue
    : null;

  const existing = await tx.partyBossAction.findFirst({
    where: {
      sessionId: input.sessionId,
      actorCharacterId: input.actorCharacterId,
      turn: input.turn
    }
  });

  if (existing) {
    if (isSamePartyBossActionChoice(existing.actionKey, existing.resultJson, input.action, input.item, input.gearAbility)) {
      return "duplicate";
    }

    await tx.partyBossAction.update({
      where: { id: existing.id },
      data: {
        actionKey: input.action,
        resultJson: resultJson ?? Prisma.JsonNull,
        submittedAt: input.submittedAt
      }
    });

    return "updated";
  }

  await tx.partyBossAction.create({
    data: {
      sessionId: input.sessionId,
      actorCharacterId: input.actorCharacterId,
      turn: input.turn,
      actionKey: input.action,
      submittedAt: input.submittedAt,
      ...(resultJson ? { resultJson } : {})
    }
  }).catch(async (error: unknown) => {
    if (!isUniqueConflict(error)) {
      throw error;
    }

    await tx.partyBossAction.updateMany({
      where: {
        sessionId: input.sessionId,
        actorCharacterId: input.actorCharacterId,
        turn: input.turn
      },
      data: {
        actionKey: input.action,
        resultJson: resultJson ?? Prisma.JsonNull,
        submittedAt: input.submittedAt
      }
    });
  });

  return "queued";
}

function isSamePartyBossActionChoice(
  existingActionKey: string,
  existingResultJson: Prisma.JsonValue | null,
  nextAction: PartyBossActionKey,
  nextItem?: PartyBossCombatItemInput,
  nextGearAbility?: CombatGearAbilityInput
): boolean {
  if (parseActionKey(existingActionKey) !== nextAction) {
    return false;
  }

  const existingItem = parseActionItem(existingResultJson);
  if (!nextItem) {
    const existingGearAbility = parseActionGearAbility(existingResultJson);
    if (!nextGearAbility) {
      return !existingItem && !existingGearAbility;
    }

    return existingGearAbility?.profile.id === nextGearAbility.profile.id;
  }

  return existingItem?.id === nextItem.id &&
    existingItem.name === nextItem.name &&
    JSON.stringify(existingItem.effect) === JSON.stringify(nextItem.effect);
}

async function consumePartyBossCombatItem(
  tx: TxClient,
  characterId: string,
  itemId: string
): Promise<void> {
  const consumed = await tx.characterItem.updateMany({
    where: {
      characterId,
      itemId,
      quantity: { gte: 1 }
    },
    data: {
      quantity: { decrement: 1 }
    }
  });

  if (consumed.count !== 1) {
    throw new PartyBossItemUseRollback("not-owned");
  }

  await tx.characterItem.deleteMany({
    where: {
      characterId,
      quantity: { lte: 0 }
    }
  });
}

function buildPartyBossItemActionAchievementEvents(
  session: PartyBossRow,
  action: QueuedPartyBossActionInput,
  item: PartyBossCombatItemInput,
  occurredAt: Date
): PartyBossAchievementEventRecord[] {
  const events: PartyBossAchievementEventRecord[] = [{
    type: "item.used",
    characterId: action.characterId,
    itemId: item.id,
    sourceId: action.id,
    occurredAt
  }];

  if (
    session.rulesVersion === BIG_BARREL_BROTHER_RULES_VERSION &&
    isMedicalCombatItemId(item.id)
  ) {
    events.push({
      type: "barrel.raid.bandage-used",
      characterId: action.characterId,
      sourceId: action.id,
      occurredAt
    });
  }

  return events;
}

function enrichBigBarrelResult(
  result: PartyBossResult,
  snapshots: {
    rewards: Map<string, PartyBossRewardSnapshot>;
    attemptXp: Map<string, number>;
  }
): PartyBossResult {
  return {
    ...result,
    participants: result.participants.map((participant) => {
      const reward = snapshots.rewards.get(participant.characterId);
      const attemptXp = snapshots.attemptXp.get(participant.characterId);

      return {
        ...participant,
        ...(reward ? { reward } : {}),
        ...(attemptXp !== undefined ? { attemptXp } : {})
      };
    })
  };
}

function getItemName(itemId: string): string {
  return items.find((item) => item.id === itemId)?.name ?? itemId;
}

async function getCombatItemReservedItemIds(
  tx: TxClient,
  characterId: string,
  now: Date,
  options: { includeItemUseReservations?: boolean } = {}
): Promise<string[]> {
  const [pendingChestRuns, pendingLevelBarters, pendingSales, pendingTransfers, pendingUses] = await Promise.all([
    tx.mantokChestRun.findMany({
      where: { characterId, status: "pending" },
      select: { inputItemsJson: true }
    }),
    tx.levelBarterExchange.findMany({
      where: { characterId, status: "pending" },
      select: { inputItemsJson: true }
    }),
    tx.korchmaMantokSale.findMany({
      where: {
        characterId,
        status: { in: ["pending", "processing"] },
        expiresAt: { gt: now }
      },
      select: { selectionJson: true }
    }),
    findActiveTransferReservedItems(tx, { senderCharacterId: characterId, now }),
    options.includeItemUseReservations === false
      ? Promise.resolve([])
      : findActiveItemUseReservedItems(tx, { characterId, now })
  ]);
  const reserved = new Set<string>();

  for (const run of pendingChestRuns) {
    for (const item of parseCombatReservedItems(run.inputItemsJson)) {
      reserved.add(item.itemId);
    }
  }
  for (const exchange of pendingLevelBarters) {
    for (const item of parseCombatReservedItems(exchange.inputItemsJson)) {
      reserved.add(item.itemId);
    }
  }
  for (const sale of pendingSales) {
    for (const item of parseCombatReservedItems(sale.selectionJson)) {
      reserved.add(item.itemId);
    }
  }
  for (const transfer of pendingTransfers) {
    reserved.add(transfer.itemId);
  }
  for (const use of pendingUses) {
    reserved.add(use.itemId);
  }

  return [...reserved];
}

async function cancelPendingCombatItemUseOrders(
  tx: TxClient,
  characterId: string,
  itemId: string,
  now: Date
): Promise<void> {
  await tx.itemUseOrder.updateMany({
    where: {
      characterId,
      itemId,
      status: { in: ["pending", "processing"] },
      expiresAt: { gt: now }
    },
    data: {
      status: "cancelled",
      reservationKey: null,
      cancelledAt: now,
      resultJson: {
        kind: "cancelled",
        itemId
      }
    }
  });
}

function parseCombatReservedItems(value: unknown): Array<{ itemId: string; quantity: number }> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return [];
    }
    const itemId = (entry as { itemId?: unknown }).itemId;
    const quantity = (entry as { quantity?: unknown }).quantity;

    return typeof itemId === "string" && typeof quantity === "number"
      ? [{ itemId, quantity }]
      : [];
  });
}

function isParticipant(session: PartyBossRow, characterId: string): boolean {
  return session.partySession.participants.some(
    (participant) => participant.characterId === characterId && participant.status === "joined"
  );
}

function isUniqueConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
