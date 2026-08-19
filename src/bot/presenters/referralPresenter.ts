import { REFERRAL_POLICY_V1, type ReferralRewardItem } from "../../domain/referral/referralPolicy";
import { sanitizeReferralName } from "../../domain/referral/referralIdentity";
import type { ReferralInviteePage } from "../../db/repositories/referralRepository";
import type { ReferralDashboardResult } from "../../services/referralService";
import { escapeHtml } from "./telegramHtml";

export function presentReferralBoardEntry(): string {
  return [
    "📨 <b>Поклик до Квестарні</b>",
    "",
    "Поклич нового пригодника. Коли той набиратиметься досвіду, Квестарня автоматично видаватиме тобі припаси, Іскрокамені та золото."
  ].join("\n");
}

export function presentReferralDashboard(result: ReferralDashboardResult): string {
  if (result.state === "disabled") {
    return "Писар тимчасово не приймає нових покликів. Уже записані пригодники й зароблені етапи не зникнуть.";
  }
  if (result.state === "no-character") {
    return [
      "📨 <b>Поклик до Квестарні</b>",
      "",
      "Спершу створи пригодника. Тоді корчмар матиме кому виписати посилання й кому складати майбутні нагороди."
    ].join("\n");
  }
  const pendingLines = result.pendingStageTotal > 0
    ? [
        `⏳ Автоматичної доставки чекає: <b>${result.pendingStageTotal}</b>.`,
        "Нічого натискати не треба — Квестарня повторить виплату сама."
      ]
    : [];
  const header = result.hasCharacter
      ? [
        "📨 <b>Поклик до Квестарні</b>",
        "",
        "Поклич нового пригодника. За чотири ранні рівневі звитяги Квестарня автоматично видаватиме тобі ці нагороди:",
        "",
        ...presentDashboardRewardTrackLines()
      ]
    : [
        "📨 <b>Поклик до Квестарні</b>",
        "",
        "Твій поклик досі чинний і не змінився після перезапуску."
      ];
  return [
    ...header,
    "",
    "🔗 <b>Твоє посилання:</b>",
    escapeHtml(result.inviteUrl),
    "",
    `👥 Покликано й прибуло: <b>${result.arrivedTotal}</b>`,
    `🎁 Виплачено етапів: <b>${result.grantedStageTotal}</b>`,
    `Досягнуті етапи: 3 — ${result.earnedByMilestone.LEVEL_3}/${result.arrivedTotal} · 5 — ${result.earnedByMilestone.LEVEL_5}/${result.arrivedTotal} · 8 — ${result.earnedByMilestone.LEVEL_8}/${result.arrivedTotal} · 13 — ${result.earnedByMilestone.LEVEL_13}/${result.arrivedTotal}`,
    ...(pendingLines.length > 0 ? ["", ...pendingLines] : []),
    ...(!result.hasCharacter
      ? [
          "",
          "Нагороди, які вже чекають автоматичної доставки, не зникнуть. Коли зʼявиться чинний персонаж і доставка буде доступна, Квестарня повторить спробу. Забирати вручну нічого не треба."
        ]
      : [])
  ].join("\n");
}

export function presentReferralCaptureRetry(): string {
  return [
    "Писар не зміг надійно звірити цей поклик.",
    "Спробуй відкрити те саме посилання ще раз — звичайний вхід поки не розпочато й поклик не втрачено."
  ].join("\n\n");
}

export function presentReferralConsent(inviterName: string): string {
  const name = escapeHtml(sanitizeReferralName(inviterName));
  return [
    `🤝 <b>Поклик від «${name}»</b>`,
    "",
    "Можеш прийняти цей поклик або продовжити самостійно — створення пригодника доступне в обох випадках.",
    "",
    "Якщо приймеш, запрошувач автоматично отримає припаси, Іскрокамені та золото, коли ти вперше досягнеш 3, 5, 8 і 13 рівня.",
    "",
    "Запрошувач бачитиме лише імʼя твого чинного пригодника, поточний рівень і позначки цих чотирьох етапів. Telegram-профіль, місце, справи, речі, золото та ґільдія лишаться приватними.",
    "",
    "Після створення пригодника Хроніки Квестарні публічно запишуть імʼя нового пригодника, імʼя запрошувача й сам факт поклику в розділі «Пригодники». Посилання, Telegram-дані, рівні та нагороди туди не потраплять.",
    "",
    "Вибір одноразовий: якщо продовжиш без поклику, інше посилання пізніше не привʼяже цей облік до запрошувача."
  ].join("\n");
}

export function presentReferralAccepted(): string {
  return [
    "🤝 Поклик прийнято.",
    "",
    "Квестарня запамʼятала, хто кого сюди привів. Тепер час створити пригодника.",
    "",
    "Після створення персонажа Хроніки запишуть обидва імена та факт поклику в розділі «Пригодники»."
  ].join("\n");
}

export function presentReferralDeclined(): string {
  return [
    "Гаразд. Поклик не прийнято. Запрошувач тебе не побачить і нагород не отримає; інше посилання вже не змінить цього вибору.",
    "",
    "Звичайне створення пригодника триває."
  ].join("\n");
}

export function presentReferralCaptureOutcome(
  state: "existing-user" | "self" | "not-found" | "disabled" | "accepted" | "declined"
): string {
  switch (state) {
    case "existing-user":
      return "Цей поклик призначений для нового гравця. Твої нинішні пригоди й звʼязки не змінено.";
    case "self":
      return "Корчмар звірив підписи. Покликати до Квестарні самого себе цим папірцем не вийде.";
    case "disabled":
      return "Нові поклики тимчасово не записують. Можна продовжити звичайне створення пригодника.";
    case "accepted":
      return "Поклик уже прийнято. Інше посилання не змінює запису в журналі.";
    case "declined":
      return "Поклик уже було відхилено. Інше посилання не привʼяже цей облік до запрошувача.";
    case "not-found":
      return "Печатка на поклику пошкоджена або невідома Квестарні. Звичайний вхід усе одно відкритий.";
  }
}

export function presentReferralInvitees(page: ReferralInviteePage): string {
  if (page.totalCount === 0) {
    return [
      "👥 <b>Мої покликані</b>",
      "",
      "Поки ніхто не прийняв твій поклик і не створив пригодника.",
      "Посилання можна надіслати приватно або опублікувати там, де його справді чекають."
    ].join("\n");
  }
  const hasPending = page.rows.some((row) => row.stages.some((stage) => stage.state === "PENDING"));
  return [
    "👥 <b>Мої покликані</b>",
    "",
    `Усього: <b>${page.totalCount}</b> · Сторінка ${page.page + 1}/${page.totalPages}`,
    "",
    ...page.rows.flatMap((row, index) => {
      const number = page.page * 5 + index + 1;
      const name = row.name
        ? `<b>«${escapeHtml(sanitizeReferralName(row.name))}»</b> · ${row.level} рівень`
        : "<b>Покликаний пригодник</b> · зараз без чинного персонажа";
      return [
        `${number}. ${name}`,
        `   ${REFERRAL_POLICY_V1.stages.map((stage) => {
          const earned = row.stages.find((candidate) => candidate.milestoneKey === stage.key);
          return `${stage.level}:${earned?.state === "GRANTED" ? "✅" : earned?.state === "PENDING" ? "⏳" : "▫️"}`;
        }).join(" · ")}`
      ];
    }),
    ...(hasPending ? ["", "✅ виплачено · ⏳ досягнуто, доставка в черзі · ▫️ ще попереду"] : [])
  ].join("\n");
}

export function presentReferralNotification(kind: string, payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  if (kind === "REFERRAL_JOINED") {
    const inviteeName = (payload as { inviteeName?: unknown }).inviteeName;
    if (typeof inviteeName !== "string") {
      return null;
    }
    return [
      "🤝 <b>Новий поклик прийнято!</b>",
      "",
      `У журналі зʼявилося імʼя: <b>«${escapeHtml(sanitizeReferralName(inviteeName))}»</b>.`,
      "",
      "Нагороди прийдуть автоматично:",
      ...presentRewardTrackLines(),
      "",
      "Уся шкала дає золото на базові кроки від +1 до +5, а останній етап — каміння навіть на найдорожчу чинну спробу з +4 до +5. Не на +6."
    ].join("\n");
  }
  if (kind !== "REFERRAL_PAYOUT_GRANTED") {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const level = record.level;
  const gold = record.gold;
  const items = record.items;
  const milestoneKey = record.milestoneKey;
  if (
    typeof level !== "number" ||
    !Number.isSafeInteger(level) ||
    typeof gold !== "number" ||
    !Number.isSafeInteger(gold) ||
    !Array.isArray(items) ||
    typeof milestoneKey !== "string"
  ) {
    return null;
  }
  const parsedItems = parseNotificationItems(items);
  const stage = REFERRAL_POLICY_V1.stages.find((candidate) => candidate.key === milestoneKey);
  if (
    !parsedItems ||
    !stage ||
    stage.level !== level ||
    stage.gold !== gold ||
    parsedItems.length !== stage.itemGrants.length ||
    parsedItems.some((item, index) =>
      item.itemId !== stage.itemGrants[index]?.itemId ||
      item.quantity !== stage.itemGrants[index]?.quantity
    )
  ) {
    return null;
  }
  const inviteeName = typeof record.inviteeName === "string"
    ? sanitizeReferralName(record.inviteeName)
    : null;
  const stageLine = inviteeName
    ? `🎉 Етап пригодника <b>«${escapeHtml(inviteeName)}»</b>: <b>${level} рівень</b>.`
    : `🎉 Етап покликаного пригодника: <b>${level} рівень</b>.`;
  const rewardLine = `Тобі автоматично видано: ${presentGrantedItems(parsedItems)} і 💰 ${gold} золота.`;
  return [
    "🎁 <b>Нагорода за поклик!</b>",
    "",
    stageLine,
    rewardLine,
    ...(level === 13
      ? [
          "",
          "193 Іскрокамені останнього етапу покривають найдорожчу чинну спробу покращення з +4 до +5: для легендарного предмета потрібно 180. Загальне золото чотирьох етапів покриває базові кроки від +1 до +5. Це не відкриває та не обіцяє +6."
        ]
      : [])
  ].join("\n");
}

function presentRewardTrackLines(): string[] {
  return [
    "3 рівень — 🩹 Щільний бинт ×1 · ✨ 5 Іскрокаменів · 💰 50 золота",
    "5 рівень — ⚕️ Польова аптечка ×1 · ✨ 13 Іскрокаменів · 💰 120 золота",
    "8 рівень — ⚕️ Польова аптечка ×2 · ✨ 65 Іскрокаменів · 💰 760 золота",
    "13 рівень — ⚕️ Польова аптечка ×3 · ✨ 193 Іскрокамені · 💰 900 золота"
  ];
}

function presentDashboardRewardTrackLines(): string[] {
  return [
    "3 рівень — 1 × item.dense-bandage · 5 × item.iskrokamin · 50 золота",
    "5 рівень — 1 × item.field-kit · 13 × item.iskrokamin · 120 золота",
    "8 рівень — 2 × item.field-kit · 65 × item.iskrokamin · 760 золота",
    "13 рівень — 3 × item.field-kit · 193 × item.iskrokamin · 900 золота",
    "",
    "Разом — 1 × item.dense-bandage · 6 × item.field-kit · 276 × item.iskrokamin · 1830 золота"
  ];
}

function parseNotificationItems(value: unknown[]): ReferralRewardItem[] | null {
  const result: ReferralRewardItem[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return null;
    }
    const itemId = (item as { itemId?: unknown }).itemId;
    const quantity = (item as { quantity?: unknown }).quantity;
    if (
      typeof itemId !== "string" ||
      !["item.dense-bandage", "item.field-kit", "item.iskrokamin"].includes(itemId) ||
      typeof quantity !== "number" ||
      !Number.isSafeInteger(quantity) ||
      quantity <= 0
    ) {
      return null;
    }
    result.push({ itemId, quantity });
  }
  return result;
}

function presentGrantedItems(items: ReferralRewardItem[]): string {
  return items.map((item) => {
    if (item.itemId === "item.dense-bandage") {
      return `🩹 Щільний бинт ×${item.quantity}`;
    }
    if (item.itemId === "item.field-kit") {
      return `⚕️ Польова аптечка ×${item.quantity}`;
    }
    return `✨ ${item.quantity} ${item.quantity === 193 ? "Іскрокамені" : "Іскрокаменів"}`;
  }).join(", ");
}
