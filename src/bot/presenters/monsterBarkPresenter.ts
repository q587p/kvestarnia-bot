import { escapeHtml } from "./telegramHtml";

export function presentMonsterBarkBlockquote(text: string): string {
  const trimmed = text.trim();
  const barkText = trimmed.startsWith("«") && trimmed.endsWith("»")
    ? trimmed.slice(1, -1).trim()
    : trimmed;

  return `🗣️ Монстр:\n<blockquote>${escapeHtml(barkText)}</blockquote>`;
}
