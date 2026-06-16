import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/env";

const validEnv = {
  NODE_ENV: "test",
  DATABASE_URL: "file:./dev.db"
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

  it("does not require REDIS_URL for the current SQLite setup", () => {
    const config = loadConfig({
      ...validEnv,
      REDIS_URL: undefined
    });

    expect(config.databaseUrl).toBe("file:./dev.db");
  });

  it("accepts the Render SQLite setup without REDIS_URL", () => {
    const config = loadConfig({
      BOT_TOKEN: "replace-with-real-token",
      DATABASE_URL: "file:/var/data/kvestarnia.db",
      NODE_ENV: "production"
    });

    expect(config.databaseUrl).toBe("file:/var/data/kvestarnia.db");
    expect(config.nodeEnv).toBe("production");
  });

  it("keeps deploy notifications disabled by default", () => {
    const config = loadConfig(validEnv);

    expect(config.deployNotificationsEnabled).toBe(false);
  });

  it("can enable deploy notifications explicitly", () => {
    const config = loadConfig({
      ...validEnv,
      DEPLOY_NOTIFICATIONS_ENABLED: "true"
    });

    expect(config.deployNotificationsEnabled).toBe(true);
  });

  it("keeps support barrel URL optional", () => {
    const config = loadConfig(validEnv);

    expect(config.supportBarrelUrl).toBeUndefined();
  });

  it("accepts a configured Monobank support barrel URL", () => {
    const config = loadConfig({
      ...validEnv,
      SUPPORT_BARREL_URL: "https://send.monobank.ua/jar/test-placeholder"
    });

    expect(config.supportBarrelUrl).toBe("https://send.monobank.ua/jar/test-placeholder");
  });

  it("rejects support barrel URLs outside HTTPS Monobank jars", () => {
    expect(() =>
      loadConfig({
        ...validEnv,
        SUPPORT_BARREL_URL: "http://send.monobank.ua/jar/test-placeholder"
      })
    ).toThrow();
    expect(() =>
      loadConfig({
        ...validEnv,
        SUPPORT_BARREL_URL: "https://example.com/support"
      })
    ).toThrow();
  });
});
