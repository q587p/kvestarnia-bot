import type { SupportBarrelStatus } from "../../config/env";

const NO_GAMEPLAY_ADVANTAGE_LINE =
  "Підтримка не дає XP, золота, луту, манаток, рівнів, бойової сили, прогресу або доступу до фіч.";

export function presentSupportBarrel(
  supportBarrelUrl: string | undefined,
  supportBarrelStatus: SupportBarrelStatus | undefined
): string {
  if (!supportBarrelUrl) {
    return [
      "🫙 Бочка підтримки Квестарні",
      "",
      "Корчмар уже поставив Бочку на стійку, але посилання ще прибивають до дошки.",
      "",
      "Квестарня безкоштовна й не продає силу, лут або прогрес. Коли Бочка відчиниться, тут буде добровільне посилання для підтримки сервера, текстів і корчмарської інфраструктури.",
      "",
      NO_GAMEPLAY_ADVANTAGE_LINE
    ].join("\n");
  }

  return [
    "🫙 Бочка підтримки Квестарні",
    "",
    "Квестарня безкоштовна: жодної купівлі сили, луту, золота чи прогресу.",
    "",
    "Якщо хочете підтримати розробку — можна добровільно підкинути монет у Бочку. Вона допомагає оплачувати сервер, токени для Кодексу, тексти, редактуру, коректуру й інші речі, через які корчма не розвалюється між оновленнями.",
    "",
    NO_GAMEPLAY_ADVANTAGE_LINE,
    "",
    ...presentSupportBarrelStatus(supportBarrelStatus),
    "",
    `Підтримати: ${supportBarrelUrl}`
  ].join("\n");
}

export function presentBarrelThanks(): string {
  return [
    "🍺 Бочка вдячно булькнула.",
    "",
    "Якщо ви тут після поповнення Бочки Квестарні — дякуємо. Ваш внесок допомагає тримати корчму живою: сервер, токени для Кодексу, тексти, редактура, коректура й інші речі, які корчмар називає «та воно саме працює».",
    "",
    NO_GAMEPLAY_ADVANTAGE_LINE,
    "",
    "Корчмар просто ставить вам Тост із Бочки:",
    "+1000 до настрою корчми",
    "",
    "Ефект косметичний. Піна справжня настільки, наскільки це дозволяє Telegram."
  ].join("\n");
}

function presentSupportBarrelStatus(status: SupportBarrelStatus | undefined): string[] {
  const lines =
    status?.currentUah === undefined
      ? ["Стан Банки видно за посиланням."]
      : [`У Бочці зараз: ${formatUah(status.currentUah)} грн`];

  if (status?.goalUah !== undefined) {
    lines.push(`Ціль: ${formatUah(status.goalUah)} грн`);
  }

  if (status?.updatedAt) {
    lines.push(`Оновлено вручну: ${status.updatedAt}`);
  }

  return lines;
}

function formatUah(amount: number): string {
  return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}
