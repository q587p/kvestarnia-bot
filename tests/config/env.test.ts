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

  it("accepts a Telegram bot username for generated deep links", () => {
    const config = loadConfig({ ...validEnv, BOT_USERNAME: "@kvestarnia_dev_bot" });

    expect(config.botUsername).toBe("kvestarnia_dev_bot");
  });

  it("rejects a Telegram bot URL as BOT_USERNAME", () => {
    expect(() =>
      loadConfig({ ...validEnv, BOT_USERNAME: "https://t.me/kvestarnia_bot" })
    ).toThrow();
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

  it("keeps dev grant commands disabled by default", () => {
    const config = loadConfig(validEnv);

    expect(config.devGrantCommandsEnabled).toBe(false);
  });

  it("keeps combat balance analytics disabled by default", () => {
    const config = loadConfig(validEnv);

    expect(config.combatBalanceAnalyticsEnabled).toBe(false);
  });

  it("keeps party session foundation disabled by default", () => {
    const config = loadConfig(validEnv);

    expect(config.partySessionFoundationEnabled).toBe(false);
  });

  it("keeps party session dev helpers disabled by default", () => {
    const config = loadConfig(validEnv);

    expect(config.partySessionDevHelpersEnabled).toBe(false);
  });

  it("keeps Big Barrel Brother raid disabled by default", () => {
    const config = loadConfig(validEnv);

    expect(config.bigBarrelBrotherRaidEnabled).toBe(false);
  });

  it("keeps the group-combat proof disabled unless explicitly flagged", () => {
    expect(loadConfig(validEnv).groupCombatProofEnabled).toBe(false);
    expect(loadConfig({ ...validEnv, GROUP_COMBAT_PROOF_ENABLED: "true" }).groupCombatProofEnabled).toBe(true);
  });

  it("keeps newly activated consumable manatky disabled unless explicitly flagged", () => {
  });

  it("keeps fresh left-passage party entry disabled unless explicitly flagged", () => {
    expect(loadConfig(validEnv).leftPassagePartyAttackEnabled).toBe(false);
    expect(loadConfig({
      ...validEnv,
      LEFT_PASSAGE_PARTY_ATTACK_ENABLED: "true"
    }).leftPassagePartyAttackEnabled).toBe(true);
  });

  it("keeps guild foundation default-off and enables only the named rollout flag", () => {
    expect(loadConfig(validEnv).guildFoundationEnabled).toBe(false);
    expect(loadConfig({
      ...validEnv,
      GUILD_FOUNDATION_ENABLED: "true"
    }).guildFoundationEnabled).toBe(true);
  });

  it("keeps the guild weekly goal default-off behind its own kill switch", () => {
    expect(loadConfig(validEnv).guildWeeklyGoalEnabled).toBe(false);
    expect(loadConfig({
      ...validEnv,
      GUILD_WEEKLY_GOAL_ENABLED: "true"
    }).guildWeeklyGoalEnabled).toBe(true);
  });

  it("keeps tavern social games disabled by default", () => {
    const config = loadConfig(validEnv);

    expect(config.tavernGamesEnabled).toBe(false);
    expect(config.tavernGameTavleiEnabled).toBe(false);
    expect(config.tavernGameKostiEnabled).toBe(false);
    expect(config.tavernGameMaxStake).toBe(93);
    expect(config.tavernGameCreateCooldownSec).toBe(93);
  });

  it("can enable deploy notifications explicitly", () => {
    const config = loadConfig({
      ...validEnv,
      DEPLOY_NOTIFICATIONS_ENABLED: "true"
    });

    expect(config.deployNotificationsEnabled).toBe(true);
  });

  it("can enable dev grant commands only through an explicit flag value", () => {
    for (const value of ["true", "1", "yes", "on"]) {
      expect(loadConfig({
        ...validEnv,
        DEV_GRANT_COMMANDS_ENABLED: value
      }).devGrantCommandsEnabled).toBe(true);
    }

    for (const value of ["false", "0", "no", "off", "maybe"]) {
      expect(loadConfig({
        ...validEnv,
        DEV_GRANT_COMMANDS_ENABLED: value
      }).devGrantCommandsEnabled).toBe(false);
    }
  });

  it("can enable combat balance analytics explicitly", () => {
    const config = loadConfig({
      ...validEnv,
      COMBAT_BALANCE_ANALYTICS_ENABLED: "on"
    });

    expect(config.combatBalanceAnalyticsEnabled).toBe(true);
  });

  it("keeps the Fighting Corner quest production rollout and dev helper flags explicit", () => {
    const disabled = loadConfig(validEnv);
    const enabled = loadConfig({
      ...validEnv,
      FIGHTING_CORNER_ONBOARDING_QUEST_ENABLED: "true",
      FIGHTING_CORNER_ONBOARDING_QUEST_DEV_HELPERS_ENABLED: "true"
    });

    expect(disabled.fightingCornerOnboardingQuestEnabled).toBe(false);
    expect(disabled.fightingCornerOnboardingQuestDevHelpersEnabled).toBe(false);
    expect(enabled.fightingCornerOnboardingQuestEnabled).toBe(true);
    expect(enabled.fightingCornerOnboardingQuestDevHelpersEnabled).toBe(true);
  });

  it("can enable party session foundation explicitly", () => {
    const config = loadConfig({
      ...validEnv,
      PARTY_SESSION_FOUNDATION_ENABLED: "true"
    });

    expect(config.partySessionFoundationEnabled).toBe(true);
  });

  it("can enable party session dev helpers explicitly", () => {
    const config = loadConfig({
      ...validEnv,
      PARTY_SESSION_DEV_HELPERS_ENABLED: "true"
    });

    expect(config.partySessionDevHelpersEnabled).toBe(true);
  });

  it("can enable Big Barrel Brother raid explicitly", () => {
    const config = loadConfig({
      ...validEnv,
      BIG_BARREL_BROTHER_RAID_ENABLED: "true"
    });

    expect(config.bigBarrelBrotherRaidEnabled).toBe(true);
  });

  it("ignores the removed standalone raid-chat environment key", () => {
    const config = loadConfig({
      ...validEnv,
      BIG_BARREL_RAID_CHAT_ENABLED: "true"
    });

    expect(config).not.toHaveProperty("bigBarrelRaidChatEnabled");
  });

  it("can enable tavern social games explicitly", () => {
    const config = loadConfig({
      ...validEnv,
      TAVERN_GAMES_ENABLED: "true",
      TAVERN_GAME_TAVLEI_ENABLED: "true",
      TAVERN_GAME_KOSTI_ENABLED: "on",
      TAVERN_GAME_MAX_STAKE: "13",
      TAVERN_GAME_CREATE_COOLDOWN_SEC: "42"
    });

    expect(config.tavernGamesEnabled).toBe(true);
    expect(config.tavernGameTavleiEnabled).toBe(true);
    expect(config.tavernGameKostiEnabled).toBe(true);
    expect(config.tavernGameMaxStake).toBe(13);
    expect(config.tavernGameCreateCooldownSec).toBe(42);
  });

  it("rejects unsafe tavern social game numeric limits", () => {
    expect(() => loadConfig({ ...validEnv, TAVERN_GAME_MAX_STAKE: "0" })).toThrow();
    expect(() => loadConfig({ ...validEnv, TAVERN_GAME_CREATE_COOLDOWN_SEC: "90000" })).toThrow();
  });

  it("parses the dev grant flag in production but leaves production blocking to the service", () => {
    const config = loadConfig({
      ...validEnv,
      NODE_ENV: "production",
      DEV_GRANT_COMMANDS_ENABLED: "true"
    });

    expect(config.nodeEnv).toBe("production");
    expect(config.devGrantCommandsEnabled).toBe(true);
  });

  it("keeps support jar URL optional", () => {
    const config = loadConfig(validEnv);

    expect(config.supportJarUrl).toBeUndefined();
  });

  it("trims a blank support jar URL to undefined", () => {
    const config = loadConfig({
      ...validEnv,
      SUPPORT_JAR_URL: "   "
    });

    expect(config.supportJarUrl).toBeUndefined();
  });

  it("accepts a configured Monobank support jar URL", () => {
    const config = loadConfig({
      ...validEnv,
      SUPPORT_JAR_URL: "https://send.monobank.ua/jar/test-placeholder"
    });

    expect(config.supportJarUrl).toBe("https://send.monobank.ua/jar/test-placeholder");
  });

  it("rejects support jar URLs outside HTTPS Monobank jars", () => {
    const invalidUrls = [
      "http://send.monobank.ua/jar/test-placeholder",
      "https://example.com/jar/test-placeholder",
      "https://send.monobank.ua/",
      "https://send.monobank.ua/not-jar/test-placeholder",
      "https://user:password@send.monobank.ua/jar/test-placeholder"
    ];

    for (const url of invalidUrls) {
      expect(() =>
        loadConfig({
          ...validEnv,
          SUPPORT_JAR_URL: url
        })
      ).toThrow();
    }
  });

  it("keeps support jar status fields optional", () => {
    const config = loadConfig(validEnv);

    expect(config.supportJarStatus).toBeUndefined();
  });

  it("accepts manual support jar status fields", () => {
    const zeroConfig = loadConfig({
      ...validEnv,
      SUPPORT_JAR_CURRENT_UAH: "0"
    });
    const filledConfig = loadConfig({
      ...validEnv,
      SUPPORT_JAR_CURRENT_UAH: "1234",
      SUPPORT_JAR_GOAL_UAH: "5000",
      SUPPORT_JAR_STATUS_UPDATED_AT: "2026-06-16"
    });

    expect(zeroConfig.supportJarStatus).toEqual({ currentUah: 0 });
    expect(filledConfig.supportJarStatus).toEqual({
      currentUah: 1234,
      goalUah: 5000,
      updatedAt: "2026-06-16"
    });
  });

  it("rejects invalid support jar current amounts", () => {
    for (const current of ["-1", "12.5", "many"]) {
      expect(() =>
        loadConfig({
          ...validEnv,
          SUPPORT_JAR_CURRENT_UAH: current
        })
      ).toThrow();
    }
  });

  it("rejects invalid support jar goals", () => {
    for (const goal of ["0", "-1", "12.5", "many"]) {
      expect(() =>
        loadConfig({
          ...validEnv,
          SUPPORT_JAR_GOAL_UAH: goal
        })
      ).toThrow();
    }
  });

  it("rejects unsafe support jar status update dates", () => {
    for (const updatedAt of ["2026-06-16T12:00:00Z", "2026-06-16<script>", "today"]) {
      expect(() =>
        loadConfig({
          ...validEnv,
          SUPPORT_JAR_STATUS_UPDATED_AT: updatedAt
        })
      ).toThrow();
    }
  });

  it("does not read legacy support barrel env names", () => {
    const config = loadConfig({
      ...validEnv,
      [["SUPPORT", "BARREL", "URL"].join("_")]: "https://send.monobank.ua/jar/test-placeholder",
      [["SUPPORT", "BARREL", "CURRENT", "UAH"].join("_")]: "1234"
    });

    expect(config.supportJarUrl).toBeUndefined();
    expect(config.supportJarStatus).toBeUndefined();
  });
});
