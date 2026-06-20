import type { CharacterSummary } from "../characters/characterSummary";
import type { QuestMethodDefinition, QuestResolutionScene } from "../../content/questResolution";

export function resolveQuestMethodsForCharacter(
  scene: QuestResolutionScene,
  character: CharacterSummary,
  options: { maxMethods?: number; minMethods?: number; sceneSlotKey?: string } = {}
): QuestMethodDefinition[] {
  const maxMethods = options.maxMethods ?? 7;
  const minMethods = options.minMethods ?? Math.min(5, maxMethods);
  const priority: QuestMethodDefinition["source"][] = ["scene", "race", "class", "signature"];
  const selected: QuestMethodDefinition[] = [];

  for (const source of priority) {
    const candidates = orderCandidates(
      scene.methods.filter((method) => method.source === source),
      `${scene.sceneId}:${source}:${character.raceId}:${character.classId}:${character.title}:${options.sceneSlotKey ?? ""}`
    );

    for (const candidate of candidates) {
      if (pushIfDistinct(selected, candidate)) {
        break;
      }
    }
  }

  for (const candidate of orderCandidates(scene.methods, `${scene.sceneId}:fill:${character.raceId}:${character.classId}`)) {
    if (selected.length >= maxMethods) {
      break;
    }

    pushIfDistinct(selected, candidate);
  }

  if (selected.length < minMethods) {
    for (const candidate of scene.methods) {
      if (selected.length >= minMethods) {
        break;
      }

      pushIfDistinct(selected, candidate);
    }
  }

  return selected.slice(0, maxMethods);
}

export function findVisibleQuestMethod(
  scene: QuestResolutionScene,
  character: CharacterSummary,
  methodId: string,
  options: { maxMethods?: number; minMethods?: number; sceneSlotKey?: string } = {}
): QuestMethodDefinition | null {
  return (
    resolveQuestMethodsForCharacter(scene, character, options).find(
      (method) => method.id === methodId || method.callbackKey === methodId
    ) ?? null
  );
}

export function findVisibleQuestMethodByCallbackKey(
  scene: QuestResolutionScene,
  character: CharacterSummary,
  callbackKey: string,
  options: { maxMethods?: number; minMethods?: number; sceneSlotKey?: string } = {}
): QuestMethodDefinition | null {
  return (
    resolveQuestMethodsForCharacter(scene, character, options).find(
      (method) => method.callbackKey === callbackKey
    ) ?? null
  );
}

export function findQuestMethod(
  scene: QuestResolutionScene,
  methodId: string
): QuestMethodDefinition | null {
  return scene.methods.find((method) => method.id === methodId || method.callbackKey === methodId) ?? null;
}

export function findQuestMethodByLegacyAction(
  scene: QuestResolutionScene,
  legacyAction: string
): QuestMethodDefinition | null {
  return scene.methods.find((method) => method.legacyAction === legacyAction) ?? null;
}

export function getQuestMethodTacticKey(method: QuestMethodDefinition): string {
  return `${method.intent}:${method.primaryStat}:${method.affordanceId}:${[...method.techniques].sort().join("+")}`;
}

export function getQuestMethodAffordanceKey(method: QuestMethodDefinition): string {
  return method.affordanceId;
}

function pushIfDistinct(
  selected: QuestMethodDefinition[],
  candidate: QuestMethodDefinition
): boolean {
  const normalizedLabel = normalizeLabel(candidate.label);
  const duplicate = selected.some(
    (method) =>
      method.id === candidate.id ||
      method.affordanceId === candidate.affordanceId ||
      normalizeLabel(method.label) === normalizedLabel ||
      getQuestMethodTacticKey(method) === getQuestMethodTacticKey(candidate)
  );
  const samePrimaryCount = selected.filter((method) => method.primaryStat === candidate.primaryStat).length;

  if (duplicate) {
    return false;
  }

  if (samePrimaryCount >= 2) {
    return false;
  }

  selected.push(candidate);
  return true;
}

function normalizeLabel(label: string): string {
  return label
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("uk-UA");
}

function orderCandidates<T>(candidates: readonly T[], seed: string): T[] {
  if (candidates.length <= 1) {
    return [...candidates];
  }

  const preferred = candidates.findIndex(
    (candidate) =>
      typeof candidate === "object" &&
      candidate !== null &&
      "id" in candidate &&
      typeof (candidate as { id?: unknown }).id === "string" &&
      (seed === (candidate as { id: string }).id ||
        seed.includes(`:${(candidate as { id: string }).id}:`) ||
        seed.endsWith(`:${(candidate as { id: string }).id}`))
  );

  if (preferred >= 0) {
    return [...candidates.slice(preferred), ...candidates.slice(0, preferred)];
  }

  const start = stableIndex(seed, candidates.length);

  return [...candidates.slice(start), ...candidates.slice(0, start)];
}

function stableIndex(seed: string, modulo: number): number {
  let hash = 0x811c9dc5;

  for (const char of seed) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash % modulo;
}
