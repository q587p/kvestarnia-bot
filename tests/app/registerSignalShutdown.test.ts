import { afterEach, describe, expect, it, vi } from "vitest";
import { registerSignalShutdown } from "../../src/app/registerSignalShutdown";

describe("registerSignalShutdown", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registers SIGINT and SIGTERM shutdown handlers", () => {
    const once = vi.spyOn(process, "once").mockReturnThis();

    registerSignalShutdown({ stop: vi.fn().mockResolvedValue(undefined) });

    expect(once).toHaveBeenCalledWith("SIGINT", expect.any(Function));
    expect(once).toHaveBeenCalledWith("SIGTERM", expect.any(Function));
  });

  it("logs rejected shutdown cleanup", async () => {
    const shutdownError = new Error("stop failed");
    let handler: (() => void) | null = null;
    vi.spyOn(process, "once").mockImplementation((event, listener) => {
      if (event === "SIGINT") {
        handler = listener as () => void;
      }
      return process;
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    registerSignalShutdown({ stop: vi.fn().mockRejectedValue(shutdownError) });
    handler?.();
    await Promise.resolve();

    expect(error).toHaveBeenCalledWith("Квестарня: runtime не зупинився чисто.", shutdownError);
  });
});
