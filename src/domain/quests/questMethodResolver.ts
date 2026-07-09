import type { CharacterSummary } from "../characters/characterSummary";
import type { QuestMethodDefinition, QuestResolutionScene } from "../../content/questResolution";
import { calculateQuestChance } from "./questChecks";

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

  return limitAlmostReliableMethods(
    ensureRiskyMethod(selected, scene.methods, maxMethods).slice(0, maxMethods),
    scene.methods,
    character
  );
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
  const aliasMethodId = scene.legacyActionAliases?.[legacyAction];

  if (aliasMethodId) {
    const aliased = findQuestMethod(scene, aliasMethodId);

    if (aliased) {
      return aliased;
    }
  }

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
  if (!canAddDistinct(selected, candidate)) {
    return false;
  }

  selected.push(candidate);
  return true;
}

function canAddDistinct(
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

  return true;
}

function ensureRiskyMethod(
  selected: QuestMethodDefinition[],
  allMethods: readonly QuestMethodDefinition[],
  maxMethods: number
): QuestMethodDefinition[] {
  if (selected.some(isRiskyMethod)) {
    return selected;
  }

  const riskyCandidates = allMethods.filter(isRiskyMethod);

  if (riskyCandidates.length === 0) {
    return selected;
  }

  for (const candidate of riskyCandidates) {
    if (canAddDistinct(selected, candidate)) {
      return selected.length < maxMethods ? [...selected, candidate] : replaceLastPersonalMethod(selected, candidate);
    }
  }

  for (let index = selected.length - 1; index >= 0; index -= 1) {
    const candidateToReplace = selected[index];

    if (!candidateToReplace || candidateToReplace.source === "scene") {
      continue;
    }

    const withoutCandidate = selected.filter((_, candidateIndex) => candidateIndex !== index);
    const replacement = riskyCandidates.find((candidate) => canAddDistinct(withoutCandidate, candidate));

    if (replacement) {
      return [
        ...withoutCandidate.slice(0, index),
        replacement,
        ...withoutCandidate.slice(index)
      ];
    }
  }

  return selected;
}

function replaceLastPersonalMethod(
  selected: QuestMethodDefinition[],
  replacement: QuestMethodDefinition
): QuestMethodDefinition[] {
  for (let index = selected.length - 1; index >= 0; index -= 1) {
    const candidateToReplace = selected[index];

    if (candidateToReplace && candidateToReplace.source !== "scene") {
      return [
        ...selected.slice(0, index),
        replacement,
        ...selected.slice(index + 1)
      ];
    }
  }

  return selected;
}

function limitAlmostReliableMethods(
  selected: QuestMethodDefinition[],
  allMethods: readonly QuestMethodDefinition[],
  character: CharacterSummary
): QuestMethodDefinition[] {
  let almostReliableSeen = false;
  let nextSelected = selected;

  for (let index = 0; index < nextSelected.length; index += 1) {
    const method = nextSelected[index];

    if (!method || !isAlmostReliableMethod(method, character)) {
      continue;
    }

    if (!almostReliableSeen) {
      almostReliableSeen = true;
      continue;
    }

    const withoutMethod = nextSelected.filter((_, candidateIndex) => candidateIndex !== index);
    const replacement = allMethods.find(
      (candidate) => !isAlmostReliableMethod(candidate, character) && canAddDistinct(withoutMethod, candidate)
    );

    if (replacement) {
      nextSelected = [
        ...withoutMethod.slice(0, index),
        replacement,
        ...withoutMethod.slice(index)
      ];
    }
  }

  return nextSelected;
}

function isRiskyMethod(method: QuestMethodDefinition): boolean {
  const consequence = method.consequenceByGrade.complication;

  return (
    consequence === "minor-injury" ||
    consequence === "serious-injury" ||
    consequence === "fight-handoff" ||
    consequence === "local-failure"
  );
}

function isAlmostReliableMethod(method: QuestMethodDefinition, character: CharacterSummary): boolean {
  return calculateQuestChance({
    method,
    stats: character.stats,
    raceId: character.raceId,
    classId: character.classId
  }) >= 80;
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
