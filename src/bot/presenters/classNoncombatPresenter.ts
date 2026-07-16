import type {
  ClassNoncombatOpenResult,
  PriestBlessResult,
  PriestHealResult,
  RoguePickpocketResult,
  VarenykSatedPreviewResult,
  VarenykSatedResult
} from "../../services/classNoncombatService";
import type { PriestBlessingRecord } from "../../db/repositories/classNoncombatRepository";
import { presentCharacterDisplayName } from "./characterDisplay";
import { presentManaSpentLine } from "./resourcePresenter";
import { escapeHtml } from "./telegramHtml";
import { presentActiveVarenykSatedBuff } from "./varenykSatedPresenter";
import { getVarenykSatedPeriodicRecovery } from "../../domain/noncombat/varenykSatedSupport";

export function presentClassNoncombatOpen(result: ClassNoncombatOpenResult): string {
  if (result.state === "no-character") {
    return "Спершу створіть пригодника через /start. Кишені й милосердя не працюють без біографії.";
  }

  if (result.state === "not-eligible") {
    return [
      result.character.classId === "class.priest"
        ? "✨ <b>Жрецька поміч ще вчиться не плутати кадило з чайником</b>"
        : result.character.classId === "class.varenyk-mancer"
          ? "🍽️ <b>Вареникова підтримка ще не дістала великої миски</b>"
          : "🗡️ <b>Тиха кишеня ще не отримала службовий дозвіл</b>",
      "",
      `Класова дія відкривається з рівня ${result.requiredLevel}.`
    ].join("\n");
  }

  const lines: Array<string | null> = result.actorBlocked
    ? [
        result.mode === "priest"
          ? "✨ <b>Жрецька поміч</b>"
          : result.mode === "varenyk"
            ? "🍽️ <b>Нагодувати</b>"
            : "🗡️ <b>Тиха кишеня</b>",
        "",
        `📍 ${escapeHtml(result.locationName)}`,
        result.mode === "priest" || result.mode === "varenyk"
          ? `Мана: <b>${result.character.manaCurrent}/${result.character.manaMax}</b>.`
          : null,
        result.mode === "priest"
          ? "⚕️ Лікування: недоступне під час бою або рейду."
          : result.mode === "varenyk"
            ? "🍽️ Годування: недоступне під час бою або іншої пригодницької метушні."
            : "🕯️ Спроба: недоступна під час бою або рейду.",
        result.mode === "priest"
          ? "✨ Благословення: недоступне під час бою або рейду."
          : null,
        "",
        result.mode === "varenyk"
          ? "Спершу завершіть активну пригоду, бій або рейд. Тоді оновіть картку, і Корчма знову дасть кнопки."
          : "Спершу завершіть бій або рейд. Тоді оновіть картку, і Корчма знову дасть кнопки."
      ]
    : result.mode === "priest"
    ? [
        "✨ <b>Жрецька поміч</b>",
        "",
        `📍 ${escapeHtml(result.locationName)}`,
        `Мана: <b>${result.character.manaCurrent}/${result.character.manaMax}</b>. Лікування бере ману, не бинти.`,
        "⚕️ Лікування: без відпочинку, доки вистачає мани.",
        "✨ Благословення: без загального відпочинку; повтор тієї самої цілі має паузу.",
        "",
        result.targets.length > 0
          ? "Оберіть себе або когось активного поруч:"
          : "Поруч нікого активного немає, але себе можна підтримати без черги."
      ]
    : result.mode === "rogue"
    ? [
        "🗡️ <b>Тиха кишеня</b>",
        "",
        `📍 ${escapeHtml(result.locationName)}`,
        "",
        "Ризик малий не буває: можна нічого не знайти, засвітитись або дуже невдало зустріти чужий лікоть.",
        ...presentRogueOtherTargetsLines(result.roguePickpocketCooldownAvailableAt)
      ]
    : [
        "🍽️ <b>Нагодувати</b>",
        "",
        `📍 ${escapeHtml(result.locationName)}`,
        `Мана: <b>${result.character.manaCurrent}/${result.character.manaMax}</b>.`,
        result.varenykPlan
          ? `Зараз вистачає на миску за <b>${result.varenykPlan.manaCost} мани</b>.`
          : "Навіть найменша миска просить 8 мани.",
        "",
        "Оберіть, кому вручити теплу аргументацію в тісті."
      ];

  if (!result.actorBlocked && result.mode === "priest") {
    const waitLines = presentPriestBlessWaitLines(result);
    if (waitLines.length > 0) {
      lines.push("", ...waitLines);
    }
  }

  if (!result.actorBlocked && result.mode === "rogue") {
    const availableTargets = result.targets.filter((target) => target.canRoguePickpocket);
    const attemptedLines = presentRogueAttemptedLines(result);
    if (attemptedLines.length > 0) {
      lines.push("", ...attemptedLines);
    }
    if (availableTargets.length > 0) {
      lines.push("", "Оберіть активну ціль поруч:");
    }
    if (availableTargets.length === 0 && result.targets.length === 0) {
      lines.push("", "Активних цілей поруч немає. Кишені теж мають графік роботи.");
    } else if (
      availableTargets.length === 0 &&
      !result.roguePickpocketCooldownAvailableAt
    ) {
      lines.push("", "Нових кишень поруч немає. Старі записи Корчма вже сховала до завтра.");
    }
  }
  if (!result.actorBlocked && result.mode === "varenyk") {
    const waitLines = presentVarenykStatusAndWaitLines(result);
    if (waitLines.length > 0) {
      lines.push("", ...waitLines);
    }
  }
  return lines.filter((line): line is string => line !== null).join("\n");
}

export function presentVarenykSatedPreview(result: VarenykSatedPreviewResult): string {
  if (result.state === "blocked") {
    return presentBlocked("🍽️", "Миска не дійшла", result.reason, result.availableAt);
  }
  const self = result.targetTelegramUserId === null;
  const periodicRecovery = getVarenykSatedPeriodicRecovery(result.plan.rank);
  return [
    "🍽️ <b>Підтвердити годування?</b>",
    "",
    `Ціль: <b>${self ? "ви" : escapeHtml(result.target.name)}</b>.`,
    "",
    `Точна ціна: <b>${result.plan.manaCost} мани</b>.`,
    `Одразу до <b>+${result.plan.immediateHp} HP</b>.`,
    `Далі <b>+${periodicRecovery.hp} HP і +${periodicRecovery.mana} ${periodicRecovery.mana === 1 ? "мана" : "мани"}</b> після повної хвилини поза боєм або завершення бойового обміну (кожен забирає хвилину дії).`,
    "",
    `😋 «Ситий»: <b>${result.durationMinutes} хв</b> · ваша нова миска для цієї цілі через <b>${result.recipientWaitMinutes} хв</b>.`,
    "",
    "Вареники вже пораховані. Відступити ще не соромно."
  ].filter((line): line is string => line !== null).join("\n");
}

export function presentVarenykSatedResult(result: VarenykSatedResult): string {
  if (result.state === "blocked") {
    return presentBlocked("🍽️", "Годування не склалося", result.reason, result.availableAt);
  }
  const self = result.action.actorTelegramUserId === result.action.targetTelegramUserId;
  const now = Date.now();
  const timingLines = result.action.expiresAt.getTime() > now
    ? [
        "",
        presentSatedActiveStatusLine(result.action.expiresAt, result.action.rank),
        "",
        `Ви зможете нагодувати цю ціль знову <b>через ${formatRemaining(result.action.availableAt)}</b>.`
      ]
    : result.action.availableAt.getTime() > now
      ? [`Ви зможете нагодувати цю ціль знову <b>через ${formatRemaining(result.action.availableAt)}</b>.`]
      : ["Ви знову можете нагодувати цю ціль."];
  return [
    result.created ? "😋 <b>Ситий</b>" : "🧾 <b>Та сама миска вже врахована</b>",
    "",
    self
      ? "Вареник-мант нагодував себе. Кухонна етика знизала плечима, але зарахувала."
      : `<b>${escapeHtml(result.action.actorName)}</b> нагодував <b>${escapeHtml(result.action.targetName)}</b>. Вареники не ставили зайвих питань.`,
    "",
    result.action.immediateHpRestored > 0
      ? presentSatedRecoveryLine(result.action.immediateHpRestored, 0)
      : "HP уже повне, зате стан акуратно загорнутий.",
    ...timingLines,
    "",
    presentManaSpentLine(result.action.manaCost)
  ].join("\n");
}

export function presentVarenykSatedTargetNotification(
  result: Extract<VarenykSatedResult, { state: "completed" }>
): string {
  return [
    "😋 <b>Вас нагодували</b>",
    "",
    `<b>${escapeHtml(result.action.actorName)}</b> передав вам вареники. Корчма визнала це турботою.`,
    "",
    result.action.immediateHpRestored > 0
      ? presentSatedRecoveryLine(result.action.immediateHpRestored, 0)
      : "HP уже повне. Вареники вирішили працювати на перспективу.",
    "",
    presentSatedActiveStatusLine(result.action.expiresAt, result.action.rank)
  ].join("\n");
}

export function presentPriestHealResult(result: PriestHealResult): string {
  if (result.state === "blocked") {
    return presentBlocked(
      "⚕️",
      presentPriestHealBlockedTitle(result.reason),
      result.reason,
      result.availableAt,
      result.blessing
    );
  }

  const targetSelf = result.action.actorTelegramUserId === result.action.targetTelegramUserId;
  return [
    "⚕️ <b>Лікування спрацювало</b>",
    "",
    targetSelf
      ? "Жрець приклав ману до себе. Мана трохи обурилась, але виконала обов’язок."
      : `${presentCharacterDisplayName(result.actor)} полікував ${presentCharacterDisplayName(result.target, { boldName: false })}.`,
    `❤️ HP: <b>+${result.action.healAmount}</b> · тепер <b>${result.target.hpCurrent}/${result.target.hpMax}</b>.`,
    presentManaSpentLine(result.action.manaCost)
  ].join("\n");
}

export function presentPriestBlessResult(result: PriestBlessResult): string {
  if (result.state === "blocked") {
    return presentBlocked(
      "✨",
      presentPriestBlessBlockedTitle(result.reason),
      result.reason,
      result.availableAt,
      result.blessing
    );
  }

  const targetSelf = result.action.actorTelegramUserId === result.action.targetTelegramUserId;
  return [
    "✨ <b>Благословення тримається</b>",
    "",
    targetSelf
      ? "Жрець благословив себе. Корчма це записала як самодогляд із кадилом."
      : `${presentCharacterDisplayName(result.actor)} благословив ${presentCharacterDisplayName(result.target)}.`,
    "",
    `Стан діє ще: <b>${formatRemaining(result.blessing.expiresAt)}</b>.`,
    `Бонус: <b>+${normalizeBlessingBonus(result.blessing.bonusAmount)} ${presentBlessingStatLabel(result.blessing)}</b>. Видно в персонажі поруч із бафами.`,
    "",
    presentManaSpentLine(result.action.manaCost)
  ].join("\n");
}

export function presentRoguePickpocketResult(result: RoguePickpocketResult): string {
  if (result.state === "blocked") {
    if (result.reason === "cooldown") {
      return presentRogueCooldownBlocked(result.availableAt);
    }

    return presentBlocked("🗡️", "Кишеня не піддалася", result.reason, result.availableAt);
  }

  const replayLines = result.created ? [] : ["", "Цей запис уже зафіксовано: повтор не перекидає долю."];
  const outcome = result.attempt.outcome;
  const body = outcome === "clean-success"
    ? `Чисто. У протоколі з’явилось <b>${result.attempt.stolenGold}</b> золота, і навіть протяг соромиться.`
    : outcome === "noticed-success"
      ? `Вийшло, але не зовсім тихо: <b>${result.attempt.stolenGold}</b> золота змінило кишеню.`
      : outcome === "empty"
        ? "Нічого. Кишеня або порожня, або надто добре вихована."
        : outcome === "noticed-failure"
          ? "Не вийшло. Ціль щось відчула, а злодій отримав досвід у жанрі «ой»."
          : "Дуже невдало. Чужий лікоть пояснив техніку переконливіше за підручник.";

  return [
    "🗡️ <b>Тиха кишеня</b>",
    "",
    `Ціль: ${presentCharacterDisplayName(result.target)}`,
    "",
    body,
    ...(outcome === "caught-badly" ? ["", "HP злодія: <b>0</b>."] : []),
    "",
    `Наступна спроба: <i>${formatRemaining(result.attempt.cooldownAvailableAt)}</i>.`,
    ...replayLines
  ].join("\n");
}

function presentRogueCooldownBlocked(availableAt?: Date): string {
  return [
    "🗡️ <b>Пальці ще відсапуються</b>",
    "",
    availableAt
      ? `Після попередньої кишенькової пригоди треба зачекати ще <b>${formatRemaining(availableAt)}</b>.`
      : "Після попередньої кишенькової пригоди пальцям треба трохи відсапатись."
  ].join("\n");
}

export function presentPriestHealTargetNotification(result: Extract<PriestHealResult, { state: "completed" }>): string {
  return [
    "⚕️ <b>Вас полікували</b>",
    "",
    `${presentCharacterDisplayName(result.actor)} полікував вас без бинтів, зате з маною.`,
    `❤️ HP: <b>+${result.action.healAmount}</b> · тепер <b>${result.target.hpCurrent}/${result.target.hpMax}</b>.`
  ].join("\n");
}

export function presentPriestBlessTargetNotification(result: Extract<PriestBlessResult, { state: "completed" }>): string {
  return [
    "✨ <b>Вас благословили</b>",
    "",
    `${presentCharacterDisplayName(result.actor)} благословив вас. Корчма зробила вигляд, що це планувала.`,
    "",
    `Стан діє ще: <b>${formatRemaining(result.blessing.expiresAt)}</b>.`,
    `Бонус: <b>+${normalizeBlessingBonus(result.blessing.bonusAmount)} ${presentBlessingStatLabel(result.blessing)}</b>.`
  ].join("\n");
}

export function presentRoguePickpocketTargetNotification(result: Extract<RoguePickpocketResult, { state: "completed" }>): string | null {
  if (!result.created) {
    return null;
  }

  const outcome = result.attempt.outcome;
  if (outcome === "clean-success" && result.attempt.stolenGold > 0) {
    return [
      "🪙 <b>Кишеня стала легшою</b>",
      "",
      `Зникло <b>${result.attempt.stolenGold}</b> золота. Корчма підозрює протяг, але протяг мовчить.`
    ].join("\n");
  }

  if (outcome === "noticed-success" && result.attempt.stolenGold > 0) {
    return [
      "🪙 <b>Кишеня подала скаргу</b>",
      "",
      `Ви помітили успішну крадіжку: ${presentCharacterDisplayName(result.actor)} був надто близько, а <b>${result.attempt.stolenGold}</b> золота вже ні.`
    ].join("\n");
  }

  if (outcome === "noticed-failure") {
    return [
      "🗡️ <b>Біля кишені хтось крутився</b>",
      "",
      `${presentCharacterDisplayName(result.actor)} зробив невдалу спробу виглядати частиною меблів. Золото на місці.`
    ].join("\n");
  }

  if (outcome === "caught-badly") {
    return [
      "🗡️ <b>Кишеня перемогла</b>",
      "",
      `${presentCharacterDisplayName(result.actor)} поліз не туди й упав до <b>0 HP</b>. Золото на місці.`
    ].join("\n");
  }

  return null;
}

function presentBlocked(
  icon: string,
  title: string,
  reason: string,
  availableAt?: Date,
  blessing?: PriestBlessingRecord
): string {
  const detail = (() => {
    switch (reason) {
      case "no-character":
        return "Спершу створіть пригодника через /start.";
      case "target-not-found":
      case "target-inactive":
        return "Ціль уже не стоїть активною поруч.";
      case "self-target":
        return "Себе обчистити не можна. Бухгалтерія й так плаче.";
      case "not-priest":
        return "Це техніка жерця.";
      case "not-rogue":
        return "Це техніка злодія.";
      case "not-varenyk-mancer":
        return "Це техніка Вареник-манта.";
      case "level-locked":
        return "Класова дія відкривається з 3 рівня.";
      case "target-level-locked":
        return "Новачків ця техніка не чіпає.";
      case "actor-remort-mismatch":
      case "target-remort-mismatch":
      case "stale":
        return "Кнопка застаріла. Оновіть «Хто поруч» і спробуйте з нового рядка.";
      case "wrong-location":
        return "Корчемна географія змістилася: ви вже не в одній локації.";
      case "actor-blocked":
        return icon === "🍽️"
          ? "Спершу завершіть активну пригоду, бій або рейд. Миска почекає без образ."
          : "Спершу завершіть бій або рейд. Жрецька поміч не лізе поперед черги.";
      case "target-blocked":
        return icon === "🍽️"
          ? "Ціль зараз у бою, рейді або іншій пригоді. Вареники не лізуть у чужий хід."
          : "Ціль зараз зайнята боєм або рейдом. Допомога дочекається вільного віконця.";
      case "actor-defeated":
        return icon === "🍽️"
          ? "При 0 HP годувати не виходить. Спершу поверніться до тями."
          : "При 0 HP кишені бачать вас першими.";
      case "target-defeated":
        return "При 0 HP вареники не воскресають. Спершу потрібне звичайне повернення до тями.";
      case "full-hp":
        return "HP уже повне. Мана лишається на місці.";
      case "insufficient-mana":
        return icon === "🍽️"
          ? "Навіть найменша миска просить 8 мани."
          : "Мани не вистачає. Жрець суворо дивиться на порожню шкалу.";
      case "already-sated":
        return availableAt
          ? `Стан «Ситий» ще діє ${formatRemaining(availableAt)}. Нову миску поки не ставимо.`
          : "Стан «Ситий» ще діє. Нову миску поки не ставимо.";
      case "already-blessed":
        return blessing
          ? `На цілі вже тримається благословення ще ${formatRemaining(blessing.expiresAt)}.`
          : "На цілі вже тримається таке благословення.";
      case "cooldown":
        return availableAt
          ? `Техніка відсапується ще ${formatRemaining(availableAt)}.`
          : "Техніка ще відсапується.";
      case "target-cooldown":
        return availableAt
          ? icon === "✨"
            ? `Цю саму ціль можна благословити знову через ${formatRemaining(availableAt)}.`
            : `Ви зможете нагодувати цю ціль знову через ${formatRemaining(availableAt)}.`
          : icon === "✨"
            ? "Ця ціль ще пам’ятає благословення."
            : "Ваша наступна миска для цієї цілі ще не готова.";
      case "pair-daily-used":
        return "Цього пригодника сьогодні вже пробували. Наступна така спроба — завтра; іншу ціль можна після відпочинку пальців.";
      default:
        return "Протокол відмовився робити вигляд, що це працює.";
    }
  })();

  return [`${icon} <b>${title}</b>`, "", detail].join("\n");
}

function presentBlessingStatLabel(blessing: PriestBlessingRecord): string {
  switch (blessing.bonusStat) {
    case "strength":
      return "Сили";
    case "dexterity":
      return "Спритності";
    case "intelligence":
      return "Розуму";
    case "charisma":
      return "Харизми";
    case "luck":
    default:
      return "Вдачі";
  }
}

function normalizeBlessingBonus(value: number): number {
  return value > 0 ? Math.floor(value) : 1;
}

function presentPriestHealBlockedTitle(
  reason: Extract<PriestHealResult, { state: "blocked" }>["reason"]
): string {
  switch (reason) {
    case "full-hp":
      return "Лікування не потрібне";
    case "insufficient-mana":
      return "Бракує мани для лікування";
    default:
      return "Лікування не відбулося";
  }
}

function presentPriestBlessBlockedTitle(
  reason: Extract<PriestBlessResult, { state: "blocked" }>["reason"]
): string {
  switch (reason) {
    case "already-blessed":
      return "Благословення вже тримається";
    case "cooldown":
      return "Благословення відсапується";
    case "target-cooldown":
      return "Ціль ще пам’ятає благословення";
    case "insufficient-mana":
      return "Бракує мани для благословення";
    default:
      return "Благословення не лягло";
  }
}

function presentPriestBlessWaitLines(
  result: Extract<ClassNoncombatOpenResult, { state: "ready" }>
): string[] {
  const lines: string[] = [];
  if (result.priestSelfBlessAvailableAt) {
    lines.push(`✨ Ви: повтор через ${formatRemaining(result.priestSelfBlessAvailableAt)}.`);
  }

  for (const target of result.targets.filter((candidate) => candidate.priestBlessAvailableAt)) {
    lines.push(`✨ ${escapeHtml(target.name)}: повтор через ${formatRemaining(target.priestBlessAvailableAt!)}.`);
  }

  return lines;
}

function presentRogueAttemptedLines(
  result: Extract<ClassNoncombatOpenResult, { state: "ready" }>
): string[] {
  const attempted = result.targets.filter((target) => target.rogueAttemptedToday);
  if (attempted.length === 0) {
    return [];
  }

  return [
    "Сьогодні вже були:",
    ...attempted.map((target) => `🗓️ ${escapeHtml(target.name)} — цю кишеню знову тільки завтра.`)
  ];
}

function presentRogueOtherTargetsLines(availableAt: Date | null): string[] {
  return availableAt
    ? ["", `🕯️ Нова спроба по іншій цілі: пальці відсапуються ще ${formatRemaining(availableAt)}.`]
    : [];
}

function presentVarenykStatusAndWaitLines(
  result: Extract<ClassNoncombatOpenResult, { state: "ready" }>
): string[] {
  const blocks: string[][] = [];
  const selfLines: string[] = [];
  if (result.varenykSatedSelf) {
    const selfStatus = presentActiveVarenykSatedBuff(
      new Date(result.varenykSatedSelf.expiresAt),
      result.varenykSatedSelf.rank
    );
    if (selfStatus) selfLines.push(selfStatus);
  }
  if (result.varenykSatedSelfAvailableAt) {
    selfLines.push(`🍽️ Знову нагодувати через ${formatRemaining(result.varenykSatedSelfAvailableAt)}.`);
  }
  if (selfLines.length > 0) {
    blocks.push(["👤 <b>Ви</b>", ...selfLines]);
  }
  for (const target of result.targets) {
    const targetLines: string[] = [];
    if (target.varenykSated) {
      const targetStatus = presentActiveVarenykSatedBuff(
        new Date(target.varenykSated.expiresAt),
        target.varenykSated.rank
      );
      if (targetStatus) targetLines.push(targetStatus);
    }
    if (target.varenykSatedAvailableAt) {
      targetLines.push(`🍽️ Знову нагодувати через ${formatRemaining(target.varenykSatedAvailableAt)}.`);
    }
    if (targetLines.length > 0) {
      blocks.push([`👤 <b>${escapeHtml(target.name)}</b>`, ...targetLines]);
    }
  }
  return blocks.flatMap((block, index) => index === 0 ? block : ["", ...block]);
}

function presentSatedRecoveryLine(hpRestored: number, manaRestored: number): string {
  const parts = [
    ...(hpRestored > 0 ? [`<b>+${hpRestored} HP</b>`] : []),
    ...(manaRestored > 0 ? [`<b>+${manaRestored} мани</b>`] : [])
  ];
  return `Відновлено: ${parts.join(" · ")}.`;
}

function presentSatedActiveStatusLine(expiresAt: Date, rank: number): string {
  const status = presentActiveVarenykSatedBuff(expiresAt, rank);
  return status
    ? `${status} Видно в персонажі поруч з іншими станами.`
    : "Статус уже завершився.";
}

function formatRemaining(availableAt: Date, now = new Date()): string {
  const minutes = Math.max(1, Math.ceil((availableAt.getTime() - now.getTime()) / 60_000));
  return `${minutes} ${pluralize(minutes, "хвилину", "хвилини", "хвилин")}`;
}

function pluralize(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) {
    return one;
  }
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return few;
  }
  return many;
}
