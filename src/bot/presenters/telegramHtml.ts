export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function npcQuote(speaker: string, text: string): string {
  return `${escapeHtml(speaker)}:\n<blockquote>${escapeHtml(text)}</blockquote>`;
}
