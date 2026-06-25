import { type Context } from "grammy";
import {
type PresenceService
} from "../../services/presenceService";
import { playerFromContext } from "../context";
import type { PresenceContext } from "../presence/presenceRouting";

export async function markScenePresence(
  ctx: Context,
  presenceService: PresenceService,
  context: PresenceContext
): Promise<void> {
  const player = playerFromContext(ctx.from);

  if (!player) {
    return;
  }

  await presenceService.markAction({
    user: player,
    ...context
  });
}
