export type AchievementCategory =
  | "onboarding"
  | "progression"
  | "combat"
  | "inventory"
  | "korchma"
  | "exploration"
  | "social";

export type AchievementVisibility = "visible" | "hidden";

export type AchievementReward = Readonly<{
  type: "none";
}>;

export type AchievementCombatStatus = "won" | "lost" | "fled";

export type AchievementRoundTier = "simple" | "fine";

export type AchievementEvent =
  | { type: "character.created" }
  | { type: "level.reached"; level: number }
  | {
      type: "combat.finished";
      status: AchievementCombatStatus;
      monsterId?: string;
      turns?: number;
      manaSpent?: number;
    }
  | {
      type: "inventory.item-granted";
      itemId: string;
      totalStacks?: number;
    }
  | {
      type: "equipment.item-equipped";
      itemId: string;
      slot?: string;
    }
  | { type: "hunt.completed"; monsterId: string }
  | { type: "tavern.barrel.completed" }
  | { type: "tavern.round-bought"; tier: AchievementRoundTier }
  | { type: "bestiary.opened" };

export type AchievementTrigger =
  | { type: "character.created" }
  | { type: "level.reached"; minLevel: number }
  | {
      type: "combat.finished";
      status?: AchievementCombatStatus | readonly AchievementCombatStatus[];
      monsterId?: string;
      minTurns?: number;
      minManaSpent?: number;
    }
  | {
      type: "inventory.item-granted";
      itemId?: string;
      minTotalStacks?: number;
    }
  | {
      type: "equipment.item-equipped";
      itemId?: string;
      slot?: string;
    }
  | {
      type: "hunt.completed";
      monsterId?: string;
    }
  | { type: "tavern.barrel.completed" }
  | {
      type: "tavern.round-bought";
      tier?: AchievementRoundTier | readonly AchievementRoundTier[];
    }
  | { type: "bestiary.opened" };

export interface AchievementDefinition {
  id: string;
  title: string;
  description: string;
  category: AchievementCategory;
  visibility: AchievementVisibility;
  phase: "phase1";
  trigger: AchievementTrigger;
  reward: AchievementReward;
}
