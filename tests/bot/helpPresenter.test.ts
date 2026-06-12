import { describe, expect, it } from "vitest";
import { presentHelp } from "../../src/bot/presenters/helpPresenter";

describe("help presenter", () => {
  it("lists only currently available commands by default", () => {
    const text = presentHelp(false);

    expect(text).toContain("/start");
    expect(text).toContain("/hero");
    expect(text).toContain("/profile");
    expect(text).toContain("/me");
    expect(text).toContain("/tavern");
    expect(text).toContain("/raid");
    expect(text).toContain("/help");
    expect(text).not.toContain("/dev_reset_me");
    expect(text).not.toContain("/adventure");
    expect(text).toContain("ще не працюють");
  });

  it("includes dev reset only when enabled", () => {
    expect(presentHelp(true)).toContain("/dev_reset_me");
  });
});
