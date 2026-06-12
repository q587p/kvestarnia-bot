import { z } from "zod";

const nodeEnvSchema = z.enum(["development", "test", "production"]).default("development");

export const configSchema = z.object({
  nodeEnv: nodeEnvSchema,
  botToken: z.string().optional(),
  databaseUrl: z.string().url(),
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
