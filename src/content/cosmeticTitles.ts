import { achievements, type AchievementDefinition } from "./achievements";

export interface CosmeticTitleDefinition {
  id: string;
  label: string;
}

export const cosmeticTitles = [
  { id: "cosmetic-title.first-ink", label: "Першописець" },
  { id: "cosmetic-title.human-ish-paperproof", label: "Анкетник" },
  { id: "cosmetic-title.dwarf-low-shelf", label: "Низькополичник" },
  { id: "cosmetic-title.elf-offended-accuracy", label: "Ображений естет" },
  { id: "cosmetic-title.bisyny-locked-dictionary", label: "Словниковартовий" },
  { id: "cosmetic-title.drantohor-border-plan", label: "Межовик" },
  { id: "cosmetic-title.domovyk-stove-witness", label: "Запічник" },
  { id: "cosmetic-title.dryland-rusalka-teapot-watch", label: "Чайниковий вартовий" },
  { id: "cosmetic-title.intellectual-orc-reviewer", label: "Рецензент кулака" },
  { id: "cosmetic-title.molfar-soul-pocket-fog", label: "Туманник" },
  { id: "cosmetic-title.warrior-straight-plan", label: "Прямопланник" },
  { id: "cosmetic-title.mage-room-warming", label: "Кімнатогрій" },
  { id: "cosmetic-title.bard-dangerous-couplet", label: "Куплетник" },
  { id: "cosmetic-title.rogue-invoice-vanished", label: "Рахунковий зникник" },
  { id: "cosmetic-title.priest-strict-gaze", label: "Суворий лікар" },
  { id: "cosmetic-title.varenyk-mancer-filling-prophet", label: "Начинковий пророк" },
  { id: "cosmetic-title.bureaucramancer-form-thirteen", label: "Формулярник" },
  { id: "cosmetic-title.ranger-trail-receipt", label: "Слідовий квитантар" },
  { id: "cosmetic-title.kharakternyk-problem-side-eye", label: "Косий характерник" },
  { id: "cosmetic-title.level-two-stool", label: "Табуретник" },
  { id: "cosmetic-title.level-three-witness", label: "Перший свідок" },
  { id: "cosmetic-title.level-five-stick", label: "Палиценосець" },
  { id: "cosmetic-title.level-ten-folder", label: "Текотримач" },
  { id: "cosmetic-title.level-thirteen-clause", label: "Тринадцятий пункт" },
  { id: "cosmetic-title.level-twenty-three-reasons", label: "Двадцять третій пункт" },
  { id: "cosmetic-title.first-puddle-victor", label: "Калюжний переможець" },
  { id: "cosmetic-title.three-monster-protocols", label: "Протоколіст монстрів" },
  { id: "cosmetic-title.thirteen-not-floor", label: "Стійкий підписант" },
  { id: "cosmetic-title.first-problem-clerk", label: "Перший писар" },
  { id: "cosmetic-title.twenty-three-problem-signatures", label: "Підписний підозрювач" },
  { id: "cosmetic-title.forty-two-stamp-reasons", label: "Печатковий резонер" },
  { id: "cosmetic-title.first-mantok-witness", label: "Манатковий свідок" },
  { id: "cosmetic-title.three-mantok-council", label: "Манатковий радник" },
  { id: "cosmetic-title.thirteen-mantok-doubts", label: "Сумнівотримач" },
  { id: "cosmetic-title.first-responsible-bandage", label: "Бинтовий наглядач" },
  { id: "cosmetic-title.ninety-three-responsible-bandages", label: "Бинтовий завгосп" },
  { id: "cosmetic-title.first-bandage-use", label: "Панічний вузляр" },
  { id: "cosmetic-title.four-bandage-uses", label: "Вузловий самозберігач" },
  { id: "cosmetic-title.ninety-three-bandage-uses", label: "Невчорашній бинтар" },
  { id: "cosmetic-title.first-yeger-free-bandage", label: "Єгерський свідок" },
  { id: "cosmetic-title.first-equipped-hook", label: "Гачковий носій" },
  { id: "cosmetic-title.three-equipped-inspection", label: "Інвентарний інспектор" },
  { id: "cosmetic-title.twenty-three-mantok-archive", label: "Манатковий архівар" },
  { id: "cosmetic-title.forty-two-mantok-answer", label: "Відповідальний торбар" },
  { id: "cosmetic-title.ninety-three-mantok-evidence", label: "Доказовий торбар" },
  { id: "cosmetic-title.first-chest-recycler", label: "Скриняр" },
  { id: "cosmetic-title.thirteen-chest-recycles", label: "Скринний технік" },
  { id: "cosmetic-title.first-mantok-sale", label: "Скупниковий клієнт" },
  { id: "cosmetic-title.thirteen-mantok-sales", label: "Скупниковий знайомець" },
  { id: "cosmetic-title.first-level-barter", label: "Манчкінів клієнт" },
  { id: "cosmetic-title.three-level-barter-receipts", label: "Квитанційний рівняр" },
  { id: "cosmetic-title.first-bard-performance", label: "Перший куплетник" },
  { id: "cosmetic-title.thirteen-bard-performances", label: "Куплетний свідок" },
  { id: "cosmetic-title.first-doppelganger-training", label: "Дзеркальний суперник" },
  { id: "cosmetic-title.thirteen-doppelganger-trainings", label: "Дзеркальний завсідник" },
  { id: "cosmetic-title.first-quick-duel", label: "Миттєвий дуелянт" },
  { id: "cosmetic-title.thirteen-quick-duels", label: "Швидкий непорозумілець" },
  { id: "cosmetic-title.first-turnbased-duel", label: "Покроковий дуелянт" },
  { id: "cosmetic-title.three-turnbased-duels", label: "Ходовий стратег" },
  { id: "cosmetic-title.first-barrel-claim", label: "Пінний актор" },
  { id: "cosmetic-title.thirteen-barrel-claims", label: "Бочковий знайомець" },
  { id: "cosmetic-title.first-korchma-round", label: "Кухлевий дипломат" },
  { id: "cosmetic-title.thirteen-korchma-rounds", label: "Кухлевий посол" },
  { id: "cosmetic-title.first-mantok-gift-sent", label: "Дарувальник манаток" },
  { id: "cosmetic-title.thirteen-mantok-gifts-sent", label: "Журнальний дарувальник" },
  { id: "cosmetic-title.first-mantok-gift-received", label: "Обдарований торбар" },
  { id: "cosmetic-title.first-shynok-drink", label: "Шинковий дегустатор" },
  { id: "cosmetic-title.four-shynok-drinks", label: "Напійний радник" },
  { id: "cosmetic-title.first-nyz-search", label: "Низовий порпач" },
  { id: "cosmetic-title.thirteen-nyz-searches", label: "Порпальний знавець" },
  { id: "cosmetic-title.first-search-monster", label: "Зубний шукач" },
  { id: "cosmetic-title.current-nyz-search-map", label: "Закутковий картар" },
  { id: "cosmetic-title.first-hunt-contract", label: "Дошковий мисливець" },
  { id: "cosmetic-title.thirteen-hunt-contracts", label: "Оголошений мисливець" },
  { id: "cosmetic-title.first-three-affairs", label: "Справовий початківець" },
  { id: "cosmetic-title.thirteen-nearby-affairs", label: "Близькосправник" },
  { id: "cosmetic-title.first-affair-complication", label: "Зубатий свідок" },
  { id: "cosmetic-title.three-affair-complications", label: "Кусючий діловод" },
  { id: "cosmetic-title.first-nyz-escalation", label: "Низовий свідок" },
  { id: "cosmetic-title.three-nyz-escalations", label: "Натовповий протоколіст" },
  { id: "cosmetic-title.first-nyz-pressure", label: "Натисковий гайкар" },
  { id: "cosmetic-title.three-nyz-pressures", label: "Ввічливостійкий" },
  { id: "cosmetic-title.first-remort-candle", label: "Свічковий памʼятар" }
] as const satisfies readonly CosmeticTitleDefinition[];

const cosmeticTitleById = new Map<string, CosmeticTitleDefinition>(
  cosmeticTitles.map((title) => [title.id, title])
);

export function resolveActiveCosmeticTitleLabel(
  titleGrantId: string | null | undefined
): string | null {
  if (!titleGrantId) {
    return null;
  }

  return cosmeticTitleById.get(titleGrantId)?.label ?? null;
}

export function validateCosmeticTitleDefinitions(
  definitions: readonly CosmeticTitleDefinition[] = cosmeticTitles
): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const labels = new Set<string>();
  const achievementByGrantId = new Map<string, AchievementDefinition>();

  for (const achievement of achievements) {
    if ("cosmeticTitleGrantId" in achievement && achievement.cosmeticTitleGrantId) {
      achievementByGrantId.set(achievement.cosmeticTitleGrantId, achievement);
    }
  }

  for (const definition of definitions) {
    if (ids.has(definition.id)) {
      errors.push(`Duplicate cosmetic title id: ${definition.id}`);
    }
    ids.add(definition.id);

    if (labels.has(definition.label)) {
      errors.push(`Duplicate cosmetic title label: ${definition.label}`);
    }
    labels.add(definition.label);

    const trimmedLabel = definition.label.trim();
    if (!trimmedLabel) {
      errors.push(`Empty cosmetic title label: ${definition.id}`);
    }

    if (Array.from(trimmedLabel).length > 32) {
      errors.push(`Cosmetic title label is too long: ${definition.id}`);
    }

    if (/[?!.]/u.test(trimmedLabel)) {
      errors.push(`Cosmetic title label uses sentence punctuation: ${definition.id}`);
    }

    if (/\b(?:xp|gold|stat|stats|bonus|power)\b/iu.test(trimmedLabel)) {
      errors.push(`Cosmetic title label uses reward or power wording: ${definition.id}`);
    }

    const grantingAchievement = achievementByGrantId.get(definition.id);
    if (!grantingAchievement) {
      errors.push(`Unknown cosmetic title grant id: ${definition.id}`);
      continue;
    }

    if (trimmedLabel === grantingAchievement.title) {
      errors.push(`Cosmetic title label repeats achievement title: ${definition.id}`);
    }
  }

  for (const achievement of achievements) {
    if (
      achievement.status === "enabled" &&
      "cosmeticTitleGrantId" in achievement &&
      achievement.cosmeticTitleGrantId &&
      !ids.has(achievement.cosmeticTitleGrantId)
    ) {
      errors.push(`Missing cosmetic title label: ${achievement.cosmeticTitleGrantId}`);
    }
  }

  return errors;
}
