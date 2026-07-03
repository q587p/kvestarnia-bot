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
        result.preview.characterClassId === "class.ranger"
          ? "Єгерська вправність може зекономити частину звичайних бинтів під час вузлування."
          : "Для цього класу рецепт витрачає рівно стільки бинтів, скільки написано.",
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
    case "crafted": {
      const savingsLine = result.savedSourceQuantity > 0
        ? `Зекономлено: <b>${result.savedSourceQuantity}</b> × ${result.sourceItem.name}.`
        : result.character.classId === "class.ranger"
          ? "Цього разу вузли були чесні й нічого не зекономили."
          : "Рецепт витратив рівно стільки бинтів, скільки було написано.";
      return [
        `🧰 <b>${result.outputItem.name}: готово.</b>`,
        "",
        `Витрачено: <b>${result.spentSourceQuantity}</b> × ${result.sourceItem.name}.`,
        savingsLine,
        `Залишилось звичайних бинтів: <b>${result.remainingSourceQuantity}</b>.`
      ].join("\n");
    }
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
