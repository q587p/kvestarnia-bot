import { describe, expect, it } from "vitest";
import {
  presentBarrelThanks,
  presentSupportBarrel
} from "../../src/bot/presenters/supportPresenter";

describe("support presenter", () => {
  it("renders configured support URL without payment or reward claims", () => {
    const text = presentSupportBarrel("https://send.monobank.ua/jar/test-placeholder");

    expect(text).toContain("🫙 Бочка підтримки Квестарні");
    expect(text).toContain("https://send.monobank.ua/jar/test-placeholder");
    expect(text).toContain(
      "Підтримка не дає XP, золота, луту, манаток, рівнів, бойової сили, прогресу або доступу до фіч."
    );
    expectNoUnsafeRewardClaims(text);
  });

  it("renders a safe fallback without broken links", () => {
    const text = presentSupportBarrel(undefined);

    expect(text).toContain("посилання ще прибивають");
    expect(text).toContain(
      "Підтримка не дає XP, золота, луту, манаток, рівнів, бойової сили, прогресу або доступу до фіч."
    );
    expect(text).not.toContain("undefined");
    expect(text).not.toContain("null");
    expect(text).not.toContain("https://");
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
}
