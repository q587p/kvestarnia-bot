export interface BestiarySpecialRecord {
  id: string;
  name: string;
  description: string;
  fieldNote: string;
  tags: readonly string[];
}

export const bestiarySpecialRecords = [
  {
    id: "special.friday-barrel",
    name: "Бочка Пінного Міражу",
    description:
      "Не зовсім монстр і не зовсім меблі. Стоїть у корчмі, піниться за розкладом і дуже ображається, коли її називають декором.",
    fieldNote:
      "Рівень у Бочки не записують: вона то пригода, то місцева традиція, то причина, чому корчмар тримає під рукою сухий рушник.",
    tags: ["korchma", "boss"]
  },
  {
    id: "special.big-barrel-brother",
    name: "Старший Брат Бочки",
    description:
      "Коли Бочка вирішує, що самотньої хоробрости забагато, з журналу піднімається Старший Брат і починає дивитися на ватагу як на незаповнену форму.",
    fieldNote:
      "Це окремий рейдовий запис без сталого рівня: сила залежить від заявки, ватаги й того, наскільки голосно кришка сказала «процедура».",
    tags: ["korchma", "boss"]
  }
] as const satisfies readonly BestiarySpecialRecord[];

export function getBestiarySpecialRecord(id: string): BestiarySpecialRecord | undefined {
  return bestiarySpecialRecords.find((record) => record.id === id);
}
