import { describe, expect, it } from "vitest";
import {
  presentNearbyDuelCandidates,
  presentNearbyDuelMode
} from "../../src/bot/presenters/nearbyDuelPresenter";
import type { PresencePerson } from "../../src/services/presenceService";

describe("nearby duel presenter", () => {
  it("shows selected active cosmetic titles in nearby target rows and mode cards", () => {
    const target: PresencePerson = {
      telegramUserId: 2n,
      name: "Дара <&>",
      activeCosmeticTitle: "Перший <пергамент> не зʼїв",
      level: 4,
      status: "active"
    };
    const candidates = presentNearbyDuelCandidates({
      state: "ready",
      location: {
        id: "location.korchma.hall",
        name: "Зала корчми"
      },
      page: 0,
      pageSize: 5,
      total: 1,
      totalPages: 1,
      visible: [target]
    });
    const mode = presentNearbyDuelMode(target);

    expect(candidates).toContain("— Дара &lt;&amp;&gt; (<i>«Перший &lt;пергамент&gt; не зʼїв»</i>) · рівень 4");
    expect(mode).toContain("<b>Дара &lt;&amp;&gt;</b> (<i>«Перший &lt;пергамент&gt; не зʼїв»</i>) · рівень 4");
  });
});
