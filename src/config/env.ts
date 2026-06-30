import { z } from "zod";

const nodeEnvSchema = z.enum(["development", "test", "production"]).default("development");
const databaseUrlSchema = z.string().min(1).refine(isValidDatabaseUrl, {
  message: "DATABASE_URL must be a URL or a Prisma SQLite file: path"
});
const supportJarUrlSchema = z.string().refine(isValidSupportJarUrl, {
  message: "SUPPORT_JAR_URL must be an absolute https://send.monobank.ua/jar/... URL"
});
const supportJarStatusSchema = z
  .object({
    currentUah: z.number().int().min(0).optional(),
    goalUah: z.number().int().min(1).optional(),
    updatedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
  })
  .optional();
const botUsernameSchema = z.string().transform(normalizeBotUsername).pipe(
  z.string().regex(/^[A-Za-z][A-Za-z0-9_]{4,31}$/, {
    message: "BOT_USERNAME must be a Telegram bot username without https://t.me/"
  })
);

export interface SupportJarStatus {
  currentUah?: number;
  goalUah?: number;
  updatedAt?: string;
}

interface RawSupportJarStatus {
  currentUah?: number | string;
  goalUah?: number | string;
  updatedAt?: string;
}

export const configSchema = z.object({
  nodeEnv: nodeEnvSchema,
  botToken: z.string().optional(),
  botUsername: botUsernameSchema.optional(),
  databaseUrl: databaseUrlSchema,
  deployNotificationsEnabled: z.boolean().default(false),
  devGrantCommandsEnabled: z.boolean().default(false),
  partySessionFoundationEnabled: z.boolean().default(false),
  partySessionDevHelpersEnabled: z.boolean().default(false),
  bigBarrelBrotherRaidEnabled: z.boolean().default(false),
  combatBalanceAnalyticsEnabled: z.boolean().default(false),
  supportJarUrl: supportJarUrlSchema.optional(),
  supportJarStatus: supportJarStatusSchema
});

export type AppConfig = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return configSchema.parse({
    nodeEnv: env.NODE_ENV,
    botToken: blankToUndefined(env.BOT_TOKEN),
    botUsername: blankToUndefined(env.BOT_USERNAME),
    databaseUrl: env.DATABASE_URL,
    deployNotificationsEnabled: parseBoolean(env.DEPLOY_NOTIFICATIONS_ENABLED),
    devGrantCommandsEnabled: parseBoolean(env.DEV_GRANT_COMMANDS_ENABLED),
    partySessionFoundationEnabled: parseBoolean(env.PARTY_SESSION_FOUNDATION_ENABLED),
    partySessionDevHelpersEnabled: parseBoolean(env.PARTY_SESSION_DEV_HELPERS_ENABLED),
    bigBarrelBrotherRaidEnabled: parseBoolean(env.BIG_BARREL_BROTHER_RAID_ENABLED),
    combatBalanceAnalyticsEnabled: parseBoolean(env.COMBAT_BALANCE_ANALYTICS_ENABLED),
    supportJarUrl: blankToUndefined(env.SUPPORT_JAR_URL),
    supportJarStatus: parseSupportJarStatus(env)
  });
}

function normalizeBotUsername(value: string): string {
  return value.trim().replace(/^@/, "");
}

function blankToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function isValidDatabaseUrl(value: string): boolean {
  if (value.startsWith("file:")) {
    return value.length > "file:".length;
  }

  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function isValidSupportJarUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "send.monobank.ua" &&
      url.pathname.startsWith("/jar/") &&
      url.pathname.length > "/jar/".length &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

function parseSupportJarStatus(env: NodeJS.ProcessEnv): RawSupportJarStatus | undefined {
  const currentUah = parseOptionalInteger(env.SUPPORT_JAR_CURRENT_UAH);
  const goalUah = parseOptionalInteger(env.SUPPORT_JAR_GOAL_UAH);
  const updatedAt = blankToUndefined(env.SUPPORT_JAR_STATUS_UPDATED_AT);
  const status: RawSupportJarStatus = {};

  if (currentUah !== undefined) {
    status.currentUah = currentUah;
  }

  if (goalUah !== undefined) {
    status.goalUah = goalUah;
  }

  if (updatedAt !== undefined) {
    status.updatedAt = updatedAt;
  }

  return Object.keys(status).length > 0 ? status : undefined;
}

function parseOptionalInteger(value: string | undefined): number | string | undefined {
  const trimmed = blankToUndefined(value);

  if (!trimmed) {
    return undefined;
  }

  return /^\d+$/.test(trimmed) ? Number(trimmed) : trimmed;
}

function parseBoolean(value: string | undefined): boolean | undefined {
  const normalized = value?.trim().toLowerCase();

  if (!normalized) {
    return undefined;
  }

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return undefined;
}
