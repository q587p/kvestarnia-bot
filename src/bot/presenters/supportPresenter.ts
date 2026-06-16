import type { SupportJarStatus } from "../../config/env";

const NO_GAMEPLAY_ADVANTAGE_LINE =
  "Підтримка не дає XP, золота, луту, манаток, рівнів, бойової сили, прогресу або доступу до фіч.";

export function presentSupportJar(
  supportJarUrl: string | undefined,
  supportJarStatus: SupportJarStatus | undefined
): string {
  if (!supportJarUrl) {
    return [
      "🫙 Банка підтримки Квестарні",
      "",
      "Корчмар уже поставив Банку на стійку, але посилання ще прибивають до дошки.",
      "",
      "Квестарня безкоштовна й не продає силу, лут або прогрес. Коли Банка відчиниться, тут буде добровільне посилання для підтримки сервера, текстів і корчмарської інфраструктури.",
      "",
      NO_GAMEPLAY_ADVANTAGE_LINE
    ].join("\n");
  }

  return [
    "🫙 Банка підтримки Квестарні",
    "",
    "Квестарня безкоштовна: жодної купівлі сили, луту, золота чи прогресу.",
    "",
    "Якщо хочете підтримати розробку — можна добровільно підкинути монет у Банку. Вона допомагає оплачувати сервер, токени для Кодексу, тексти, редактуру, коректуру й інші речі, через які корчма не розвалюється між оновленнями.",
    "",
    NO_GAMEPLAY_ADVANTAGE_LINE,
    "",
    ...presentSupportJarStatus(supportJarStatus),
    "",
    `Підтримати: ${supportJarUrl}`
  ].join("\n");
}

export function presentSupportThanks(): string {
  return [
    "🍺 Корчмар піднімає подячний кухоль.",
    "",
    "Якщо ви тут після поповнення Банки Квестарні — дякуємо. Ваш внесок допомагає тримати корчму живою: сервер, токени для Кодексу, тексти, редактура, коректура й інші речі, які корчмар називає «та воно саме працює».",
    "",
    NO_GAMEPLAY_ADVANTAGE_LINE,
    "",
    "+1000 до настрою корчми",
    "",
    "Ефект косметичний. Піна справжня настільки, наскільки це дозволяє Telegram."
  ].join("\n");
}

function presentSupportJarStatus(status: SupportJarStatus | undefined): string[] {
  const lines =
    status?.currentUah === undefined
      ? ["Стан Банки видно за посиланням."]
      : [`У Банці зараз: ${formatUah(status.currentUah)} грн`];

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
