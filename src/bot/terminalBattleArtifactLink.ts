export type TerminalBattleArtifactKind = "solo" | "training" | "mimic";

export type TerminalBattleArtifactStartPayload = {
  type: "terminal-battle-artifact";
  kind: TerminalBattleArtifactKind;
  token: string;
};

export type TerminalBattleArtifactKeyboardOptions = Readonly<{
  artifactUrl: string | null;
}>;

type TerminalBattleArtifactSession = Readonly<{
  id: string;
  status?: string | null;
  state?: Readonly<{ status?: string | null }> | null;
}>;

const PAYLOAD_VERSION = "ba1";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BOT_USERNAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{4,31}$/;
const TERMINAL_SESSION_STATUSES = new Set(["won", "lost", "fled", "expired"]);
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
  return BOT_USERNAME_PATTERN.test(username) && payload
    ? `https://t.me/${username}?start=${payload}`
    : null;
}

export function buildSessionTerminalBattleArtifactKeyboardOptions(
  botUsername: string | undefined,
  kind: Exclude<TerminalBattleArtifactKind, "mimic">,
  session: TerminalBattleArtifactSession
): TerminalBattleArtifactKeyboardOptions {
  const status = session.state?.status ?? session.status;
  return {
    artifactUrl: status && TERMINAL_SESSION_STATUSES.has(status)
      ? buildTerminalBattleArtifactUrl(botUsername, kind, session.id)
      : null
  };
}

export function buildMimicTerminalBattleArtifactKeyboardOptions(
  botUsername: string | undefined,
  state: "completed" | "already-completed",
  artifactToken: string | null | undefined
): TerminalBattleArtifactKeyboardOptions {
  const terminal = state === "completed" || state === "already-completed";
  return {
    artifactUrl: terminal && artifactToken
      ? buildTerminalBattleArtifactUrl(botUsername, "mimic", artifactToken)
      : null
  };
}

export function buildTerminalBattleArtifactShareUrl(artifactUrl: string): string {
  return `https://t.me/share/url?url=${encodeURIComponent(artifactUrl)}`;
}

export function resolveTerminalBattleArtifactBotUsername(
  configured: string | undefined,
  readRuntimeUsername: () => string | undefined
): string | undefined {
  if (configured !== undefined) {
    return configured;
  }

  try {
    return readRuntimeUsername();
  } catch {
    return undefined;
  }
}
