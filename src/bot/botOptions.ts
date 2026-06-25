import type { SupportJarStatus } from "../config/env";

export interface BotOptions {
  supportJarUrl?: string;
  supportJarStatus?: SupportJarStatus;
  botUsername?: string;
}
