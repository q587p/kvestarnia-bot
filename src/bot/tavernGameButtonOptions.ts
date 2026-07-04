import type { TavernGameService } from "../services/tavernGameService";

export interface TavernGameButtonOptions {
  tavernGames: boolean;
  tavernGameTableCount?: number;
}

export async function getTavernGameButtonOptions(
  tavernGames?: Pick<TavernGameService, "getHub" | "isEnabled">
): Promise<TavernGameButtonOptions> {
  if (!tavernGames?.isEnabled()) {
    return { tavernGames: false };
  }

  const hub = await tavernGames.getHub();

  return {
    tavernGames: true,
    tavernGameTableCount: hub.state === "ready" ? hub.openTables.length : 0
  };
}
