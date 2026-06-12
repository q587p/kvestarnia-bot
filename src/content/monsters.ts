import type { MonsterContent } from "./schema";

export const monsters = [
  {
    id: "monster.mimic-shawarma",
    name: "Мімік-шаурма",
    description: "Виглядає апетитно, але це саме так працює маркетинг міміків.",
    level: 1,
    tags: ["mimic", "food", "starter"]
  }
] satisfies MonsterContent[];
