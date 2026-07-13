export interface RuntimeReadiness {
  isReady(): boolean;
  markDatabaseReady(): void;
  markPollingReady(): void;
  markFailed(): void;
  markStopping(): void;
}

export function createRuntimeReadiness(): RuntimeReadiness {
  let databaseReady = false;
  let pollingReady = false;
  let failed = false;
  let stopping = false;

  return {
    isReady(): boolean {
      return databaseReady && pollingReady && !failed && !stopping;
    },
    markDatabaseReady(): void {
      databaseReady = true;
    },
    markPollingReady(): void {
      pollingReady = true;
    },
    markFailed(): void {
      failed = true;
    },
    markStopping(): void {
      stopping = true;
    }
  };
}
