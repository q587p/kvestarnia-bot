import { items, monsterLoot, monsters, selectMonsterFlavorLine } from "../content";
import type { MonsterContent } from "../content/schema";
import type { CharacterRepository } from "../db/repositories/characterRepository";
import type { DailyActionRepository, RewardLevelChange } from "../db/repositories/dailyActionRepository";
import type {
  HuntContractRecord,
  HuntContractRepository
} from "../db/repositories/huntContractRepository";
import { summarizeCharacter, type CharacterSummary } from "../domain/characters/characterSummary";
import { HUNT_MIN_LEVEL, meetsActivityLevel } from "../domain/progression/activityGates";
import {
  getLootCandidates,
  getMonsterLootEntryItemId,
  type LootCandidate
} from "../domain/loot/lootEngine";
import { systemClock, type Clock } from "../shared/time";
import { HUNT_BOARD_CONTRACT_KEY } from "./dailyActionKeys";
import { enrichRewardItemGrants, type RewardItemGrant } from "./itemGrant";

export { HUNT_BOARD_CONTRACT_KEY } from "./dailyActionKeys";

export const HUNT_BOARD_TIME_ZONE = "Europe/Kyiv";
export type HuntAction = "strike" | "trick" | "retreat";

export interface HuntContract {
  localPeriodId: string;
  monster: MonsterContent;
  contractToken: string;
  startFlavor: string | null;
}

export type HuntLookupResult =
  | { state: "no-character" }
  | { state: "level-locked"; character: CharacterSummary; requiredLevel: number }
  | { state: "missing-contract-monster"; character: CharacterSummary; localPeriodId: string; monsterId: string }
  | { state: "ready"; character: CharacterSummary; contract: HuntContract }
  | { state: "already-completed"; character: CharacterSummary; contract: HuntContract; reward?: HuntRewardReplay };

export type HuntResult =
  | { state: "no-character" }
  | { state: "level-locked"; character: CharacterSummary; requiredLevel: number }
  | { state: "stale-period"; currentLocalPeriodId: string; requestedLocalPeriodId: string }
  | { state: "missing-contract-monster"; character: CharacterSummary; localPeriodId: string; monsterId: string }
  | {
      state: "stale-contract";
      currentLocalPeriodId: string;
      requestedLocalPeriodId: string;
      currentContract: HuntContract;
    }
  | {
      state: "completed";
      action: HuntAction;
      character: CharacterSummary;
      contract: HuntContract;
      reward: HuntReward;
      levelChange: RewardLevelChange;
      outcomeFlavor: string | null;
    }
  | {
      state: "already-completed";
      character: CharacterSummary;
      contract: HuntContract;
      reward?: HuntRewardReplay;
    };

export interface HuntReward {
  xp: number;
  gold: number;
  localPeriodId: string;
  itemGrants: RewardItemGrant[];
}

export interface HuntRewardReplay extends HuntReward {
  action?: HuntAction;
  itemReplayUnavailable?: boolean;
}

export class HuntService {
  constructor(
    private readonly characters: CharacterRepository,
    private readonly dailyActions: DailyActionRepository,
    private readonly huntContracts: HuntContractRepository,
    private readonly clock: Clock = systemClock
  ) {}

  async getHuntBoardForTelegramUser(telegramUserId: bigint): Promise<HuntLookupResult> {
    const localPeriodId = toKyivHourPeriodId(this.clock());
    const character = await this.characters.findByTelegramUserId(telegramUserId);

    if (!character) {
      return { state: "no-character" };
    }

    const summary = summarizeCharacter(character);

    if (!meetsActivityLevel(summary.level, HUNT_MIN_LEVEL)) {
      return {
        state: "level-locked",
        character: summary,
        requiredLevel: HUNT_MIN_LEVEL
      };
    }

    const resolved = await this.getOrCreateContract(telegramUserId, localPeriodId, character, summary);

    if (resolved.state === "missing-contract-monster") {
      return {
        state: "missing-contract-monster",
        character: summary,
        localPeriodId,
        monsterId: resolved.monsterId
      };
    }

    const { contract, record } = resolved;
    const existing = await this.dailyActions.findForTelegramUser(telegramUserId, {
      key: HUNT_BOARD_CONTRACT_KEY,
      localDate: localPeriodId
    });

    if (existing) {
      return {
        state: "already-completed",
        character: summary,
        contract,
        reward: buildRewardReplay(record) ?? buildRewardReplayFromDailyAction(existing)
      };
    }

    return {
      state: "ready",
      character: summary,
      contract
    };
  }

  async completeHuntContract(
    telegramUserId: bigint,
    requestedLocalPeriodId: string,
    requestedContractToken: string | null,
    action: HuntAction
  ): Promise<HuntResult> {
    const currentLocalPeriodId = toKyivHourPeriodId(this.clock());

    if (requestedLocalPeriodId !== currentLocalPeriodId) {
      return {
        state: "stale-period",
        currentLocalPeriodId,
        requestedLocalPeriodId
      };
    }

    const character = await this.characters.findByTelegramUserId(telegramUserId);

    if (!character) {
      return { state: "no-character" };
    }

    const summary = summarizeCharacter(character);

    if (!meetsActivityLevel(summary.level, HUNT_MIN_LEVEL)) {
      return {
        state: "level-locked",
        character: summary,
        requiredLevel: HUNT_MIN_LEVEL
      };
    }

    const resolved = await this.getOrCreateContract(telegramUserId, currentLocalPeriodId, character, summary);

    if (resolved.state === "missing-contract-monster") {
      return {
        state: "missing-contract-monster",
        character: summary,
        localPeriodId: currentLocalPeriodId,
        monsterId: resolved.monsterId
      };
    }

    const { contract, record } = resolved;

    if (requestedContractToken !== contract.contractToken) {
      return {
        state: "stale-contract",
        currentLocalPeriodId,
        requestedLocalPeriodId,
        currentContract: contract
      };
    }

    const reward = buildHuntRewardAmounts(contract.monster, action, summary.level);
    const claim = await this.dailyActions.claimForTelegramUser(telegramUserId, {
      key: HUNT_BOARD_CONTRACT_KEY,
      localDate: currentLocalPeriodId,
      rewardXp: reward.xp,
      rewardGold: reward.gold,
      itemGrants: buildHuntItemGrants(contract, action, character.id)
    });

    if (!claim) {
      return { state: "no-character" };
    }

    if (claim.state === "insufficient-gold") {
      throw new Error("Hunt board daily claim unexpectedly required gold.");
    }

    if (claim.state === "existing") {
      return {
        state: "already-completed",
        character: summarizeCharacter(claim.character),
        contract,
        reward: buildRewardReplay(record) ?? buildRewardReplayFromDailyAction(claim.action)
      };
    }

    await this.markLedgerCompletedAfterClaim(telegramUserId, {
      localPeriodId: currentLocalPeriodId,
      action,
      rewardXp: claim.action.rewardXp,
      rewardGold: claim.action.rewardGold,
      itemGrants: claim.itemGrants
    });

    return {
      state: "completed",
      action,
      character: summarizeCharacter(claim.character),
      contract,
      reward: {
        ...reward,
        localPeriodId: currentLocalPeriodId,
        itemGrants: enrichRewardItemGrants(claim.itemGrants)
      },
      levelChange: claim.levelChange,
      outcomeFlavor: selectMonsterFlavorLine(summary, {
        monsterId: contract.monster.id,
        placement: "monster.outcome",
        action,
        seed: `${currentLocalPeriodId}:${character.id}:${action}:outcome`
      })?.text ?? null
    };
  }

  private async markLedgerCompletedAfterClaim(
    telegramUserId: bigint,
    input: {
      localPeriodId: string;
      action: HuntAction;
      rewardXp: number;
      rewardGold: number;
      itemGrants: Array<{ itemId: string; quantity: number }>;
    }
  ): Promise<void> {
    try {
      await this.huntContracts.markCompletedForTelegramUser(telegramUserId, input);
    } catch {
      // daily_actions is the reward authority; ledger replay can fall back to stored XP/gold.
    }
  }

  private async getOrCreateContract(
    telegramUserId: bigint,
    localPeriodId: string,
    character: { id: string },
    summary: CharacterSummary
  ): Promise<
    | { state: "ready"; record: HuntContractRecord; contract: HuntContract }
    | { state: "missing-contract-monster"; monsterId: string }
  > {
    const existing = await this.huntContracts.findByTelegramUserIdAndPeriod(
      telegramUserId,
      localPeriodId
    );
    const record =
      existing ??
      (await this.huntContracts.upsertPostedContractForTelegramUser(telegramUserId, {
        localPeriodId,
        ...buildPostedContractIdentity(localPeriodId, character.id, summary.level)
      }));

    if (!record) {
      return { state: "missing-contract-monster", monsterId: "" };
    }

    const contract = buildHuntContractFromRecord(summary, character.id, record);

    if (!contract) {
      return { state: "missing-contract-monster", monsterId: record.monsterId };
    }

    return { state: "ready", record, contract };
  }
}

export function selectHuntMonster(
  localPeriodId: string,
  characterId: string,
  characterLevel = HUNT_MIN_LEVEL
): MonsterContent {
  const maxMonsterLevel = Math.max(HUNT_MIN_LEVEL, characterLevel);
  const closeMonsterLevelFloor = Math.max(1, characterLevel - 2);
  const eligibleMonsters = monsters
    .filter((monster) => isHuntMonsterEligible(monster, maxMonsterLevel))
    .sort((left, right) => left.id.localeCompare(right.id));
  const closeCandidates = eligibleMonsters.filter(
    (monster) => monster.level >= closeMonsterLevelFloor
  );
  const candidates =
    closeCandidates.length > 0 ? closeCandidates : selectHighestAvailableMonsterLevel(eligibleMonsters);

  const monster = candidates[stableHash(`${localPeriodId}:${characterId}:hunt-board`) % candidates.length];

  if (!monster) {
    throw new Error("Hunt board has no available monsters.");
  }

  return monster;
}

function isHuntMonsterEligible(monster: MonsterContent, maxMonsterLevel: number): boolean {
  const tags = new Set(monster.tags);

  return (
    monster.id !== "monster.mimic-shawarma" &&
    !tags.has("starter") &&
    !tags.has("boss") &&
    monster.level <= maxMonsterLevel
  );
}

function selectHighestAvailableMonsterLevel(monstersByLevel: MonsterContent[]): MonsterContent[] {
  const highestLevel = monstersByLevel.reduce(
    (currentHighest, monster) => Math.max(currentHighest, monster.level),
    0
  );

  return monstersByLevel.filter((monster) => monster.level === highestLevel);
}

export function toKyivHourPeriodId(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: HUNT_BOARD_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}T${values.hour}`;
}

function buildPostedContractIdentity(
  localPeriodId: string,
  characterId: string,
  characterLevel: number
): { monsterId: string; contractToken: string } {
  const monster = selectHuntMonster(localPeriodId, characterId, characterLevel);

  return {
    monsterId: monster.id,
    contractToken: buildHuntContractToken(localPeriodId, characterId, monster)
  };
}

function buildHuntContractFromRecord(
  character: CharacterSummary,
  characterId: string,
  record: HuntContractRecord
): HuntContract | null {
  const monster = monsters.find((candidate) => candidate.id === record.monsterId);

  if (!monster) {
    return null;
  }

  return {
    localPeriodId: record.localPeriodId,
    monster,
    contractToken: record.contractToken,
    startFlavor:
      selectMonsterFlavorLine(character, {
        monsterId: monster.id,
        placement: "monster.start",
        seed: `${record.localPeriodId}:${characterId}:start`
      })?.text ?? null
  };
}

export function buildHuntContractToken(
  localPeriodId: string,
  characterId: string,
  monster: Pick<MonsterContent, "id" | "level" | "tags">
): string {
  const lootIds = [...(monsterLoot[monster.id] ?? [])]
    .map(getMonsterLootEntryItemId)
    .sort();
  const tags = [...monster.tags].sort();
  const contentFingerprint = [
    monster.id,
    `level=${monster.level}`,
    `tags=${tags.join(",")}`,
    `loot=${lootIds.join(",")}`
  ].join("|");

  return stableHash(`hunt:${localPeriodId}:${characterId}:${contentFingerprint}`)
    .toString(36)
    .padStart(7, "0");
}

export function buildHuntRewardAmounts(
  monster: MonsterContent,
  action: HuntAction,
  characterLevel = HUNT_MIN_LEVEL
): { xp: number; gold: number } {
  const actionXpBonus = action === "trick" ? 1 : action === "retreat" ? 0 : 2;
  const actionGoldBonus = action === "retreat" ? 0 : action === "trick" ? 1 : 0;
  const weakMonsterXp = characterLevel - monster.level > 2;

  return {
    xp: weakMonsterXp ? 1 : Math.min(14, Math.max(3, 2 + monster.level + actionXpBonus)),
    gold: Math.min(7, Math.max(0, Math.floor(monster.level / 2) + actionGoldBonus))
  };
}

function buildHuntItemGrants(
  contract: HuntContract,
  action: HuntAction,
  characterId: string
): Array<{ itemId: string; quantity: number }> {
  if (action === "retreat") {
    return [];
  }

  const lootCandidates = getLootCandidates({
    monsterId: contract.monster.id,
    monsterLoot,
    items
  });

  if (lootCandidates.length === 0) {
    return [];
  }

  const seed = `${contract.localPeriodId}:${characterId}:${contract.monster.id}:${action}:loot`;
  const itemId = selectWeightedHuntLootCandidate(lootCandidates, seed)?.item.id;

  if (!itemId || !items.some((item) => item.id === itemId)) {
    return [];
  }

  return [{ itemId, quantity: 1 }];
}

export function selectWeightedHuntLootCandidate(
  candidates: readonly LootCandidate[],
  seed: string
): LootCandidate | undefined {
  if (candidates.length === 0) {
    return undefined;
  }

  const totalWeight = candidates.reduce(
    (sum, candidate) => sum + Math.max(0, candidate.weight ?? 1),
    0
  );

  if (totalWeight <= 0) {
    return candidates[0];
  }

  const target = (stableHash(seed) / 2 ** 32) * totalWeight;
  let cursor = 0;

  for (const candidate of candidates) {
    cursor += Math.max(0, candidate.weight ?? 1);

    if (target < cursor) {
      return candidate;
    }
  }

  return candidates.at(-1);
}

function buildRewardReplay(record: HuntContractRecord): HuntRewardReplay | undefined {
  if (
    record.status !== "completed" ||
    record.rewardXp === null ||
    record.rewardGold === null
  ) {
    return undefined;
  }

  return {
    xp: record.rewardXp,
    gold: record.rewardGold,
    localPeriodId: record.localPeriodId,
    itemGrants: enrichRewardItemGrants(record.rewardItems ?? []),
    ...(isHuntAction(record.completedAction) ? { action: record.completedAction } : {}),
    ...(record.rewardItems === null ? { itemReplayUnavailable: true } : {})
  };
}

function buildRewardReplayFromDailyAction(action: {
  localDate: string;
  rewardXp: number;
  rewardGold: number;
}): HuntRewardReplay {
  return {
    xp: action.rewardXp,
    gold: action.rewardGold,
    localPeriodId: action.localDate,
    itemGrants: [],
    itemReplayUnavailable: true
  };
}

function isHuntAction(value: string | null): value is HuntAction {
  return value === "strike" || value === "trick" || value === "retreat";
}

function stableHash(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}
