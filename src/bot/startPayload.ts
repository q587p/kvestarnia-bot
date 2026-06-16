export type StartPayload =
  | { type: "none" }
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

  return { type: "unknown", raw: payload, safe: true };
}
