export const PARTY_RAID_CHAT_MAX_GRAPHEMES = 93;

const PROHIBITED_DIRECTIONAL_AND_ZERO_WIDTH =
  /[\u061c\u200b\u200e\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/gu;
const C0_C1_CONTROLS = /\p{Cc}/gu;

type GraphemeSegmenter = {
  segment(value: string): Iterable<unknown>;
};

type SegmenterConstructor = new (
  locales?: string | string[],
  options?: { granularity: "grapheme" }
) => GraphemeSegmenter;

const Segmenter = (Intl as unknown as { Segmenter?: SegmenterConstructor }).Segmenter;
const graphemeSegmenter = Segmenter ? new Segmenter("uk", { granularity: "grapheme" }) : null;

export type PartyRaidChatTextValidation =
  | { ok: true; text: string; graphemeCount: number }
  | { ok: false; reason: "empty" | "too-long"; graphemeCount: number };

export function normalizePartyRaidChatText(value: string): string {
  return value
    .normalize("NFC")
    .replace(/[\t\n\r]+/gu, " ")
    .replace(C0_C1_CONTROLS, "")
    .replace(PROHIBITED_DIRECTIONAL_AND_ZERO_WIDTH, "")
    .replace(/\s+/gu, " ")
    .trim();
}

export function countPartyRaidChatGraphemes(value: string): number {
  return graphemeSegmenter
    ? Array.from(graphemeSegmenter.segment(value)).length
    : Array.from(value).length;
}

export function validatePartyRaidChatText(value: string): PartyRaidChatTextValidation {
  const text = normalizePartyRaidChatText(value);
  const graphemeCount = countPartyRaidChatGraphemes(text);

  if (graphemeCount === 0) {
    return { ok: false, reason: "empty", graphemeCount };
  }
  if (graphemeCount > PARTY_RAID_CHAT_MAX_GRAPHEMES) {
    return { ok: false, reason: "too-long", graphemeCount };
  }

  return { ok: true, text, graphemeCount };
}
