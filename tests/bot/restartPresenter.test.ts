import { describe, expect, it } from "vitest";
import {
  presentRestartActiveCombat,
  presentRestartCancelled,
  presentRestartDeleted,
  presentRestartNoCharacter,
  presentRestartPrompt
} from "../../src/bot/presenters/restartPresenter";

describe("restart presenter", () => {
  it("asks for confirmation before deleting a character", () => {
    const text = presentRestartPrompt();

    expect(text).toContain("Почати персонажа з початку");
    expect(text).toContain("видалить");
    expect(text).toContain("/start");
  });

  it("points back to /start after deletion or missing character", () => {
    expect(presentRestartDeleted()).toContain("/start");
    expect(presentRestartNoCharacter()).toContain("/start");
  });

  it("explains why restart is blocked during combat", () => {
    expect(presentRestartActiveCombat()).toContain("активного бою");
    expect(presentRestartActiveCombat()).toContain("завершіть бій");
  });

  it("keeps cancellation non-destructive", () => {
    expect(presentRestartCancelled()).toContain("скасовано");
  });
});
