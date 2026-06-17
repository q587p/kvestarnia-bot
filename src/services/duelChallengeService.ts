import { randomBytes } from "node:crypto";
import type {
  DuelChallengeRecord,
  DuelChallengeRepository,
  DuelCharacterSnapshot,
  ResolvedDuelChallengeRecord
} from "../db/repositories/duelChallengeRepository";
import { summarizeCharacter, type CharacterSummary } from "../domain/characters/characterSummary";
import { resolveQuickDuel } from "../domain/duels/duelResolver";
import { CryptoRandomSource, type RandomSource } from "../shared/random";
import { systemClock, type Clock } from "../shared/time";
import { getEquippedItemContents } from "./equipmentService";

export const DUEL_INVITE_MIN_LEVEL = 3;
const DUEL_INVITE_TTL_MS = 15 * 60 * 1000;
const DUEL_LEADERBOARD_LIMIT = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface DuelResourceWarning {
  hpBelowMax: boolean;
  manaBelowMax: boolean;
}

export interface DuelLeaderboardEntry {
  characterId: string;
  name: string;
  winCount: number;
}

export interface DuelLeaderboard {
  day: DuelLeaderboardEntry[];
  week: DuelLeaderboardEntry[];
  month: DuelLeaderboardEntry[];
}

export type DuelChallengeView =
  | {
      state: "pending";
      challenge: DuelChallengeRecord;
      challenger: CharacterSummary;
      challengerResourceWarning: DuelResourceWarning | null;
      expiresAt: Date;
      now: Date;
    }
  | {
      state: "resolved";
      challenge: DuelChallengeRecord;
      challenger: CharacterSummary;
      target: CharacterSummary;
      result: NonNullable<DuelChallengeRecord["result"]>;
    }
  | {
      state: "expired" | "cancelled" | "declined";
      challenge: DuelChallengeRecord;
      challenger: CharacterSummary;
    };

export type DuelCreateResult =
  | { state: "no-character" }
  | { state: "level-gated"; character: CharacterSummary; minLevel: number }
  | Extract<DuelChallengeView, { state: "pending" }>;

export type DuelAcceptResult =
  | { state: "no-character" }
  | { state: "not-found" }
  | { state: "self-challenge"; challenge: DuelChallengeRecord; challenger: CharacterSummary }
  | { state: "level-gated"; character: CharacterSummary; minLevel: number }
  | {
      state: "resource-warning";
      challenge: DuelChallengeRecord;
      challenger: CharacterSummary;
      target: CharacterSummary;
      warning: DuelResourceWarning;
    }
  | DuelChallengeView;

export type DuelCancelResult =
  | { state: "no-character" }
  | { state: "not-found" }
  | { state: "not-owner"; challenge: DuelChallengeRecord; challenger: CharacterSummary }
  | DuelChallengeView;

export type DuelDeclineResult =
  | { state: "no-character" }
  | { state: "not-found" }
  | { state: "open-invite"; challenge: DuelChallengeRecord; challenger: CharacterSummary }
  | DuelChallengeView;

export class DuelChallengeService {
  constructor(
    private readonly challenges: DuelChallengeRepository,
    private readonly clock: Clock = systemClock,
    private readonly rng: RandomSource = new CryptoRandomSource()
  ) {}

  async createOpenChallengeForTelegramUser(
    telegramUserId: bigint,
    input: { contextChatId?: bigint | null } = {}
  ): Promise<DuelCreateResult> {
    const now = this.clock();
    const challengerSnapshot = await this.challenges.findCharacterByTelegramUser(telegramUserId);

    if (!challengerSnapshot) {
      return { state: "no-character" };
    }

    const challenger = summarizeDuelCharacter(challengerSnapshot);

    if (challenger.level < DUEL_INVITE_MIN_LEVEL) {
      return {
        state: "level-gated",
        character: challenger,
        minLevel: DUEL_INVITE_MIN_LEVEL
      };
    }

    const challenge = await this.challenges.createOpenForTelegramUser(telegramUserId, {
      inviteToken: createInviteToken(),
      contextChatId: input.contextChatId ?? null,
      expiresAt: new Date(now.getTime() + DUEL_INVITE_TTL_MS)
    });

    if (!challenge) {
      return { state: "no-character" };
    }

    return {
      state: "pending",
      challenge,
      challenger,
      challengerResourceWarning: getResourceWarning(challenger),
      expiresAt: challenge.expiresAt,
      now
    };
  }

  async acceptForTelegramUser(
    telegramUserId: bigint,
    inviteToken: string,
    options: { ignoreResourceWarning?: boolean } = {}
  ): Promise<DuelAcceptResult> {
    const now = this.clock();
    const challenge = await this.getFreshChallenge(inviteToken, now);

    if (!challenge) {
      return { state: "not-found" };
    }

    const challenger = summarizeDuelCharacter(challenge.challenger);

    if (challenge.challenger.telegramUserId === telegramUserId) {
      return { state: "self-challenge", challenge, challenger };
    }

    if (challenge.status !== "pending") {
      return this.viewChallenge(challenge, now);
    }

    const targetCharacter = await this.challenges.findCharacterByTelegramUser(telegramUserId);

    if (!targetCharacter) {
      return { state: "no-character" };
    }

    const currentTarget = summarizeDuelCharacter(targetCharacter);

    if (currentTarget.level < DUEL_INVITE_MIN_LEVEL) {
      return {
        state: "level-gated",
        character: currentTarget,
        minLevel: DUEL_INVITE_MIN_LEVEL
      };
    }

    const warning = getResourceWarning(currentTarget);

    if (warning && options.ignoreResourceWarning !== true) {
      return {
        state: "resource-warning",
        challenge,
        challenger,
        target: currentTarget,
        warning
      };
    }

    const result = resolveQuickDuel({
      challenger: { ...challenger, id: challenge.challenger.id },
      target: { ...currentTarget, id: targetCharacter.id },
      rng: this.rng
    });
    const accepted = await this.challenges.acceptByTokenForTelegramUser(inviteToken, telegramUserId, now, result);

    if (!accepted) {
      return { state: "no-character" };
    }

    return this.viewChallenge(accepted, now);
  }

  async cancelForTelegramUser(
    telegramUserId: bigint,
    inviteToken: string
  ): Promise<DuelCancelResult> {
    const now = this.clock();
    const before = await this.getFreshChallenge(inviteToken, now);

    if (!before) {
      return { state: "not-found" };
    }

    const challenger = summarizeDuelCharacter(before.challenger);

    if (before.status !== "pending") {
      return this.viewChallenge(before, now);
    }

    if (before.challenger.telegramUserId !== telegramUserId) {
      return { state: "not-owner", challenge: before, challenger };
    }

    const updated = await this.challenges.cancelByTokenForTelegramUser(inviteToken, telegramUserId, now);

    return updated ? this.viewChallenge(updated, now) : { state: "not-found" };
  }

  async declineForTelegramUser(
    telegramUserId: bigint,
    inviteToken: string
  ): Promise<DuelDeclineResult> {
    const now = this.clock();
    const before = await this.getFreshChallenge(inviteToken, now);

    if (!before) {
      return { state: "not-found" };
    }

    const challenger = summarizeDuelCharacter(before.challenger);

    if (before.status !== "pending") {
      return this.viewChallenge(before, now);
    }

    if (!before.targetCharacterId) {
      void telegramUserId;
      return { state: "open-invite", challenge: before, challenger };
    }

    const updated = await this.challenges.declineByTokenForTelegramUser(inviteToken, telegramUserId, now);

    return updated ? this.viewChallenge(updated, now) : { state: "not-found" };
  }

  async getByToken(inviteToken: string): Promise<DuelChallengeView | { state: "not-found" }> {
    const now = this.clock();
    const challenge = await this.getFreshChallenge(inviteToken, now);

    return challenge ? this.viewChallenge(challenge, now) : { state: "not-found" };
  }

  async getLeaderboard(): Promise<DuelLeaderboard> {
    const now = this.clock();
    const daySince = new Date(now.getTime() - DAY_MS);
    const weekSince = new Date(now.getTime() - 7 * DAY_MS);
    const monthSince = new Date(now.getTime() - 31 * DAY_MS);
    const records = await this.challenges.listResolvedSince(monthSince);

    return {
      day: buildLeaderboard(records, daySince),
      week: buildLeaderboard(records, weekSince),
      month: buildLeaderboard(records, monthSince)
    };
  }

  private async getFreshChallenge(
    inviteToken: string,
    now: Date
  ): Promise<DuelChallengeRecord | null> {
    const challenge = await this.challenges.findByToken(inviteToken);

    if (!challenge) {
      return null;
    }

    if (challenge.status === "pending" && challenge.expiresAt <= now) {
      return this.challenges.markExpiredByToken(inviteToken, now);
    }

    return challenge;
  }

  private viewChallenge(challenge: DuelChallengeRecord, now: Date): DuelChallengeView {
    const challenger = summarizeDuelCharacter(challenge.challenger);

    if (challenge.status === "resolved" && challenge.target && challenge.result) {
      return {
        state: "resolved",
        challenge,
        challenger,
        target: summarizeDuelCharacter(challenge.target),
        result: challenge.result
      };
    }

    if (challenge.status === "cancelled" || challenge.status === "declined" || challenge.status === "expired") {
      return {
        state: challenge.status,
        challenge,
        challenger
      };
    }

    return {
      state: "pending",
      challenge,
      challenger,
      challengerResourceWarning: getResourceWarning(challenger),
      expiresAt: challenge.expiresAt,
      now
    };
  }

}

function buildLeaderboard(
  records: ResolvedDuelChallengeRecord[],
  since: Date
): DuelLeaderboardEntry[] {
  const entries = new Map<string, DuelLeaderboardEntry>();

  for (const record of records) {
    if (record.resolvedAt < since || !record.result.winnerCharacterId) {
      continue;
    }

    const winner = getDuelWinner(record);
    const current = entries.get(record.result.winnerCharacterId);

    if (current) {
      current.winCount += 1;
      continue;
    }

    entries.set(record.result.winnerCharacterId, {
      characterId: record.result.winnerCharacterId,
      name: winner?.name ?? "Хтось дуже переможний",
      winCount: 1
    });
  }

  return [...entries.values()]
    .sort((left, right) => {
      const winDiff = right.winCount - left.winCount;

      return winDiff === 0 ? left.name.localeCompare(right.name, "uk") : winDiff;
    })
    .slice(0, DUEL_LEADERBOARD_LIMIT);
}

function getDuelWinner(record: ResolvedDuelChallengeRecord): DuelCharacterSnapshot | null {
  if (record.result.winnerCharacterId === record.challenger.id) {
    return record.challenger;
  }

  if (record.result.winnerCharacterId === record.target.id) {
    return record.target;
  }

  return null;
}

function summarizeDuelCharacter(character: DuelCharacterSnapshot): CharacterSummary {
  return summarizeCharacter(character, {
    equippedItems: getEquippedItemContents(character.equipment)
  });
}

function createInviteToken(): string {
  return randomBytes(8).toString("base64url");
}

function getResourceWarning(character: CharacterSummary): DuelResourceWarning | null {
  const warning = {
    hpBelowMax: character.hpCurrent < character.hpMax,
    manaBelowMax: character.manaCurrent < character.manaMax
  };

  return warning.hpBelowMax || warning.manaBelowMax ? warning : null;
}
