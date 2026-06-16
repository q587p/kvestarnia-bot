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
    expect(text).toContain("жодної купівлі сили, луту, золота чи прогресу");
    expect(text).not.toContain("платіж підтверджено");
    expect(text).not.toContain("XP");
  });

  it("renders a safe fallback without broken links", () => {
    const text = presentSupportBarrel(undefined);

    expect(text).toContain("посилання ще прибивають");
    expect(text).toContain("не продає силу, лут або прогрес");
    expect(text).not.toContain("undefined");
    expect(text).not.toContain("null");
    expect(text).not.toContain("https://");
  });

  it("renders the deep-link gratitude as cosmetic only", () => {
    const text = presentBarrelThanks();

    expect(text).toContain("Бочка вдячно булькнула");
    expect(text).toContain("не дає ігрової сили, луту, золота чи переваг");
    expect(text).toContain("+1000 до настрою корчми");
    expect(text).toContain("Ефект косметичний");
    expect(text).not.toContain("платіж підтверджено");
  });
});
