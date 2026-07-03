import { findItemCraftRecipeByCode, type ItemCraftRecipeCode } from "../../domain/itemCraft";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "./onboardingCallbackData";

export type ItemCraftCallback =
  | { type: "preview"; recipeCode: ItemCraftRecipeCode }
  | { type: "confirm"; recipeCode: ItemCraftRecipeCode };

export function makeItemCraftPreviewCallbackData(recipeCode: ItemCraftRecipeCode): string {
  return `v1:craft:p:${recipeCode}`;
}

export function makeItemCraftConfirmCallbackData(recipeCode: ItemCraftRecipeCode): string {
  return `v1:craft:ok:${recipeCode}`;
}

export function parseItemCraftCallbackData(data: string): ParseItemCraftCallbackResult {
  if (!data.startsWith("v1:craft:") || Buffer.byteLength(data, "utf8") > TELEGRAM_CALLBACK_DATA_LIMIT) {
    return { ok: false };
  }

  const parts = data.split(":");
  if (parts.length !== 4 || parts[0] !== "v1" || parts[1] !== "craft") {
    return { ok: false };
  }

  const recipe = findItemCraftRecipeByCode(parts[3] ?? "");
  if (!recipe) {
    return { ok: false };
  }

  switch (parts[2]) {
    case "p":
      return { ok: true, value: { type: "preview", recipeCode: recipe.code } };
    case "ok":
      return { ok: true, value: { type: "confirm", recipeCode: recipe.code } };
    default:
      return { ok: false };
  }
}

type ParseItemCraftCallbackResult = { ok: true; value: ItemCraftCallback } | { ok: false };
