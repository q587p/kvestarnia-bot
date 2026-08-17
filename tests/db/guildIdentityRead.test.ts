import { describe, expect, it } from "vitest";
import {
  readLiveGuildCrest,
  readLiveGuildCrestsByCharacterIds
} from "../../src/db/repositories/guildIdentityRead";

const NOW = new Date("2026-08-17T10:00:00.000Z");

describe("guild identity read", () => {
  it("returns only active or genuinely unexpired forming membership crests", () => {
    expect(readLiveGuildCrest([membership("active")], NOW)).toBe("🐸");
    expect(readLiveGuildCrest([
      membership("forming", { charterExpiresAt: new Date("2026-08-17T10:00:01.000Z") })
    ], NOW)).toBe("🐸");
    expect(readLiveGuildCrest([
      membership("forming", { charterExpiresAt: NOW })
    ], NOW)).toBeUndefined();
    expect(readLiveGuildCrest([
      membership("active", { disbandedAt: NOW })
    ], NOW)).toBeUndefined();
    expect(readLiveGuildCrest([
      membership("active", { leftAt: NOW, activeUserKey: null })
    ], NOW)).toBeUndefined();
  });

  it("deduplicates character ids and returns only the minimal live crest map", async () => {
    const findMany = (input: unknown) => {
      expect(input).toMatchObject({
        where: {
          user: { character: { id: { in: ["character-1", "character-2"] } } }
        },
        select: {
          user: { select: { character: { select: { id: true } } } },
          guild: { select: { crest: true } }
        }
      });
      return Promise.resolve([
        { user: { character: { id: "character-1" } }, guild: { crest: "🐸" } },
        { user: { character: null }, guild: { crest: "🦉" } }
      ]);
    };

    await expect(readLiveGuildCrestsByCharacterIds(
      { guildMember: { findMany } } as never,
      ["character-1", "character-1", "character-2"],
      NOW
    )).resolves.toEqual(new Map([["character-1", "🐸"]]));
  });
});

function membership(
  status: "forming" | "active",
  overrides: Partial<{
    leftAt: Date | null;
    activeUserKey: string | null;
    charterExpiresAt: Date;
    disbandedAt: Date | null;
  }> = {}
) {
  return {
    leftAt: "leftAt" in overrides ? overrides.leftAt! : null,
    activeUserKey: "activeUserKey" in overrides ? overrides.activeUserKey! : "user-1",
    guild: {
      crest: "🐸",
      status,
      charterExpiresAt: overrides.charterExpiresAt ?? new Date("2026-08-24T10:00:00.000Z"),
      disbandedAt: overrides.disbandedAt ?? null
    }
  };
}
