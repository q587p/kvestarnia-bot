import type { Context } from "grammy";
import { mainMenuButtons } from "./keyboards/mainMenuKeyboard";
import {
  GUILD_CREATION_DESCRIPTION_PROMPT_HEADING,
  GUILD_CREATION_NAME_PROMPT_HEADING,
  GUILD_CREST_UPLOAD_PROMPT_HEADING,
  GUILD_CUSTOM_EMOJI_PROMPT_HEADING,
  GUILD_PROFILE_DESCRIPTION_PROMPT_HEADING
} from "./presenters/guildPresenter";
import { parseStartPayload } from "./startPayload";

export const GUILD_INVITE_PROMPT_HEADING = "📨 Запрошення до ґільдії · крок 1 із 2";

export const guildCommandNames = {
  hub: "guild",
  create: "guild_create",
  inviteCode: "guild_invite_code",
  invite: "guild_invite",
  party: "guild_party",
  edit: "guild_edit",
  leave: "guild_leave",
  delete: "guild_delete",
  transfer: "guild_transfer",
  promote: "guild_promote",
  demote: "guild_demote",
  kick: "guild_kick"
} as const;

const GUILD_COMMAND_NAMES = new Set<string>(Object.values(guildCommandNames));

export type GuildRouteMode = "reply" | "edit";

export function getGuildRouteMode(ctx: Context): GuildRouteMode | null {
  if (ctx.callbackQuery?.data?.startsWith("v1:g:")) {
    return "edit";
  }

  const text = ctx.message?.text?.trim();
  const replyTo = ctx.message?.reply_to_message;
  const replyText = replyTo && "text" in replyTo ? replyTo.text : undefined;
  if (replyTo?.from?.is_bot && replyText && isGuildPrompt(replyText)) {
    return "reply";
  }

  if (text === mainMenuButtons.guild) {
    return "reply";
  }

  const commandMatch = text?.match(/^\/([a-z_]+)(?:@\w+)?(?:\s+(.+))?$/i);
  const command = commandMatch?.[1]?.toLowerCase();
  if (command && GUILD_COMMAND_NAMES.has(command)) {
    return "reply";
  }

  if (command !== "start") {
    return null;
  }

  const payload = parseStartPayload(commandMatch?.[2]);
  return payload.type === "guild-invite" ? "reply" : null;
}

export function isGuildRoute(ctx: Context): boolean {
  return getGuildRouteMode(ctx) !== null;
}

function isGuildPrompt(text: string): boolean {
  const firstLine = text.split("\n", 1)[0] ?? "";
  return firstLine === GUILD_INVITE_PROMPT_HEADING || [
    GUILD_CREATION_NAME_PROMPT_HEADING,
    GUILD_CREATION_DESCRIPTION_PROMPT_HEADING,
    GUILD_PROFILE_DESCRIPTION_PROMPT_HEADING,
    GUILD_CUSTOM_EMOJI_PROMPT_HEADING
  ].some((heading) => firstLine.startsWith(`${heading} · `)) || firstLine.startsWith(`${GUILD_CREST_UPLOAD_PROMPT_HEADING} · `);
}
