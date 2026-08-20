import { presentCharacterDisplayName } from "./characterDisplay";
import { escapeHtml } from "./telegramHtml";

export interface SocialInviteIdentity {
  name: string;
  activeCosmeticTitle?: string | null;
  guildCrest?: string | null;
  guildName?: string | null;
}

export function presentSocialInviteIdentityLine(
  label: string,
  identity: SocialInviteIdentity
): string {
  return `${escapeHtml(label)}: ${presentCharacterDisplayName({
    name: identity.name,
    ...(identity.activeCosmeticTitle !== undefined
      ? { activeCosmeticTitle: identity.activeCosmeticTitle }
      : {}),
    ...(identity.guildCrest !== undefined ? { guildCrest: identity.guildCrest } : {})
  })}`;
}

export function presentForwardableSocialInvite(input: {
  heading: string;
  bodyHtml: string;
  inviterIdentity: SocialInviteIdentity;
  inviteUrl: string;
}): string {
  const identityDetails = [
    ...(input.inviterIdentity.activeCosmeticTitle
      ? [`Титул: <i>«${escapeHtml(input.inviterIdentity.activeCosmeticTitle)}»</i>`]
      : []),
    ...(input.inviterIdentity.guildName
      ? [
          `Ґільдія: ${input.inviterIdentity.guildCrest
            ? `${escapeHtml(input.inviterIdentity.guildCrest)} `
            : ""}<b>${escapeHtml(input.inviterIdentity.guildName)}</b>`
        ]
      : [])
  ];

  return [
    `<b>${escapeHtml(input.heading)}</b>`,
    "",
    input.bodyHtml,
    ...identityDetails,
    "",
    `🔗 <a href="${escapeHtml(input.inviteUrl)}">${escapeHtml(input.inviteUrl)}</a>`
  ].join("\n");
}
