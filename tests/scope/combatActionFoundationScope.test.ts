import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("0.1.21 combat action foundation scope", () => {
  it("does not wire or advertise proactive HP-full notifications in 0.1.21", () => {
    const botEntry = read("src/bot.ts");
    const taskDoc = read("docs/tasks/0.1.21-combat-action-foundation.md");
    const changelogSection = read("CHANGELOG.md").split("## [0.1.20]")[0] ?? "";
    const newsSection = read("news.md").split("## 0.1.20")[0] ?? "";

    expect(existsSync(join(root, "src/bot/resourceRecoveryNotificationScheduler.ts"))).toBe(false);
    expect(existsSync(join(root, "src/services/resourceRecoveryNotificationService.ts"))).toBe(false);
    expect(botEntry).not.toContain("ResourceRecoveryNotification");
    expect(botEntry).not.toContain("resourceRecoveryNotificationScheduler");
    expect(taskDoc).not.toMatch(/proactive HP|HP-full recovery notifications|full-health notice proactively/i);
    expect(changelogSection).not.toMatch(/resource recovery scheduler|full-HP notice proactively/i);
    expect(newsSection).not.toMatch(/здоров.?я.*натиснете наступну кнопку/i);
  });
});

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}
