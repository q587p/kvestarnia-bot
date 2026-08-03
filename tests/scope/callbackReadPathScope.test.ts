import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("0.3.17 callback read-path boundaries", () => {
  it("acknowledges static Shynok dice rules before marker construction", () => {
    const source = read("src/bot/modules/tavern.ts");
    const handler = source.slice(
      source.indexOf("async function handleShynokCallback"),
      source.indexOf("async function handleTavernGameCallback")
    );
    const staticRoute = handler.slice(
      handler.indexOf('if (action.type === "game-dice-poker-rules")'),
      handler.indexOf("const questMarkers")
    );

    expect(staticRoute).toContain("await safeAnswerCallbackQuery(ctx);");
    expect(staticRoute).toContain("await safeEditMessageText(ctx, presentDicePokerRules()");
    expect(staticRoute).not.toContain("buildQuestMarkerSnapshotForTelegramUser");
    expect(staticRoute.indexOf("safeAnswerCallbackQuery")).toBeLessThan(
      staticRoute.indexOf("safeEditMessageText")
    );
  });

  it("branches marker-free locations before the main-menu marker snapshot", () => {
    const source = read("src/bot/modules/mainMenu.ts");
    const route = source.slice(
      source.indexOf("async function sendCurrentPresenceLocation"),
      source.indexOf("function buildQuestHubCommandOptions")
    );
    const markerIndex = route.indexOf("buildQuestMarkerSnapshotForTelegramUser");

    for (const markerFreeBranch of [
      "PRESENCE_LOCATION_KORCHMA_QUEST_TABLE",
      "PRESENCE_LOCATION_KORCHMA_NEWS_CORNER",
      "PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER",
      "PRESENCE_LOCATION_KORCHMA_DEEP)",
      "PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1)",
      "presenceLocationToPersistentFightPassage(locationId)"
    ]) {
      expect(route.indexOf(markerFreeBranch)).toBeGreaterThanOrEqual(0);
      expect(route.indexOf(markerFreeBranch)).toBeLessThan(markerIndex);
    }
  });

  it("does not build a discarded marker-aware keyboard for Hero", () => {
    const source = read("src/bot/modules/mainMenu.ts");
    const heroRoute = source.slice(
      source.indexOf("bot.hears(mainMenuButtons.hero"),
      source.indexOf("bot.hears([...mainMenuLocationButtonTexts]")
    );

    expect(heroRoute).toContain('sendHero(ctx, services.hero, "reply", {');
    expect(heroRoute).toContain('services.guilds ? { guildService: services.guilds }');
    expect(heroRoute).not.toContain("buildCurrentMainMenuKeyboardWithQuestMarkers");
  });
});

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}
