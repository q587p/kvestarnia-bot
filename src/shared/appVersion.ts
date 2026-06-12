import { readFileSync } from "fs";
import { join } from "path";

export function readAppVersion(): string {
  try {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      version?: unknown;
    };

    return typeof packageJson.version === "string" && packageJson.version.trim()
      ? packageJson.version
      : fallbackVersion();
  } catch {
    return fallbackVersion();
  }
}

function fallbackVersion(): string {
  return process.env.APP_VERSION?.trim() || "dev";
}
