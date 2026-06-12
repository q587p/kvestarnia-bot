import { createServer, type IncomingMessage, type Server, type ServerResponse } from "http";

export const DEFAULT_HEALTH_PORT = 10000;
export const HEALTH_HOST = "0.0.0.0";

export interface HealthServerOptions {
  port?: string | number;
}

export function resolveHealthPort(value: string | number | undefined): number {
  if (typeof value === "number") {
    return isValidPort(value) ? value : DEFAULT_HEALTH_PORT;
  }

  const parsed = Number(value);
  return isValidPort(parsed) ? parsed : DEFAULT_HEALTH_PORT;
}

export function handleHealthRequest(request: IncomingMessage, response: ServerResponse): void {
  if (request.method !== "GET" || (request.url !== "/" && request.url !== "/health")) {
    response.writeHead(404, {
      "content-type": "text/plain; charset=utf-8"
    });
    response.end("not found\n");
    return;
  }

  response.writeHead(200, {
    "cache-control": "no-store",
    "content-type": "text/plain; charset=utf-8"
  });
  response.end("kvestarnia ok\n");
}

export function startHealthServer(options: HealthServerOptions = {}): Server {
  const port = resolveHealthPort(options.port ?? process.env.PORT);
  const server = createServer(handleHealthRequest);

  server.listen(port, HEALTH_HOST, () => {
    console.log(`Квестарня: healthcheck HTTP server listening on ${HEALTH_HOST}:${port}.`);
  });

  return server;
}

function isValidPort(value: number): boolean {
  return Number.isInteger(value) && value > 0 && value <= 65535;
}
