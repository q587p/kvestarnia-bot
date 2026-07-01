import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { join, posix } from "path";
import { tmpdir } from "os";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UserRecord, UserRepository } from "../../src/db/repositories/userRepository";
import type { NewsEntry } from "../../src/news/newsMarkdown";
import {
  DeployNotificationService,
  renderDeployNotification,
  resolveDeployMarkerPath,
  type TelegramMessageSender
} from "../../src/services/deployNotificationService";

const tempDirs: string[] = [];

describe("deploy notification service", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("uses the SQLite database directory for the deploy marker", () => {
    expect(resolveDeployMarkerPath("file:/var/data/kvestarnia.db")).toBe(
      posix.join("/var/data", ".kvestarnia-deploy-version")
    );
  });

  it("renders version, latest news, and channel link", () => {
    const text = renderDeployNotification("0.0.4", makeNewsEntry());

    expect(text).toContain("Квестарня оновилась");
    expect(text).toContain("Версія: <b>0.0.4</b>");
    expect(text).toContain("📰 Остання вість із Дошки корчми:");
    expect(text).toContain("<b>Перша пригода</b>");
    expect(text).toContain("Шаурма знову підозріла.");
    expect(text).toContain("Архів вістей: /news");
    expect(text).toContain("Канал вістей: https://t.me/kvestarnia");
    expect(text).not.toContain("Остання новина");
    expect(text).not.toContain("Деталі й архів");
    expect(text).toContain("https://t.me/kvestarnia");
  });

  it("escapes version, latest news title, and first paragraph for Telegram HTML", () => {
    const text = renderDeployNotification(
      "0.0.4 <draft>",
      makeNewsEntry("0.0.4 — 12026-06-12 — A < B", "Корчмар має <план> & кухоль.")
    );

    expect(text).toContain("Версія: <b>0.0.4 &lt;draft&gt;</b>");
    expect(text).toContain("<b>A &lt; B</b>");
    expect(text).toContain("Корчмар має &lt;план&gt; &amp; кухоль.");
    expect(text).not.toContain("A < B");
    expect(text).not.toContain("<план>");
  });

  it("uses a short fallback when latest news has no narrative paragraph", () => {
    const text = renderDeployNotification("0.0.4", {
      ...makeNewsEntry(),
      body: "",
      raw: "## 0.0.4 — 12026-06-12 — Перша пригода"
    });

    expect(text).toContain("Дошка вістей тимчасово мовчить.");
    expect(text).toContain("Архів вістей: /news");
    expect(text).toContain("Канал вістей: https://t.me/kvestarnia");
    expect(text).not.toContain("Остання новина");
    expect(text).not.toContain("Деталі й архів");
  });

  it("uses a short fallback when latest news is unavailable", () => {
    const text = renderDeployNotification("0.0.4", null);

    expect(text).toBe([
      "🛠️ Квестарня оновилась.",
      "Версія: <b>0.0.4</b>",
      "",
      "Дошка вістей тимчасово мовчить. Корчмар каже, що це теж технічний стан.",
      "",
      "Архів вістей: /news",
      "Канал вістей: https://t.me/kvestarnia"
    ].join("\n"));
  });

  it("uses only the first narrative paragraph from release news", () => {
    const text = renderDeployNotification(
      "0.0.4",
      makeNewsEntry(
        "0.0.4 — 12026-06-12 — Перша пригода",
        [
          "Корчмар нарешті поставив шаховий годинник.",
          "",
          "У грі вже:",
          "- Дуель чекає вашого ходу."
        ].join("\r\n")
      )
    );

    expect(text).toContain("Корчмар нарешті поставив шаховий годинник.");
    expect(text).not.toContain("У грі вже");
    expect(text).not.toContain("Дуель чекає вашого ходу");
  });

  it("does nothing when deploy notifications are disabled", async () => {
    const service = new DeployNotificationService(makeUsers([42n]), {
      enabled: false,
      databaseUrl: await makeSqliteUrl(),
      version: "0.0.4"
    });
    const sender = makeSender();

    await service.announceIfNeeded(sender);

    expect(sender.messages).toEqual([]);
  });

  it("does not resend the same version when marker exists", async () => {
    const databaseUrl = await makeSqliteUrl();
    const markerPath = resolveDeployMarkerPath(databaseUrl);
    await writeFile(markerPath, "0.0.4\n", "utf8");
    const service = new DeployNotificationService(makeUsers([42n]), {
      enabled: true,
      databaseUrl,
      version: "0.0.4"
    });
    const sender = makeSender();

    await service.announceIfNeeded(sender);

    expect(sender.messages).toEqual([]);
  });

  it("sends to known users and writes the version marker", async () => {
    const databaseUrl = await makeSqliteUrl();
    const markerPath = resolveDeployMarkerPath(databaseUrl);
    const service = new DeployNotificationService(makeUsers([42n, 43n]), {
      enabled: true,
      databaseUrl,
      version: "0.0.4"
    });
    const sender = makeSender();

    await service.announceIfNeeded(sender);

    expect(sender.messages).toHaveLength(2);
    expect(sender.messages[0]?.chatId).toBe("42");
    expect(sender.messages[0]?.text).toContain("Версія: <b>0.0.4</b>");
    expect(sender.messages[0]?.options).toMatchObject({
      parse_mode: "HTML"
    });
    expect(sender.messages[1]?.chatId).toBe("43");
    expect(sender.messages[1]?.text).toContain("Версія: <b>0.0.4</b>");
    expect(sender.messages[1]?.options).toMatchObject({
      parse_mode: "HTML"
    });
    await expect(readFile(markerPath, "utf8")).resolves.toBe("0.0.4\n");
  });

  it("skips blocked users without logging deploy notification errors", async () => {
    const databaseUrl = await makeSqliteUrl();
    const markerPath = resolveDeployMarkerPath(databaseUrl);
    const service = new DeployNotificationService(makeUsers([42n, 43n]), {
      enabled: true,
      databaseUrl,
      version: "0.0.4"
    });
    const sender = makeSender({
      "42": Object.assign(new Error("Call to 'sendMessage' failed"), {
        error_code: 403,
        description: "Forbidden: bot was blocked by the user"
      })
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      await service.announceIfNeeded(sender);

      expect(sender.messages).toHaveLength(1);
      expect(sender.messages[0]?.chatId).toBe("43");
      expect(warnSpy).toHaveBeenCalledWith(
        "Квестарня: користувач 42 заблокував бота, нотифікацію про версію пропущено."
      );
      expect(errorSpy).not.toHaveBeenCalled();
      await expect(readFile(markerPath, "utf8")).resolves.toBe("0.0.4\n");
    } finally {
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});

function makeUsers(ids: bigint[]): UserRepository {
  return {
    upsertTelegramUser(): Promise<UserRecord> {
      return Promise.reject(new Error("not used"));
    },
    listTelegramUserIds(): Promise<bigint[]> {
      return Promise.resolve(ids);
    }
  };
}

function makeSender(failures: Record<string, Error> = {}): TelegramMessageSender & {
  messages: Array<{ chatId: string; text: string; options: unknown }>;
} {
  const messages: Array<{ chatId: string; text: string; options: unknown }> = [];

  return {
    messages,
    api: {
      sendMessage(chatId: string, text: string, options?: unknown): Promise<void> {
        const failure = failures[chatId];

        if (failure) {
          return Promise.reject(failure);
        }

        messages.push({ chatId, text, options });
        return Promise.resolve();
      }
    }
  };
}

async function makeSqliteUrl(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "kvestarnia-deploy-"));
  tempDirs.push(dir);
  return `file:${join(dir, "dev.db")}`;
}

function makeNewsEntry(
  title = "0.0.4 — 12026-06-12 — Перша пригода",
  body = "Шаурма знову підозріла."
): NewsEntry {
  return {
    index: 0,
    title,
    body,
    raw: `## ${title}\n\n${body}`,
    version: "0.0.4",
    contentHash: "hash"
  };
}
