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
const HTML_MESSAGE_OPTIONS = {
  parse_mode: "HTML" as const
};

type DevGrantCommand =
  | "dev_add_level"
  | "dev_add_xp"
  | "dev_add_gold"
  | "dev_add_random_item"
  | "dev_add_bandage"
  | "dev_add_dense_bandage"
  | "dev_add_field_kit"
  | "dev_add_yeger_line"
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

  bot.command("dev_add_bandage", async (ctx) => {
    await handleDevGrantCommand(
      ctx,
      devGrantService,
      "dev_add_bandage",
      (telegramUserId, amount) => devGrantService.addBandages(telegramUserId, amount)
    );
  });

  bot.command("dev_add_dense_bandage", async (ctx) => {
    await handleDevGrantCommand(
      ctx,
      devGrantService,
      "dev_add_dense_bandage",
      (telegramUserId, amount) => devGrantService.addDenseBandages(telegramUserId, amount)
    );
  });

  bot.command("dev_add_field_kit", async (ctx) => {
    await handleDevGrantCommand(
      ctx,
      devGrantService,
      "dev_add_field_kit",
      (telegramUserId, amount) => devGrantService.addFieldKits(telegramUserId, amount)
    );
  });

  bot.command("dev_add_yeger_line", async (ctx) => {
    await handleDevGrantCommand(
      ctx,
      devGrantService,
      "dev_add_yeger_line",
      (telegramUserId, amount) => devGrantService.addYegerLines(telegramUserId, amount)
    );
  });

  bot.command("dev_reset_yeger_bandage", async (ctx) => {
    await handleDevResetYegerBandageCommand(ctx, devGrantService);
  });

  bot.command("dev_reset_yeger_bandage_day", async (ctx) => {
    await handleDevResetYegerBandageDayCommand(ctx, devGrantService);
  });

  bot.command("dev_reset_yeger_trail", async (ctx) => {
    await handleDevResetYegerTrailCommand(ctx, devGrantService);
  });

  bot.command("dev_reset_priest_blessing", async (ctx) => {
    await handleDevResetPriestBlessingCommand(ctx, devGrantService);
  });

  bot.command("dev_reset_quiet_pocket", async (ctx) => {
    await handleDevResetQuietPocketCommand(ctx, devGrantService);
  });

  bot.command("dev_reset_rogue", async (ctx) => {
    await handleDevResetRogueCommand(ctx, devGrantService);
  });

  bot.command("dev_yeger_first_done", async (ctx) => {
    await handleDevCompleteYegerQuestCommand(ctx, devGrantService, "first");
  });

  bot.command("dev_yeger_second_done", async (ctx) => {
    await handleDevCompleteYegerQuestCommand(ctx, devGrantService, "second");
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

  await ctx.reply(presentDevGrantResult(result), HTML_MESSAGE_OPTIONS);
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

  await ctx.reply(presentDevGrantResult(result), HTML_MESSAGE_OPTIONS);
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

  await ctx.reply(presentDevGrantResult(result), HTML_MESSAGE_OPTIONS);
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

  await ctx.reply(presentDevGrantResult(result), HTML_MESSAGE_OPTIONS);
}

async function handleDevResetYegerTrailCommand(
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

  const result = await devGrantService.resetYegerTrackingCooldown(telegramUserId);

  await ctx.reply(presentDevGrantResult(result), HTML_MESSAGE_OPTIONS);
}

async function handleDevResetPriestBlessingCommand(
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

  const result = await devGrantService.resetPriestBlessingCooldown(telegramUserId);

  await ctx.reply(presentDevGrantResult(result), HTML_MESSAGE_OPTIONS);
}

async function handleDevResetQuietPocketCommand(
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

  const result = await devGrantService.resetQuietPocketCooldown(telegramUserId);

  await ctx.reply(presentDevGrantResult(result), HTML_MESSAGE_OPTIONS);
}

async function handleDevResetRogueCommand(
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

  const result = await devGrantService.resetRogue(telegramUserId);

  await ctx.reply(presentDevGrantResult(result), HTML_MESSAGE_OPTIONS);
}

async function handleDevResetYegerBandageDayCommand(
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

  const result = await devGrantService.resetYegerBandageDay(telegramUserId);

  await ctx.reply(presentDevGrantResult(result), HTML_MESSAGE_OPTIONS);
}

async function handleDevCompleteYegerQuestCommand(
  ctx: DevGrantContext,
  devGrantService: DevGrantService,
  stage: "first" | "second"
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

  const result = stage === "second"
    ? await devGrantService.completeSecondYegerQuestProgress(telegramUserId)
    : await devGrantService.completeFirstYegerQuestProgress(telegramUserId);

  await ctx.reply(presentDevGrantResult(result), HTML_MESSAGE_OPTIONS);
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
