export const GUILD_CREATION_GOLD = 587;
export const GUILD_MAX_MEMBERS = 13;
export const GUILD_NAME_MIN_GRAPHEMES = 3;
export const GUILD_NAME_MAX_GRAPHEMES = 32;
export const GUILD_DESCRIPTION_MAX_GRAPHEMES = 120;

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
const emojiPattern = /\p{Extended_Pictographic}/u;
const letterOrNumberPattern = /[\p{L}\p{N}]/u;

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
  if (forbiddenText.test(displayName) || !letterOrNumberPattern.test(displayName)) {
    return { ok: false, reason: "name-unsafe" };
  }
  if (graphemeLength(crest) !== 1 || !emojiPattern.test(crest) || forbiddenText.test(crest)) {
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
