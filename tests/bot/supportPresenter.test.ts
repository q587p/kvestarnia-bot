import { describe, expect, it } from "vitest";
import {
  presentBarrelThanks,
  presentSupportBarrel
} from "../../src/bot/presenters/supportPresenter";

describe("support presenter", () => {
  it("renders configured support URL without payment or reward claims", () => {
    const text = presentSupportBarrel("https://send.monobank.ua/jar/test-placeholder", undefined);

    expect(text).toContain("🫙 Бочка підтримки Квестарні");
    expect(text).toContain("https://send.monobank.ua/jar/test-placeholder");
    expect(text).toContain("Стан Банки видно за посиланням.");
    expect(text).not.toContain("0 грн");
    expect(text).toContain(
      "Підтримка не дає XP, золота, луту, манаток, рівнів, бойової сили, прогресу або доступу до фіч."
    );
    expectNoUnsafeRewardClaims(text);
  });

  it("renders configured manual current amount calmly", () => {
    const text = presentSupportBarrel("https://send.monobank.ua/jar/test-placeholder", {
      currentUah: 1234
    });

    expect(text).toContain("У Бочці зараз: 1 234 грн");
    expect(text).not.toContain("Ціль:");
    expect(text).not.toContain("Оновлено вручну:");
    expectNoUnsafeRewardClaims(text);
  });

  it("renders configured manual current amount with goal and update date", () => {
    const text = presentSupportBarrel("https://send.monobank.ua/jar/test-placeholder", {
      currentUah: 1234,
      goalUah: 5000,
      updatedAt: "2026-06-16"
    });

    expect(text).toContain("У Бочці зараз: 1 234 грн");
    expect(text).toContain("Ціль: 5 000 грн");
    expect(text).toContain("Оновлено вручну: 2026-06-16");
    expect(text).not.toContain("залишилось тільки");
    expectNoUnsafeRewardClaims(text);
  });

  it("renders configured manual goal without inventing a current amount", () => {
    const text = presentSupportBarrel("https://send.monobank.ua/jar/test-placeholder", {
      goalUah: 5000,
      updatedAt: "2026-06-16"
    });

    expect(text).toContain("Стан Банки видно за посиланням.");
    expect(text).toContain("Ціль: 5 000 грн");
    expect(text).toContain("Оновлено вручну: 2026-06-16");
    expect(text).not.toContain("У Бочці зараз:");
    expect(text).not.toContain("У Бочці зараз: 0 грн");
    expectNoUnsafeRewardClaims(text);
  });


  it("renders a safe fallback without broken links", () => {
    const text = presentSupportBarrel(undefined, {
      currentUah: 1234,
      goalUah: 5000,
      updatedAt: "2026-06-16"
    });

    expect(text).toContain("посилання ще прибивають");
    expect(text).toContain(
      "Підтримка не дає XP, золота, луту, манаток, рівнів, бойової сили, прогресу або доступу до фіч."
    );
    expect(text).not.toContain("undefined");
    expect(text).not.toContain("null");
    expect(text).not.toContain("https://");
    expect(text).not.toContain("У Бочці зараз");
    expect(text).not.toContain("5 000 грн");
    expectNoUnsafeRewardClaims(text);
  });

  it("renders the deep-link gratitude as cosmetic only", () => {
    const text = presentBarrelThanks();

    expect(text).toContain("Бочка вдячно булькнула");
    expect(text).toContain(
      "Підтримка не дає XP, золота, луту, манаток, рівнів, бойової сили, прогресу або доступу до фіч."
    );
    expect(text).toContain("+1000 до настрою корчми");
    expect(text).toContain("Ефект косметичний");
    expectNoUnsafeRewardClaims(text);
  });
});

function expectNoUnsafeRewardClaims(text: string): void {
  expect(text).not.toContain("платіж підтверджено");
  expect(text).not.toContain("отримано XP");
  expect(text).not.toContain("видано золото");
  expect(text).not.toContain("манатку додано");
  expect(text).not.toContain("донорський статус");
}
