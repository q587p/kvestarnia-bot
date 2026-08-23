import { parseTerminalBattleArtifactStartPayload } from "../../src/bot/terminalBattleArtifactLink";

type InlineButton = {
  text?: string;
  url?: string;
};

export function findTerminalBattleArtifactShareButtons(replyMarkup: unknown): InlineButton[] {
  const rows = (replyMarkup as { inline_keyboard?: InlineButton[][] } | null | undefined)
    ?.inline_keyboard ?? [];
  return rows.flat().filter((button) => button.text === "🔗 Поділитися записом");
}

export function inspectSingleTerminalBattleArtifactShare(replyMarkup: unknown): {
  artifactUrl: string;
  parsed: NonNullable<ReturnType<typeof parseTerminalBattleArtifactStartPayload>>;
  shareUrl: string;
} {
  const buttons = findTerminalBattleArtifactShareButtons(replyMarkup);
  if (buttons.length !== 1 || !buttons[0]?.url) {
    throw new Error(`Expected exactly one terminal artifact share URL, received ${buttons.length}.`);
  }

  const shareUrl = new URL(buttons[0].url);
  const artifactUrlValue = shareUrl.searchParams.get("url");
  if (shareUrl.origin !== "https://t.me" || shareUrl.pathname !== "/share/url" || !artifactUrlValue) {
    throw new Error("Terminal artifact share button does not contain a Telegram share URL.");
  }

  const artifactUrl = new URL(artifactUrlValue);
  const payload = artifactUrl.searchParams.get("start");
  const parsed = payload ? parseTerminalBattleArtifactStartPayload(payload) : null;
  if (!parsed) {
    throw new Error("Terminal artifact URL does not round-trip through the typed ba1 parser.");
  }

  return { artifactUrl: artifactUrl.toString(), parsed, shareUrl: shareUrl.toString() };
}
