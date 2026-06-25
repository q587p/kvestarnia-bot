import type { Bot, Context } from "grammy";
import type {
  DevGrantItemsResult,
  DevGrantResult,
  DevGrantService
} from "../../services/devGrantService";
import { playerFromContext } from "../context";
import {
  presentDevGrantDisabled,
  presentDevGrantInvalidAmount,
  presentDevGrantNoCharacter,
  presentDevGrantResult
} from "../presenters/devGrantPresenter";

const DEFAULT_DEV_GRANT_AMOUNT = 1;
const MAX_DEV_GRANT_AMOUNT = 1_000;

type DevGrantCommand =
  | "dev_add_level"
  | "dev_add_xp"
  | "dev_add_gold"
  | "dev_add_random_item"
  | "dev_heal"
  | "dev_restore_mana";
type DevGrantContext = Context & { match?: string };

export function registerDevGrantCommands(bot: Bot, devGrantService: DevGrantService): void {
  bot.command("dev_add_level", async (ctx) => {
    await handleDevGrantCommand(ctx, devGrantService, "dev_add_level", (telegramUserId, amount) =>
      devGrantService.addLevel(telegramUserId, amount)
    );
  });

  bot.command("dev_add_xp", async (ctx) => {
    await handleDevGrantCommand(ctx, devGrantService, "dev_add_xp", (telegramUserId, amount) =>
      devGrantService.addXp(telegramUserId, amount)
    );
  });

  bot.command("dev_add_gold", async (ctx) => {
    await handleDevGrantCommand(ctx, devGrantService, "dev_add_gold", (telegramUserId, amount) =>
      devGrantService.addGold(telegramUserId, amount)
    );
  });

  bot.command("dev_heal", async (ctx) => {
    await handleDevHealCommand(ctx, devGrantService);
  });

  bot.command("dev_restore_mana", async (ctx) => {
    await handleDevRestoreManaCommand(ctx, devGrantService);
  });

  bot.command("dev_add_random_item", async (ctx) => {
    await handleDevGrantCommand(
      ctx,
      devGrantService,
      "dev_add_random_item",
      (telegramUserId, amount) => devGrantService.addRandomItems(telegramUserId, amount)
    );
  });

  bot.command("dev_reset_yeger_bandage", async (ctx) => {
    await handleDevResetYegerBandageCommand(ctx, devGrantService);
  });
}

async function handleDevGrantCommand(
  ctx: DevGrantContext,
  devGrantService: DevGrantService,
  command: DevGrantCommand,
  grant: (
    telegramUserId: bigint,
    amount: number
  ) => Promise<DevGrantResult | DevGrantItemsResult>
): Promise<void> {
  if (!devGrantService.isEnabled()) {
    await ctx.reply(presentDevGrantDisabled());
    return;
  }

  const amount = parseDevGrantAmount(ctx.match);

  if (amount === null) {
    await ctx.reply(presentDevGrantInvalidAmount(command));
    return;
  }

  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

  if (!telegramUserId) {
    await ctx.reply(presentDevGrantNoCharacter());
    return;
  }

  const result = await grant(telegramUserId, amount);

  await ctx.reply(presentDevGrantResult(result));
}

async function handleDevHealCommand(
  ctx: DevGrantContext,
  devGrantService: DevGrantService
): Promise<void> {
  if (!devGrantService.isEnabled()) {
    await ctx.reply(presentDevGrantDisabled());
    return;
  }

  const amount = parseDevHealAmount(ctx.match);

  if (amount === null) {
    await ctx.reply(presentDevGrantInvalidAmount("dev_heal"));
    return;
  }

  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

  if (!telegramUserId) {
    await ctx.reply(presentDevGrantNoCharacter());
    return;
  }

  const result = await devGrantService.heal(telegramUserId, amount);

  await ctx.reply(presentDevGrantResult(result));
}

async function handleDevRestoreManaCommand(
  ctx: DevGrantContext,
  devGrantService: DevGrantService
): Promise<void> {
  if (!devGrantService.isEnabled()) {
    await ctx.reply(presentDevGrantDisabled());
    return;
  }

  const amount = parseDevHealAmount(ctx.match);

  if (amount === null) {
    await ctx.reply(presentDevGrantInvalidAmount("dev_restore_mana"));
    return;
  }

  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

  if (!telegramUserId) {
    await ctx.reply(presentDevGrantNoCharacter());
    return;
  }

  const result = await devGrantService.restoreMana(telegramUserId, amount);

  await ctx.reply(presentDevGrantResult(result));
}

async function handleDevResetYegerBandageCommand(
  ctx: DevGrantContext,
  devGrantService: DevGrantService
): Promise<void> {
  if (!devGrantService.isEnabled()) {
    await ctx.reply(presentDevGrantDisabled());
    return;
  }

  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

  if (!telegramUserId) {
    await ctx.reply(presentDevGrantNoCharacter());
    return;
  }

  const result = await devGrantService.resetYegerBandageCooldown(telegramUserId);

  await ctx.reply(presentDevGrantResult(result));
}

function parseDevGrantAmount(raw: string | undefined): number | null {
  const value = raw?.trim();

  if (!value) {
    return DEFAULT_DEV_GRANT_AMOUNT;
  }

  if (!/^\d+$/.test(value)) {
    return null;
  }

  const amount = Number(value);

  return Number.isSafeInteger(amount) && amount >= 1 && amount <= MAX_DEV_GRANT_AMOUNT
    ? amount
    : null;
}

function parseDevHealAmount(raw: string | undefined): number | null | undefined {
  const value = raw?.trim();

  if (!value) {
    return undefined;
  }

  if (!/^\d+$/.test(value)) {
    return null;
  }

  const amount = Number(value);

  return Number.isSafeInteger(amount) && amount >= 1 ? amount : null;
}
