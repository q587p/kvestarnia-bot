import { describe, expect, it } from "vitest";
import type { MantokChestRunRecord } from "../../src/db/repositories/mantokChestRepository";
import type { MantokChestPresentedItem } from "../../src/services/mantokChestService";
import {
  presentMantokChestManualSelection,
  presentMantokChestOverview,
  presentMantokChestPreview,
  presentMantokChestRecycleResult
} from "../../src/bot/presenters/mantokChestPresenter";

const now = new Date("2026-06-15T07:30:00.000Z");

describe("Mantok Chest presenter", () => {
  it("shows eligible count on the overview", () => {
    expect(presentMantokChestOverview({ state: "ready", eligibleCount: 7 })).toContain(
      "Доступних манаток: <b>7</b>"
    );
  });

  it("shows manual selection counter, page, and selected stack units", () => {
    const text = presentMantokChestManualSelection({
      state: "selection",
      run: run(),
      selectedCount: 3,
      requiredCount: 5,
      eligibleCount: 9,
      page: 1,
      pageCount: 2,
      items: [
        {
          ...item("item.cheese", "Сир", 2),
          index: 5,
          selectedQuantity: 1,
          availableQuantity: 2,
          manualOnly: true
        }
      ]
    });

    expect(text).toContain("Обрано: <b>3/5</b>");
    expect(text).toContain("Сторінка <b>2/2</b>");
    expect(text).toContain("<b>Сир</b> ×2 · на виделці <b>1</b> · ручне переконання");
  });

  it("shows confirmation warning and selected input list", () => {
    const text = presentMantokChestPreview({
      state: "preview-created",
      run: run(),
      inputItems: [
        item("item.<unsafe>", "<b>Пательня</b>", 2),
        item("item.cheese", "Сир", 3)
      ],
      averageInputScore: 30,
      minimumOutputScore: 31
    });

    expect(text).toContain("Скриня зʼїсть ці 5 манаток назавжди");
    expect(text).toContain("<b>&lt;b&gt;Пательня&lt;/b&gt;</b> ×2");
    expect(text).toContain("щонайменше на <b>31</b> умовних скринячих одиниць");
    expect(text).not.toContain("score");
  });

  it("warns when preview contains manual-only inputs", () => {
    const text = presentMantokChestPreview({
      state: "preview-created",
      run: run(),
      inputItems: [
        {
          ...item("item.ticket", "Квиток мокрого пригодника", 5),
          manualOnly: true
        }
      ],
      averageInputScore: 25,
      minimumOutputScore: 26
    });

    expect(text).toContain("Автоматично Скриня б таке не брала");
    expect(text).toContain("ручне переконання");
  });

  it("shows success output card and escapes item text", () => {
    const text = presentMantokChestRecycleResult({
      state: "recycled",
      run: run(),
      outputItem: item("item.output", "<i>Нова</i>", 1)
    });

    expect(text).toContain("Хрум. Шурх");
    expect(text).toContain("&lt;i&gt;Нова&lt;/i&gt;");
  });

  it("shows stale and not-enough states without throwing", () => {
    expect(presentMantokChestPreview({ state: "not-enough-items", eligibleCount: 4 })).toContain(
      "треба 5 доступних манаток"
    );
    expect(presentMantokChestRecycleResult({ state: "stale-inputs", run: run() })).toContain(
      "манатка втекла з меню"
    );
    expect(presentMantokChestRecycleResult({ state: "expired", run: run() })).toContain(
      "прибрала старий бланк"
    );
    expect(presentMantokChestPreview({ state: "selection-incomplete", selectedCount: 4 })).toContain(
      "обрано <b>4/5</b>"
    );
  });
});

function run(): MantokChestRunRecord {
  return {
    id: "run-1",
    characterId: "character-42",
    token: "12345678-1234-4234-9234-123456789abc",
    status: "pending",
    inputItems: [],
    outputItems: [],
    averageInputScore: 30,
    minimumOutputScore: 31,
    outputScore: null,
    completedAt: null,
    expiredAt: null,
    createdAt: now,
    updatedAt: now
  };
}

function item(itemId: string, name: string, quantity: number): MantokChestPresentedItem {
  return {
    itemId,
    quantity,
    manualOnly: false,
    score: 30,
    content: {
      id: itemId,
      name,
      description: "Опис <script>",
      rarity: "common",
      slot: "junk",
      goldValue: 1
    }
  };
}
