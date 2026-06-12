import type { Pronoun } from "../../content/schema";

export const characterPaths = ["sun", "moon", "boundary"] as const;
export type CharacterPath = (typeof characterPaths)[number];

export interface CharacterPathInput {
  path?: string | null | undefined;
  pronoun?: string | null | undefined;
}

export function getPathForPronoun(pronoun: Pronoun): CharacterPath {
  if (pronoun === "he") {
    return "sun";
  }

  if (pronoun === "she") {
    return "moon";
  }

  return "boundary";
}

export function getCharacterPath(character: CharacterPathInput): CharacterPath {
  if (isCharacterPath(character.path)) {
    return character.path;
  }

  if (character.pronoun === "he") {
    return "sun";
  }

  if (character.pronoun === "she") {
    return "moon";
  }

  return "boundary";
}

export function isSunPath(characterOrPath: CharacterPathInput | string | null | undefined): boolean {
  return pathFromValue(characterOrPath) === "sun";
}

export function isMoonPath(characterOrPath: CharacterPathInput | string | null | undefined): boolean {
  return pathFromValue(characterOrPath) === "moon";
}

export function isBoundaryPath(
  characterOrPath: CharacterPathInput | string | null | undefined
): boolean {
  return pathFromValue(characterOrPath) === "boundary";
}

function pathFromValue(value: CharacterPathInput | string | null | undefined): CharacterPath {
  if (typeof value === "string") {
    return isCharacterPath(value) ? value : "boundary";
  }

  if (!value) {
    return "boundary";
  }

  return getCharacterPath(value);
}

function isCharacterPath(value: string | null | undefined): value is CharacterPath {
  return characterPaths.includes(value as CharacterPath);
}
