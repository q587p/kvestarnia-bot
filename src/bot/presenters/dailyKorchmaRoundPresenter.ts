import type {
  DailyKorchmaRoundClaimResult,
  DailyKorchmaRoundExistingLookupResult,
  DailyKorchmaRoundLookupResult,
  DailyKorchmaRoundOverviewResult,
  DailyKorchmaRoundSceneLookupResult,
  DailyKorchmaRoundStepResult
} from "../../services/dailyKorchmaRoundService";
import type { DailyKorchmaRoundAction } from "../../content/dailyKorchmaRoundContent";
import { getLocationName } from "../../services/presenceService";
import { escapeHtml } from "./telegramHtml";

export function presentDailyKorchmaRound(result: DailyKorchmaRoundOverviewResult): string {
  if (result.state === "stale-day") {
    return [
      "🧾 Стара ревізійна дощечка",
      "",
      "Цей обхід належить іншому київському дню. Корчмар уже підсунув свіжішу дощечку."
    ].join("\n");
  }

  if (result.state === "no-character") {
    return "Спершу створіть пригодника через /start. Корчмар не видає обхід без людини, яку можна звинуватити в порядку.";
  }

  if (result.state === "level-locked") {
    return [
      "🧾 Корчмарський обхід",
      "",
      `Корчмар ховає ревізійну дощечку до ${result.requiredLevel} рівня. Каже, що здоровий глузд спершу має налякатися.`
    ].join("\n");
  }

  if (result.state === "hp-blocked") {
    return [
      "🧾 Корчмарський обхід",
      "",
      "HP 0. Спершу трохи відновіться: ревізія здорового глузду не підписує лежачих."
    ].join("\n");
  }

  if (result.state === "active-fight") {
    return [
      "🧾 Корчмарський обхід",
      "",
      "Спершу завершіть поточний бій. Корчмар не хоче, щоб підписи мали зуби."
    ].join("\n");
  }

  if (result.state === "pending-barrel") {
    return [
      "🧾 Корчмарський обхід",
      "",
      "Спершу розберіться з Бочкою Пінного Міражу. Вона ревнує до будь-яких інших катастроф."
    ].join("\n");
  }

  if (result.state === "not-issued") {
    return [
      "🧾 Корчмарський обхід",
      "",
      "Корчмар тримає ревізійну дощечку так, ніби вона вже має власну думку.",
      "",
      "Візьмете обхід — дрібні катастрофи розійдуться по корчмі й чекатимуть вас на своїх місцинах.",
      "Не візьмете — локації працюватимуть як завжди, без бухгалтерії здорового глузду."
    ].join("\n");
  }

  const completedCount = result.offer.completedSceneIds.length;
  const status =
    result.state === "completed"
      ? "сьогодні закрито"
      : result.state === "turn-in-ready"
        ? "2/2, Корчмар чекає на підписи"
        : `${completedCount}/2 дрібниць уже не кричать`;

  return [
    "🧾 Корчмарський обхід",
    "",
    "Корчмар видав дощечку «Ревізія здорового глузду». У корчмі три дрібні катастрофи; владнайте будь-які дві там, де вони стоять.",
    "",
    `<b>Стан:</b> ${escapeHtml(status)}.`,
    "",
    ...result.offer.scenes.map((scene) => {
      const done = result.offer.completedSceneIds.includes(scene.id);
      const omitted = result.offer.omittedSceneId === scene.id;
      const mark = done ? "✅" : omitted ? "—" : "○";
      const suffix = omitted ? " — Не сьогоднішня катастрофа" : "";

      return `${mark} ${scene.icon} <b>${escapeHtml(getLocationName(scene.locationId))}</b>: ${escapeHtml(scene.title)}${suffix}`;
    }),
    "",
    result.state === "turn-in-ready"
      ? "Поверніться до <i>столу зі справами</i> й здайте обхід Корчмарю."
      : result.state === "completed"
        ? "Корчмар уже поставив сьогоднішню галочку й виглядає підозріло організованим."
        : "Місцини вказані в списку. Пройдіться корчмою: завершити дрібницю можна тільки на місці."
  ].join("\n");
}

export function presentDailyKorchmaRoundScene(
  result: DailyKorchmaRoundSceneLookupResult,
  options: { mode?: "compact" | "help" } = {}
): string {
  if (result.state !== "scene") {
    return presentDailyKorchmaRoundFallback(result);
  }

  const canChooseAction = !result.locked && !result.alreadyCompleted;

  const suffix = result.locked
    ? "\n\nЦе вже Не сьогоднішня катастрофа. Дощечка не дає мутувати третій пункт."
    : result.alreadyCompleted
      ? "\n\nЦей пункт уже має підпис. Можна лише перечитати й підозріло кивнути."
      : "";

  if (options.mode === "help" && canChooseAction && hasActionDescriptions(result.scene.actions)) {
    return [
      `${result.scene.icon} ${escapeHtml(result.scene.title)}`,
      "",
      `<b>${escapeHtml(getLocationName(result.scene.locationId))}</b>`,
      escapeHtml(result.scene.hook),
      "",
      "Детальніше про дії:",
      "",
      ...presentDailyKorchmaRoundActionHelp(result.scene.actions)
    ].join("\n");
  }

  return [
    `${result.scene.icon} ${escapeHtml(result.scene.title)}`,
    "",
    `<b>${escapeHtml(getLocationName(result.scene.locationId))}</b>`,
    escapeHtml(result.scene.hook),
    ...(suffix ? [suffix] : []),
    ...(canChooseAction ? ["", "<i>Оберіть одну дію. Вона спрацює тільки тут:</i>", ...result.scene.actions.map((action) => escapeHtml(action.label))] : [])
  ].join("\n");
}

function hasActionDescriptions(actions: readonly DailyKorchmaRoundAction[]): boolean {
  return actions.some((action) => Boolean(action.description));
}

function presentDailyKorchmaRoundActionHelp(
  actions: readonly DailyKorchmaRoundAction[]
): string[] {
  return actions.flatMap((action, index) => [
    escapeHtml(action.label),
    action.description ? `<i>${escapeHtml(action.description)}</i>` : "<i>Коротка дія без додаткових пояснень.</i>",
    ...(index === actions.length - 1 ? [] : [""])
  ]);
}

export function presentDailyKorchmaRoundStep(result: DailyKorchmaRoundStepResult): string {
  if (result.state === "step-completed" || result.state === "step-replayed") {
    return [
      `${result.scene.icon} ${escapeHtml(result.scene.title)}`,
      "",
      escapeHtml(result.action.outcome),
      "",
      result.completedCount >= 2
        ? "2/2. Дві катастрофи отримали підписи; третя стала «Не сьогоднішня катастрофа»."
        : "1/2. Дощечка вдає, що це плановий порядок."
    ].join("\n");
  }

  if (result.state === "wrong-location") {
    return [
      "🧾 Корчмарський обхід",
      "",
      `Ця дрібниця живе в місцині «${escapeHtml(getLocationName(result.scene.locationId))}». Зараз ви в місцині «${escapeHtml(result.currentLocationName)}».`,
      "Кнопка може провести туди, але підпис ставиться тільки на місці."
    ].join("\n");
  }

  if (result.state === "third-locked") {
    return [
      "🧾 Не сьогоднішня катастрофа",
      "",
      `${result.scene.icon} ${escapeHtml(result.scene.title)} вже не мутує: два підписи зібрано, дощечка закрилась.`
    ].join("\n");
  }

  if (result.state === "stale-life") {
    return "Ця картка лишилась із минулого життя. Відкрийте сьогоднішній обхід заново.";
  }

  return presentDailyKorchmaRoundFallback(result);
}

export function presentDailyKorchmaRoundClaim(result: DailyKorchmaRoundClaimResult): string {
  if (result.state === "reward-claimed" || result.state === "reward-replayed") {
    return [
      "🧾 Корчмарський обхід здано",
      "",
      "Корчмар прийняв два підписи, подивився на третю катастрофу й вирішив не провокувати.",
      "",
      "Отримано:",
      `<b>+${result.reward.xp} XP</b>`,
      `<b>+${result.reward.gold} золота</b>`
    ].join("\n");
  }

  if (result.state === "not-ready") {
    return [
      "🧾 Корчмарський обхід",
      "",
      "Корчмар показує на порожнє місце для другого підпису. Спершу владнайте ще одну дрібницю."
    ].join("\n");
  }

  if (result.state === "wrong-location") {
    return [
      "🧾 Корчмарський обхід",
      "",
      `Здати обхід можна тільки біля Столу зі справами. Зараз ви в місцині «${escapeHtml(result.currentLocationName)}».`
    ].join("\n");
  }

  if (result.state === "stale-life") {
    return "Ця здача лишилась із минулого життя. Відкрийте сьогоднішній обхід заново.";
  }

  return presentDailyKorchmaRoundFallback(result);
}

function presentDailyKorchmaRoundFallback(
  result:
    | DailyKorchmaRoundLookupResult
    | DailyKorchmaRoundExistingLookupResult
    | DailyKorchmaRoundSceneLookupResult
    | DailyKorchmaRoundStepResult
    | DailyKorchmaRoundClaimResult
): string {
  if (result.state === "stale-day") {
    return [
      "🧾 Стара ревізійна дощечка",
      "",
      "Цей обхід належить іншому київському дню. Корчмар уже підсунув свіжішу дощечку."
    ].join("\n");
  }

  if (result.state === "unknown-scene" || result.state === "unknown-action") {
    return "🧾 Цей пункт не вписаний у сьогоднішню дощечку. Відкрийте обхід заново.";
  }

  if (
    result.state === "no-character" ||
    result.state === "not-issued" ||
    result.state === "level-locked" ||
    result.state === "hp-blocked" ||
    result.state === "active-fight" ||
    result.state === "pending-barrel" ||
    result.state === "ready" ||
    result.state === "turn-in-ready" ||
    result.state === "completed"
  ) {
    return presentDailyKorchmaRound(result);
  }

  return "🧾 Корчмарська дощечка розгубилась. Відкрийте обхід заново.";
}
