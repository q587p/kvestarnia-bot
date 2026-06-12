import { createServer } from "http";
import type { AddressInfo } from "net";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_HEALTH_PORT,
  handleHealthRequest,
  resolveHealthPort
} from "../../src/health/server";

let server: ReturnType<typeof createServer> | null = null;

afterEach(async () => {
  if (!server) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server?.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
  server = null;
});

describe("health server", () => {
  it("uses PORT when valid and defaults to 10000 otherwise", () => {
    expect(resolveHealthPort("12345")).toBe(12345);
    expect(resolveHealthPort(23456)).toBe(23456);
    expect(resolveHealthPort(undefined)).toBe(DEFAULT_HEALTH_PORT);
    expect(resolveHealthPort("not-a-port")).toBe(DEFAULT_HEALTH_PORT);
  });

  it.each(["/", "/health"])("responds 200 OK on GET %s", async (path) => {
    const baseUrl = await listen();

    const response = await fetch(`${baseUrl}${path}`);

    await expect(response.text()).resolves.toContain("kvestarnia ok");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
  });

  it("returns 404 for other paths", async () => {
    const baseUrl = await listen();

    const response = await fetch(`${baseUrl}/nope`);

    expect(response.status).toBe(404);
  });
});

async function listen(): Promise<string> {
  server = createServer(handleHealthRequest);

  await new Promise<void>((resolve) => {
    server?.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}
