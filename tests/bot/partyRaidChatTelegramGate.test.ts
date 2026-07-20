import { describe, expect, it } from "vitest";
import { PartyRaidChatTelegramGate } from "../../src/bot/partyRaidChatTelegramGate";

describe("PartyRaidChatTelegramGate", () => {
  it("enforces the global rate while allowing another target before a throttled target", async () => {
    let now = 0;
    const starts: Array<{ target: string; at: number }> = [];
    const gate = new PartyRaidChatTelegramGate({
      now: () => now,
      sleep: (milliseconds) => {
        now += milliseconds;
        return Promise.resolve();
      }
    });

    await Promise.all([
      gate.enqueue("a", () => { starts.push({ target: "a", at: now }); return Promise.resolve(); }),
      gate.enqueue("b", () => { starts.push({ target: "b", at: now }); return Promise.resolve(); }),
      gate.enqueue("a", () => { starts.push({ target: "a", at: now }); return Promise.resolve(); })
    ]);

    expect(starts).toEqual([
      { target: "a", at: 0 },
      { target: "b", at: 77 },
      { target: "a", at: 1_100 }
    ]);
  });

  it("keeps operations for one target at least 1.1 seconds apart", async () => {
    let now = 0;
    const starts: number[] = [];
    const gate = new PartyRaidChatTelegramGate({
      now: () => now,
      sleep: (milliseconds) => {
        now += milliseconds;
        return Promise.resolve();
      }
    });

    await Promise.all([
      gate.enqueue(42, () => { starts.push(now); return Promise.resolve(); }),
      gate.enqueue(42, () => { starts.push(now); return Promise.resolve(); }),
      gate.enqueue(42, () => { starts.push(now); return Promise.resolve(); })
    ]);

    expect(starts).toEqual([0, 1_100, 2_200]);
  });

  it("forgets expired target delays", async () => {
    let now = 0;
    const gate = new PartyRaidChatTelegramGate({
      now: () => now,
      sleep: (milliseconds) => {
        now += milliseconds;
        return Promise.resolve();
      }
    });

    await gate.enqueue("old", () => Promise.resolve());
    now = 5_000;
    const startedAt = await gate.enqueue("old", () => Promise.resolve(now));

    expect(startedAt).toBe(5_000);
  });
});
