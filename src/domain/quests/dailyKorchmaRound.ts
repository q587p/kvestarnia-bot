import type { DailyKorchmaRoundScene } from "../../content/dailyKorchmaRoundContent";

export interface DailyKorchmaRoundPlanInput {
  characterId: string;
  dayKey: string;
  rerollIndex?: number;
  scenes: readonly DailyKorchmaRoundScene[];
}

export function selectDailyKorchmaRoundSceneIds(input: DailyKorchmaRoundPlanInput): string[] {
  const rerollIndex = Math.max(0, Math.floor(input.rerollIndex ?? 0));
  const seedBase = `${input.characterId}:${input.dayKey}${rerollIndex > 0 ? `:r${rerollIndex}` : ""}`;
  const yardScenes = shuffleStable(
    input.scenes.filter((scene) => scene.zone === "yard"),
    `${seedBase}:yard`
  );
  const interiorScenes = shuffleStable(
    input.scenes.filter((scene) => scene.zone === "interior"),
    `${seedBase}:interior`
  );
  const firstYard = yardScenes[0];

  if (!firstYard) {
    throw new Error("Daily Korchma round requires at least one yard scene.");
  }

  const interiors: DailyKorchmaRoundScene[] = [];
  const usedLocations = new Set<string>();

  for (const scene of interiorScenes) {
    if (usedLocations.has(scene.locationId)) {
      continue;
    }

    interiors.push(scene);
    usedLocations.add(scene.locationId);

    if (interiors.length === 2) {
      break;
    }
  }

  if (interiors.length < 2) {
    throw new Error("Daily Korchma round requires two distinct interior locations.");
  }

  return shuffleStable([firstYard, ...interiors], `${seedBase}:order`).map(
    (scene) => scene.id
  );
}

function shuffleStable<T>(items: readonly T[], seed: string): T[] {
  const result = [...items];
  let state = hashString(seed);

  for (let index = result.length - 1; index > 0; index -= 1) {
    state = nextState(state);
    const swapIndex = state % (index + 1);
    const current = result[index] as T;
    result[index] = result[swapIndex] as T;
    result[swapIndex] = current;
  }

  return result;
}

function hashString(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function nextState(state: number): number {
  let next = state || 0x9e3779b9;
  next ^= next << 13;
  next ^= next >>> 17;
  next ^= next << 5;

  return next >>> 0;
}
