export const GUILD_CREATION_GOLD = 587;
export const GUILD_MAX_MEMBERS = 8;
export const GUILD_MAX_OFFICERS = 2;
export const GUILD_NAME_MIN_GRAPHEMES = 3;
export const GUILD_NAME_MAX_GRAPHEMES = 32;
export const GUILD_DESCRIPTION_MAX_GRAPHEMES = 93;
export const GUILD_CREST_CATALOG = [
  "🛡️", "⚔️", "🏰", "🐉", "🦉", "🦊", "🐺", "🐸", "🦄", "🔥", "🌙", "🍄", "🥨"
] as const;
export const GUILD_CUSTOM_CREST_MARKER = "🖼️";
export const GUILD_CREST_MIN_DIMENSION = 64;
export const GUILD_CREST_MAX_DIMENSION = 2048;
export const GUILD_CREST_MAX_FILE_SIZE = 5 * 1024 * 1024;

export type GuildCrestKind = "catalog" | "custom";

export type GuildRole = "leader" | "officer" | "member";

export type GuildIdentityValidation =
  | {
      ok: true;
      displayName: string;
      normalizedName: string;
      crest: string;
      description: string;
    }
  | {
      ok: false;
      reason: "name-length" | "name-reserved" | "name-unsafe" | "crest" | "description-length" | "description-unsafe";
    };

export type GuildProfileValidation =
  | { ok: true; crest: string; description: string }
  | { ok: false; reason: "crest" | "description-length" | "description-unsafe" };

const reservedNames = new Set([
  "квестарня",
  "kvestarnia",
  "адміністрація",
  "адміністратори",
  "модерація",
  "модератори",
  "підтримка",
  "telegram"
]);

const forbiddenText = /[\p{Cc}\p{Cf}\p{Cs}<>&]/u;
const letterOrNumberPattern = /[\p{L}\p{N}]/u;
const cyrillicPattern = /\p{Script=Cyrillic}/u;
const latinPattern = /\p{Script=Latin}/u;
const crestCatalog = new Set<string>(GUILD_CREST_CATALOG);

export function validateGuildIdentity(input: {
  displayName: string;
  crest: string;
  description: string;
}): GuildIdentityValidation {
  const displayName = collapseWhitespace(input.displayName.normalize("NFKC"));
  const normalizedName = displayName.toLocaleLowerCase("uk-UA");
  const crest = input.crest.trim().normalize("NFC");
  const description = collapseWhitespace(input.description.normalize("NFKC"));
  const nameLength = graphemeLength(displayName);

  if (nameLength < GUILD_NAME_MIN_GRAPHEMES || nameLength > GUILD_NAME_MAX_GRAPHEMES) {
    return { ok: false, reason: "name-length" };
  }
  if (reservedNames.has(normalizedName)) {
    return { ok: false, reason: "name-reserved" };
  }
  if (
    forbiddenText.test(displayName) ||
    !letterOrNumberPattern.test(displayName) ||
    (cyrillicPattern.test(displayName) && latinPattern.test(displayName))
  ) {
    return { ok: false, reason: "name-unsafe" };
  }
  if (!crestCatalog.has(crest)) {
    return { ok: false, reason: "crest" };
  }
  if (graphemeLength(description) > GUILD_DESCRIPTION_MAX_GRAPHEMES) {
    return { ok: false, reason: "description-length" };
  }
  if (forbiddenText.test(description)) {
    return { ok: false, reason: "description-unsafe" };
  }

  return { ok: true, displayName, normalizedName, crest, description };
}

export function isEligibleGuildFounder(level: number, remortCount: number): boolean {
  return level >= 5 || (remortCount >= 1 && level >= 3);
}

export function validateGuildProfile(input: { crest: string; description: string }): GuildProfileValidation {
  const crest = input.crest.trim().normalize("NFC");
  const description = collapseWhitespace(input.description.normalize("NFKC"));
  if (!crestCatalog.has(crest)) {
    return { ok: false, reason: "crest" };
  }
  if (graphemeLength(description) > GUILD_DESCRIPTION_MAX_GRAPHEMES) {
    return { ok: false, reason: "description-length" };
  }
  if (forbiddenText.test(description)) {
    return { ok: false, reason: "description-unsafe" };
  }
  return { ok: true, crest, description };
}

export function isValidGuildCrestMediaMetadata(input: {
  fileId: string;
  fileUniqueId: string;
  width: number;
  height: number;
  fileSize: number | null;
}): boolean {
  return input.fileId.length > 0 && input.fileUniqueId.length > 0 &&
    Number.isInteger(input.width) && Number.isInteger(input.height) &&
    input.width >= GUILD_CREST_MIN_DIMENSION && input.height >= GUILD_CREST_MIN_DIMENSION &&
    input.width <= GUILD_CREST_MAX_DIMENSION && input.height <= GUILD_CREST_MAX_DIMENSION &&
    input.fileSize !== null &&
    (
      Number.isInteger(input.fileSize) && input.fileSize >= 0 && input.fileSize <= GUILD_CREST_MAX_FILE_SIZE
    );
}

export function validateGuildDescription(descriptionInput: string):
  | { ok: true; description: string }
  | { ok: false; reason: "description-length" | "description-unsafe" } {
  const description = collapseWhitespace(descriptionInput.normalize("NFKC"));
  if (graphemeLength(description) > GUILD_DESCRIPTION_MAX_GRAPHEMES) {
    return { ok: false, reason: "description-length" };
  }
  if (forbiddenText.test(description)) {
    return { ok: false, reason: "description-unsafe" };
  }
  return { ok: true, description };
}

export function validateGuildName(displayNameInput: string):
  | { ok: true; displayName: string; normalizedName: string }
  | { ok: false; reason: "name-length" | "name-reserved" | "name-unsafe" } {
  const result = validateGuildIdentity({ displayName: displayNameInput, crest: GUILD_CREST_CATALOG[0], description: "" });
  if (result.ok) {
    return { ok: true, displayName: result.displayName, normalizedName: result.normalizedName };
  }
  if (result.reason === "name-length" || result.reason === "name-reserved" || result.reason === "name-unsafe") {
    return { ok: false, reason: result.reason };
  }
  return { ok: false, reason: "name-unsafe" };
}

export function normalizeGuildMemberLookup(value: string): string {
  return collapseWhitespace(value.normalize("NFKC")).toLocaleLowerCase("uk-UA");
}

function collapseWhitespace(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}

function graphemeLength(value: string): number {
  const Segmenter = (Intl as unknown as {
    Segmenter: new (locale: string, options: { granularity: "grapheme" }) => {
      segment(input: string): Iterable<unknown>;
    };
  }).Segmenter;
  return [...new Segmenter("uk", { granularity: "grapheme" }).segment(value)].length;
}
