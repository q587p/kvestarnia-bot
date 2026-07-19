import { describe, expect, it } from "vitest";
import type { PartyRaidChatAuthorizedView } from "../../src/db/repositories/partyRaidChatRepository";
import {
  appendPartyRaidChatWithinBudget,
  presentPartyRaidChatSection
} from "../../src/bot/presenters/partyRaidChatPresenter";

describe("party raid chat presenter", () => {
  it("renders Kyiv seconds, chronological rows and escaped plaintext", () => {
    const view = makeView([
      entry(1, "2026-01-20T10:00:00.000Z", "<Щур>", "Хало & привіт"),
      entry(2, "2026-01-20T10:00:03.000Z", "Бард", "Йой")
    ]);

    const text = presentPartyRaidChatSection(view);
    expect(text).toContain("12:00:00 &lt;Щур&gt;: Хало &amp; привіт");
    expect(text.indexOf("12:00:00")).toBeLessThan(text.indexOf("12:00:03"));
  });

  it("uses date prefixes when visible rows cross Kyiv midnight", () => {
    const text = presentPartyRaidChatSection(makeView([
      entry(1, "2026-07-20T20:59:59.000Z", "А", "До"),
      entry(2, "2026-07-20T21:00:01.000Z", "Б", "Після")
    ]));
    expect(text).toContain("20.07 23:59:59");
    expect(text).toContain("21.07 00:00:01");
  });

  it("drops oldest rows only and reports the pruned count within Telegram budget", () => {
    const entries = Array.from({ length: 13 }, (_, index) =>
      entry(index + 1, `2026-07-20T10:00:${String(index).padStart(2, "0")}.000Z`, `Довге імʼя ${index}`, "<&>".repeat(31))
    );
    const text = appendPartyRaidChatWithinBudget("x".repeat(3_000), makeView(entries));
    expect(text.length).toBeLessThanOrEqual(4096);
    expect(text).toMatch(/останні \d+ із 13/);
    expect(text).toContain("Довге імʼя 12");
  });

  it("uses a complete safe fallback instead of slicing oversized HTML", () => {
    const text = appendPartyRaidChatWithinBudget(`<b>${"x".repeat(4_096)}</b>`, makeView([]));

    expect(text).toBe("💬 <b>Рейд-чат</b>\n• Основна картка завелика. Відкрийте окрему картку чату.");
    expect(text.length).toBeLessThanOrEqual(4_096);
  });

  it("names Form 13-B correctly in the typed system event", () => {
    const text = presentPartyRaidChatSection(makeView([{
      ...entry(1, "2026-07-20T10:00:00.000Z", "Бюрокрамант", ""),
      kind: "system",
      eventType: "ability.form-thirteen-b",
      body: null
    }]));

    expect(text).toContain("Форму 13-Б");
    expect(text).not.toContain("Форму 13-А через бойову");
  });
});

function makeView(entries: PartyRaidChatAuthorizedView["entries"]): PartyRaidChatAuthorizedView {
  return {
    partySessionId: "party-1",
    inviteToken: "raid-token",
    chatRevision: entries.length,
    lifecycle: "recruiting",
    writable: true,
    retentionUntil: null,
    viewerCharacterId: "character-1",
    entries
  };
}

function entry(id: number, at: string, name: string, body: string): PartyRaidChatAuthorizedView["entries"][number] {
  return {
    id,
    revision: id,
    kind: "player",
    eventType: null,
    actorCharacterId: `character-${id}`,
    actorDisplayName: name,
    actorRemortCount: 0,
    body,
    payload: null,
    occurredAt: new Date(at)
  };
}
