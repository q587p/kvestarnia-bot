import "dotenv/config";

import { createRepositories } from "./app/createRepositories";
import { createRuntime } from "./app/createRuntime";
import { createServices } from "./app/createServices";
import { loadConfig } from "./config/env";
import { prisma } from "./db/prisma";

const config = loadConfig();
const repositories = createRepositories(prisma);
const services = createServices(repositories, config);
const runtime = createRuntime({
  config,
  prisma,
  services
});

function shutdown(): void {
  void runtime.stop();
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

void runtime.start();
