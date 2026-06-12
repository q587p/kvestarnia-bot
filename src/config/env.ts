import { z } from "zod";

const nodeEnvSchema = z.enum(["development", "test", "production"]).default("development");
const databaseUrlSchema = z.string().min(1).refine(isValidDatabaseUrl, {
  message: "DATABASE_URL must be a URL or a Prisma SQLite file: path"
});

export const configSchema = z.object({
  nodeEnv: nodeEnvSchema,
  botToken: z.string().optional(),
  databaseUrl: databaseUrlSchema,
  redisUrl: z.string().url()
});

export type AppConfig = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return configSchema.parse({
    nodeEnv: env.NODE_ENV,
    botToken: blankToUndefined(env.BOT_TOKEN),
    databaseUrl: env.DATABASE_URL,
    redisUrl: env.REDIS_URL
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
