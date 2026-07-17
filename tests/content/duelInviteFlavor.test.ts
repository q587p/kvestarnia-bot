import { describe, expect, it } from "vitest";
import {
  DUEL_INVITE_TEMPLATES,
  getInitialDuelInviteTemplateIndex,
  getNextDuelInviteTemplateIndex,
  renderDuelInviteTemplate
} from "../../src/content/duelInviteFlavor";

describe("duel invite flavor", () => {
  it("keeps exactly 13 stable unique templates", () => {
    expect(DUEL_INVITE_TEMPLATES).toHaveLength(13);
    expect(new Set(DUEL_INVITE_TEMPLATES.map((template) => template.id)).size).toBe(13);
    expect(DUEL_INVITE_TEMPLATES.map((template) => template.header)).toEqual([
      "🥊 Дружній корчемний виклик",
      "🍺 Кухоль поставлено ребром",
      "📜 Надзвичайно офіційний виклик",
      "🪨 Крейда вже на столі",
      "🎩 Підозріло чемна дуель",
      "🧾 Перевірка героїчної звітности",
      "🪑 Стіл вимагає видовища",
      "❓ Виклик без переконливої причини",
      "⚔️ Епос на один корчемний запис",
      "👀 Кухоль усе бачив",
      "🤝 Дружня незгода",
      "🗂️ Форма 13-Д: добровільна бійка",
      "🔔 Перерва в здоровому глузді"
    ]);
  });

  it("renders escaped dynamic fields supplied by the presenter", () => {
    const text = renderDuelInviteTemplate({
      templateIndex: 0,
      escapedName: "<b>Пан &amp; Пані</b>",
      modeLine: "⚡ Формат: миттєва дуель — результат одразу після згоди.",
      fairnessLine: "⚖️ Корчмар тимчасово зрівняє досвід. Ваші манатки й їхні ефекти лишаться вашими.",
      escapedInviteUrl: "https://t.me/kvestarnia_bot?start=duel_a&amp;b"
    });

    expect(text).toContain("<b>Пан &amp; Пані</b>");
    expect(text).toContain("https://t.me/kvestarnia_bot?start=duel_a&amp;b");
    expect(text).toContain("⚡ Формат: миттєва дуель");
    expect(text).toContain("⚖️ Корчмар тимчасово зрівняє досвід");
  });

  it("chooses the initial and next template deterministically without an immediate repeat", () => {
    const token = "abcDEF12";
    const initial = getInitialDuelInviteTemplateIndex(token);
    const repeated = getInitialDuelInviteTemplateIndex(token);
    const next = getNextDuelInviteTemplateIndex(token, initial);
    const repeatedNext = getNextDuelInviteTemplateIndex(token, initial);

    expect(initial).toBe(repeated);
    expect(next).toBe(repeatedNext);
    expect(next).not.toBe(initial);
    expect(renderDuelInviteTemplate({
      templateIndex: next,
      escapedName: "<b>Автор</b>",
      modeLine: "mode",
      fairnessLine: "fair",
      escapedInviteUrl: "url"
    })).toContain("url");
  });

  it("walks the full thirteen-template pool before returning to the initial template", () => {
    const token = "full-cycle-token";
    const initial = getInitialDuelInviteTemplateIndex(token);
    const seen = new Set<number>([initial]);
    let current = initial;

    for (let index = 0; index < 12; index += 1) {
      current = getNextDuelInviteTemplateIndex(token, current);
      seen.add(current);
    }

    expect(seen.size).toBe(13);
    expect(getNextDuelInviteTemplateIndex(token, current)).toBe(initial);
  });

  it("keeps dynamic invite copy pronoun-neutral", () => {
    const rendered = [6, 11].map((templateIndex) =>
      renderDuelInviteTemplate({
        templateIndex,
        escapedName: "<b>Мандрівниця</b>",
        modeLine: "mode",
        fairnessLine: "fair",
        escapedInviteUrl: "url"
      })
    ).join("\n");

    expect(rendered).not.toContain("саме він");
    expect(rendered).not.toContain("заповнив");
    expect(rendered).toContain("дуелі щойно зажадали саме меблі");
    expect(rendered).toContain("майже всі поля вже заповнено");
  });
});
