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
    expect(text).toContain("/adventure");
    expect(text).toContain("/quest");
    expect(text).toContain("/fight");
    expect(text).toContain("/hunt");
    expect(text).toContain("/inventory");
    expect(text).toContain("/guild");
    expect(text).toContain("/restart");
    expect(text).toContain("/version");
    expect(text).toContain("/news");
    expect(text).toContain("/help");
    expect(text).not.toContain("/dev_reset_me");
    expect(text).toContain("те саме, що /fight");
    expect(text).not.toContain("/hunt — ще");
    expect(text).toContain("Повний бій");
  });

  it("includes dev reset only when enabled", () => {
    expect(presentHelp(true)).toContain("/dev_reset_me");
  });
});
