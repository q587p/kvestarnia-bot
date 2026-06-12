import { describe, expect, it } from "vitest";
import {
  presentRestartCancelled,
  presentRestartDeleted,
  presentRestartNoCharacter,
  presentRestartPrompt
} from "../../src/bot/presenters/restartPresenter";

describe("restart presenter", () => {
  it("asks for confirmation before deleting a character", () => {
    const text = presentRestartPrompt();

    expect(text).toContain("Почати героя з початку");
    expect(text).toContain("видалить");
    expect(text).toContain("/start");
  });

  it("points back to /start after deletion or missing character", () => {
    expect(presentRestartDeleted()).toContain("/start");
    expect(presentRestartNoCharacter()).toContain("/start");
  });

  it("keeps cancellation non-destructive", () => {
    expect(presentRestartCancelled()).toContain("скасовано");
  });
});
