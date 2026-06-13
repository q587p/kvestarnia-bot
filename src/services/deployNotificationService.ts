import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, isAbsolute, posix, resolve } from "path";
import type { UserRepository } from "../db/repositories/userRepository";
import type { NewsEntry } from "../news/newsMarkdown";
import { readNewsEntries } from "../news/newsMarkdown";

export interface DeployNotificationOptions {
  enabled: boolean;
  databaseUrl: string;
  version: string;
}

export interface TelegramMessageSender {
  api: {
    sendMessage(
      chatId: string,
      text: string,
      options?: { parse_mode: "HTML" }
    ): Promise<unknown>;
  };
}

const NEWS_CHANNEL_URL = "https://t.me/kvestarnia";
const DEPLOY_NOTIFICATION_OPTIONS = {
  parse_mode: "HTML" as const
};

export class DeployNotificationService {
  constructor(
    private readonly users: UserRepository,
    private readonly options: DeployNotificationOptions
  ) {}

  async announceIfNeeded(bot: TelegramMessageSender): Promise<void> {
    if (!this.options.enabled) {
      return;
    }

    const markerPath = resolveDeployMarkerPath(this.options.databaseUrl);

    if (readMarker(markerPath) === this.options.version) {
      return;
    }

    const latestNews = await readLatestNewsSafe();
    const text = renderDeployNotification(this.options.version, latestNews);
    const telegramUserIds = await this.users.listTelegramUserIds();

    for (const telegramUserId of telegramUserIds) {
      try {
        await bot.api.sendMessage(telegramUserId.toString(), text, DEPLOY_NOTIFICATION_OPTIONS);
      } catch (error) {
        console.error("Квестарня: не вдалося надіслати нотифікацію про версію.", error);
      }
    }

    writeMarker(markerPath, this.options.version);
  }
}

export function renderDeployNotification(version: string, latestNews: NewsEntry | null): string {
  return [
    "🛠️ Квестарня оновилась.",
    `Версія: ${escapeHtml(version)}`,
    ...(latestNews ? ["", `Остання новина: <b>${escapeHtml(latestNews.title)}</b>`] : []),
    "",
    "Деталі й архів: /news",
    `Канал: ${NEWS_CHANNEL_URL}`
  ].join("\n");
}

export function resolveDeployMarkerPath(databaseUrl: string): string {
  if (!databaseUrl.startsWith("file:")) {
    return resolve(process.cwd(), ".kvestarnia-deploy-version");
  }

  const sqlitePath = databaseUrl.slice("file:".length);

  if (sqlitePath.startsWith("/")) {
    return posix.resolve(posix.dirname(sqlitePath), ".kvestarnia-deploy-version");
  }

  const absoluteSqlitePath = isAbsolute(sqlitePath)
    ? sqlitePath
    : resolve(process.cwd(), "prisma", sqlitePath);

  return resolve(dirname(absoluteSqlitePath), ".kvestarnia-deploy-version");
}

async function readLatestNewsSafe(): Promise<NewsEntry | null> {
  try {
    const [latest] = await readNewsEntries();
    return latest ?? null;
  } catch {
    return null;
  }
}

function readMarker(markerPath: string): string | null {
  if (!existsSync(markerPath)) {
    return null;
  }

  return readFileSync(markerPath, "utf8").trim() || null;
}

function writeMarker(markerPath: string, version: string): void {
  mkdirSync(dirname(markerPath), { recursive: true });
  writeFileSync(markerPath, `${version}\n`, "utf8");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
