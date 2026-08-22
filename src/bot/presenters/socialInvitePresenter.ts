import { presentCharacterDisplayName } from "./characterDisplay";
import { escapeHtml } from "./telegramHtml";

export interface SocialInviteIdentity {
  name: string;
  activeCosmeticTitle?: string | null;
  guildCrest?: string | null;
}

export function presentSocialInviteIdentity(identity: SocialInviteIdentity): string {
  return presentCharacterDisplayName({
    name: identity.name,
    ...(identity.activeCosmeticTitle !== undefined
      ? { activeCosmeticTitle: identity.activeCosmeticTitle }
      : {}),
    ...(identity.guildCrest !== undefined ? { guildCrest: identity.guildCrest } : {})
  });
}

export function presentSocialInviteIdentityLine(
  label: string,
  identity: SocialInviteIdentity
): string {
  return `${escapeHtml(label)}: ${presentSocialInviteIdentity(identity)}`;
}

export function presentForwardableSocialInvite(input: {
  heading: string;
  bodyHtml: string;
  inviteUrl: string;
}): string {
  return [
    `<b>${escapeHtml(input.heading)}</b>`,
    "",
    input.bodyHtml,
    "",
    escapeHtml(input.inviteUrl)
  ].join("\n");
}
