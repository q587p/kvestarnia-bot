import { getHelpCommandEntries } from "../botCommandCatalog";

export interface HelpVisibility {
  includeDevReset: boolean;
  includeDevGrant?: boolean;
  includePartySessions?: boolean;
  includeTavernGames?: boolean;
}

export function presentHelp(visibility: boolean | HelpVisibility): string {
  const normalized = normalizeHelpVisibility(visibility);
  const publicCommands = getHelpCommandEntries(normalized)
    .filter((entry) => !entry.devOnly)
    .map((entry) => `${entry.icon} /${entry.command} — ${entry.description}`);
  const lines = [
    "📖 Допомога Квестарні",
    "",
    "👤 Персонаж — рівень, HP/мана, прогрес і титули.",
    "🍺 Корчма — зала, стіл зі справами, Низ, Бочка, шинок і Дошка корчми.",
    "📰 Дошка корчми — Вісти, Останні події, Перекази, подарунки й Пошта Квестарні.",
    ...(normalized.includeTavernGames
      ? ["🎲 Ігри за столом — тавлеї та кості у шинку."]
      : []),
    "🗺️ Квести — пригоди, Низ, Єгер, льох і бойові справи.",
    "🎒 Манатки — інвентар, спорядження й корисні дрібниці.",
    "👀 Хто поруч — пригодники поруч і соціяльні дії.",
    "",
    "Команди:",
    ...publicCommands,
    "",
    "Підказка: найзручніше ходити кнопками основної клавіатури."
  ];

  lines.push(
    "",
    "Крамниці, ремесло й ґільдії ще готуються.",
    "",
    "Квестарню розробляє @q587p — розробник і корчмар за стійкою."
  );

  return lines.join("\n");
}

export function presentDevHelp(visibility: boolean | HelpVisibility): string {
  const normalized = normalizeHelpVisibility(visibility);
  const devCommands = getHelpCommandEntries(normalized)
    .filter((entry) => entry.devOnly)
    .map((entry) => `${entry.icon} /${entry.command} — ${entry.description}`);

  if (devCommands.length === 0) {
    return "Dev-команди тут не ввімкнені. Корчмар сховав викрутку.";
  }

  return [
    "🧰 Dev-довідка Квестарні",
    "",
    ...devCommands,
    "",
    "Команди працюють тільки у локальній майстерні."
  ].join("\n");
}

function normalizeHelpVisibility(visibility: boolean | HelpVisibility): Required<HelpVisibility> {
  if (typeof visibility === "boolean") {
    return {
      includeDevReset: visibility,
      includeDevGrant: visibility,
      includePartySessions: visibility,
      includeTavernGames: visibility
    };
  }

  return {
    includeDevReset: visibility.includeDevReset,
    includeDevGrant: visibility.includeDevGrant ?? false,
    includePartySessions: visibility.includePartySessions ?? false,
    includeTavernGames: visibility.includeTavernGames ?? false
  };
}
