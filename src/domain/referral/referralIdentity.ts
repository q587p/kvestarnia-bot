export function sanitizeReferralName(value: string | null | undefined): string {
  const withoutControls = Array.from(value ?? "", (character) => {
      const code = character.charCodeAt(0);
      return code <= 0x1f || (code >= 0x7f && code <= 0x9f) ? " " : character;
    }).join("");
  const normalized = withoutControls
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 32);
  return normalized || "Мандрівник";
}
