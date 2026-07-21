import { Prisma, type PrismaClient } from "@prisma/client";
import {
  BIG_BARREL_BROTHER_LOSS_RETRY_COOLDOWN_KEY,
  BIG_BARREL_BROTHER_LOSS_RETRY_COOLDOWN_MS,
  BIG_BARREL_BROTHER_BOSS_KEY,
  BIG_BARREL_BROTHER_RULES_VERSION,
  buildBigBarrelLossXp,
  buildResult,
  calculatePartyBossCombatItemHealing,
  clonePartyBossState,
  createPartyBossState,
  getPartyBossCombatItemAvailability,
  getWarriorRaidTauntAvailability,
  isBigBarrelEligible,
  isBigBarrelBrotherState,
  isMeaningfulBigBarrelParticipant,
  resolvePartyBossRound,
  type PartyBossActionKey,
  type PartyBossStandardActionKey,
  type PartyBossCombatItemInput,
  type PartyBossParticipantActionSummary,
  type PartyBossRoundSummary,
  type PartyBossResult,
  type PartyBossRewardSnapshot,
  type PartyBossState
} from "../../domain/partyBoss/partyBoss";
import {
  parsePartyBossResultStrict,
  parsePartyBossStateStrict,
  parsePartyBossRoundSummaryStrict,
  parsePartyBossStatusStrict
} from "../../domain/partyBoss/partyBossStateValidation";
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
  buildFridayBarrelRaidPendingKey,
  buildBigBarrelBrotherItemGrants,
  FRIDAY_BARREL_RAID_KEY
} from "../../services/tavernRaidService";
import { recordLevelMilestones } from "./levelMilestoneRepository";
import { countCharacterRemorts } from "./prismaRemortCount";
import { findActiveItemUseReservedItems } from "./itemUseReservations";
import { findActiveTransferReservedItems } from "./itemTransferReservations";
import { isMedicalCombatItemId } from "../../services/combatItemUse";
import { BUREAUCRAMANCER_PROTOCOL_KIND } from "../../services/bureaucramancerProtocol";
import { HpRecoveryNotificationProducer } from "./hpRecoveryNotificationProducer";
import {
  freezeVarenykSatedFromCooldown,
  releaseCombatLeaseWithTimedStatuses,
  VarenykSatedCasError
} from "./prismaVarenykSated";
import {
  findBardMusicAvailableAt,
  freezeBardInspirationFromCooldown,
  writeBardMusicAvailability
} from "./prismaBardSupport";
import { PRESENCE_LOCATION_KORCHMA_BARREL } from "../../services/presenceService";
import { buildBardLamentPlan } from "../../domain/noncombat/bardSupport";
import { parseBardInspirationCombatState } from "../../domain/noncombat/bardSupport";
import { parseVarenykSatedCombatState } from "../../domain/noncombat/varenykSatedSupport";
import { SeededRandomSource } from "../../shared/random";
import { PrismaPartyRaidChatTransactionWriter } from "./prismaPartyRaidChatEvents";
import { PartyBossStateValidationError } from "../../domain/partyBoss/partyBossStateValidation";

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
const BUREAUCRAMANCER_PROTOCOL_SNAPSHOT_KEY = "bureaucramancerPersonalProtocol13B";
const BUREAUCRAMANCER_PROTOCOL_SIGNATURE_SNAPSHOT_KEY = "bureaucramancerPersonalProtocol13BSignature";
class PartyBossItemUseRollback extends Error {
  constructor(readonly reason: Extract<PartyBossActionResult, { state: "item-unavailable" }>["reason"]) {
    super(reason);
  }
}

class PartyBossLamentRaceRollback extends Error {}

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
        where: {
          character: { is: {} }
        },
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
      { submittedAt: "desc" as const },
      { id: "asc" as const }
    ],
    take: 13
  }
} satisfies Prisma.PartyBossSessionInclude;

export class PrismaPartyBossRepository implements PartyBossRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly hpRecoveryProducer = new HpRecoveryNotificationProducer(false),
    private readonly raidChat = new PrismaPartyRaidChatTransactionWriter(false)
  ) {}

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
      const initialParty = await tx.partySession.findUnique({
        where: { inviteToken: input.partyInviteToken },
        include: partyInclude
      });

      if (!initialParty) {
        return { state: "not-found" };
      }
      let party: PartyRow = initialParty;

      let claimedParty: PartyRow | null = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const existingBoss = await tx.partyBossSession.findUnique({
          where: { partySessionId: party.id },
          include: partyBossInclude
        });

        if (existingBoss) {
          return {
            state: existingBoss.status === "active" ? "already-active" : "terminal",
            session: this.mapSession(existingBoss)
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

        if (party.status === "ineligible") {
          return { state: "terminal-ineligible" };
        }

        if (party.status !== RECRUITING_PARTY_STATUS) {
          return { state: "not-recruiting" };
        }

        const candidateJoined = party.participants.filter((participant) => participant.status === "joined");
        if (candidateJoined.length < party.minimumParticipants) {
          return { state: "too-small" };
        }

        const candidateIsBigBarrel = party.originLocationId === BIG_BARREL_PARTY_ORIGIN_LOCATION_ID;
        if (candidateIsBigBarrel) {
          const eligibilityConflict = await getBigBarrelEligibilityConflict(tx, party, candidateJoined, input.now);
          if (eligibilityConflict === "permanent") {
            if (party.expiresAt <= input.now && input.allowExpiredRecruiting === true) {
              const terminalized = await terminalizeIneligibleRecruitingParty(tx, party);
              if (terminalized) {
                await this.raidChat.append(tx, {
                  partySessionId: party.id,
                  eventType: "raid.expired",
                  sourceKey: `party:${party.id}:terminal:ineligible`,
                  occurredAt: input.now
                });
                await this.raidChat.terminalize(tx, party.id, input.now);
                return { state: "terminal-ineligible" };
              }

              const latest = await tx.partySession.findUnique({
                where: { id: party.id },
                include: partyInclude
              });
              if (!latest) {
                return { state: "not-found" };
              }
              party = latest;
              continue;
            }
            return { state: "ineligible" };
          }
          if (eligibilityConflict === "transient") {
            return { state: "ineligible" };
          }
        }

        const blocker = await tx.activeCombatLease.findFirst({
          where: {
            characterId: {
              in: candidateJoined.map((participant) => participant.characterId)
            }
          },
          select: {
            characterId: true
          }
        });
        if (blocker) {
          const blocked = candidateJoined.find((participant) => participant.characterId === blocker.characterId);
          return blocked
            ? { state: "blocked", blockerName: blocked.character.name }
            : { state: "blocked" };
        }

        const claimed = await tx.partySession.updateMany({
          where: {
            id: party.id,
            status: RECRUITING_PARTY_STATUS,
            version: party.version
          },
          data: {
            status: ACTIVE_PARTY_STATUS,
            version: { increment: 1 }
          }
        });
        if (claimed.count === 1) {
          const canonicalParty = await tx.partySession.findUnique({
            where: { id: party.id },
            include: partyInclude
          });
          if (!canonicalParty) {
            throw new Error("Claimed party disappeared before boss-state freeze.");
          }
          claimedParty = canonicalParty;
          break;
        }

        const latest: PartyRow | null = await tx.partySession.findUnique({
          where: { id: party.id },
          include: partyInclude
        });
        if (!latest) {
          return { state: "not-found" };
        }
        party = latest;
      }

      if (!claimedParty) {
        return { state: "blocked" };
      }

      party = claimedParty;
      const joined = party.participants.filter((participant) => participant.status === "joined");
      const isBigBarrelParty = party.originLocationId === BIG_BARREL_PARTY_ORIGIN_LOCATION_ID;

      const wardSign = isBigBarrelParty ? buildKharakternykWardSignForStartedParty(joined) : undefined;
      const personalProtocol = isBigBarrelParty
        ? buildBureaucramancerPersonalProtocolForStartedParty(party.participants)
        : undefined;
      const state = createPartyBossState({
        partySessionId: party.id,
        variant: isBigBarrelParty ? "big-barrel" : "proof",
        leaderCharacterId: party.leaderCharacterId,
        now: input.now,
        ...(wardSign ? { wardSign } : {}),
        ...(personalProtocol ? { personalProtocol } : {}),
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

      if (isBigBarrelParty) {
        for (const participant of state.participants) {
          const joinedParticipant = joined.find((entry) => entry.characterId === participant.characterId);
          if (!joinedParticipant) {
            throw new Error("Big Barrel participant disappeared before Sated freeze.");
          }
          const canonical = joinedParticipant.character;
          const frozen = await freezeVarenykSatedFromCooldown({
            tx,
            characterId: participant.characterId,
            remortCount: participant.remortCount,
            resources: participant.resources,
            now: input.now
          });
          if (frozen.hpRestored > 0 || frozen.manaRestored > 0) {
            const persisted = await tx.character.updateMany({
              where: {
                id: canonical.id,
                hpCurrent: canonical.hpCurrent,
                manaCurrent: canonical.manaCurrent,
                hpRegenAt: canonical.hpRegenAt,
                manaRegenAt: canonical.manaRegenAt,
                updatedAt: canonical.updatedAt
              },
              data: {
                hpCurrent: frozen.resources.hp,
                manaCurrent: frozen.resources.mana,
                hpRegenAt: frozen.resources.hp >= frozen.resources.hpMax
                  ? input.now
                  : canonical.hpRegenAt,
                manaRegenAt: frozen.resources.mana >= frozen.resources.manaMax
                  ? input.now
                  : canonical.manaRegenAt
              }
            });
            if (persisted.count !== 1) {
              throw new VarenykSatedCasError("party-character-resources");
            }
          }
          participant.resources = { ...participant.resources, ...frozen.resources };
          participant.status = participant.resources.hp > 0 ? "active" : "knocked-out";
          if (frozen.sated) {
            participant.varenykSated = frozen.sated;
          }
          const inspiration = await freezeBardInspirationFromCooldown({
            tx,
            characterId: participant.characterId,
            remortCount: participant.remortCount,
            now: input.now
          });
          if (inspiration) {
            participant.bardInspiration = inspiration;
          }
          if (participant.combatStats.classId === "class.bard") {
            const availableAt = await findBardMusicAvailableAt({
              tx,
              characterId: participant.characterId,
              locationId: PRESENCE_LOCATION_KORCHMA_BARREL,
              remortCount: participant.remortCount
            });
            if (availableAt) {
              participant.bardMusicAvailableAt = availableAt.toISOString();
            }
          }
        }
        const barrelPerformanceIds = [...new Set(state.participants.flatMap((participant) =>
          participant.bardInspiration?.sourceLocationId === PRESENCE_LOCATION_KORCHMA_BARREL
            ? [participant.bardInspiration.sourcePerformanceId]
            : []
        ))];
        state.bardMusic = barrelPerformanceIds.length > 0
          ? { kind: "inspiration", sourcePerformanceIds: barrelPerformanceIds }
          : { kind: "none" };
      }

      await tx.activeCombatLease.createMany({
        data: joined.map((participant) => ({
          characterId: participant.characterId,
          kind: PARTY_BOSS_LEASE_KIND,
          referenceId: party.id,
          createdAt: input.now,
          updatedAt: input.now
        }))
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

      await this.raidChat.append(tx, {
        partySessionId: party.id,
        eventType: "raid.started",
        sourceKey: `party:${party.id}:boss:${boss.id}:started`,
        occurredAt: input.now,
        actorCharacterId: party.leaderCharacterId,
        actorDisplayName: joined.find((participant) => participant.characterId === party.leaderCharacterId)?.character.name ?? null
      });
      if (state.bardMusic?.kind === "inspiration") {
        await this.raidChat.append(tx, {
          partySessionId: party.id,
          eventType: "raid.music.started",
          sourceKey: `party:${party.id}:boss:${boss.id}:music:inspiration`,
          occurredAt: input.now,
          payload: { kind: "inspiration" }
        });
      }
      await this.raidChat.activate(tx, party.id, input.now);

      return { state: "started", session: this.mapSession(boss) };
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
    action: PartyBossStandardActionKey,
    input: PartyBossResolveInput,
    options: { gearAbility?: CombatGearAbilityInput } = {}
  ): Promise<PartyBossActionResult> {
    if ((action as string) === "lament") {
      const session = await this.findByPartyInviteToken(partyInviteToken);
      return session
        ? { state: "lament-unavailable", reason: "specialized-only", session }
        : { state: "not-found" };
    }

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
        return { state: "not-participant", session: this.mapSession(session) };
      }

      if (session.status !== "active") {
        return { state: "terminal", session: this.mapSession(session) };
      }

      if (session.turn !== turn || this.parseState(session).turn !== turn) {
        return { state: "stale", session: this.mapSession(session) };
      }

      const state = this.parseState(session);
      const actor = state.participants.find((participant) => participant.characterId === character.id);
      if (!actor || actor.status !== "active" || actor.resources.hp <= 0) {
        return { state: "stale", session: this.mapSession(session) };
      }
      if (
        state.bardMusic?.kind === "lament" &&
        state.bardMusic.sourceCharacterId === character.id &&
        state.bardMusic.activatedTurn === turn
      ) {
        return {
          state: "lament-unavailable",
          reason: "locked",
          session: this.mapSession(session)
        };
      }

      if (action === "taunt") {
        const availability = getWarriorRaidTauntAvailability(state, character.id);
        if (!availability.available) {
          return {
            state: "taunt-unavailable",
            reason: availability.reason,
            ...(availability.availableTurn !== undefined ? { availableTurn: availability.availableTurn } : {}),
            session: this.mapSession(session)
          };
        }
      }

      if (action === "gear" && options.gearAbility) {
        const matchingGrant = getCombatMantokAbilityGrantsByIds({
          grantIds: actor.equipmentAbilityGrantIds ?? [],
          characterLevel: actor.combatStats.level
        }).some((grant) => grant.combat?.profile.id === options.gearAbility?.profile.id);
        if (!matchingGrant) {
          return { state: "stale", session: this.mapSession(session) };
        }

        const availability = getCombatGearActionAvailabilityForActor(
          actor.resources,
          options.gearAbility.profile
        );
        if (!availability.available) {
          return {
            state: "gear-unavailable",
            reason: availability.reason === "cooldown" ? "skill-on-cooldown" : "not-enough-mana",
            session: this.mapSession(session)
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

      return { state: queuedState, session: this.mapSession(current) };
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

  async submitLamentForTelegramUser(
    telegramUserId: bigint,
    partyInviteToken: string,
    turn: number,
    input: PartyBossResolveInput & { activationId: string }
  ): Promise<PartyBossActionResult> {
    let inserted: PartyBossActionResult;
    try {
      inserted = await this.prisma.$transaction(async (tx): Promise<PartyBossActionResult> => {
        const character = await findCharacterByTelegramUser(tx, telegramUserId);
        if (!character) {
          return { state: "no-character" };
        }
        const session = await findByInviteToken(tx, partyInviteToken);
        if (!session) {
          return { state: "not-found" };
        }
        const presented = this.mapSession(session);
        if (!isBigBarrelBrotherState(this.parseState(session))) {
          return {
            state: "lament-unavailable",
            reason: "not-big-barrel",
            session: presented
          };
        }
        if (!isParticipant(session, character.id)) {
          return {
            state: "lament-unavailable",
            reason: "not-participant",
            session: presented
          };
        }
        if (session.status !== "active") {
          return {
            state: "lament-unavailable",
            reason: "not-active",
            session: presented
          };
        }
        const state = this.parseState(session);
        if (session.turn !== turn || state.turn !== turn) {
          return { state: "stale", session: presented };
        }
        const actor = state.participants.find((participant) => participant.characterId === character.id);
        if (!actor) {
          return {
            state: "lament-unavailable",
            reason: "not-participant",
            session: presented
          };
        }
        if (actor.combatStats.classId !== "class.bard") {
          return {
            state: "lament-unavailable",
            reason: "not-bard",
            session: presented
          };
        }
        if (actor.status !== "active" || actor.resources.hp <= 0) {
          return {
            state: "lament-unavailable",
            reason: "unable",
            session: presented
          };
        }
        if (
          state.bardMusic?.kind === "lament" &&
          state.bardMusic.sourceCharacterId === character.id &&
          state.bardMusic.activatedTurn === turn
        ) {
          return { state: "duplicate", session: presented };
        }
        if (!state.bardMusic || state.bardMusic.kind !== "none") {
          return {
            state: "lament-unavailable",
            reason: "music-taken",
            session: presented
          };
        }
        const availableAt = await findBardMusicAvailableAt({
          tx,
          characterId: character.id,
          locationId: PRESENCE_LOCATION_KORCHMA_BARREL,
          remortCount: actor.remortCount
        });
        if (availableAt && availableAt > input.now) {
          return {
            state: "lament-unavailable",
            reason: "cooldown",
            availableAt,
            now: input.now,
            session: presented
          };
        }

        const roll = new SeededRandomSource(
          `${session.id}:${turn}:${character.id}:${input.activationId}:bard-lament-v1`
        ).nextInt(-6, 6);
        const plan = buildBardLamentPlan({
          charisma: actor.combatStats.charisma,
          luck: actor.combatStats.luck,
          level: actor.combatStats.level,
          roll
        });
        const nextState = clonePartyBossState(state);
        nextState.bardMusic = {
          kind: "lament",
          activationId: input.activationId,
          sourceCharacterId: character.id,
          grade: plan.grade,
          damageReduction: plan.damageReduction,
          remainingBossResponses: plan.bossResponses,
          activatedTurn: turn
        };
        const claimed = await tx.partyBossSession.updateMany({
          where: {
            id: session.id,
            status: "active",
            turn,
            version: session.version
          },
          data: {
            stateJson: nextState as unknown as Prisma.InputJsonValue,
            version: { increment: 1 }
          }
        });
        if (claimed.count !== 1) {
          throw new PartyBossLamentRaceRollback();
        }

        const queuedState = await writePartyBossActionChoice(tx, {
          sessionId: session.id,
          actorCharacterId: character.id,
          turn,
          action: "lament",
          submittedAt: input.now
        });
        await writeBardMusicAvailability({
          tx,
          characterId: character.id,
          locationId: PRESENCE_LOCATION_KORCHMA_BARREL,
          now: input.now,
          source: "lament",
          sourceId: input.activationId
        });
        const current = await tx.partyBossSession.findUnique({
          where: { id: session.id },
          include: partyBossInclude
        });
        if (!current) {
          return { state: "not-found" };
        }

        return { state: queuedState, session: this.mapSession(current) };
      });
    } catch (error) {
      if (!(error instanceof PartyBossLamentRaceRollback)) {
        throw error;
      }
      const current = await this.findByPartyInviteToken(partyInviteToken);
      if (!current) {
        return { state: "not-found" };
      }
      return {
        state: "lament-unavailable",
        reason: "music-taken",
        session: current
      };
    }

    if (
      "session" in inserted &&
      (inserted.state === "queued" || inserted.state === "updated" || inserted.state === "duplicate")
    ) {
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
        return { state: "not-participant", session: this.mapSession(session) };
      }

      if (session.status !== "active") {
        return { state: "terminal", session: this.mapSession(session) };
      }

      if (session.turn !== turn || this.parseState(session).turn !== turn) {
        return { state: "stale", session: this.mapSession(session) };
      }

      const state = this.parseState(session);
      const actor = state.participants.find((participant) => participant.characterId === character.id);
      if (!actor || actor.status !== "active" || actor.resources.hp <= 0) {
        return { state: "stale", session: this.mapSession(session) };
      }
      if (
        state.bardMusic?.kind === "lament" &&
        state.bardMusic.sourceCharacterId === character.id &&
        state.bardMusic.activatedTurn === turn
      ) {
        return {
          state: "lament-unavailable",
          reason: "locked",
          session: this.mapSession(session)
        };
      }

      const itemAvailability = getPartyBossCombatItemAvailability(actor, item.id);
      if (!itemAvailability.available) {
        return { state: "item-unavailable", reason: itemAvailability.reason, session: this.mapSession(session) };
      }

      if (calculatePartyBossCombatItemHealing(actor.resources, item.effect) <= 0) {
        return { state: "item-unavailable", reason: "full-hp", session: this.mapSession(session) };
      }

      const lease = await tx.activeCombatLease.findUnique({
        where: { characterId: character.id },
        select: { kind: true, referenceId: true }
      });
      if (!lease || lease.kind !== PARTY_BOSS_LEASE_KIND || lease.referenceId !== session.partySessionId) {
        return { state: "stale", session: this.mapSession(session) };
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
        return { state: "item-unavailable", reason: "not-owned", session: this.mapSession(session) };
      }

      if (equipped || reservedItemIds.includes(item.id)) {
        return { state: "item-unavailable", reason: "reserved", session: this.mapSession(session) };
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
        session: this.mapSession(current)
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
      return { state: "terminal", session: this.mapSession(session) };
    }

    const resolved = await this.resolveIfReady(
      session.id,
      mode === "force-dev" ? "timeout-force-dev" : "timeout-due",
      input
    );
    return resolved
      ? { state: "resolved", ...resolved }
      : { state: "queued", session: this.mapSession(session) };
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

    return session ? this.mapSession(session) : null;
  }

  async findByPartyInviteToken(partyInviteToken: string): Promise<PartyBossSessionRecord | null> {
    const session = await findByInviteToken(this.prisma, partyInviteToken);
    return session ? this.mapSession(session) : null;
  }

  async findJournalPageByPartyInviteToken(
    partyInviteToken: string,
    requestedPage?: number | null
  ): Promise<PartyBossSessionRecord | null> {
    const session = await findByInviteToken(this.prisma, partyInviteToken);
    if (!session) {
      return null;
    }

    const mapped = this.mapSession(session);
    const persistedCount = await this.prisma.partyBossRound.count({ where: { sessionId: session.id } });
    if (persistedCount === 0) {
      const fallbackTotal = mapped.state.roundLog.length;
      const page = clampJournalPage(requestedPage ?? fallbackTotal - 1, fallbackTotal);
      return {
        ...mapped,
        journal: {
          round: fallbackTotal > 0 ? mapped.state.roundLog[page] ?? null : null,
          page,
          totalPages: fallbackTotal
        }
      };
    }

    const page = clampJournalPage(requestedPage ?? persistedCount - 1, persistedCount);
    const row = await this.prisma.partyBossRound.findFirst({
      where: { sessionId: session.id },
      orderBy: [{ turn: "asc" }, { id: "asc" }],
      skip: page
    });
    return {
      ...mapped,
      journal: {
        round: row ? parsePartyBossRoundSummaryStrict(row.roundJson) : null,
        page,
        totalPages: persistedCount
      }
    };
  }

  async listDueTimedOutSessions(now: Date, options: { limit?: number } = {}): Promise<PartyBossSessionRecord[]> {
    const limit = options.limit ?? 25;
    await this.repairOrphanedPartyBossLeases(now, limit);
    const dueRows = await this.prisma.partyBossSession.findMany({
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
      take: limit,
      select: { id: true }
    });
    const dueOrder = new Map(dueRows.map((row, index) => [row.id, index]));
    const sessions = dueRows.length === 0
      ? []
      : (await this.prisma.partyBossSession.findMany({
          where: { id: { in: dueRows.map((row) => row.id) } },
          include: partyBossInclude
        })).sort((left, right) => (dueOrder.get(left.id) ?? 0) - (dueOrder.get(right.id) ?? 0));

    const healthy: PartyBossSessionRecord[] = [];
    for (const session of sessions) {
      try {
        healthy.push(this.mapSession(session));
      } catch (error) {
        if (!(error instanceof PartyBossStateValidationError)) {
          throw error;
        }
        try {
          await this.repairMalformedSession(session.id, now);
        } catch (repairError) {
          console.error("Квестарня: пошкоджену сесію PartyBoss не вдалося полагодити.", {
            sessionId: session.id,
            error: repairError
          });
        }
      }
    }

    return healthy;
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

      const state = this.parseState(session);
      if (!isBigBarrelBrotherState(state)) {
        return { state: "not-big", session: this.mapSession(session) };
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

        return current ? { state: "stale", session: this.mapSession(current) } : { state: "no-active" };
      }

      const current = await tx.partyBossSession.findUnique({
        where: { id: session.id },
        include: partyBossInclude
      });

      return current ? { state: "primed", session: this.mapSession(current) } : { state: "no-active" };
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
        return session ? { session: this.mapSession(session) } : null;
      }

      const state = this.parseState(session);
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
      const hotState: PartyBossState = {
        ...resolved.state,
        roundLog: resolved.state.roundLog.slice(-1)
      };
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
          stateJson: hotState as unknown as Prisma.InputJsonValue,
          resultJson: result as unknown as Prisma.InputJsonValue,
          turnExpiresAt: status === "active" ? input.nextTurnExpiresAt : input.now,
          ...(status === "active" ? {} : { completedAt: input.now })
        }
      });

      if (updated.count !== 1) {
        return null;
      }

      for (const round of resolved.state.roundLog) {
        await tx.partyBossRound.upsert({
          where: { sessionId_turn: { sessionId: session.id, turn: round.turn } },
          create: {
            sessionId: session.id,
            turn: round.turn,
            roundJson: round as unknown as Prisma.InputJsonValue
          },
          update: {}
        });
      }

      await appendResolvedRaidChatEvents(this.raidChat, tx, session, state, resolved.state, resolved.round, input.now);

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
      if (resolved.round.personalProtocol) {
        achievementEvents.push({
          type: "bureaucramancer.protocol.triggered",
          characterId: resolved.round.personalProtocol.characterId,
          sourceId: resolved.round.personalProtocol.bossActionId,
          occurredAt: input.now
        });
      }
      if (resolved.round.warriorTaunt?.activatedCharacterId) {
        achievementEvents.push({
          type: "warrior.raid-taunt.activated",
          characterId: resolved.round.warriorTaunt.activatedCharacterId,
          sourceId: `${session.id}:turn:${session.turn}:warrior-taunt`,
          occurredAt: input.now
        });
      }
      if (status !== "active") {
        achievementEvents = [
          ...achievementEvents,
          ...await settleTerminalPartyBoss(tx, session, resolved.state, input.now, this.hpRecoveryProducer)
        ];
        await releasePartyBossLocks(
          tx,
          session.partySessionId,
          input.now,
          resolved.state
        );
        await this.raidChat.append(tx, {
          partySessionId: session.partySessionId,
          eventType: status === "won" ? "raid.won" : status === "lost" ? "raid.lost" : "raid.cancelled",
          sourceKey: `party:${session.partySessionId}:boss:${session.id}:terminal:${status}`,
          occurredAt: input.now
        });
        await this.raidChat.terminalize(tx, session.partySessionId, input.now);
      }

      const current = await tx.partyBossSession.findUnique({
        where: { id: session.id },
        include: partyBossInclude
      });

      return current
        ? {
            session: this.mapSession(current),
            ...(achievementEvents.length > 0 ? { achievementEvents } : {})
          }
        : null;
    });
  }

  private mapSession(row: PartyBossRow): PartyBossSessionRecord {
    return mapSession(row);
  }

  private parseState(row: PartyBossRow): PartyBossState {
    return parseState(row);
  }

  private async repairMalformedSession(sessionId: string, now: Date): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const session = await tx.partyBossSession.findUnique({
        where: { id: sessionId },
        include: partyBossInclude
      });
      if (!session || session.status !== "active") {
        return false;
      }
      try {
        parseState(session);
        return false;
      } catch (error) {
        if (!(error instanceof PartyBossStateValidationError)) {
          throw error;
        }
      }

      const fallback = createPartyBossState({
        partySessionId: session.partySessionId,
        variant: session.rulesVersion === BIG_BARREL_BROTHER_RULES_VERSION || session.bossKey === BIG_BARREL_BROTHER_BOSS_KEY
          ? "big-barrel"
          : "proof",
        leaderCharacterId: session.leaderCharacterId,
        participants: session.partySession.participants
          .filter((participant) => participant.status === "joined")
          .map((participant) => {
            const character = mapCharacterForCombat(participant.character);
            return {
              characterId: character.id,
              name: character.name,
              remortCount: character.remortCount,
              combatStats: buildPartyBossCombatStats(character),
              equipmentAbilityGrantIds: getCombatMantokAbilityGrantsForEquippedItems({
                itemIds: participant.character.equipment.map((row) => row.itemId),
                characterLevel: participant.character.level
              }).map((grant) => grant.id)
            };
          }),
        now: session.createdAt
      });
      fallback.turn = Math.max(1, session.turn);
      fallback.status = "cancelled";
      fallback.completedAt = now.toISOString();
      const result = buildResult(fallback, now);
      const repaired = await tx.partyBossSession.updateMany({
        where: {
          id: session.id,
          status: "active",
          version: session.version
        },
        data: {
          status: "cancelled",
          turn: fallback.turn,
          version: session.version + 1,
          stateJson: fallback as unknown as Prisma.InputJsonValue,
          resultJson: result as unknown as Prisma.InputJsonValue,
          turnExpiresAt: now,
          completedAt: now
        }
      });
      if (repaired.count !== 1) {
        return false;
      }

      await releasePartyBossLeasesFromRawState(tx, session.partySessionId, session.stateJson, now);
      await terminalizeRepairedParty(tx, session.partySessionId);
      await this.raidChat.append(tx, {
        partySessionId: session.partySessionId,
        eventType: "raid.cancelled",
        sourceKey: `party:${session.partySessionId}:boss:${session.id}:repair:${session.version}`,
        occurredAt: now
      });
      await this.raidChat.terminalize(tx, session.partySessionId, now);
      return true;
    });
  }

  private async repairOrphanedPartyBossLeases(now: Date, limit: number): Promise<void> {
    const scanLimit = Math.max(93, limit);
    const orphanIds = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT acl.id
      FROM active_combat_leases AS acl
      LEFT JOIN party_boss_sessions AS pbs
        ON pbs.party_session_id = acl.reference_id
       AND pbs.status = ${ACTIVE_PARTY_STATUS}
      WHERE acl.kind = ${PARTY_BOSS_LEASE_KIND}
        AND pbs.id IS NULL
      ORDER BY acl.updated_at ASC, acl.id ASC
      LIMIT ${scanLimit}
    `);
    const leases = orphanIds.length === 0
      ? []
      : await this.prisma.activeCombatLease.findMany({
          where: { id: { in: orphanIds.map(({ id }) => id) } },
          orderBy: [{ updatedAt: "asc" }, { id: "asc" }]
        });
    for (const candidate of leases) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const lease = await tx.activeCombatLease.findUnique({ where: { id: candidate.id } });
          if (!lease || lease.kind !== PARTY_BOSS_LEASE_KIND) {
            return;
          }
          const session = await tx.partyBossSession.findUnique({
            where: { partySessionId: lease.referenceId },
            select: { status: true, stateJson: true }
          });
          if (session?.status === "active") {
            return;
          }
          const statuses = findRecoverablePartyParticipantStatuses(session?.stateJson, lease.characterId);
          await releaseCombatLeaseWithTimedStatuses({
            tx,
            lease,
            releasedAt: now,
            ...(statuses.sated ? { sated: statuses.sated } : {}),
            ...(statuses.inspiration ? { inspiration: statuses.inspiration } : {})
          });
        });
      } catch (error) {
        console.error("Квестарня: осиротілий combat lease PartyBoss не вдалося відпустити.", {
          leaseId: candidate.id,
          error
        });
      }
    }
  }
}

async function releasePartyBossLeasesFromRawState(
  tx: TxClient,
  partySessionId: string,
  rawState: Prisma.JsonValue,
  now: Date
): Promise<void> {
  const leases = await tx.activeCombatLease.findMany({
    where: {
      kind: PARTY_BOSS_LEASE_KIND,
      referenceId: partySessionId
    }
  });
  for (const lease of leases) {
    const statuses = findRecoverablePartyParticipantStatuses(rawState, lease.characterId);
    await releaseCombatLeaseWithTimedStatuses({
      tx,
      lease,
      releasedAt: now,
      ...(statuses.sated ? { sated: statuses.sated } : {}),
      ...(statuses.inspiration ? { inspiration: statuses.inspiration } : {})
    });
  }
}

function findRecoverablePartyParticipantStatuses(value: unknown, characterId: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const participants = (value as Record<string, unknown>).participants;
  if (!Array.isArray(participants)) {
    return {};
  }
  const participant = participants.find((entry) =>
    entry !== null &&
    typeof entry === "object" &&
    !Array.isArray(entry) &&
    (entry as Record<string, unknown>).characterId === characterId
  ) as Record<string, unknown> | undefined;
  if (!participant) {
    return {};
  }
  const sated = parseVarenykSatedCombatState(participant.varenykSated);
  const inspiration = parseBardInspirationCombatState(participant.bardInspiration);
  return {
    ...(sated ? { sated } : {}),
    ...(inspiration ? { inspiration } : {})
  };
}

async function terminalizeRepairedParty(tx: TxClient, partySessionId: string): Promise<void> {
  await tx.partySession.updateMany({
    where: { id: partySessionId, status: "active" },
    data: {
      status: "completed",
      activeLeaderKey: null,
      version: { increment: 1 }
    }
  });
  await tx.partyParticipant.updateMany({
    where: {
      sessionId: partySessionId,
      activeMembershipKey: { not: null }
    },
    data: { activeMembershipKey: null }
  });
}

async function appendResolvedRaidChatEvents(
  raidChat: PrismaPartyRaidChatTransactionWriter,
  tx: TxClient,
  session: PartyBossRow,
  previousState: PartyBossState,
  nextState: PartyBossState,
  round: PartyBossRoundSummary,
  occurredAt: Date
): Promise<void> {
  const actorSnapshot = (characterId: string) => {
    const participant = nextState.participants.find((row) => row.characterId === characterId);
    return {
      actorCharacterId: characterId,
      actorDisplayName: participant?.name ?? null,
      actorRemortCount: participant?.remortCount ?? null
    };
  };

  if (round.warriorTaunt?.activatedCharacterId) {
    const characterId = round.warriorTaunt.activatedCharacterId;
    await raidChat.append(tx, {
      partySessionId: session.partySessionId,
      eventType: "ability.taunt",
      sourceKey: `party:${session.partySessionId}:boss:${session.id}:turn:${round.turn}:taunt:${characterId}`,
      occurredAt,
      ...actorSnapshot(characterId)
    });
  }

  if (round.bardMusic?.activated) {
    const characterId = round.bardMusic.sourceCharacterId;
    await raidChat.append(tx, {
      partySessionId: session.partySessionId,
      eventType: "ability.lament",
      sourceKey: `party:${session.partySessionId}:boss:${session.id}:turn:${round.turn}:lament:${round.bardMusic.activationId}`,
      occurredAt,
      ...actorSnapshot(characterId)
    });
  }

  const previousParticipants = new Map(previousState.participants.map((participant) => [
    participant.characterId,
    participant
  ]));
  for (const participant of nextState.participants) {
    const previous = previousParticipants.get(participant.characterId);
    if (previous?.status !== "active" || participant.status !== "knocked-out") {
      continue;
    }
    await raidChat.append(tx, {
      partySessionId: session.partySessionId,
      eventType: "participant.knocked-out",
      sourceKey: `party:${session.partySessionId}:boss:${session.id}:turn:${previousState.turn}:knocked-out:${participant.characterId}`,
      occurredAt,
      actorCharacterId: participant.characterId,
      actorDisplayName: participant.name,
      actorRemortCount: participant.remortCount
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
  now: Date,
  hpRecoveryProducer: HpRecoveryNotificationProducer
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
      }, hpRecoveryProducer);
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
      await settleBigParticipantResources(tx, participant, now, hpRecoveryProducer);
      continue;
    }

    if (!remortMatches || !isBigBarrelEligible(current.level, remortCount)) {
      if (remortMatches) {
        await settleBigParticipantResources(tx, participant, now, hpRecoveryProducer);
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
      await settleBigParticipantResources(tx, participant, now, hpRecoveryProducer);
      continue;
    }

    const reward = buildBigBarrelReward(state, participant);
    if (!reward.meaningful) {
      await settleBigParticipantResources(tx, participant, now, hpRecoveryProducer);
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
    await hpRecoveryProducer.record(
      tx,
      participant.characterId,
      now,
      "recovering"
    );
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

async function getBigBarrelEligibilityConflict(
  tx: TxClient,
  party: PartyRow,
  joined: PartyRow["participants"],
  now: Date
): Promise<"permanent" | "transient" | null> {
  const characterIds = joined.map((participant) => participant.characterId);
  if (!party.periodId || characterIds.length === 0) {
    return "permanent";
  }

  if (joined.some((participant) =>
    !isBigBarrelEligible(participant.character.level, participant.character._count.remorts) ||
    participant.character._count.remorts !== participant.remortCount
  )) {
    return "permanent";
  }

  const [existingSuccess, pendingSoloRaid, activeLossCooldown] = await Promise.all([
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
        key: buildFridayBarrelRaidPendingKey(party.periodId)
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

  if (existingSuccess || pendingSoloRaid) {
    return "permanent";
  }

  return activeLossCooldown ? "transient" : null;
}

async function terminalizeIneligibleRecruitingParty(
  tx: TxClient,
  party: Pick<PartyRow, "id" | "version">
): Promise<boolean> {
  const transitioned = await tx.partySession.updateMany({
    where: {
      id: party.id,
      status: RECRUITING_PARTY_STATUS,
      version: party.version
    },
    data: {
      status: "ineligible",
      activeLeaderKey: null,
      version: { increment: 1 }
    }
  });
  if (transitioned.count !== 1) {
    return false;
  }

  await tx.partyParticipant.updateMany({
    where: {
      sessionId: party.id,
      activeMembershipKey: { not: null }
    },
    data: {
      activeMembershipKey: null
    }
  });
  return true;
}

async function settleBigParticipantResources(
  tx: TxClient,
  participant: PartyBossState["participants"][number],
  now: Date,
  hpRecoveryProducer: HpRecoveryNotificationProducer
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
  await hpRecoveryProducer.record(
    tx,
    participant.characterId,
    now,
    "recovering"
  );
}

async function settleBigParticipantAttempt(
  tx: TxClient,
  current: { id: string; level: number; xp: number },
  participant: PartyBossState["participants"][number],
  now: Date,
  remortCount: number,
  xp: number,
  source: { partyBossSessionId: string; partySessionId: string },
  hpRecoveryProducer: HpRecoveryNotificationProducer
): Promise<number> {
  const safeXp = Math.max(0, Math.floor(xp));
  if (safeXp <= 0) {
    await settleBigParticipantResources(tx, participant, now, hpRecoveryProducer);
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
    await settleBigParticipantResources(tx, participant, now, hpRecoveryProducer);
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
  await hpRecoveryProducer.record(
    tx,
    participant.characterId,
    now,
    "recovering"
  );
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
  const availableRounds = Math.max(
    1,
    participant.contribution.submittedActions + participant.contribution.timeoutActions
  );
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

async function releasePartyBossLocks(
  tx: TxClient,
  partySessionId: string,
  releasedAt: Date,
  state: PartyBossState
): Promise<void> {
  const transitioned = await tx.partySession.updateMany({
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
  if (transitioned.count !== 1) {
    return;
  }
  const leases = await tx.activeCombatLease.findMany({
    where: {
      kind: PARTY_BOSS_LEASE_KIND,
      referenceId: partySessionId
    }
  });
  for (const lease of leases) {
    const participant = state.participants.find((entry) => entry.characterId === lease.characterId);
    await releaseCombatLeaseWithTimedStatuses({
      tx,
      lease,
      releasedAt,
      ...(participant?.varenykSated ? { sated: participant.varenykSated } : {}),
      ...(participant?.bardInspiration ? { inspiration: participant.bardInspiration } : {})
    });
  }
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
    const transitioned = await tx.partySession.updateMany({
      where: { id: party.id, status: RECRUITING_PARTY_STATUS },
      data: {
        status: "expired",
        activeLeaderKey: null,
        version: { increment: 1 }
      }
    });
    if (transitioned.count !== 1) {
      return;
    }
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
    leaderCharacterId: state.leaderCharacterId,
    status: parseStatus(row.status),
    turn: row.turn,
    version: row.version,
    rulesVersion: row.rulesVersion,
    bossKey: row.bossKey,
    state,
    result: parseResult(row.resultJson, state),
    turnExpiresAt: row.turnExpiresAt,
    completedAt: row.completedAt,
    queuedActions: row.actions.filter((action) => action.turn === row.turn).flatMap((action) => {
      const item = parseActionItem(action.resultJson);
      const gearAbility = parseActionGearAbility(action.resultJson);
      const actionKey = parseActionKey(action.actionKey);

      return [{
        characterId: action.actorCharacterId,
        turn: action.turn,
        action: actionKey,
        ...(item ? { item } : {}),
        ...(gearAbility ? { gearAbility } : {})
      }];
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

function parseState(row: PartyBossRow): PartyBossState {
  const raw = row.stateJson && typeof row.stateJson === "object" && !Array.isArray(row.stateJson)
    ? { ...row.stateJson, leaderCharacterId: row.stateJson.leaderCharacterId ?? row.leaderCharacterId }
    : row.stateJson;
  return parsePartyBossStateStrict(raw, {
    rulesVersion: row.rulesVersion,
    partySessionId: row.partySessionId,
    status: parsePartyBossStatusStrict(row.status),
    turn: row.turn,
    bossKey: row.bossKey,
    ...(row.status === "active"
      ? {
          participantCharacterIds: row.partySession.participants
            .filter((participant) => participant.status === "joined")
            .map((participant) => participant.characterId)
        }
      : {})
  });
}

function clampJournalPage(page: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return Math.min(Math.max(0, Math.floor(page)), total - 1);
}

function parseResult(value: Prisma.JsonValue, state: PartyBossState) {
  return value
    ? parsePartyBossResultStrict(value, state)
    : buildResult(state, new Date());
}

function parseStatus(value: string): PartyBossSessionStatus {
  return parsePartyBossStatusStrict(value);
}

function parseActionKey(value: string): PartyBossActionKey {
  return value === "defend" || value === "skill" || value === "race" || value === "gear" || value === "item" || value === "taunt" || value === "lament"
    ? value
    : "attack";
}

function buildKharakternykWardSignForStartedParty(
  joined: PartyRow["participants"]
): { kind: "kharakternyk"; placerCharacterId: string; supportCount: number; supportCap: number } | undefined {
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
    supportCount: Math.min(KHARAKTERNYK_WARD_SUPPORT_CAP, supportCount),
    supportCap: KHARAKTERNYK_WARD_SUPPORT_CAP
  };
}

function buildBureaucramancerPersonalProtocolForStartedParty(
  participants: PartyRow["participants"]
): {
  kind: typeof BUREAUCRAMANCER_PROTOCOL_KIND;
  protocolId: string;
  filerCharacterId: string;
  signerCharacterIds: string[];
} | undefined {
  const joined = participants.filter((participant) => participant.status === "joined");
  const filer = participants.find((participant) => {
    const protocol = parsePersonalProtocolSnapshot(participant.snapshotJson);
    return (
      protocol?.filerCharacterId === participant.characterId &&
      protocol.remortCount === participant.remortCount &&
      participant.character._count.remorts === participant.remortCount
    );
  });
  if (!filer) {
    return undefined;
  }

  const protocol = parsePersonalProtocolSnapshot(filer.snapshotJson);
  if (!protocol) {
    return undefined;
  }

  const signerCharacterIds = joined.flatMap((participant) => {
    const signature = parsePersonalProtocolSignatureSnapshot(participant.snapshotJson);
    return (
      signature?.protocolId === protocol.protocolId &&
      signature.filerCharacterId === protocol.filerCharacterId &&
      signature.signerCharacterId === participant.characterId &&
      signature.remortCount === participant.remortCount &&
      participant.character._count.remorts === participant.remortCount
    )
      ? [participant.characterId]
      : [];
  });

  return signerCharacterIds.length > 0
    ? {
        kind: BUREAUCRAMANCER_PROTOCOL_KIND,
        protocolId: protocol.protocolId,
        filerCharacterId: protocol.filerCharacterId,
        signerCharacterIds: [...new Set(signerCharacterIds)]
      }
    : undefined;
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

function parsePersonalProtocolSnapshot(snapshotJson: Prisma.JsonValue | null): {
  protocolId: string;
  filerCharacterId: string;
  remortCount: number;
} | null {
  const value = getSnapshotObject(snapshotJson, BUREAUCRAMANCER_PROTOCOL_SNAPSHOT_KEY);
  if (!value || value.kind !== BUREAUCRAMANCER_PROTOCOL_KIND || value.version !== 1) {
    return null;
  }

  return (
    typeof value.protocolId === "string" &&
    typeof value.filerCharacterId === "string" &&
    typeof value.remortCount === "number"
  )
    ? {
        protocolId: value.protocolId,
        filerCharacterId: value.filerCharacterId,
        remortCount: Math.max(0, Math.floor(value.remortCount))
      }
    : null;
}

function parsePersonalProtocolSignatureSnapshot(snapshotJson: Prisma.JsonValue | null): {
  protocolId: string;
  filerCharacterId: string;
  signerCharacterId: string;
  remortCount: number;
} | null {
  const value = getSnapshotObject(snapshotJson, BUREAUCRAMANCER_PROTOCOL_SIGNATURE_SNAPSHOT_KEY);
  if (!value || value.kind !== BUREAUCRAMANCER_PROTOCOL_KIND || value.version !== 1) {
    return null;
  }

  return (
    typeof value.protocolId === "string" &&
    typeof value.filerCharacterId === "string" &&
    typeof value.signerCharacterId === "string" &&
    typeof value.remortCount === "number"
  )
    ? {
        protocolId: value.protocolId,
        filerCharacterId: value.filerCharacterId,
        signerCharacterId: value.signerCharacterId,
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
