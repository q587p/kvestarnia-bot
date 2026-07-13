import { createServer, type IncomingMessage, type Server, type ServerResponse } from "http";
import type { RuntimeReadiness } from "../app/runtimeReadiness";
import type { SupportJarStatus } from "../config/env";
import type {
  PresenceService,
  PublicPresenceLocationsSnapshot
} from "../services/presenceService";
import { readNewsEntries } from "./news";
import {
  renderHomePage,
  renderNewsArchivePage,
  renderPresencePage
} from "./publicSite";

export { renderPresencePage } from "./publicSite";

export const DEFAULT_HEALTH_PORT = 10000;
export const HEALTH_HOST = "0.0.0.0";

export interface HealthServerOptions {
  port?: string | number;
  presence?: PresenceService;
  supportJarUrl?: string;
  supportJarStatus?: SupportJarStatus;
  readiness?: Pick<RuntimeReadiness, "isReady">;
}

export function resolveHealthPort(value: string | number | undefined): number {
  if (typeof value === "number") {
    return isValidPort(value) ? value : DEFAULT_HEALTH_PORT;
  }

  const parsed = Number(value);
  return isValidPort(parsed) ? parsed : DEFAULT_HEALTH_PORT;
}

export function handleHealthRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: HealthServerOptions = {}
): void {
  void handleRequest(request, response, options).catch((error) => {
    console.error("Квестарня: HTTP route failed.", error);

    if (!response.headersSent) {
      response.writeHead(500, {
        "content-type": "text/plain; charset=utf-8"
      });
    }

    response.end("server error\n");
  });
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: HealthServerOptions
): Promise<void> {
  const pathname = getPathname(request.url);

  if (request.method !== "GET") {
    sendNotFound(response);
    return;
  }

  if (pathname === "/health") {
    sendText(response, 200, "kvestarnia ok\n");
    return;
  }

  if (pathname === "/ready") {
    const ready = options.readiness?.isReady() === true;
    sendText(response, ready ? 200 : 503, ready ? "kvestarnia ready\n" : "kvestarnia not ready\n");
    return;
  }

  if (pathname === "/") {
    sendHtml(
      response,
      200,
      renderHomePage(
        await getPublicPresenceSnapshot(options),
        readNewsEntries(),
        options.supportJarUrl
          ? {
              supportJarUrl: options.supportJarUrl,
              ...(options.supportJarStatus
                ? { supportJarStatus: options.supportJarStatus }
                : {})
            }
          : {}
      )
    );
    return;
  }

  if (pathname === "/news") {
    const entries = readNewsEntries();
    sendHtml(response, 200, renderNewsArchivePage(entries, getSelectedNewsIndex(request.url, entries.length)));
    return;
  }

  if (pathname === "/api/presence/locations") {
    if (!options.presence) {
      sendJson(response, 503, { error: "presence unavailable" });
      return;
    }

    sendJson(response, 200, await options.presence.getPublicPresenceLocations());
    return;
  }

  if (pathname === "/presence") {
    if (!options.presence) {
      sendHtml(response, 503, "<!doctype html><title>Квестарня</title><p>Присутність недоступна.</p>");
      return;
    }

    sendHtml(response, 200, renderPresencePage(await options.presence.getPublicPresenceLocations()));
    return;
  }

  sendNotFound(response);
}

export function startHealthServer(options: HealthServerOptions = {}): Server {
  const port = resolveHealthPort(options.port ?? process.env.PORT);
  const server = createServer((request, response) => {
    handleHealthRequest(request, response, options);
  });

  server.listen(port, HEALTH_HOST, () => {
    console.log(`Квестарня: healthcheck HTTP server listening on ${HEALTH_HOST}:${port}.`);
  });

  return server;
}

function isValidPort(value: number): boolean {
  return Number.isInteger(value) && value > 0 && value <= 65535;
}

function getPathname(url: string | undefined): string {
  return new URL(url ?? "/", "http://localhost").pathname;
}

function sendText(response: ServerResponse, status: number, text: string): void {
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "text/plain; charset=utf-8"
  });
  response.end(text);
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(value));
}

function sendHtml(response: ServerResponse, status: number, html: string): void {
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "text/html; charset=utf-8"
  });
  response.end(html);
}

function sendNotFound(response: ServerResponse): void {
  sendText(response, 404, "not found\n");
}

async function getPublicPresenceSnapshot(
  options: HealthServerOptions
): Promise<PublicPresenceLocationsSnapshot> {
  if (!options.presence) {
    return {
      totalActive: 0,
      totalIdle: 0,
      total: 0,
      locations: []
    };
  }

  return options.presence.getPublicPresenceLocations();
}

function getSelectedNewsIndex(url: string | undefined, entryCount: number): number {
  const raw = new URL(url ?? "/", "http://localhost").searchParams.get("entry");
  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed < 0 || parsed >= entryCount) {
    return 0;
  }

  return parsed;
}
