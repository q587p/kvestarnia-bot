import { describe, expect, it } from "vitest";
import type { ActivityEventRecord } from "../../src/db/repositories/activityEventRepository";
import {
  presentLatestEventsEmpty,
  presentLatestEventsError,
  presentLatestEventsPage
} from "../../src/bot/presenters/latestEventsPresenter";

describe("latest events presenter", () => {
  it("renders empty and error states", () => {
    expect(presentLatestEventsEmpty()).toContain("📜 Хроніки Квестарні");
    expect(presentLatestEventsEmpty()).toContain("Літописець гріє чорнило");
    expect(presentLatestEventsEmpty("imp")).toContain("⭐ Важливе");
    expect(presentLatestEventsError()).toContain("упустив перо в суп");
  });

  it("groups recent rows by Kyiv day and renders all MVP event types", () => {
    const text = presentLatestEventsPage({
      now: new Date("2026-07-02T12:00:00.000Z"),
      page: {
        events: [
          makeEvent("character.created", "2026-07-02T09:00:00.000Z", {
            actorDisplayName: "Арден"
          }),
          makeEvent("character.level_reached", "2026-07-02T08:00:00.000Z", {
            actorDisplayName: "You®4ik",
            payload: { level: 7 }
          }),
          makeEvent("party.raid_won", "2026-07-02T07:00:00.000Z", {
            subjectName: "Старший Брат Бочки",
            payload: { participantCount: 5 }
          }),
          makeEvent("item.rare_received", "2026-07-01T20:00:00.000Z", {
            actorDisplayName: "Мудрий",
            subjectName: "Пляшка Пінного Міражу",
            payload: { rarity: "rare" }
          }),
          makeEvent("combat.underdog_won", "2026-07-01T19:00:00.000Z", {
            actorDisplayName: "Пандочка",
            subjectName: "Огрище",
            payload: { levelDelta: 6 }
          })
        ],
        page: 0,
        pageSize: 15,
        hasNextPage: false
      }
    });

    expect(text).toContain("📜 Хроніки Квестарні");
    expect(text).toContain("Сьогодні");
    expect(text).toContain("Вчора");
    expect(text).toContain("Новий пригодник у Квестарні: Арден!");
    expect(text).toContain("You®4ik бере 7 рівень!");
    expect(text).toContain("Ватага здолала «Старший Брат Бочки»: 5 пригодників");
    expect(text).toContain("Мудрий: рідкісна манатка — «Пляшка Пінного Міражу».");
    expect(text).toContain("Пандочка: перемога над «Огрище», сильнішим на 6 рівнів.");
  });

  it("escapes, truncates and falls back for dynamic names", () => {
    const text = presentLatestEventsPage({
      now: new Date("2026-07-02T12:00:00.000Z"),
      page: {
        events: [
          makeEvent("item.rare_received", "2026-07-02T09:00:00.000Z", {
            actorDisplayName: " <b>дуже дуже дуже дуже довге ім'я</b> ",
            subjectName: "<манатка>",
            payload: { rarity: "epic" }
          }),
          makeEvent("character.created", "2026-07-02T08:00:00.000Z", {
            actorDisplayName: "\u0000   "
          })
        ],
        page: 0,
        pageSize: 15,
        hasNextPage: false
      }
    });

    expect(text).toContain("&lt;b&gt;дуже дуже дуже дуже довге ...");
    expect(text).toContain("«&lt;манатка&gt;»");
    expect(text).toContain("Пригодник без таблички");
  });
});

function makeEvent(
  eventType: ActivityEventRecord["eventType"],
  occurredAt: string,
  overrides: Partial<ActivityEventRecord> = {}
): ActivityEventRecord {
  return {
    id: `${eventType}-${occurredAt}`,
    eventType,
    category: "adventurer",
    severity: "normal",
    visibility: "public",
    actorCharacterId: null,
    actorDisplayName: null,
    relatedCharacterIds: null,
    subjectKind: null,
    subjectId: null,
    subjectName: null,
    sourceType: null,
    sourceId: null,
    dedupeKey: null,
    payload: null,
    occurredAt: new Date(occurredAt),
    publishedAt: null,
    createdAt: new Date(occurredAt),
    ...overrides
  };
}
