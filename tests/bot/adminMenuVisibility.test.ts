import { describe, expect, it } from "vitest";
import type { BotServices } from "../../src/bot/botServices";
import { shouldIncludeAdminMainMenu } from "../../src/bot/modules/mainMenu";

describe("admin main menu visibility", () => {
  it("appears when any registered dev command family is enabled", () => {
    expect(shouldIncludeAdminMainMenu(services({ devReset: true }))).toBe(true);
    expect(shouldIncludeAdminMainMenu(services({ devGrant: true }))).toBe(true);
    expect(shouldIncludeAdminMainMenu(services({ party: true }))).toBe(true);
    expect(shouldIncludeAdminMainMenu(services({ fightingCorner: true }))).toBe(true);
    expect(shouldIncludeAdminMainMenu(services({ hpRecovery: true }))).toBe(true);
  });

  it("stays hidden when every dev command family is disabled", () => {
    expect(shouldIncludeAdminMainMenu(services({}))).toBe(false);
  });
});

function services(enabled: {
  devReset?: boolean;
  devGrant?: boolean;
  party?: boolean;
  fightingCorner?: boolean;
  hpRecovery?: boolean;
}): Pick<
  BotServices,
  "devReset" | "devGrant" | "partySessions" | "fightingCornerQuest" | "healthRecoveryNotifications"
> {
  return {
    devReset: { isEnabled: () => enabled.devReset ?? false },
    devGrant: { isEnabled: () => enabled.devGrant ?? false },
    partySessions: { areDevHelpersEnabled: () => enabled.party ?? false },
    fightingCornerQuest: { isDevHelperEnabled: () => enabled.fightingCorner ?? false },
    healthRecoveryNotifications: { areDevHelpersEnabled: () => enabled.hpRecovery ?? false }
  } as Pick<
    BotServices,
    "devReset" | "devGrant" | "partySessions" | "fightingCornerQuest" | "healthRecoveryNotifications"
  >;
}
