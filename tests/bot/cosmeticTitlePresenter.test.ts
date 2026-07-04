import { describe, expect, it } from "vitest";
import {
  presentCosmeticTitleNotice,
  presentCosmeticTitles
} from "../../src/bot/presenters/cosmeticTitlePresenter";
import type { CosmeticTitleListEntry, CosmeticTitleListView } from "../../src/services/achievementService";

describe("cosmetic title presenter", () => {
  it("shows a friendly empty state", () => {
    const text = presentCosmeticTitles(buildView({ entries: [] }));

    expect(text).toContain("🏷️ <b>Титули</b>");
    expect(text).toContain("Титулів ще нема");
    expect(text).toContain("Бонусів він не дає");
  });

  it("marks active and archived title rows", () => {
    const text = presentCosmeticTitles(buildView({
      activeTitleGrantId: "cosmetic-title.first-ink",
      entries: [
        buildEntry({
          active: true,
          title: "Де тут вихід?",
          sourceAchievementTitle: "Де тут вихід?"
        }),
        buildEntry({
          grantRowId: "title-row-2",
          titleGrantId: "cosmetic-title.retired",
          title: "Архівний титул",
          sourceAchievementTitle: "архівний запис",
          archived: true
        })
      ]
    }));

    expect(text).toContain("1. ✅ <b>Де тут вихід?</b>");
    expect(text).toContain("2. ▫️ <b>Архівний титул</b>");
    expect(text).toContain("архів");
    expect(text).not.toContain("cosmetic-title.");
    expect(text).not.toContain("title-row-");
  });

  it("shows pagination state and stable global row numbers", () => {
    const text = presentCosmeticTitles(buildView({
      page: 1,
      totalPages: 5,
      totalCount: 47,
      entries: [
        buildEntry({
          grantRowId: "title-row-11",
          title: "Одинадцята табличка"
        })
      ]
    }));

    expect(text).toContain("Сторінка 2/5.");
    expect(text).toContain("11. ▫️ <b>Одинадцята табличка</b>");
  });

  it("explains a missing active title pointer without crashing", () => {
    const text = presentCosmeticTitles(buildView({
      activeTitleGrantId: "cosmetic-title.missing",
      activeTitleMissing: true,
      entries: []
    }));

    expect(text).toContain("Активний титул загубився в архіві");
  });

  it("presents mutation notices without mechanical rewards", () => {
    expect(presentCosmeticTitleNotice("selected", 1)).toContain("Ачівка за перший вибір");
    expect(presentCosmeticTitleNotice("cleared")).toContain("Сила не змінилася");
    expect(presentCosmeticTitleNotice("not-owned")).toContain("не належить");
    expect(presentCosmeticTitleNotice("stale-life")).toContain("застаріла після реморту");
  });
});

function buildView(overrides: Partial<CosmeticTitleListView> = {}): CosmeticTitleListView {
  return {
    entries: [buildEntry()],
    activeTitleGrantId: null,
    activeTitleMissing: false,
    remortCount: 0,
    page: 0,
    totalPages: 1,
    totalCount: 1,
    ...overrides
  };
}

function buildEntry(overrides: Partial<CosmeticTitleListEntry> = {}): CosmeticTitleListEntry {
  return {
    grantRowId: "title-row-1",
    titleGrantId: "cosmetic-title.first-ink",
    title: "Де тут вихід?",
    sourceAchievementTitle: "Де тут вихід?",
    grantedAt: new Date("2026-06-28T09:00:00.000Z"),
    active: false,
    archived: false,
    ...overrides
  };
}
