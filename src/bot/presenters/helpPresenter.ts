export function presentHelp(includeDevReset: boolean): string {
  const lines = [
    "❔ Довідка Квестарні",
    "/start — створити або показати героя",
    "/hero — герой і прогрес",
    "/profile — те саме, що /hero",
    "/me — те саме, що /hero",
    "/tavern — таверна й малий рейд на бочку",
    "/raid — те саме, що /tavern, поки без групового рейду",
    "/help — довідка"
  ];

  if (includeDevReset) {
    lines.push("/dev_reset_me — скинути свого героя в локальній майстерні");
  }

  lines.push("Великі пригоди ще не працюють: квестодавець шукає окуляри.");

  return lines.join("\n");
}
