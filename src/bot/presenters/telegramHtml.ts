export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function presentCharacterHeader(character: { name: string; title: string }): string {
  return `<b>${escapeHtml(character.name)}</b> · <i>${escapeHtml(character.title)}</i>`;
}

export function npcQuote(speaker: string, text: string): string {
  return `${escapeHtml(speaker)}:\n<blockquote>${escapeHtml(text)}</blockquote>`;
}
