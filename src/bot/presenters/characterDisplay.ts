import { escapeHtml } from "./telegramHtml";

export interface CharacterDisplayIdentity {
  name: string;
  activeCosmeticTitle?: string | null;
  guildCrest?: string | null;
}

export interface CharacterDisplayOptions {
  boldName?: boolean;
  maxNameLength?: number;
  maxTitleLength?: number;
}

export function presentCharacterDisplayName(
  identity: CharacterDisplayIdentity,
  options: CharacterDisplayOptions = {}
): string {
  const name = escapeHtml(truncateDisplayPart(identity.name, options.maxNameLength));
  const guildCrest = identity.guildCrest ? `${escapeHtml(identity.guildCrest)} ` : "";
  const renderedName = options.boldName === false
    ? `${guildCrest}${name}`
    : `${guildCrest}<b>${name}</b>`;
  const title = presentActiveCosmeticTitle(identity.activeCosmeticTitle, {
    ...(options.maxTitleLength === undefined ? {} : { maxLength: options.maxTitleLength })
  });

  return title ? `${renderedName} (${title})` : renderedName;
}

export function presentActiveCosmeticTitle(
  title: string | null | undefined,
  options: { maxLength?: number } = {}
): string {
  const trimmed = title?.trim();

  return trimmed ? `<i>«${escapeHtml(truncateDisplayPart(trimmed, options.maxLength))}»</i>` : "";
}

function truncateDisplayPart(value: string, maxLength: number | undefined): string {
  if (!maxLength || value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(1, maxLength - 1))}…`;
}
