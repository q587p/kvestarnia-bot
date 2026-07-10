import { SeededRandomSource } from "../../shared/random";

export const QUEST_ISKROKAMIN_ITEM_ID = "item.iskrokamin";
export const QUEST_ISKROKAMIN_BONUS_MIN_LEVEL = 4;

export function rollQuestIskrokaminBonusQuantity(input: {
  characterLevel: number;
  roll: number;
}): number {
  if (input.characterLevel < QUEST_ISKROKAMIN_BONUS_MIN_LEVEL) {
    return 0;
  }

  const roll = Math.min(Math.max(input.roll, 0), 0.999_999);

  if (roll < 0.05) {
    return 3;
  }

  if (roll < 0.18) {
    return 2;
  }

  if (roll < 0.41) {
    return 1;
  }

  return 0;
}

export function buildQuestIskrokaminBonusGrant(input: {
  characterId: string;
  characterLevel: number;
  sourceIdentity: string;
}): { itemId: string; quantity: number } | null {
  const rng = new SeededRandomSource(
    `quest-iskrokamin:${input.characterId}:${input.sourceIdentity}`
  );
  const quantity = rollQuestIskrokaminBonusQuantity({
    characterLevel: input.characterLevel,
    roll: rng.nextFloat()
  });

  return quantity > 0
    ? {
        itemId: QUEST_ISKROKAMIN_ITEM_ID,
        quantity
      }
    : null;
}
