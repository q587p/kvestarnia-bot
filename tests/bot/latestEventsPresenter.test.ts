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
    expect(presentLatestEventsEmpty("imp")).toContain("Фільтр: <b>⭐ Важливе</b>");
    expect(presentLatestEventsEmpty("adv")).toContain("👥 Пригодники");
    expect(presentLatestEventsEmpty("cmb")).toContain("⚔️ Бої");
    expect(presentLatestEventsEmpty("itm")).toContain("🎒 Манатки");
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
            payload: { level: 7, remortCount: 5 }
          }),
          makeEvent("party.raid_won", "2026-07-02T07:00:00.000Z", {
            subjectName: "Старший Брат Бочки",
            payload: { participantCount: 5 }
          }),
          makeEvent("raid.completed", "2026-07-02T06:30:00.000Z", {
            subjectName: "Старший Брат Бочки",
            payload: { mode: "group", outcome: "lost", participantCount: 4 }
          }),
          makeEvent("raid.completed", "2026-07-02T06:00:00.000Z", {
            actorDisplayName: "Арден",
            subjectName: "Бочка Пінного Міражу",
            payload: { mode: "solo", outcome: "won", participantCount: 1 }
          }),
          makeEvent("item.rare_received", "2026-07-01T20:00:00.000Z", {
            actorDisplayName: "Мудрий",
            subjectName: "Пляшка Пінного Міражу",
            payload: { rarity: "rare" }
          }),
          makeEvent("item.rare_received", "2026-07-01T19:30:00.000Z", {
            actorDisplayName: "Майстриня",
            subjectName: "Ложка, яку не кладуть у шухляду",
            payload: { rarity: "legendary" }
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
    expect(text).toContain("You®4ik бере 7 рівень (р5)!");
    expect(text).toContain("Ватага: перемога. Ціль — «Старший Брат Бочки». У протоколі: 5 пригодників.");
    expect(text).toContain("Ватага: невдача. Ціль — «Старший Брат Бочки». У протоколі: 4 пригодників.");
    expect(text).toContain("Арден: соло-рейд, перемога. Ціль — «Бочка Пінного Міражу».");
    expect(text).toContain("Мудрий: рідкісна манатка — «Пляшка Пінного Міражу».");
    expect(text).toContain("Майстриня: легендарна манатка — «Ложка, яку не кладуть у шухляду».");
    expect(text).toContain("Пандочка: перемога. Монстр — «Огрище», перевага рівнів: +6.");
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

  it("renders successful item upgrade activity rows", () => {
    const text = presentLatestEventsPage({
      filter: "itm",
      now: new Date("2026-07-08T12:00:00.000Z"),
      page: {
        events: [
          makeEvent("item.upgraded", "2026-07-08T09:00:00.000Z", {
            actorDisplayName: "Майстер",
            subjectName: "Пательня переконання +5",
            payload: { targetLevel: 5 }
          })
        ],
        page: 0,
        pageSize: 15,
        hasNextPage: false
      }
    });

    expect(text).toContain("Фільтр: <b>🎒 Манатки</b>");
    expect(text).toContain("Майстер: манатка підсилена до +5 — «Пательня переконання +5».");
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
