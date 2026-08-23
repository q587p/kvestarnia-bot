export type TerminalBattleArtifactKind = "solo" | "training" | "mimic";

export type TerminalBattleArtifactStartPayload = {
  type: "terminal-battle-artifact";
  kind: TerminalBattleArtifactKind;
  token: string;
};

const PAYLOAD_VERSION = "ba1";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KIND_CODES: Readonly<Record<TerminalBattleArtifactKind, string>> = {
  solo: "s",
  training: "t",
  mimic: "m"
};
const KINDS_BY_CODE: Readonly<Record<string, TerminalBattleArtifactKind>> = {
  s: "solo",
  t: "training",
  m: "mimic"
};

export function isOpaqueTerminalArtifactToken(token: string): boolean {
  return UUID_PATTERN.test(token);
}

export function buildTerminalBattleArtifactStartPayload(
  kind: TerminalBattleArtifactKind,
  token: string
): string | null {
  if (!isOpaqueTerminalArtifactToken(token)) return null;
  const payload = `${PAYLOAD_VERSION}_${KIND_CODES[kind]}_${token}`;
  return payload.length <= 64 ? payload : null;
}

export function parseTerminalBattleArtifactStartPayload(
  payload: string
): TerminalBattleArtifactStartPayload | null {
  const match = payload.match(/^ba1_([stm])_([0-9a-fA-F-]+)$/);
  if (!match) return null;
  const kind = KINDS_BY_CODE[match[1] ?? ""];
  const token = match[2] ?? "";
  return kind && isOpaqueTerminalArtifactToken(token)
    ? { type: "terminal-battle-artifact", kind, token }
    : null;
}

export function buildTerminalBattleArtifactUrl(
  botUsername: string | undefined,
  kind: TerminalBattleArtifactKind,
  token: string
): string | null {
  const username = botUsername?.trim().replace(/^@/u, "") ?? "";
  const payload = buildTerminalBattleArtifactStartPayload(kind, token);
  return username && payload ? `https://t.me/${username}?start=${payload}` : null;
}

export function buildTerminalBattleArtifactShareUrl(artifactUrl: string): string {
  return `https://t.me/share/url?url=${encodeURIComponent(artifactUrl)}`;
}
