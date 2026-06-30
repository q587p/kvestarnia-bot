import { Prisma, type PrismaClient } from "@prisma/client";
import {
  buildResult,
  createPartyBossState,
  isBigBarrelEligible,
  isBigBarrelBrotherState,
  resolvePartyBossRound,
  BIG_BARREL_BROTHER_RULES_VERSION,
  type PartyBossActionKey,
  type PartyBossState
} from "../../domain/partyBoss/partyBoss";
import { getLevelForXp } from "../../domain/progression/level";
import {
  buildPartyBossCombatStats,
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
  buildBarrelRaidItemGrants,
  FRIDAY_BARREL_RAID_KEY
} from "../../services/tavernRaidService";
import { recordLevelMilestones } from "./levelMilestoneRepository";
import { countCharacterRemorts } from "./prismaRemortCount";

type TxClient = Prisma.TransactionClient;
type PartyBossRow = Prisma.PartyBossSessionGetPayload<{ include: typeof partyBossInclude }>;
type PartyRow = Prisma.PartySessionGetPayload<{ include: typeof partyInclude }>;
type CharacterRow = PartyRow["participants"][number]["character"];

const PARTY_BOSS_LEASE_KIND = "party-boss";
const ACTIVE_PARTY_STATUS = "active";
const RECRUITING_PARTY_STATUS = "recruiting";
const BIG_BARREL_PARTY_ORIGIN_LOCATION_ID = "barrel.big-brother";

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
      if (isBigBarrelParty && await hasIneligibleBigBarrelParticipant(tx, party, joined)) {
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

      const state = createPartyBossState({
        partySessionId: party.id,
        variant: isBigBarrelParty ? "big-barrel" : "proof",
        leaderCharacterId: party.leaderCharacterId,
        now: input.now,
        participants: joined.map((participant) => ({
          characterId: participant.characterId,
          name: participant.character.name,
          remortCount: participant.character._count.remorts,
          combatStats: buildPartyBossCombatStats(mapCharacterForCombat(participant.character))
        }))
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

      const created = await tx.partyBossAction.create({
        data: {
          sessionId: session.id,
          actorCharacterId: character.id,
          turn,
          actionKey: action,
          submittedAt: input.now
        }
      }).catch((error: unknown) => {
        if (isUniqueConflict(error)) {
          return null;
        }
        throw error;
      });

      const current = await tx.partyBossSession.findUnique({
        where: { id: session.id },
        include: partyBossInclude
      });

      if (!current) {
        return { state: "not-found" };
      }

      return { state: created ? "queued" : "duplicate", session: mapSession(current) };
    });

    if (!("session" in inserted)) {
      return inserted;
    }

    if (inserted.state === "queued" || inserted.state === "duplicate") {
      const resolved = await this.resolveIfReady(inserted.session.id, "all-actions", input);
      return resolved ? { state: "resolved", session: resolved } : inserted;
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
      ? { state: "resolved", session: resolved }
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
  ): Promise<PartyBossSessionRecord | null> {
    return this.prisma.$transaction(async (tx): Promise<PartyBossSessionRecord | null> => {
      const session = await tx.partyBossSession.findUnique({
        where: { id: sessionId },
        include: partyBossInclude
      });

      if (!session || session.status !== "active") {
        return session ? mapSession(session) : null;
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

      const resolved = resolvePartyBossRound({
        state,
        now: input.now,
        seed: session.id,
        actions: actions.map((entry) => ({
          characterId: entry.actorCharacterId,
          action: parseActionKey(entry.actionKey),
          origin: "manual"
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

      for (const action of actions) {
        const summary = resolved.round.actions.find((entry) => entry.characterId === action.actorCharacterId);
        if (summary) {
          await tx.partyBossAction.update({
            where: { id: action.id },
            data: { resultJson: summary as unknown as Prisma.InputJsonValue }
          });
        }
      }

      if (status !== "active") {
        await settleTerminalPartyBoss(tx, session, resolved.state, input.now);
        await releasePartyBossLocks(tx, session.partySessionId);
      }

      const current = await tx.partyBossSession.findUnique({
        where: { id: session.id },
        include: partyBossInclude
      });

      return current ? mapSession(current) : null;
    });
  }
}

async function settleTerminalPartyBoss(
  tx: TxClient,
  session: PartyBossRow,
  state: PartyBossState,
  now: Date
): Promise<void> {
  if (!isBigBarrelBrotherState(state)) {
    return;
  }

  const periodId = session.partySession.periodId;

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

    const itemGrants = reward.meaningful ? buildBarrelRaidItemGrants(periodId) : [];
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
  }
}

async function hasIneligibleBigBarrelParticipant(
  tx: TxClient,
  party: PartyRow,
  joined: PartyRow["participants"]
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

  const [activeLease, existingSuccess] = await Promise.all([
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
    })
  ]);

  return Boolean(activeLease || existingSuccess);
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

function buildBigBarrelReward(
  state: PartyBossState,
  participant: PartyBossState["participants"][number]
): { meaningful: boolean; tier: "none" | "partial" | "full"; xp: number; gold: number } {
  const meaningful =
    participant.contribution.submittedActions > 0 ||
    participant.contribution.damageDealt > 0 ||
    participant.contribution.damageTaken > 0;
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
  return value === "defend" || value === "skill" || value === "race" ? value : "attack";
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
