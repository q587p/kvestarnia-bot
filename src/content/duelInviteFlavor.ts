export const DUEL_INVITE_MODE_LINE =
  "⚡ Формат: миттєва дуель — результат одразу після згоди.";
export const DUEL_TURN_BASED_INVITE_MODE_LINE =
  "♟️ Формат: покрокова дуель — кожен сам обирає дії.";
export const DUEL_INVITE_FAIRNESS_LINE =
  "⚖️ Корчмар тимчасово зрівняє досвід. Ваші манатки й їхні ефекти лишаться вашими.";

export interface DuelInviteTemplate {
  id: string;
  header: string;
  body: (name: string) => readonly string[];
}

export const DUEL_INVITE_TEMPLATES = [
  {
    id: "glove-on-table",
    header: "🥊 Дружній корчемний виклик",
    body: (name) => [
      `${name} лишає рукавицю на столі й удає, що це не виглядає підозріло урочисто.`,
      "Переходьте за посиланням, приймайте виклик, а Корчмар зробить вигляд, що все було за правилами."
    ]
  },
  {
    id: "mug-edge",
    header: "🍺 Кухоль поставлено ребром",
    body: (name) => [
      `${name} запевняє, що це просто незручне розташування посуду. Рукавиця поруч заперечує.`,
      "Переходьте за посиланням. Корчмар уже звільнив у протоколі один дуже серйозний рядок."
    ]
  },
  {
    id: "official-challenge",
    header: "📜 Надзвичайно офіційний виклик",
    body: (name) => [
      `Корчмар урочисто вписав ${name} у графу «хтось знову придумав собі клопіт».`,
      "Приймайте виклик за посиланням. Печатка майже справжня, згода — цілком справжня."
    ]
  },
  {
    id: "chalk-on-table",
    header: "🪨 Крейда вже на столі",
    body: (name) => [
      `${name} проводить між кухлями риску й стверджує, що це тактична мапа, а не початок дуелі.`,
      "Перейдіть за посиланням і перевірте цю видатну теорію на практиці."
    ]
  },
  {
    id: "too-polite",
    header: "🎩 Підозріло чемна дуель",
    body: (name) => [
      `${name} вклоняється так чемно, що в Корчмі це вже рахується викликом.`,
      "Приймайте за посиланням. Жодної образи — лише добровільна й добре задокументована незгода."
    ]
  },
  {
    id: "heroic-report",
    header: "🧾 Перевірка героїчної звітности",
    body: (name) => [
      `${name} стверджує, що вміє битися. Корчмар просить підтверджувальний документ у двох примірниках.`,
      "Один примірник уже за посиланням. Другий, як завжди, загубився біля Бочки."
    ]
  },
  {
    id: "table-demands",
    header: "🪑 Стіл вимагає видовища",
    body: (name) => [
      `Стіл мовчить, але ${name} переконує всіх, що дуелі щойно зажадали саме меблі.`,
      "Переходьте за посиланням, доки меблі не передумали й не викликали когось іншого."
    ]
  },
  {
    id: "no-good-reason",
    header: "❓ Виклик без переконливої причини",
    body: (name) => [
      `${name} не має до вас жодних претензій. Саме тому Корчмар вважає цю дуель особливо культурною.`,
      "Приймайте за посиланням. Причину можна вигадати вже після результату."
    ]
  },
  {
    id: "one-record-epic",
    header: "⚔️ Епос на один корчемний запис",
    body: (name) => [
      `${name} починає легенду, якій поки бракує другого учасника й бодай одного свідка без кухля.`,
      "Долучайтеся за посиланням. Корчмар обіцяє скоротити сагу до розміру одного повідомлення."
    ]
  },
  {
    id: "mug-witness",
    header: "👀 Кухоль усе бачив",
    body: (name) => [
      `${name} каже, що нікого не викликав. Кухоль готовий свідчити протилежне, але тільки після пінної перерви.`,
      "Переходьте за посиланням і допоможіть Корчмареві закрити цю справу без допиту посуду."
    ]
  },
  {
    id: "friendly-disagreement",
    header: "🤝 Дружня незгода",
    body: (name) => [
      `${name} пропонує з’ясувати, чия героїчна постава переконливіша. Без ставок, втрат і довічної ворожнечі.`,
      "Приймайте виклик за посиланням. Пафос дозволено приносити із собою."
    ]
  },
  {
    id: "form-13b",
    header: "🗂️ Форма 13-Д: добровільна бійка",
    body: (name) => [
      `У формі ${name} майже всі поля вже заповнено. У графі «гідний суперник» лишилося вписати вас.`,
      "Переходьте за посиланням і поставте згоду там, де Корчмар уже намалював хрестик."
    ]
  },
  {
    id: "reason-break",
    header: "🔔 Перерва в здоровому глузді",
    body: (name) => [
      `${name} уже біля умовної лінії старту. Лінія не була умовною, доки Корчмар не розлив на неї квас.`,
      "Приймайте виклик за посиланням. Правила короткі, а виправдання можна підготувати заздалегідь."
    ]
  }
] satisfies DuelInviteTemplate[];

export function getInitialDuelInviteTemplateIndex(token: string): number {
  return stableIndex(token, DUEL_INVITE_TEMPLATES.length);
}

export function getNextDuelInviteTemplateIndex(token: string, currentIndex: number): number {
  const current = normalizeTemplateIndex(currentIndex);

  if (DUEL_INVITE_TEMPLATES.length <= 1) {
    return current;
  }

  const offset = stableIndex(`${token}:step`, DUEL_INVITE_TEMPLATES.length - 1) + 1;

  return (current + offset) % DUEL_INVITE_TEMPLATES.length;
}

export function normalizeDuelInviteTemplateIndex(value: number): number | null {
  if (!Number.isInteger(value) || value < 0 || value >= DUEL_INVITE_TEMPLATES.length) {
    return null;
  }

  return value;
}

export function renderDuelInviteTemplate(input: {
  templateIndex: number;
  escapedName: string;
  modeLine: string;
  fairnessLine: string;
  escapedInviteUrl: string;
}): string {
  const template =
    DUEL_INVITE_TEMPLATES[normalizeTemplateIndex(input.templateIndex)] ??
    DUEL_INVITE_TEMPLATES[0];

  if (!template) {
    throw new Error("Duel invite templates must not be empty.");
  }

  return [
    `<b>${template.header}</b>`,
    "",
    ...template.body(input.escapedName).flatMap((line) => [line, ""]).slice(0, -1),
    "",
    input.modeLine,
    input.fairnessLine,
    "",
    input.escapedInviteUrl
  ].join("\n");
}

function normalizeTemplateIndex(value: number): number {
  return normalizeDuelInviteTemplateIndex(value) ?? 0;
}

function stableIndex(seed: string, modulo: number): number {
  if (modulo <= 0) {
    return 0;
  }

  let hash = 2166136261;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) % modulo;
}
