import type { BotOptions } from "../botOptions";
import type { BotServices } from "../botServices";

export interface BotModuleDependencies {
  services: BotServices;
  options: BotOptions;
}
