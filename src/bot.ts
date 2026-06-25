import "dotenv/config";

import { createRepositories } from "./app/createRepositories";
import { registerSignalShutdown } from "./app/registerSignalShutdown";
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

registerSignalShutdown(runtime);

void runtime.start();
