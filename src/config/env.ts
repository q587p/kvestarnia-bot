import { z } from "zod";

const nodeEnvSchema = z.enum(["development", "test", "production"]).default("development");
const databaseUrlSchema = z.string().min(1).refine(isValidDatabaseUrl, {
  message: "DATABASE_URL must be a URL or a Prisma SQLite file: path"
});
const supportBarrelUrlSchema = z.string().refine(isValidSupportBarrelUrl, {
  message: "SUPPORT_BARREL_URL must be an absolute https://send.monobank.ua URL"
});

export const configSchema = z.object({
  nodeEnv: nodeEnvSchema,
  botToken: z.string().optional(),
  databaseUrl: databaseUrlSchema,
  deployNotificationsEnabled: z.boolean().default(false),
  supportBarrelUrl: supportBarrelUrlSchema.optional()
});

export type AppConfig = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return configSchema.parse({
    nodeEnv: env.NODE_ENV,
    botToken: blankToUndefined(env.BOT_TOKEN),
    databaseUrl: env.DATABASE_URL,
    deployNotificationsEnabled: parseBoolean(env.DEPLOY_NOTIFICATIONS_ENABLED),
    supportBarrelUrl: blankToUndefined(env.SUPPORT_BARREL_URL)
  });
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

function isValidSupportBarrelUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "send.monobank.ua";
  } catch {
    return false;
  }
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
