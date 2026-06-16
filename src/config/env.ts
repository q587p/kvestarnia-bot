import { z } from "zod";

const nodeEnvSchema = z.enum(["development", "test", "production"]).default("development");
const databaseUrlSchema = z.string().min(1).refine(isValidDatabaseUrl, {
  message: "DATABASE_URL must be a URL or a Prisma SQLite file: path"
});
const supportBarrelUrlSchema = z.string().refine(isValidSupportBarrelUrl, {
  message: "SUPPORT_BARREL_URL must be an absolute https://send.monobank.ua/jar/... URL"
});
const supportBarrelStatusSchema = z
  .object({
    currentUah: z.number().int().min(0).optional(),
    goalUah: z.number().int().min(1).optional(),
    updatedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
  })
  .optional();

export interface SupportBarrelStatus {
  currentUah?: number;
  goalUah?: number;
  updatedAt?: string;
}

interface RawSupportBarrelStatus {
  currentUah?: number | string;
  goalUah?: number | string;
  updatedAt?: string;
}

export const configSchema = z.object({
  nodeEnv: nodeEnvSchema,
  botToken: z.string().optional(),
  databaseUrl: databaseUrlSchema,
  deployNotificationsEnabled: z.boolean().default(false),
  supportBarrelUrl: supportBarrelUrlSchema.optional(),
  supportBarrelStatus: supportBarrelStatusSchema
});

export type AppConfig = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return configSchema.parse({
    nodeEnv: env.NODE_ENV,
    botToken: blankToUndefined(env.BOT_TOKEN),
    databaseUrl: env.DATABASE_URL,
    deployNotificationsEnabled: parseBoolean(env.DEPLOY_NOTIFICATIONS_ENABLED),
    supportBarrelUrl: blankToUndefined(env.SUPPORT_BARREL_URL),
    supportBarrelStatus: parseSupportBarrelStatus(env)
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

function parseSupportBarrelStatus(env: NodeJS.ProcessEnv): RawSupportBarrelStatus | undefined {
  const currentUah = parseOptionalInteger(env.SUPPORT_BARREL_CURRENT_UAH);
  const goalUah = parseOptionalInteger(env.SUPPORT_BARREL_GOAL_UAH);
  const updatedAt = blankToUndefined(env.SUPPORT_BARREL_STATUS_UPDATED_AT);
  const status: RawSupportBarrelStatus = {};

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
