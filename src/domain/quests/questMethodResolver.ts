import type { CharacterSummary } from "../characters/characterSummary";
import type { QuestMethodDefinition, QuestResolutionScene } from "../../content/questResolution";

export function resolveQuestMethodsForCharacter(
  scene: QuestResolutionScene,
  _character: CharacterSummary,
  options: { maxMethods?: number; minMethods?: number } = {}
): QuestMethodDefinition[] {
  const maxMethods = options.maxMethods ?? 4;
  const minMethods = options.minMethods ?? Math.min(3, maxMethods);
  const priority: QuestMethodDefinition["source"][] = ["scene", "race", "class", "signature"];
  const selected: QuestMethodDefinition[] = [];

  for (const source of priority) {
    const candidate = scene.methods.find((method) => method.source === source);

    if (candidate) {
      pushIfDistinct(selected, candidate, source === "class" || source === "signature");
    }
  }

  for (const candidate of scene.methods) {
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

  if (selected.length < minMethods) {
    for (const candidate of scene.methods) {
      if (selected.length >= minMethods) {
        break;
      }

      if (!selected.includes(candidate)) {
        selected.push(candidate);
      }
    }
  }

  return selected.slice(0, maxMethods);
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

function pushIfDistinct(
  selected: QuestMethodDefinition[],
  candidate: QuestMethodDefinition,
  preferCandidate = false
): void {
  const normalizedLabel = normalizeLabel(candidate.label);
  const duplicate = selected.some(
    (method) =>
      normalizeLabel(method.label) === normalizedLabel ||
      (method.source === candidate.source &&
        method.intent === candidate.intent &&
        method.primaryStat === candidate.primaryStat)
  );
  const samePrimaryCount = selected.filter((method) => method.primaryStat === candidate.primaryStat).length;

  if (duplicate) {
    return;
  }

  if (samePrimaryCount >= 2 && preferCandidate) {
    const replaceIndex = selected.findIndex(
      (method) =>
        method.primaryStat === candidate.primaryStat &&
        method.source !== "scene" &&
        method.source !== "class" &&
        method.source !== "signature"
    );

    if (replaceIndex >= 0) {
      selected.splice(replaceIndex, 1);
    }
  }

  const updatedSamePrimaryCount = selected.filter((method) => method.primaryStat === candidate.primaryStat).length;

  if (updatedSamePrimaryCount < 2) {
    selected.push(candidate);
  }
}

function normalizeLabel(label: string): string {
  return label
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("uk-UA");
}
