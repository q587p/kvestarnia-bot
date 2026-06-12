import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { join, posix } from "path";
import { tmpdir } from "os";
import { afterEach, describe, expect, it } from "vitest";
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
    expect(text).toContain("0.0.4");
    expect(text).toContain("0.0.4 — 12026-06-12 — Перша пригода");
    expect(text).toContain("https://t.me/kvestarnia");
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
    expect(sender.messages[0]?.text).toContain("Версія: 0.0.4");
    expect(sender.messages[1]?.chatId).toBe("43");
    expect(sender.messages[1]?.text).toContain("Версія: 0.0.4");
    await expect(readFile(markerPath, "utf8")).resolves.toBe("0.0.4\n");
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

function makeSender(): TelegramMessageSender & {
  messages: Array<{ chatId: string; text: string }>;
} {
  const messages: Array<{ chatId: string; text: string }> = [];

  return {
    messages,
    api: {
      sendMessage(chatId: string, text: string): Promise<void> {
        messages.push({ chatId, text });
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

function makeNewsEntry(): NewsEntry {
  return {
    index: 0,
    title: "0.0.4 — 12026-06-12 — Перша пригода",
    body: "Шаурма знову підозріла.",
    raw: "## 0.0.4 — 12026-06-12 — Перша пригода\n\nШаурма знову підозріла.",
    version: "0.0.4",
    contentHash: "hash"
  };
}
