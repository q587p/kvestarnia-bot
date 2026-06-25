import type { ApplicationRuntime } from "./createRuntime";

export function registerSignalShutdown(runtime: Pick<ApplicationRuntime, "stop">): void {
  const shutdown = (): void => {
    void runtime.stop().catch((error) => {
      console.error("Квестарня: runtime не зупинився чисто.", error);
    });
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
