import { describe, expect, it } from "vitest";
import {
  presentTavernGameActionResult,
  presentTavernGameLeaderboard,
  presentTavernGameRules,
  presentTavernGameSession
} from "../../src/bot/presenters/tavernGamePresenter";

describe("tavern game presenter", () => {
  it("describes Kosti as a seven-player table", () => {
    expect(presentTavernGameRules("kosti", 25)).toContain("від двох до семи гравців");
  });

  it("does not imply an open Kosti table resolves immediately after two players decide", () => {
    const text = presentTavernGameSession({
      id: "session-1",
      token: "12345678-1234-4234-9234-123456789abc",
      gameKey: "kosti",
      status: "open",
      stakeGold: 1,
      potGold: 2,
      creatorCharacterId: "character-1",
      createdAt: new Date("2026-07-02T10:00:00.000Z"),
      expiresAt: new Date("2026-07-02T10:13:00.000Z"),
      participants: [
        { characterId: "character-1", displayName: "Shannar de Kassal" },
        { characterId: "character-2", displayName: "Kyjivan BooksDragon" }
      ]
    });

    expect(text).toContain("Кинути зараз");
    expect(text).toContain("стіл заповниться");
    expect(text).toContain("час збору добіжить кінця");
    expect(text).not.toContain("щонайменше двох гравців");
  });

  it("explains create cooldown without implying an open table exists", () => {
    const text = presentTavernGameActionResult({
      state: "cooldown",
      availableAt: new Date("2026-07-02T10:03:01.000Z"),
      now: new Date("2026-07-02T10:00:00.000Z")
    });

    expect(text).toContain("Новий стіл ще на паузі.");
    expect(text).toContain("обмеження на створення нових столів");
    expect(text).toContain("не ознака, що десь уже відкрита партія");
    expect(text).toContain("Спробуйте ще раз за 4 хвилини.");
  });

  it("shows tavern game leaderboard for day week and month", () => {
    const text = presentTavernGameLeaderboard({
      state: "ready",
      leaderboard: {
        day: [{
          characterId: "character-1",
          name: "<b>Дара</b>",
          activeCosmeticTitle: "Перший <стіл>",
          winCount: 2,
          drawCount: 1,
          lossCount: 5
        }],
        week: [],
        month: [{ characterId: "character-2", name: "Нестор", winCount: 11, drawCount: 12, lossCount: 14 }]
      }
    });

    expect(text).toContain("🏆 Рейтинг ігор за столом");
    expect(text).toContain("Корчмар рахує завершені тавлеї та кості");
    expect(text).toContain("<b>За добу</b>:");
    expect(text).toContain("1. &lt;b&gt;Дара&lt;/b&gt; (<i>«Перший &lt;стіл&gt;»</i>) — 2 перемоги, 1 нічия, 5 поразок");
    expect(text).toContain("<b>За тиждень</b>: ще ніхто не дограв");
    expect(text).toContain("1. Нестор — 11 перемог, 12 нічиїх, 14 поразок");
    expect(text).not.toContain("<b>Дара</b>");
  });
});
