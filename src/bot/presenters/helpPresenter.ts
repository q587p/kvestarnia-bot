export function presentHelp(includeDevReset: boolean): string {
  const lines = [
    "❔ Довідка Квестарні",
    "/start — створити або показати героя",
    "/hero — герой і прогрес",
    "/profile — те саме, що /hero",
    "/me — те саме, що /hero",
    "/tavern — таверна й малий рейд на бочку",
    "/raid — те саме, що /tavern, поки без групового рейду",
    "/adventure — пригода з підозрілою шаурмою",
    "/quest — те саме, що /adventure",
    "/fight — перша безпечна сутичка",
    "/hunt — те саме, що /fight",
    "/inventory — манатки ще шиють кишені",
    "/guild — ґільдії ще пишуть статут",
    "/restart — видалити поточного героя і почати з початку",
    "/version — поточна версія Квестарні",
    "/news — останні новини й архів",
    "/help — довідка"
  ];

  if (includeDevReset) {
    lines.push("/dev_reset_me — скинути свого героя в локальній майстерні");
  }

  lines.push("Повний бій і манатки ще не працюють: квестодавець бере розгін.");

  return lines.join("\n");
}
