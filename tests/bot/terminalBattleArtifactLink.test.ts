import { describe, expect, it } from "vitest";
import {
  buildTerminalBattleArtifactStartPayload,
  buildTerminalBattleArtifactUrl,
  parseTerminalBattleArtifactStartPayload,
  type TerminalBattleArtifactKind
} from "../../src/bot/terminalBattleArtifactLink";

describe("terminal battle artifact link contract", () => {
  const token = "123e4567-e89b-42d3-a456-426614174000";

  it.each<TerminalBattleArtifactKind>(["solo", "training", "mimic"])(
    "round-trips a compact %s URL through the typed payload registry",
    (kind) => {
      const payload = buildTerminalBattleArtifactStartPayload(kind, token);
      const url = buildTerminalBattleArtifactUrl("@kvestarnia_bot", kind, token);

      expect(payload).not.toBeNull();
      expect(payload!.length).toBeLessThanOrEqual(64);
      expect(parseTerminalBattleArtifactStartPayload(payload!)).toEqual({
        type: "terminal-battle-artifact",
        kind,
        token
      });
      expect(url).toBe(`https://t.me/kvestarnia_bot?start=${payload}`);
    }
  );

  it("rejects malformed tokens instead of producing a capability URL", () => {
    expect(buildTerminalBattleArtifactStartPayload("solo", "not-a-uuid")).toBeNull();
    expect(buildTerminalBattleArtifactUrl("kvestarnia_bot", "solo", "not-a-uuid")).toBeNull();
    expect(parseTerminalBattleArtifactStartPayload("ba1_s_not-a-uuid")).toBeNull();
  });
});
