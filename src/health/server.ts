import { createServer, type IncomingMessage, type Server, type ServerResponse } from "http";
import type {
  PresenceService,
  PublicPresenceLocationsSnapshot
} from "../services/presenceService";

export const DEFAULT_HEALTH_PORT = 10000;
export const HEALTH_HOST = "0.0.0.0";

export interface HealthServerOptions {
  port?: string | number;
  presence?: PresenceService;
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

export function renderPresencePage(snapshot: PublicPresenceLocationsSnapshot): string {
  const locationSections =
    snapshot.locations.length === 0
      ? "<p class=\"empty\">Зараз у Квестарні тихо. Навіть журнал обережно перегортає себе сам.</p>"
      : snapshot.locations.map(renderLocationCard).join("\n");

  return `<!doctype html>
<html lang="uk">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="60">
  <title>Жива Квестарня</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f8f7;
      --text: #202320;
      --muted: #66736d;
      --line: #d8dedb;
      --active: #15824a;
      --idle: #9a6a08;
    }

    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font: 16px/1.5 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    main {
      width: min(760px, calc(100% - 32px));
      margin: 0 auto;
      padding: 32px 0 48px;
    }

    h1 {
      margin: 0 0 8px;
      font-size: 2rem;
      letter-spacing: 0;
    }

    .subtitle {
      margin: 0 0 24px;
      color: var(--muted);
    }

    .total {
      margin: 0 0 24px;
      font-size: 1.15rem;
      font-weight: 700;
    }

    .location {
      border-top: 1px solid var(--line);
      padding: 20px 0;
    }

    .location h2 {
      margin: 0 0 4px;
      font-size: 1.25rem;
      letter-spacing: 0;
    }

    .region,
    .counts,
    .empty {
      color: var(--muted);
    }

    .counts {
      margin: 8px 0 12px;
    }

    .active {
      color: var(--active);
      font-weight: 700;
    }

    .idle {
      color: var(--idle);
      font-weight: 700;
    }

    ul {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    li {
      padding: 2px 0;
    }
  </style>
</head>
<body>
  <main>
    <h1>Жива Квестарня</h1>
    <p class="subtitle">Хто зараз у грі, без Telegram-стеження й секундоміра над головою.</p>
    <p class="total">👥 У грі зараз: ${snapshot.total}</p>
    ${locationSections}
  </main>
</body>
</html>`;
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

  if (pathname === "/" || pathname === "/health") {
    sendText(response, 200, "kvestarnia ok\n");
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

function renderLocationCard(
  location: PublicPresenceLocationsSnapshot["locations"][number]
): string {
  const region = location.regionName
    ? `<div class="region">${escapeHtml(location.regionName)}</div>`
    : "";
  const players =
    location.players.length === 0
      ? ""
      : `<ul>${location.players.map((player) => `<li>— ${escapeHtml(player)}</li>`).join("")}</ul>`;

  return `<section class="location">
  <h2>${escapeHtml(location.title)}</h2>
  ${region}
  <div class="counts"><span class="active">🟢 ${location.activeCount}</span> активні · <span class="idle">🟡 ${location.idleCount}</span> притихли</div>
  ${players}
</section>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
