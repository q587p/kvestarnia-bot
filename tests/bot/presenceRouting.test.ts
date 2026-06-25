import { describe, expect, it } from "vitest";
import {
  getCallbackPresenceContext,
  getCommandPresenceContext,
  getTextPresenceContext
} from "../../src/bot/presence/presenceRouting";
import {
  PRESENCE_LOCATION_KORCHMA_BAR,
  PRESENCE_LOCATION_KORCHMA_BARREL,
  PRESENCE_LOCATION_KORCHMA_FRONT,
  PRESENCE_LOCATION_KORCHMA_NEWS_CORNER,
  PRESENCE_LOCATION_KORCHMA_RANGER_CORNER,
  PRESENCE_RAID_FRIDAY_BARREL
} from "../../src/services/presenceService";
import { mainMenuLocationButtons } from "../../src/bot/keyboards/mainMenuKeyboard";

describe("presence routing", () => {
  it.each([
    [
      "v1:tavern:round-simple",
      {
        locationId: PRESENCE_LOCATION_KORCHMA_BAR,
        currentRaidId: null,
        currentAdventureId: null
      }
    ],
    [
      "v1:tavern:raid",
      {
        locationId: PRESENCE_LOCATION_KORCHMA_BARREL,
        currentRaidId: PRESENCE_RAID_FRIDAY_BARREL,
        currentAdventureId: null
      }
    ],
    [
      "v1:tavern:participants",
      {
        locationId: PRESENCE_LOCATION_KORCHMA_BARREL,
        currentRaidId: PRESENCE_RAID_FRIDAY_BARREL,
        currentAdventureId: null
      }
    ],
    [
      "v1:tavern:raid-leaderboard",
      {
        locationId: PRESENCE_LOCATION_KORCHMA_BARREL,
        currentRaidId: PRESENCE_RAID_FRIDAY_BARREL,
        currentAdventureId: null
      }
    ],
    [
      "v1:tavern:raid-news",
      {
        locationId: PRESENCE_LOCATION_KORCHMA_BARREL,
        currentRaidId: PRESENCE_RAID_FRIDAY_BARREL,
        currentAdventureId: null
      }
    ],
    [
      "v1:tavern:ranger",
      {
        locationId: PRESENCE_LOCATION_KORCHMA_RANGER_CORNER,
        currentRaidId: null,
        currentAdventureId: null
      }
    ],
    ["v1:adv:mimic:poke", {}],
    ["v1:fight:turn:123e4567-e89b-12d3-a456-426614174000:1:attack", {}],
    ["v1:spar:open", {}],
    ["v1:hunt:view:12026-06-16T08:abc123", {}],
    ["v1:ygr:track", {}],
    ["v1:item:inventory", {}],
    ["v1:equip:view", {}],
    ["v1:chest:open", {}],
    ["v1:lvlx:confirm:abc123", {}],
    ["v1:quest:fight", {}],
    ["v1:quest:archive", {}],
    ["v1:quest:list", {}],
    ["v1:place:current", {}],
    ["v1:place:hall", {}],
    ["v1:place:front", {}],
    ["v1:place:fighting-corner", {}],
    ["v1:place:quest-table", {}],
    ["v1:place:bar", {}],
    ["v1:place:barrel", {}],
    ["v1:place:deep", {}],
    ["v1:place:deep-level1", {}],
    ["v1:place:deep-left", {}],
    ["v1:place:deep-straight", {}],
    ["v1:place:deep-right", {}],
    ["v1:place:cellar", {}],
    ["v1:place:news-corner", {}],
    ["v1:place:arrivals", {}],
    ["v1:place:memorial", {}],
    ["v1:place:duel-winners", {}],
    [
      "v1:onb:gender:he",
      {
        locationId: PRESENCE_LOCATION_KORCHMA_FRONT,
        currentRaidId: null,
        currentAdventureId: null
      }
    ],
    [
      "v1:news:list:0",
      {
        locationId: PRESENCE_LOCATION_KORCHMA_NEWS_CORNER,
        currentRaidId: null,
        currentAdventureId: null
      }
    ],
    [
      "v1:news:rlist:0",
      {
        locationId: PRESENCE_LOCATION_KORCHMA_BARREL,
        currentRaidId: PRESENCE_RAID_FRIDAY_BARREL,
        currentAdventureId: null
      }
    ],
    ["v1:menu:hero", {}],
    ["v1:devreset:cancel", {}],
    ["v1:restart:confirm", {}]
  ])("routes callback %s", (data, expected) => {
    expect(getCallbackPresenceContext(data)).toEqual(expected);
  });

  it("ignores unknown callbacks", () => {
    expect(getCallbackPresenceContext("v1:unknown:thing")).toBeNull();
  });

  it.each([
    "v1:quest:adventure",
    "v1:quest:fight",
    "v1:quest:hunt",
    "v1:quest:cellar",
    "v1:quest:list",
    "v1:quest:archive"
  ])(
    "keeps quest action callback %s neutral until handler gates pass",
    (data) => {
      expect(getCallbackPresenceContext(data)).toEqual({});
    }
  );

  it.each([
    "v1:place:current",
    "v1:place:hall",
    "v1:place:front",
    "v1:place:fighting-corner",
    "v1:place:quest-table",
    "v1:place:bar",
    "v1:place:barrel",
    "v1:place:deep",
    "v1:place:deep-level1",
    "v1:place:deep-left",
    "v1:place:deep-straight",
    "v1:place:deep-right",
    "v1:place:cellar",
    "v1:place:news-corner",
    "v1:place:duel-winners"
  ])("keeps place callback %s neutral until handler gates pass", (data) => {
    expect(getCallbackPresenceContext(data)).toEqual({});
  });

  it.each(["v1:fight:mimic:attack", "v1:fight:turn:123e4567-e89b-12d3-a456-426614174000:1:attack"])(
    "keeps fight action callback %s neutral until handler gates pass",
    (data) => {
      expect(getCallbackPresenceContext(data)).toEqual({});
    }
  );

  it.each([
    ["start", {}],
    ["tavern", {}],
    ["raid", {}],
    ["adventure", {}],
    ["quest", {}],
    ["cellar", {}],
    ["fight", {}],
    ["spar", {}],
    ["hunt", {}],
    ["bestiary", {}],
    ["monsters", {}],
    [
      "news",
      {
        locationId: PRESENCE_LOCATION_KORCHMA_NEWS_CORNER,
        currentRaidId: null,
        currentAdventureId: null
      }
    ],
    ["inventory", {}],
    ["online", {}],
    ["look", {}],
    ["support", {}],
    ["restart", {}],
    ["dev_raid_stop", {}],
    ["dev_reset_monster_rest", {}],
    ["dev_reset_yeger_bandage", {}],
    ["dev_help", {}]
  ])("routes command /%s", (command, expected) => {
    expect(getCommandPresenceContext(command)).toEqual(expected);
  });

  it("ignores unknown commands", () => {
    expect(getCommandPresenceContext("dance")).toBeNull();
  });

  it("normalizes command text before routing", () => {
    expect(getTextPresenceContext("/news@kvestarnia_bot archive")).toEqual({
      locationId: PRESENCE_LOCATION_KORCHMA_NEWS_CORNER,
      currentRaidId: null,
      currentAdventureId: null
    });
  });

  it("keeps duel start deep links neutral so they do not move the player outside", () => {
    expect(getTextPresenceContext("/start duel_abc_DEF12")).toEqual({});
    expect(getTextPresenceContext("/start@kvestarnia_test_bot duel_abc_DEF12")).toEqual({});
  });

  it("keeps regular start neutral so it does not move existing characters", () => {
    expect(getTextPresenceContext("/start")).toEqual({});
    expect(getTextPresenceContext("/start@kvestarnia_test_bot")).toEqual({});
  });

  it.each(["🍺 Корчма", "🗺️ Квести", "👤 Персонаж", "🎒 Манатки", "👀 Хто поруч", "📖 Допомога"])(
    "routes main menu text %s without moving place",
    (text) => {
      expect(getTextPresenceContext(text)).toEqual({});
    }
  );

  it.each([
    mainMenuLocationButtons.bar,
    mainMenuLocationButtons.deepLeft,
    mainMenuLocationButtons.deepStraight,
    mainMenuLocationButtons.deepRight,
    mainMenuLocationButtons.newsCorner
  ])("routes location reply text %s without moving place before the handler opens it", (text) => {
    expect(getTextPresenceContext(text)).toEqual({});
  });
});
