import type {
  PassageSearchCancelPreviewResult,
  PassageSearchCheckResult,
  PassageSearchStartResult
} from "../../services/passageSearchService";
import { PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1 } from "../../services/presenceService";
import { escapeHtml } from "./telegramHtml";

type SearchResult = PassageSearchStartResult | PassageSearchCheckResult | PassageSearchCancelPreviewResult;

export function presentPassageSearch(result: SearchResult): string {
  switch (result.state) {
    case "started":
    case "running":
      return [
        "🔎 <b>Пошук триває</b>",
        "",
        `${presentNodeLine(result.action.payload)} Пригодник порпається обережно, бо Низ любить різкі висновки.`,
        "",
        `Лишилось: <b>${presentSeconds(result.state === "running" ? result.remainingSeconds : getRemainingSeconds(result.action.endsAt))}</b>.`
      ].join("\n");
    case "confirm-cancel":
      return [
        "✋ <b>Збити пошук?</b>",
        "",
        "Якщо припинити зараз, знахідки не буде, а місцевий пошуковий настрій уже піде на перерву.",
        "",
        `Лишилось: <b>${presentSeconds(result.remainingSeconds)}</b>.`
      ].join("\n");
    case "cooldown":
      return [
        "🔎 <b>Тут щойно шукали</b>",
        "",
        "Пил ще не встиг осісти, а Низ дуже цінує драматичну паузу.",
        "",
        `Спробуйте за <b>${presentSeconds(Math.ceil((result.availableAt.getTime() - result.now.getTime()) / 1000))}</b>.`
      ].join("\n");
    case "needs-rest":
      return [
        "❤️ <b>Не до пошуків</b>",
        "",
        "Пригодник тримається на настільки чесному слові, що навіть пил відмовляється співпрацювати."
      ].join("\n");
    case "completed":
      return [
        "🎒 <b>Щось знайшлося</b>",
        "",
        "Низ бурчить, але віддає кілька доказів чужого оптимізму.",
        "",
        ...presentLootLines(result.loot)
      ].join("\n");
    case "nothing":
      return [
        "🕳️ <b>Порожньо</b>",
        "",
        "Ви знайшли пил, сумнів і дуже переконливий камінець. Камінець лишився на місці."
      ].join("\n");
    case "cancelled":
      return [
        "✋ <b>Пошук збито</b>",
        "",
        "Пригодник відступив від пилу. Пил записав це як перемовини."
      ].join("\n");
    case "monster-attack":
      return [
        "⚔️ <b>Пошук образив місцевого мешканця</b>",
        "",
        "Перший хід за монстром: ви були зайняті пошуками."
      ].join("\n");
    case "no-reward":
      return [
        "🔎 <b>Пошук не склався</b>",
        "",
        result.reason === "dead"
          ? "Пригодник зараз не в стані оцінювати знахідки."
          : "Старий пошуковий слід уже розсипався."
      ].join("\n");
    case "blocked":
      return result.reason === "stale-location"
        ? "Низ дозволяє порпатись, але не дозволяє порпатись здалеку. Оновіть поточне місце й спробуйте ще раз."
        : "Низ переклав цей папірець в іншу шухляду. Оновіть місце й спробуйте ще раз.";
    case "not-found":
      return "Цей пошук уже не знайшовся. Можливо, його прибрали разом із пилом.";
    case "no-character":
      return "Спершу створіть пригодника через /start. Пил не співпрацює з анонімами.";
  }
}

function presentNodeLine(snapshot: {
  nodeKind: "passage" | "location";
  originLocationId?: string;
  safeAtStart?: boolean;
  monsterNameAtStart?: string;
  monsterLevelAtStart?: number;
}): string {
  if (snapshot.nodeKind === "location") {
    if (snapshot.originLocationId === PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1) {
      return "Сутерени Корчми сьогодні шурхотять дрібним пилом.";
    }

    return "Спуск до Низу сьогодні виглядає майже безпечним.";
  }

  if (snapshot.safeAtStart && !snapshot.monsterNameAtStart) {
    return "Прохід затих: монстри на перерві, пил тимчасово без охорони.";
  }

  const monster = snapshot.monsterNameAtStart
    ? `<b>${escapeHtml(snapshot.monsterNameAtStart)}</b>${snapshot.monsterLevelAtStart ? ` · рівень ${snapshot.monsterLevelAtStart}` : ""}`
    : "місцева тінь";

  return `Десь поруч шарудить ${monster}.`;
}

function presentLootLines(loot: { gold: number; itemGrants: Array<{ name: string; quantity: number }> }): string[] {
  const lines: string[] = [];

  if (loot.gold > 0) {
    lines.push(`💰 Золото: <b>${loot.gold}</b>`);
  }

  for (const grant of loot.itemGrants) {
    lines.push(`🎒 ${escapeHtml(grant.name)}${grant.quantity > 1 ? ` ×${grant.quantity}` : ""}`);
  }

  return lines.length > 0 ? lines : ["Здобич: нічого, але з характером."];
}

function presentSeconds(seconds: number): string {
  const normalized = Math.max(0, Math.ceil(seconds));
  if (normalized < 60) {
    return `${normalized} с`;
  }

  const minutes = Math.ceil(normalized / 60);

  return `${minutes} хв`;
}

function getRemainingSeconds(endsAt: Date): number {
  return Math.max(0, Math.ceil((endsAt.getTime() - Date.now()) / 1000));
}
