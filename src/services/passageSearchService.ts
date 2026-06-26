import { randomUUID } from "node:crypto";
import { summarizeCharacter, type CharacterSummary } from "../domain/characters/characterSummary";
import {
  DESCENT_SEARCH_DURATION_MS,
  getPassageSearchModifiers,
  isEmptyPassageSearchLoot,
  PASSAGE_SEARCH_DURATION_MS,
  rollPassageSearchDanger,
  rollPassageSearchLoot,
  SEARCH_NODE_COOLDOWN_MS,
  type PassageSearchLoot,
  type PassageSearchSnapshot
} from "../domain/passageSearch";
import type { PassageSearchActionRecord, PassageSearchRepository } from "../db/repositories/passageSearchRepository";
import type { PersistentFightDifficultyId, PersistentFightPassageAttackResult, FightService } from "./fightService";
import { BANDAGE_ITEM_ID, enrichRewardItemGrants, type RewardItemGrant } from "./itemGrant";
import {
  PRESENCE_LOCATION_KORCHMA_DEEP,
  PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1,
  PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT,
  PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_RIGHT,
  PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_STRAIGHT,
  normalizePresenceLocationId
} from "./presenceService";
import { SeededRandomSource } from "../shared/random";
import { systemClock, type Clock } from "../shared/time";

export const PASSAGE_SEARCH_NODE_DESCENT = "location:descent-to-nyz";
export const PASSAGE_SEARCH_NODE_DEEP_LEVEL1 = "location:deep-level1";

export type PassageSearchNodeKey =
  | typeof PASSAGE_SEARCH_NODE_DESCENT
  | typeof PASSAGE_SEARCH_NODE_DEEP_LEVEL1
  | `passage:deep-left`
  | `passage:deep-straight`
  | `passage:deep-right`;

export type PassageSearchStartResult =
  | { state: "started"; character: CharacterSummary; action: PassageSearchActionRecord }
  | { state: "running"; character: CharacterSummary; action: PassageSearchActionRecord; remainingSeconds: number }
  | { state: "cooldown"; character: CharacterSummary; availableAt: Date; now: Date }
  | { state: "needs-rest"; character: CharacterSummary }
  | { state: "blocked"; reason: "not-ready" | "invalid-node" | "stale-location" }
  | { state: "no-character" };

export type PassageSearchCheckResult =
  | { state: "running"; character: CharacterSummary; action: PassageSearchActionRecord; remainingSeconds: number }
  | { state: "completed"; character: CharacterSummary; action: PassageSearchActionRecord; loot: PresentedPassageSearchLoot }
  | { state: "nothing"; character: CharacterSummary; action: PassageSearchActionRecord }
  | { state: "cancelled"; character: CharacterSummary; action: PassageSearchActionRecord }
  | { state: "monster-attack"; character: CharacterSummary; action: PassageSearchActionRecord; fight: PersistentFightPassageAttackResult }
  | { state: "no-reward"; character: CharacterSummary; action: PassageSearchActionRecord; reason: "dead" | "stale" }
  | { state: "not-found"; character?: CharacterSummary }
  | { state: "no-character" };

export type PassageSearchCancelPreviewResult =
  | { state: "confirm-cancel"; character: CharacterSummary; action: PassageSearchActionRecord; remainingSeconds: number }
  | PassageSearchCheckResult;

export interface PresentedPassageSearchLoot {
  gold: number;
  itemGrants: RewardItemGrant[];
}

export type PassageSearchNodeAvailability = Record<
  PassageSearchNodeKey,
  { searchAvailable: boolean; availableAt?: Date }
>;

export class PassageSearchService {
  constructor(
    private readonly searches: PassageSearchRepository,
    private readonly fights: FightService,
    private readonly clock: Clock = systemClock
  ) {}

  async startPassageSearch(
    telegramUserId: bigint,
    input: {
      passage: "deep-left" | "deep-straight" | "deep-right";
      encounterToken: string;
      currentLocationId?: string;
    }
  ): Promise<PassageSearchStartResult> {
    const passage = resolvePassage(input.passage);
    if (!passage) {
      return { state: "blocked", reason: "invalid-node" };
    }

    if (!isCurrentLocation(input.currentLocationId, passage.locationId)) {
      return { state: "blocked", reason: "stale-location" };
    }

    const preview = await this.fights.previewPersistentFightForTelegramUser(telegramUserId, {
      difficulty: passage.difficulty,
      originLocationId: passage.locationId
    });

    if (preview.state === "no-character") {
      return { state: "no-character" };
    }

    if (preview.state === "needs-rest") {
      return { state: "needs-rest", character: preview.character };
    }

    if (preview.state !== "persistent-preview") {
      return { state: "blocked", reason: "not-ready" };
    }

    if (preview.encounterToken !== input.encounterToken) {
      return { state: "blocked", reason: "not-ready" };
    }

    const now = this.clock();
    const snapshot = buildSnapshot({
      now,
      nodeKey: getPassageSearchNodeKey(input.passage),
      nodeKind: "passage",
      originLocationId: passage.locationId,
      passage: input.passage,
      encounterToken: input.encounterToken,
      durationMs: PASSAGE_SEARCH_DURATION_MS,
      safeAtStart: false,
      dangerTier: getDangerTier(preview.monster.level, passage.difficulty),
      searchTier: getSearchTier(preview.monster.level, passage.difficulty),
      monsterIdAtStart: preview.monster.id,
      monsterNameAtStart: preview.monster.name,
      monsterLevelAtStart: preview.monster.level,
      playerLuckSnapshot: preview.character.stats.luck
    });

    return this.startWithSnapshot(telegramUserId, snapshot);
  }

  async startSafePassageRestSearch(
    telegramUserId: bigint,
    input: {
      passage: "deep-left" | "deep-straight" | "deep-right";
      currentLocationId?: string;
    }
  ): Promise<PassageSearchStartResult> {
    const passage = resolvePassage(input.passage);
    if (!passage) {
      return { state: "blocked", reason: "invalid-node" };
    }

    if (!isCurrentLocation(input.currentLocationId, passage.locationId)) {
      return { state: "blocked", reason: "stale-location" };
    }

    const restWindow = await this.fights.getPassageSearchRestWindowForTelegramUser(telegramUserId);

    if (restWindow.state === "no-character") {
      return { state: "no-character" };
    }

    if (restWindow.state === "needs-rest") {
      return { state: "needs-rest", character: restWindow.character };
    }

    if (restWindow.state !== "monster-rest") {
      return { state: "blocked", reason: "not-ready" };
    }

    const now = this.clock();
    const snapshot = buildSnapshot({
      now,
      nodeKey: getPassageSearchNodeKey(input.passage),
      nodeKind: "passage",
      originLocationId: passage.locationId,
      passage: input.passage,
      durationMs: PASSAGE_SEARCH_DURATION_MS,
      safeAtStart: true,
      dangerTier: 0,
      searchTier: getSafeRestSearchTier(passage.difficulty),
      playerLuckSnapshot: restWindow.character.stats.luck
    });

    return this.startWithSnapshot(telegramUserId, snapshot);
  }

  async startDescentSearch(
    telegramUserId: bigint,
    input: { currentLocationId?: string } = {}
  ): Promise<PassageSearchStartResult> {
    if (!isCurrentLocation(input.currentLocationId, PRESENCE_LOCATION_KORCHMA_DEEP)) {
      return { state: "blocked", reason: "stale-location" };
    }

    const overview = await this.fights.getFightOverviewForTelegramUser(telegramUserId);

    if (overview.state === "no-character") {
      return { state: "no-character" };
    }

    if (overview.state === "needs-rest") {
      return { state: "needs-rest", character: overview.character };
    }

    if (overview.state !== "persistent-ready") {
      return { state: "blocked", reason: "not-ready" };
    }

    const now = this.clock();
    const snapshot = buildSnapshot({
      now,
      nodeKey: PASSAGE_SEARCH_NODE_DESCENT,
      nodeKind: "location",
      originLocationId: PRESENCE_LOCATION_KORCHMA_DEEP,
      durationMs: DESCENT_SEARCH_DURATION_MS,
      safeAtStart: true,
      dangerTier: 0,
      searchTier: 0,
      playerLuckSnapshot: overview.character.stats.luck
    });

    return this.startWithSnapshot(telegramUserId, snapshot);
  }

  async startDeepLevelOneSearch(
    telegramUserId: bigint,
    input: { currentLocationId?: string } = {}
  ): Promise<PassageSearchStartResult> {
    if (!isCurrentLocation(input.currentLocationId, PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1)) {
      return { state: "blocked", reason: "stale-location" };
    }

    const overview = await this.fights.getFightOverviewForTelegramUser(telegramUserId);

    if (overview.state === "no-character") {
      return { state: "no-character" };
    }

    if (overview.state === "needs-rest") {
      return { state: "needs-rest", character: overview.character };
    }

    if (overview.state !== "persistent-ready") {
      return { state: "blocked", reason: "not-ready" };
    }

    const now = this.clock();
    const snapshot = buildSnapshot({
      now,
      nodeKey: PASSAGE_SEARCH_NODE_DEEP_LEVEL1,
      nodeKind: "location",
      originLocationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1,
      durationMs: DESCENT_SEARCH_DURATION_MS,
      safeAtStart: true,
      dangerTier: 0,
      searchTier: 0,
      playerLuckSnapshot: overview.character.stats.luck
    });

    return this.startWithSnapshot(telegramUserId, snapshot);
  }

  async getNodeAvailability(
    telegramUserId: bigint,
    nodeKeys: readonly PassageSearchNodeKey[]
  ): Promise<Partial<PassageSearchNodeAvailability>> {
    const keys = [...new Set(nodeKeys)];
    const result = await this.searches.findCooldownsForTelegramUser(
      telegramUserId,
      keys.map((nodeKey) => getCooldownKey(nodeKey))
    );

    const now = this.clock();
    const availability: Partial<PassageSearchNodeAvailability> = {};

    for (const nodeKey of keys) {
      availability[nodeKey] = { searchAvailable: true };
    }

    if (result.state === "no-character") {
      return availability;
    }

    for (const cooldown of result.cooldowns) {
      const nodeKey = parseCooldownNodeKey(cooldown.key);
      if (!nodeKey || !keys.includes(nodeKey)) {
        continue;
      }

      if (cooldown.availableAt > now) {
        availability[nodeKey] = {
          searchAvailable: false,
          availableAt: cooldown.availableAt
        };
      }
    }

    return availability;
  }

  async recordNotificationTarget(
    telegramUserId: bigint,
    token: string,
    input: { chatId: string }
  ): Promise<void> {
    await this.searches.recordNotificationTargetForTelegramUser(telegramUserId, token, input);
  }

  async listDueRunningSearches(
    options: { limit?: number } = {}
  ): Promise<Awaited<ReturnType<PassageSearchRepository["listDueRunning"]>>> {
    return this.searches.listDueRunning({
      now: this.clock(),
      ...(options.limit === undefined ? {} : { limit: options.limit })
    });
  }

  async resolveDueSearch(
    telegramUserId: bigint,
    token: string
  ): Promise<PassageSearchCheckResult> {
    return this.checkSearch(telegramUserId, token);
  }

  async checkSearch(
    telegramUserId: bigint,
    token: string
  ): Promise<PassageSearchCheckResult> {
    const lookup = await this.searches.findByTokenForTelegramUser(telegramUserId, token);

    if (lookup.state === "no-character") {
      return { state: "no-character" };
    }

    if (lookup.state === "not-found") {
      return { state: "not-found", character: summarizeCharacter(lookup.character) };
    }

    const character = summarizeCharacter(lookup.character);
    const action = lookup.action;

    if (action.status === "cancelled") {
      return { state: "cancelled", character, action };
    }

    if (action.status === "resolved") {
      return this.presentStoredResult(telegramUserId, character, action);
    }

    const now = this.clock();
    const remainingSeconds = getRemainingSeconds(action.endsAt, now);
    if (remainingSeconds > 0) {
      return { state: "running", character, action, remainingSeconds };
    }

    if (character.hpCurrent <= 0) {
      const resolved = await this.searches.resolveByTokenForTelegramUser(telegramUserId, token, {
        now,
        result: { outcome: "no-reward", reason: "dead" }
      });
      return this.presentResolution(telegramUserId, resolved);
    }

    const modifiers = getPassageSearchModifiers({ luck: action.payload.playerLuckSnapshot });
    const seeded = new SeededRandomSource(`passage-search:${action.token}:resolve`);
    const danger = rollPassageSearchDanger({
      snapshot: action.payload,
      modifiers,
      rng: seeded
    });

    if (danger && action.payload.encounterToken && action.payload.passage) {
      const resolved = await this.searches.resolveByTokenForTelegramUser(telegramUserId, token, {
        now,
        result: {
          outcome: "monster-attack",
          encounterToken: action.payload.encounterToken,
          passage: action.payload.passage
        }
      });
      const presented = await this.presentResolution(telegramUserId, resolved);
      if (presented.state === "monster-attack") {
        return presented;
      }

      return this.presentStoredResult(telegramUserId, character, {
        ...action,
        status: "resolved",
        result: {
          outcome: "monster-attack",
          encounterToken: action.payload.encounterToken,
          passage: action.payload.passage
        }
      });
    }

    const loot = rollPassageSearchLoot({
      snapshot: action.payload,
      modifiers,
      rng: seeded,
      bandageItemId: BANDAGE_ITEM_ID
    });
    const result = isEmptyPassageSearchLoot(loot)
      ? { outcome: "nothing" as const, loot }
      : { outcome: "loot" as const, loot };
    const resolved = await this.searches.resolveByTokenForTelegramUser(telegramUserId, token, {
      now,
      result,
      loot
    });

    return this.presentResolution(telegramUserId, resolved);
  }

  async previewCancel(
    telegramUserId: bigint,
    token: string
  ): Promise<PassageSearchCancelPreviewResult> {
    const current = await this.checkSearch(telegramUserId, token);

    return current.state === "running"
      ? {
          state: "confirm-cancel",
          character: current.character,
          action: current.action,
          remainingSeconds: current.remainingSeconds
        }
      : current;
  }

  async getActiveSearch(
    telegramUserId: bigint
  ): Promise<PassageSearchCancelPreviewResult | null> {
    const lookup = await this.searches.findRunningForTelegramUser(telegramUserId);

    if (lookup.state !== "found") {
      return null;
    }

    const now = this.clock();
    if (lookup.action.endsAt <= now) {
      return this.checkSearch(telegramUserId, lookup.action.token);
    }

    return {
      state: "confirm-cancel",
      character: summarizeCharacter(lookup.character),
      action: lookup.action,
      remainingSeconds: getRemainingSeconds(lookup.action.endsAt, now)
    };
  }

  async cancelSearch(
    telegramUserId: bigint,
    token: string
  ): Promise<PassageSearchCheckResult> {
    const resolved = await this.searches.cancelByTokenForTelegramUser(telegramUserId, token, this.clock());

    return this.presentResolution(telegramUserId, resolved);
  }

  async devReset(telegramUserId: bigint): Promise<
    | { state: "disabled" }
    | { state: "no-character" }
    | { state: "cleared"; character: CharacterSummary; actions: number; cooldowns: number }
  > {
    if (!this.searches.clearSearchStateForTelegramUser) {
      return { state: "disabled" };
    }

    const result = await this.searches.clearSearchStateForTelegramUser(telegramUserId, this.clock());

    return result.state === "cleared"
      ? {
          state: "cleared",
          character: summarizeCharacter(result.character),
          actions: result.actions,
          cooldowns: result.cooldowns
        }
      : result;
  }

  private async startWithSnapshot(
    telegramUserId: bigint,
    snapshot: PassageSearchSnapshot
  ): Promise<PassageSearchStartResult> {
    const now = this.clock();
    const result = await this.searches.startForTelegramUser(telegramUserId, {
      now,
      token: createSearchToken(),
      nodeKey: snapshot.nodeKey,
      nodeKind: snapshot.nodeKind,
      cooldownKey: getCooldownKey(snapshot.nodeKey as PassageSearchNodeKey),
      cooldownAvailableAt: new Date(now.getTime() + SEARCH_NODE_COOLDOWN_MS),
      snapshot
    });

    switch (result.state) {
      case "started":
        return { state: "started", character: summarizeCharacter(result.character), action: result.action };
      case "active":
        return {
          state: "running",
          character: summarizeCharacter(result.character),
          action: result.action,
          remainingSeconds: getRemainingSeconds(result.action.endsAt, now)
        };
      case "cooldown":
        return {
          state: "cooldown",
          character: summarizeCharacter(result.character),
          availableAt: result.availableAt,
          now
        };
      case "needs-rest":
        return { state: "needs-rest", character: summarizeCharacter(result.character) };
      case "no-character":
        return { state: "no-character" };
    }
  }

  private async presentResolution(
    telegramUserId: bigint,
    result: Awaited<ReturnType<PassageSearchRepository["resolveByTokenForTelegramUser"]>>
  ): Promise<PassageSearchCheckResult> {
    if (result.state === "no-character") {
      return { state: "no-character" };
    }

    if (result.state === "not-found") {
      return { state: "not-found", character: summarizeCharacter(result.character) };
    }

    return this.presentStoredResult(
      telegramUserId,
      summarizeCharacter(result.character),
      result.action
    );
  }

  private async presentStoredResult(
    telegramUserId: bigint,
    character: CharacterSummary,
    action: PassageSearchActionRecord
  ): Promise<PassageSearchCheckResult> {
    const result = action.result;

    if (!result) {
      return { state: "no-reward", character, action, reason: "stale" };
    }

    if (result.outcome === "cancelled") {
      return { state: "cancelled", character, action };
    }

    if (result.outcome === "no-reward") {
      return { state: "no-reward", character, action, reason: result.reason };
    }

    if (result.outcome === "monster-attack") {
      const fight = await this.fights.attackPersistentPassageEncounterForTelegramUser(
        telegramUserId,
        result.encounterToken,
        {
          callbackOriginLocationId: action.payload.originLocationId,
          currentLocationId: action.payload.originLocationId
        }
      );

      if (fight.state === "persistent-active" && fight.started) {
        await this.fights.resolvePersistentFightTurn(telegramUserId, {
          sessionId: fight.session.id,
          turn: fight.session.state?.turn ?? 1,
          action: "skip"
        });
      }

      return { state: "monster-attack", character, action, fight };
    }

    if (result.outcome === "nothing") {
      return { state: "nothing", character, action };
    }

    return {
      state: "completed",
      character,
      action,
      loot: presentLoot(result.loot)
    };
  }
}

function buildSnapshot(input: Omit<PassageSearchSnapshot, "startedAt" | "endsAt"> & { now: Date }): PassageSearchSnapshot {
  return {
    ...input,
    startedAt: input.now.toISOString(),
    endsAt: new Date(input.now.getTime() + input.durationMs).toISOString()
  };
}

export function getPassageSearchNodeKey(
  passage: "deep-left" | "deep-straight" | "deep-right"
): PassageSearchNodeKey {
  return `passage:${passage}`;
}

export function getCooldownKey(nodeKey: PassageSearchNodeKey): string {
  return `passage-search:${nodeKey}`;
}

function parseCooldownNodeKey(key: string): PassageSearchNodeKey | null {
  if (!key.startsWith("passage-search:")) {
    return null;
  }

  const nodeKey = key.slice("passage-search:".length);

  return isPassageSearchNodeKey(nodeKey) ? nodeKey : null;
}

function isPassageSearchNodeKey(nodeKey: string): nodeKey is PassageSearchNodeKey {
  return (
    nodeKey === PASSAGE_SEARCH_NODE_DESCENT ||
    nodeKey === PASSAGE_SEARCH_NODE_DEEP_LEVEL1 ||
    nodeKey === "passage:deep-left" ||
    nodeKey === "passage:deep-straight" ||
    nodeKey === "passage:deep-right"
  );
}

function resolvePassage(passage: "deep-left" | "deep-straight" | "deep-right"): {
  difficulty: PersistentFightDifficultyId;
  locationId: string;
} | null {
  if (passage === "deep-left") {
    return { difficulty: "hard", locationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT };
  }

  if (passage === "deep-right") {
    return { difficulty: "easy", locationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_RIGHT };
  }

  if (passage === "deep-straight") {
    return { difficulty: "normal", locationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_STRAIGHT };
  }

  return null;
}

function getDangerTier(monsterLevel: number, difficulty: PersistentFightDifficultyId): number {
  const difficultyBonus = difficulty === "hard" ? 2 : difficulty === "easy" ? -1 : 0;

  return Math.max(1, Math.min(10, Math.floor(monsterLevel / 2) + difficultyBonus));
}

function getSearchTier(monsterLevel: number, difficulty: PersistentFightDifficultyId): number {
  const difficultyBonus = difficulty === "hard" ? 2 : difficulty === "easy" ? -1 : 0;

  return Math.max(1, Math.min(10, Math.floor(monsterLevel / 2) + difficultyBonus));
}

function getSafeRestSearchTier(difficulty: PersistentFightDifficultyId): number {
  if (difficulty === "hard") {
    return 3;
  }

  if (difficulty === "normal") {
    return 2;
  }

  return 1;
}

function isCurrentLocation(currentLocationId: string | undefined, expectedLocationId: string): boolean {
  return currentLocationId !== undefined &&
    normalizePresenceLocationId(currentLocationId) === normalizePresenceLocationId(expectedLocationId);
}

function getRemainingSeconds(endsAt: Date, now: Date): number {
  return Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / 1000));
}

function createSearchToken(): string {
  return randomUUID().replace(/-/g, "").slice(0, 16);
}

function presentLoot(loot: PassageSearchLoot): PresentedPassageSearchLoot {
  return {
    gold: loot.gold,
    itemGrants: enrichRewardItemGrants(loot.itemGrants)
  };
}
