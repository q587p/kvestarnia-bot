export function presentHelp(includeDevReset: boolean): string {
  const lines = [
    "❔ Довідка Квестарні",
    "/start — створити або показати героя",
    "/hero — герой і прогрес",
    "/profile — те саме, що /hero",
    "/me — те саме, що /hero",
    "/help — довідка"
  ];

  if (includeDevReset) {
    lines.push("/dev_reset_me — скинути свого героя в локальній майстерні");
  }

  lines.push("Пригоди ще не працюють: квестодавець шукає окуляри.");

  return lines.join("\n");
}

export function presentTavernPlaceholder(): string {
  return "🍺 Таверна гуде, але квестодавець ще шукає свої окуляри. Наступний PR — пригоди.";
}
