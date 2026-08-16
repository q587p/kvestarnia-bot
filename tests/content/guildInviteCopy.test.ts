import { describe, expect, it } from "vitest";
import {
  GUILD_INVITE_SHARE_TEXTS,
  guildInviteShareText,
  normalizeGuildInviteShareTextIndex
} from "../../src/content/guildInviteCopy";

describe("guild invitation card copy", () => {
  it("provides thirteen distinct compact Ukrainian variants", () => {
    expect(GUILD_INVITE_SHARE_TEXTS).toHaveLength(13);
    expect(new Set(GUILD_INVITE_SHARE_TEXTS).size).toBe(13);
    expect(GUILD_INVITE_SHARE_TEXTS.every((text) => text.length > 0 && text.length <= 180)).toBe(true);
    expect(GUILD_INVITE_SHARE_TEXTS.join(" ")).not.toMatch(/social|guild|invite|telegram data/iu);
  });

  it("cycles variants without depending on an invitation token", () => {
    expect(normalizeGuildInviteShareTextIndex(13)).toBe(0);
    expect(normalizeGuildInviteShareTextIndex(-1)).toBe(12);
    expect(guildInviteShareText(13)).toBe(GUILD_INVITE_SHARE_TEXTS[0]);
  });
});
