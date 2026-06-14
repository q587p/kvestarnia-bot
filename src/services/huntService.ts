import { items, monsterLoot, monsters, selectMonsterFlavorLine } from "../content";
import type { MonsterContent } from "../content/schema";
import type { CharacterRepository } from "../db/repositories/characterRepository";
import type { DailyActionRepository, RewardLevelChange } from "../db/repositories/dailyActionRepository";
import { summarizeCharacter, type CharacterSummary } from "../domain/characters/characterSummary";
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
  | { state: "ready"; character: CharacterSummary; contract: HuntContract }
  | { state: "already-completed"; character: CharacterSummary; contract: HuntContract };

export type HuntResult =
  | { state: "no-character" }
  | { state: "stale-period"; currentLocalPeriodId: string; requestedLocalPeriodId: string }
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
    };

export interface HuntReward {
  xp: number;
  gold: number;
  localPeriodId: string;
  itemGrants: RewardItemGrant[];
}

export class HuntService {
  constructor(
    private readonly characters: CharacterRepository,
    private readonly dailyActions: DailyActionRepository,
    private readonly clock: Clock = systemClock
  ) {}

  async getHuntBoardForTelegramUser(telegramUserId: bigint): Promise<HuntLookupResult> {
    const localPeriodId = toKyivHourPeriodId(this.clock());
    const character = await this.characters.findByTelegramUserId(telegramUserId);

    if (!character) {
      return { state: "no-character" };
    }

    const summary = summarizeCharacter(character);
    const contract = buildHuntContract(summary, localPeriodId, character.id);
    const existing = await this.dailyActions.findForTelegramUser(telegramUserId, {
      key: HUNT_BOARD_CONTRACT_KEY,
      localDate: localPeriodId
    });

    if (existing) {
      return {
        state: "already-completed",
        character: summary,
        contract
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
    const contract = buildHuntContract(summary, currentLocalPeriodId, character.id);

    if (requestedContractToken !== contract.contractToken) {
      return {
        state: "stale-contract",
        currentLocalPeriodId,
        requestedLocalPeriodId,
        currentContract: contract
      };
    }

    const reward = buildHuntRewardAmounts(contract.monster, action);
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

    if (claim.state === "existing") {
      return {
        state: "already-completed",
        character: summarizeCharacter(claim.character),
        contract
      };
    }

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
}

export function selectHuntMonster(localPeriodId: string, characterId: string): MonsterContent {
  const candidates = monsters
    .filter((monster) => monster.id !== "monster.mimic-shawarma")
    .filter((monster) => !monster.tags.includes("boss"))
    .filter((monster) => monster.level <= 3)
    .sort((left, right) => left.id.localeCompare(right.id));

  const monster = candidates[stableHash(`${localPeriodId}:${characterId}:hunt-board`) % candidates.length];

  if (!monster) {
    throw new Error("Hunt board has no available monsters.");
  }

  return monster;
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

function buildHuntContract(
  character: CharacterSummary,
  localPeriodId: string,
  characterId: string
): HuntContract {
  const monster = selectHuntMonster(localPeriodId, characterId);

  return {
    localPeriodId,
    monster,
    contractToken: buildHuntContractToken(localPeriodId, characterId, monster),
    startFlavor:
      selectMonsterFlavorLine(character, {
        monsterId: monster.id,
        placement: "monster.start",
        seed: `${localPeriodId}:${characterId}:start`
      })?.text ?? null
  };
}

export function buildHuntContractToken(
  localPeriodId: string,
  characterId: string,
  monster: Pick<MonsterContent, "id" | "level" | "tags">
): string {
  const lootIds = [...(monsterLoot[monster.id as keyof typeof monsterLoot] ?? [])].sort();
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
  action: HuntAction
): { xp: number; gold: number } {
  const actionXpBonus = action === "trick" ? 1 : action === "retreat" ? 0 : 2;
  const actionGoldBonus = action === "retreat" ? 0 : action === "trick" ? 1 : 0;

  return {
    xp: Math.min(7, Math.max(3, 2 + monster.level + actionXpBonus)),
    gold: Math.min(3, Math.max(0, Math.floor(monster.level / 2) + actionGoldBonus))
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

  const lootIds: readonly string[] =
    monsterLoot[contract.monster.id as keyof typeof monsterLoot] ?? [];

  if (lootIds.length === 0) {
    return [];
  }

  const seed = `${contract.localPeriodId}:${characterId}:${contract.monster.id}:${action}:loot`;
  const itemId = lootIds[stableHash(seed) % lootIds.length];

  if (!itemId || !items.some((item) => item.id === itemId)) {
    return [];
  }

  return [{ itemId, quantity: 1 }];
}

function stableHash(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}
