import type { PrismaQuestMarkerReadRepository } from "../db/repositories/prismaQuestMarkerReadRepository";
import { runWithQuestMarkerReadSnapshot } from "../db/repositories/questMarkerReadContext";
import { EQUIPMENT_ATTUNEMENT_ACTION_KEY } from "../domain/equipment/equipmentAttunement";
import { FIELD_KIT_ITEM_ID } from "../domain/itemCraft";
import { ITEM_UPGRADE_UNLOCK_KEY } from "../domain/itemUpgrades";
import {
  CELLAR_GROWNUP_BOTTLE_KEY,
  CELLAR_GROWNUP_COMPLETION_KEY,
  CELLAR_GROWNUP_ROLEPLAY_COOLDOWN_KEY,
  CELLAR_GROWNUP_SEAL_PURCHASE_KEY
} from "./cellarGrownupQuestService";
import { CELLAR_MOUSE_ERRAND_KEY } from "./cellarErrandService";
import {
  ADVENTURE_CHOICE_KEY,
  ADVENTURE_CHOICE_REROLL_KEY,
  DAILY_KORCHMA_ROUND_OFFER_KEY,
  DAILY_KORCHMA_ROUND_REWARD_KEY,
  DAILY_KORCHMA_ROUND_STEP_KEY,
  MIMIC_SHAWARMA_ADVENTURE_KEY,
  MIMIC_SHAWARMA_COMBAT_PROBE_KEY,
  PROBLEM_QUEST_13_ISSUED_KEY,
  PROBLEM_QUEST_13_REWARD_KEY,
  PROBLEM_QUEST_23_ISSUED_KEY,
  PROBLEM_QUEST_23_REWARD_KEY,
  PROBLEM_QUEST_42_ISSUED_KEY,
  PROBLEM_QUEST_42_REWARD_KEY,
  PROBLEM_QUEST_93_ISSUED_KEY,
  PROBLEM_QUEST_93_REWARD_KEY,
  YEGER_UNQUIET_TRIAL_COMPLETED_KEY,
  YEGER_UNQUIET_TRIAL_SECOND_COMPLETED_KEY,
  YEGER_UNQUIET_TRIAL_SECOND_STARTED_KEY,
  YEGER_UNQUIET_TRIAL_STARTED_KEY
} from "./dailyActionKeys";
import { FIGHTING_CORNER_QUEST_KEYS } from "./fightingCornerQuestService";
import { CELLAR_CHEESE_SEAL_ITEM_ID, CELLAR_FOAMY_MIRAGE_BOTTLE_ITEM_ID } from "./itemGrant";
import {
  buildFridayBarrelRaidPendingKey,
  FRIDAY_BARREL_RAID_KEY,
  getBarrelRaidPeriod
} from "./tavernRaidService";

const FIRST_KORCHMA_KEYS = [
  "quest.first-korchma.entered",
  "quest.first-korchma.completed"
] as const;
const BARREL_BEER_KEYS = [
  "quest.barrel-beer-tutorial.accepted",
  "quest.barrel-beer-tutorial.visited-barrel",
  "quest.barrel-beer-tutorial.raid-completed",
  "quest.barrel-beer-tutorial.beer-action",
  "quest.barrel-beer-tutorial.beer-drunk",
  "quest.barrel-beer-tutorial.completed"
] as const;

export class QuestMarkerReadService {
  constructor(private readonly repository: PrismaQuestMarkerReadRepository) {}

  async run<T>(telegramUserId: bigint, callback: () => Promise<T>): Promise<T> {
    const observedPeriod = getBarrelRaidPeriod(new Date());
    const nextPeriod = getBarrelRaidPeriod(new Date(observedPeriod.endsAt.getTime()));
    const periods = [nextPeriod.id, ...recentFridayPeriods(observedPeriod, 24)];
    const snapshot = await this.repository.load(telegramUserId, {
      dailyActionKeys: [
        ADVENTURE_CHOICE_KEY,
        ADVENTURE_CHOICE_REROLL_KEY,
        MIMIC_SHAWARMA_ADVENTURE_KEY,
        MIMIC_SHAWARMA_COMBAT_PROBE_KEY,
        PROBLEM_QUEST_13_ISSUED_KEY,
        PROBLEM_QUEST_13_REWARD_KEY,
        PROBLEM_QUEST_23_ISSUED_KEY,
        PROBLEM_QUEST_23_REWARD_KEY,
        PROBLEM_QUEST_42_ISSUED_KEY,
        PROBLEM_QUEST_42_REWARD_KEY,
        PROBLEM_QUEST_93_ISSUED_KEY,
        PROBLEM_QUEST_93_REWARD_KEY,
        YEGER_UNQUIET_TRIAL_STARTED_KEY,
        YEGER_UNQUIET_TRIAL_COMPLETED_KEY,
        YEGER_UNQUIET_TRIAL_SECOND_STARTED_KEY,
        YEGER_UNQUIET_TRIAL_SECOND_COMPLETED_KEY,
        DAILY_KORCHMA_ROUND_OFFER_KEY,
        DAILY_KORCHMA_ROUND_STEP_KEY,
        DAILY_KORCHMA_ROUND_REWARD_KEY,
        EQUIPMENT_ATTUNEMENT_ACTION_KEY,
        ITEM_UPGRADE_UNLOCK_KEY,
        CELLAR_GROWNUP_SEAL_PURCHASE_KEY,
        CELLAR_GROWNUP_BOTTLE_KEY,
        CELLAR_GROWNUP_COMPLETION_KEY,
        FRIDAY_BARREL_RAID_KEY,
        ...Object.values(FIGHTING_CORNER_QUEST_KEYS),
        ...FIRST_KORCHMA_KEYS,
        ...BARREL_BEER_KEYS
      ],
      cooldownKeys: [
        CELLAR_MOUSE_ERRAND_KEY,
        CELLAR_GROWNUP_ROLEPLAY_COOLDOWN_KEY,
        ...periods.map((periodId) => buildFridayBarrelRaidPendingKey(periodId))
      ],
      itemIds: [
        FIELD_KIT_ITEM_ID,
        CELLAR_CHEESE_SEAL_ITEM_ID,
        CELLAR_FOAMY_MIRAGE_BOTTLE_ITEM_ID
      ]
    });

    return runWithQuestMarkerReadSnapshot(snapshot, callback);
  }
}

function recentFridayPeriods(current: ReturnType<typeof getBarrelRaidPeriod>, count: number): string[] {
  const periods = [current.id];
  let cursor = current;
  for (let index = 1; index < count; index += 1) {
    cursor = getBarrelRaidPeriod(new Date(cursor.startsAt.getTime() - 1));
    periods.push(cursor.id);
  }
  return [...new Set(periods)];
}
