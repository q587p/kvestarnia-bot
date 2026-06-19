export type StartPayload =
  | { type: "none" }
  | { type: "duel"; token: string; mode?: "quick" | "turn-based" }
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

  return { type: "unknown", raw: payload, safe: true };
}
