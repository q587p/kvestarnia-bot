import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/env";

const validEnv = {
  NODE_ENV: "test",
  DATABASE_URL: "file:./dev.db",
  REDIS_URL: "redis://localhost:6379"
};

describe("loadConfig", () => {
  it("accepts an empty BOT_TOKEN in test", () => {
    const config = loadConfig({ ...validEnv, BOT_TOKEN: "" });

    expect(config.botToken).toBeUndefined();
    expect(config.nodeEnv).toBe("test");
  });

  it("accepts a missing BOT_TOKEN in development", () => {
    const config = loadConfig({
      ...validEnv,
      NODE_ENV: "development",
      BOT_TOKEN: undefined
    });

    expect(config.botToken).toBeUndefined();
    expect(config.nodeEnv).toBe("development");
  });

  it("trims a blank BOT_TOKEN to undefined", () => {
    const config = loadConfig({ ...validEnv, BOT_TOKEN: "   " });

    expect(config.botToken).toBeUndefined();
  });

  it("accepts a PostgreSQL DATABASE_URL for future hosted deployments", () => {
    const config = loadConfig({
      ...validEnv,
      DATABASE_URL: "postgresql://kvestarnia:password@db.example.com:5432/kvestarnia"
    });

    expect(config.databaseUrl).toBe(
      "postgresql://kvestarnia:password@db.example.com:5432/kvestarnia"
    );
  });

  it("rejects an invalid DATABASE_URL", () => {
    expect(() =>
      loadConfig({
        ...validEnv,
        DATABASE_URL: "not-a-url"
      })
    ).toThrow();
  });

  it("rejects an invalid REDIS_URL", () => {
    expect(() =>
      loadConfig({
        ...validEnv,
        REDIS_URL: "not-a-url"
      })
    ).toThrow();
  });
});
