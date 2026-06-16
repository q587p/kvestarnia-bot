import { describe, expect, it } from "vitest";
import {
  presentSupportJar,
  presentSupportThanks
} from "../../src/bot/presenters/supportPresenter";

describe("support presenter", () => {
  it("renders configured support URL without payment or reward claims", () => {
    const text = presentSupportJar("https://send.monobank.ua/jar/test-placeholder", undefined);

    expect(text).toContain("🫙 Банка підтримки Квестарні");
    expect(text).toContain("https://send.monobank.ua/jar/test-placeholder");
    expect(text).toContain("Стан Банки видно за посиланням.");
    expect(text).toContain(
      "Банка підтримки допомагає @q587p тримати Квестарню живою: сервер, токени для Кодексу, тексти, редактура, коректура й інші корчмарські витрати."
    );
    expect(text).not.toContain("0 грн");
    expect(text).toContain(
      "Підтримка не дає XP, золота, луту, манаток, рівнів, бойової сили, прогресу або доступу до фіч."
    );
    expectNoUnsafeRewardClaims(text);
    expectNoOldSupportNaming(text);
  });

  it("renders configured manual current amount calmly", () => {
    const text = presentSupportJar("https://send.monobank.ua/jar/test-placeholder", {
      currentUah: 1234
    });

    expect(text).toContain("У Банці зараз: 1 234 грн");
    expect(text).not.toContain("Ціль:");
    expect(text).not.toContain("Оновлено вручну:");
    expectNoUnsafeRewardClaims(text);
    expectNoOldSupportNaming(text);
  });

  it("renders configured manual current amount with goal and update date", () => {
    const text = presentSupportJar("https://send.monobank.ua/jar/test-placeholder", {
      currentUah: 1234,
      goalUah: 5000,
      updatedAt: "2026-06-16"
    });

    expect(text).toContain("У Банці зараз: 1 234 грн");
    expect(text).toContain("Ціль: 5 000 грн");
    expect(text).toContain("Оновлено вручну: 2026-06-16");
    expect(text).not.toContain("залишилось тільки");
    expectNoUnsafeRewardClaims(text);
    expectNoOldSupportNaming(text);
  });

  it("renders configured manual goal without inventing a current amount", () => {
    const text = presentSupportJar("https://send.monobank.ua/jar/test-placeholder", {
      goalUah: 5000,
      updatedAt: "2026-06-16"
    });

    expect(text).toContain("Стан Банки видно за посиланням.");
    expect(text).toContain("Ціль: 5 000 грн");
    expect(text).toContain("Оновлено вручну: 2026-06-16");
    expect(text).not.toContain("У Банці зараз:");
    expect(text).not.toContain("У Банці зараз: 0 грн");
    expectNoUnsafeRewardClaims(text);
    expectNoOldSupportNaming(text);
  });


  it("renders a safe fallback without broken links", () => {
    const text = presentSupportJar(undefined, {
      currentUah: 1234,
      goalUah: 5000,
      updatedAt: "2026-06-16"
    });

    expect(text).toContain("посилання ще прибивають");
    expect(text).toContain(
      "Банка підтримки допомагає @q587p тримати Квестарню живою: сервер, токени для Кодексу, тексти, редактура, коректура й інші корчмарські витрати."
    );
    expect(text).toContain(
      "Підтримка не дає XP, золота, луту, манаток, рівнів, бойової сили, прогресу або доступу до фіч."
    );
    expect(text).not.toContain("undefined");
    expect(text).not.toContain("null");
    expect(text).not.toContain("https://");
    expect(text).not.toContain("У Банці зараз");
    expect(text).not.toContain("5 000 грн");
    expectNoUnsafeRewardClaims(text);
    expectNoOldSupportNaming(text);
  });

  it("renders the deep-link gratitude as cosmetic only", () => {
    const text = presentSupportThanks();

    expect(text).toContain("Корчмар піднімає подячний кухоль");
    expect(text).toContain("після поповнення Банки Квестарні");
    expect(text).toContain(
      "Підтримка не дає XP, золота, луту, манаток, рівнів, бойової сили, прогресу або доступу до фіч."
    );
    expect(text).toContain("✨ <b>+1000 до настрою корчми</b>");
    expect(text).toContain("Ефект косметичний");
    expectNoUnsafeRewardClaims(text);
    expectNoOldSupportNaming(text);
  });
});

function expectNoUnsafeRewardClaims(text: string): void {
  expect(text).not.toContain("платіж підтверджено");
  expect(text).not.toContain("отримано XP");
  expect(text).not.toContain("видано золото");
  expect(text).not.toContain("манатку додано");
  expect(text).not.toContain("донорський статус");
}

function expectNoOldSupportNaming(text: string): void {
  const oldTerms = [
    ["Бочка", "підтримки"].join(" "),
    ["Бочка", "Квестарні"].join(" "),
    ["У", "Бочці", "зараз"].join(" "),
    ["Тост", "із", "Бочки"].join(" "),
    ["Бочка", "вдячно", "булькнула"].join(" "),
    ["barrel", "thanks"].join("_"),
    ["SUPPORT", "BARREL"].join("_"),
    ["support", "Barrel"].join(""),
    ["Support", "Barrel"].join("")
  ];

  for (const term of oldTerms) {
    expect(text).not.toContain(term);
  }
}
