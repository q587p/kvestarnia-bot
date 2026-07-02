import type {
  ItemCraftConfirmRepositoryResult,
  ItemCraftPreviewRepositoryResult
} from "../../db/repositories/itemCraftRepository";

export function presentItemCraftPreview(result: ItemCraftPreviewRepositoryResult): string {
  switch (result.state) {
    case "preview":
      return [
        `🧵 <b>Створити ${result.preview.outputItem.name}?</b>`,
        "",
        `Потрібно: <b>${result.preview.recipe.sourceQuantity}</b> × ${result.preview.sourceItem.name}.`,
        `У торбі: <b>${result.preview.availableQuantity}</b>.`,
        "",
        "Корчмар суворо дивиться на вузли й вдає, що це ремесло."
      ].join("\n");
    case "not-enough":
      return [
        "🧵 <b>Матеріалу замало</b>",
        "",
        `Потрібно: <b>${result.preview.recipe.sourceQuantity}</b> × ${result.preview.sourceItem.name}.`,
        `У торбі: <b>${result.preview.availableQuantity}</b>.`
      ].join("\n");
    case "combat-locked":
      return "⚔️ Спершу закінчіть бій. Польова медицина не любить, коли поле б'є у відповідь.";
    case "no-character":
      return "Спершу створіть пригодника через /start.";
    case "locked":
      return "Єгер ще не довіряє вам настільки, щоб видавати інструкції з польової паніки.";
  }
}

export function presentItemCraftResult(result: ItemCraftConfirmRepositoryResult): string {
  switch (result.state) {
    case "crafted":
      return [
        `🧰 <b>${result.outputItem.name} готова.</b>`,
        "",
        `Витрачено: <b>${result.recipe.sourceQuantity}</b> × ${result.sourceItem.name}.`,
        `Залишилось звичайних бинтів: <b>${result.remainingSourceQuantity}</b>.`
      ].join("\n");
    case "not-enough":
      return presentItemCraftPreview(result);
    case "combat-locked":
      return "⚔️ Спершу закінчіть бій. Бинти не люблять працювати під наглядом монстра.";
    case "no-character":
      return "Спершу створіть пригодника через /start.";
    case "locked":
      return "Єгерська дошка ще не підтвердила право на щільну медичну бюрократію.";
  }
}
