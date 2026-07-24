import { describe, expect, it } from "vitest";
import { buildPersistentFightPassagePreviewKeyboard } from "../../src/bot/keyboards/fightKeyboard";

describe("left-passage party attack keyboard", () => {
  it("shows the party action only for an enabled exact left-passage preview while preserving solo attack", () => {
    const left = buildPersistentFightPassagePreviewKeyboard({
      passage: "deep-left",
      encounterToken: "preview-left-13",
      leftPassagePartyAttackEnabled: true
    }).inline_keyboard.flat();
    const straight = buildPersistentFightPassagePreviewKeyboard({
      passage: "deep-straight",
      encounterToken: "preview-straight-13",
      leftPassagePartyAttackEnabled: true
    }).inline_keyboard.flat();
    const disabled = buildPersistentFightPassagePreviewKeyboard({
      passage: "deep-left",
      encounterToken: "preview-disabled-13",
      leftPassagePartyAttackEnabled: false
    }).inline_keyboard.flat();

    expect(left.map(({ text }) => text)).toEqual(expect.arrayContaining([
      "⚔️ Атакувати",
      "🤝 Покликати в атаку"
    ]));
    expect(straight.map(({ text }) => text)).not.toContain("🤝 Покликати в атаку");
    expect(disabled.map(({ text }) => text)).not.toContain("🤝 Покликати в атаку");
  });

  it("replaces attack/search controls with the reserved party card without exposing another start", () => {
    const buttons = buildPersistentFightPassagePreviewKeyboard({
      passage: "deep-left",
      encounterToken: "preview-reserved-13",
      leftPassagePartyAttackEnabled: true,
      reservedPartyInviteToken: "party-reserved-13"
    }).inline_keyboard.flat();
    const labels = buttons.map(({ text }) => text);

    expect(labels).toContain("🤝 Відкрити збір ватаги");
    expect(labels).not.toContain("⚔️ Атакувати");
    expect(labels).not.toContain("🤝 Покликати в атаку");
    expect(labels).not.toContain("🔎 Пошукати");
  });
});
