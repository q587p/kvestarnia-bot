import { escapeHtml } from "./telegramHtml";

export function getShortMonsterName(
  name: string | null | undefined,
  fallback: string
): string {
  const plainName = name?.replace(/<[^>]*>/g, "").trim() ?? "";

  return plainName.split(/[\s\-–—]+/u).find(Boolean) ?? fallback;
}

export function presentShortMonsterName(
  name: string | null | undefined,
  fallback: string
): string {
  return escapeHtml(getShortMonsterName(name, fallback));
}

export function getDistinctShortMonsterNames(
  monsters: ReadonlyArray<{ name: string; order: number }>
): Map<number, string> {
  const shortNames = monsters.map((monster) =>
    getShortMonsterName(monster.name, `Монстр ${monster.order + 1}`)
  );
  const counts = shortNames.reduce((result, name) => {
    result.set(name, (result.get(name) ?? 0) + 1);
    return result;
  }, new Map<string, number>());

  return new Map(monsters.map((monster, index) => {
    const shortName = shortNames[index] ?? `Монстр ${monster.order + 1}`;
    return [
      monster.order,
      (counts.get(shortName) ?? 0) > 1
        ? `${shortName} ${monster.order + 1}`
        : shortName
    ];
  }));
}
