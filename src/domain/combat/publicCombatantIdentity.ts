import type { CharacterSummary } from "../characters/characterSummary";

export interface PublicCombatantIdentityV1 {
  version: 1;
  name: string;
  title: string;
  level: number;
  raceId: string;
  raceName: string;
  classId: string;
  className: string;
  guildCrest?: string;
}

export type PublicCombatantIdentitySource = Pick<
  CharacterSummary,
  "name" | "title" | "level" | "raceId" | "raceName" | "classId" | "className" | "guildCrest"
>;

const MAX_NAME_LENGTH = 64;
const MAX_TITLE_LENGTH = 128;
const MAX_LABEL_LENGTH = 64;
const MAX_ID_LENGTH = 64;
const MAX_GUILD_CREST_LENGTH = 16;
const CONTENT_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

export function freezePublicCombatantIdentity(
  character: PublicCombatantIdentitySource
): PublicCombatantIdentityV1 {
  return {
    version: 1,
    name: character.name,
    title: character.title,
    level: character.level,
    raceId: character.raceId,
    raceName: character.raceName,
    classId: character.classId,
    className: character.className,
    ...(character.guildCrest ? { guildCrest: character.guildCrest } : {})
  };
}

export function parsePublicCombatantIdentity(value: unknown): PublicCombatantIdentityV1 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.version !== 1) return null;

  const name = boundedString(candidate.name, MAX_NAME_LENGTH);
  const title = boundedString(candidate.title, MAX_TITLE_LENGTH);
  const raceId = boundedContentId(candidate.raceId);
  const raceName = boundedString(candidate.raceName, MAX_LABEL_LENGTH);
  const classId = boundedContentId(candidate.classId);
  const className = boundedString(candidate.className, MAX_LABEL_LENGTH);
  const level = Number(candidate.level);
  const guildCrest = candidate.guildCrest === undefined
    ? undefined
    : boundedString(candidate.guildCrest, MAX_GUILD_CREST_LENGTH);

  if (
    !name ||
    !title ||
    !raceId ||
    !raceName ||
    !classId ||
    !className ||
    !Number.isSafeInteger(level) ||
    level < 1 ||
    (candidate.guildCrest !== undefined && !guildCrest)
  ) {
    return null;
  }

  return {
    version: 1,
    name,
    title,
    level,
    raceId,
    raceName,
    classId,
    className,
    ...(guildCrest ? { guildCrest } : {})
  };
}

export function buildLegacyPublicCombatantIdentity(input: {
  guildCrest?: string | undefined;
} = {}): PublicCombatantIdentityV1 {
  const guildCrest = boundedString(input.guildCrest, MAX_GUILD_CREST_LENGTH);
  return {
    version: 1,
    name: "Пригодник",
    title: "Пригодник зі старого запису",
    level: 1,
    raceId: "legacy.unknown-race",
    raceName: "—",
    classId: "legacy.unknown-class",
    className: "—",
    ...(guildCrest ? { guildCrest } : {})
  };
}

function boundedContentId(value: unknown): string | null {
  const parsed = boundedString(value, MAX_ID_LENGTH);
  return parsed && CONTENT_ID_PATTERN.test(parsed) ? parsed : null;
}

function boundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= maxLength ? trimmed : null;
}
