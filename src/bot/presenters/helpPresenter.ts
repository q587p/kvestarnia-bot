export function presentHelp(includeDevReset: boolean): string {
  const lines = [
    "❔ Довідка Квестарні",
    "/start — створити або показати героя",
    "/hero (/profile, /me) — герой і прогрес",
    "/tavern (/raid) — таверна й малий рейд",
    "/adventure (/quest) — пригода з підозрілою шаурмою",
    "/fight (/hunt) — перша безпечна сутичка",
    "/inventory (/items, /bag) — манатки",
    "/guild — ґільдії ще пишуть статут",
    "/restart — почати героя з початку",
    "/version, /news — версія й новини",
    "/help — довідка"
  ];

  if (includeDevReset) {
    lines.push("/dev_reset_me — скинути свого героя в локальній майстерні");
  }

  lines.push("Повний бій, спорядження й ґільдії ще готуються.");

  return lines.join("\n");
}
