export type StartPayload =
  | { type: "none" }
  | { type: "duel"; token: string; mode?: "quick" | "turn-based" }
  | { type: "party"; token: string }
  | { type: "guild-invite"; token: string }
  | { type: "left-passage-attack"; token: string }
  | { type: "tavern-game"; token: string }
  | { type: "support-thanks" }
  | { type: "unknown"; raw: string; safe: boolean };

const MAX_START_PAYLOAD_LENGTH = 64;
const START_PAYLOAD_PATTERN = /^[A-Za-z0-9_-]+$/;

export function parseStartPayload(raw: string | undefined): StartPayload {
  const payload = raw?.trim();

  if (!payload) {
    return { type: "none" };
  }

  const safe =
    payload.length <= MAX_START_PAYLOAD_LENGTH && START_PAYLOAD_PATTERN.test(payload);

  if (!safe) {
    return { type: "unknown", raw: payload.slice(0, MAX_START_PAYLOAD_LENGTH), safe: false };
  }

  if (payload === "support_thanks") {
    return { type: "support-thanks" };
  }

  if (payload.startsWith("duel_turnbased_")) {
    const token = payload.slice("duel_turnbased_".length);

    if (/^[A-Za-z0-9_-]{8,24}$/.test(token)) {
      return { type: "duel", token, mode: "turn-based" };
    }

    return { type: "unknown", raw: payload, safe: true };
  }

  if (payload.startsWith("duel_")) {
    const token = payload.slice("duel_".length);

    if (/^[A-Za-z0-9_-]{8,24}$/.test(token)) {
      return { type: "duel", token };
    }
  }

  if (payload.startsWith("nyz_left_attack_")) {
    const token = payload.slice("nyz_left_attack_".length);

    if (/^[A-Za-z0-9_-]{8,24}$/.test(token)) {
      return { type: "left-passage-attack", token };
    }

    return { type: "unknown", raw: payload, safe: true };
  }

  if (payload.startsWith("party_")) {
    const token = payload.slice("party_".length);

    if (/^[A-Za-z0-9_-]{8,24}$/.test(token)) {
      return { type: "party", token };
    }
  }

  if (payload.startsWith("guild_")) {
    const token = payload.slice("guild_".length);

    if (/^[A-Za-z0-9_-]{8,32}$/.test(token)) {
      return { type: "guild-invite", token };
    }
  }

  if (payload.startsWith("game_")) {
    const token = payload.slice("game_".length);

    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
      return { type: "tavern-game", token };
    }
  }

  return { type: "unknown", raw: payload, safe: true };
}
