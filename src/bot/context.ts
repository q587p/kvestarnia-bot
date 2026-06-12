import type { Context } from "grammy";
import type { TelegramUserProfile } from "../db/repositories/userRepository";

type TelegramFrom = NonNullable<Context["from"]>;

export function playerFromContext(from: TelegramFrom | undefined): TelegramUserProfile | null {
  if (!from) {
    return null;
  }

  const displayName = [from.first_name, from.last_name].filter(Boolean).join(" ");
  const player: TelegramUserProfile = {
    telegramUserId: BigInt(from.id),
    displayName
  };

  if (from.username) {
    player.username = from.username;
  }

  if (from.language_code) {
    player.languageCode = from.language_code;
  }

  return player;
}

export function telegramUserIdFromContext(from: TelegramFrom | undefined): bigint | null {
  return from ? BigInt(from.id) : null;
}
