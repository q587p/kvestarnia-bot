import { describe, expect, it } from "vitest";
import {
  BESTIARY_PAGE_SIZE,
  BESTIARY_TAG_LABELS,
  presentBestiaryList,
  presentBestiaryMonster,
  presentBestiaryMonsterRecord
} from "../../src/bot/presenters/bestiaryPresenter";
import { monsters } from "../../src/content";

describe("bestiary presenter", () => {
  it("renders a short paginated monster list", () => {
    const text = presentBestiaryList(0);

    expect(text).toContain("📖 Бестіарій Квестарні");
    expect(text).toContain("Польові нотатки");
    expect(text).toContain(`Сторінка 1/${Math.ceil(monsters.length / BESTIARY_PAGE_SIZE)}`);
    expect(text.match(/^• /gm)).toHaveLength(BESTIARY_PAGE_SIZE);
  });

  it("does not leak raw technical tag ids into the monster list", () => {
    const totalPages = Math.ceil(monsters.length / BESTIARY_PAGE_SIZE);
    const allListText = Array.from({ length: totalPages }, (_, page) => presentBestiaryList(page))
      .join("\n");
    const tags = new Set(monsters.flatMap((monster) => monster.tags));

    for (const tag of tags) {
      expect(allListText).not.toMatch(new RegExp(`(^|[ ·,])${escapeRegExp(tag)}($|[ ·,])`));
    }
  });

  it("has Ukrainian labels for every current monster tag", () => {
    const tags = new Set(monsters.flatMap((monster) => monster.tags));

    for (const tag of tags) {
      expect(BESTIARY_TAG_LABELS[tag], `missing bestiary label for ${tag}`).toBeDefined();
    }
  });

  it("clamps out-of-range pages to the last available page", () => {
    const text = presentBestiaryList(999);
    const totalPages = Math.ceil(monsters.length / BESTIARY_PAGE_SIZE);

    expect(text).toContain(`Сторінка ${totalPages}/${totalPages}`);
  });

  it("renders monster detail with field notes and trophy hints", () => {
    const text = presentBestiaryMonster("monster.stamp-doorkeeper-skeleton");

    expect(text).toContain("<b>Скелет-вахтер печаток</b>");
    expect(text).toContain("Рівень: 2");
    expect(text).toContain("Польова нотатка");
    expect(text).toContain("Кістки не забираємо. Забираємо те, чим вони заважали.");
    expect(text).toContain("Можливі трофеї за нотатками, не обіцянка");
    expect(text).toContain("<i>Штемпельна подушка останнього попередження</i>");
  });

  it("uses monster-specific field notes instead of repeated tag-generic notes", () => {
    const text = presentBestiaryMonster("monster.spreadsheet-goblin");

    expect(text).toContain(
      "Польова нотатка: Трофей дрібний, зате порахований із зайвою точністю."
    );
    expect(text).not.toContain(
      "перемагати можна аргументом, але печатка все одно спитає додаток"
    );
  });

  it("escapes dynamic monster and trophy content in detail", () => {
    const detailText = presentBestiaryMonsterRecord(
      {
        id: "monster.unsafe",
        name: "<b>Монстр</b>",
        description: "Опис із <script>планом</script>.",
        level: 2,
        tags: ["food"]
      },
      ["<i>Трофей</i>"]
    );

    expect(detailText).toContain("&lt;b&gt;Монстр&lt;/b&gt;");
    expect(detailText).toContain("Опис із &lt;script&gt;планом&lt;/script&gt;.");
    expect(detailText).toContain("&lt;i&gt;Трофей&lt;/i&gt;");
    expect(detailText).not.toContain("<b>Монстр</b>");
    expect(detailText).not.toContain("<script>");
    expect(detailText).not.toContain("<i>Трофей</i>");
  });

  it("renders a friendly missing-entry state", () => {
    const text = presentBestiaryMonster("monster.no-such-problem");

    expect(text).toContain("Запис не знайдено");
    expect(text).not.toContain("undefined");
  });
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
