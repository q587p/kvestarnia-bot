import type { Context } from "grammy";
import {
  getStoredDicePokerState,
  isDicePokerState,
  isDicePokerTableState,
  type DicePokerState
} from "../domain/dicePoker";
import {
  buildShynokDicePokerKeyboard,
  buildShynokGameSessionKeyboard,
  buildShynokKostiDecisionKeyboard,
  buildShynokTavleiDecisionKeyboard
} from "./keyboards/shynokKeyboard";
import type { QuestMarkerInput } from "./keyboards/questButtonMarkers";
import {
  presentTavernGameActionResult,
  presentTavernGameSession
} from "./presenters/tavernGamePresenter";

const HTML_MESSAGE_OPTIONS = {
  parse_mode: "HTML" as const
};

type TavernGameActionResult = Parameters<typeof presentTavernGameActionResult>[0];

export function buildTavernGameActionKeyboard(result: {
  state: string;
  dicePoker?: DicePokerState;
  session?: {
    token: string;
    gameKey: "tavlei" | "kosti";
    status: string;
    creatorCharacterId: string;
    result?: unknown;
    participants: Array<{
      telegramUserId: bigint;
      status: string;
      decision: unknown;
      characterId: string;
    }>;
  };
}, telegramUserId: bigint, options: {
  questMarkers?: QuestMarkerInput | null;
  inviteUrl?: string | null | undefined;
} = {}) {
  const participant = result.session?.participants.find((row) => row.telegramUserId === telegramUserId);
  const table = isDicePokerTableState(result.session?.result) ? result.session.result : null;
  const tableIsClosed = result.state === "closed" ||
    result.state === "stale" ||
    result.session?.status === "completed" ||
    table?.phase === "terminal";
  const dicePoker = table
    ? (!tableIsClosed && table.phase === "playing" && isDicePokerState(participant?.decision)
        ? participant.decision
        : null)
    : result.dicePoker ?? getStoredDicePokerState(result.session?.result);
  if (result.session && dicePoker) {
    return buildShynokDicePokerKeyboard(result.session.token, dicePoker, {
      allowCancel: !table,
      allowRematch: result.session.status === "completed" && dicePoker.phase === "terminal"
    });
  }
  if (table) {
    return buildShynokGameSessionKeyboard(result, { viewerTelegramUserId: telegramUserId, ...options });
  }

  const canChoose = participant &&
    (participant.status === "joined" || participant.status === "decided") &&
    !participant.decision;

  if (result.session?.gameKey === "tavlei" && result.session.status === "ready" && canChoose) {
    return buildShynokTavleiDecisionKeyboard(result.session.token);
  }
  if (
    result.session?.gameKey === "kosti" &&
    (result.session.status === "open" || result.session.status === "ready") &&
    canChoose
  ) {
    return buildShynokKostiDecisionKeyboard(result.session.token);
  }

  return buildShynokGameSessionKeyboard(result, { viewerTelegramUserId: telegramUserId, ...options });
}

export function buildTavernGameInviteUrl(botUsername: string | undefined, token: string): string | null {
  if (!botUsername) {
    return null;
  }

  return `https://t.me/${botUsername}?start=game_${token}`;
}

export async function notifyTavernGameParticipants(
  ctx: Context,
  result: TavernGameActionResult,
  actorTelegramUserId: bigint,
  options: { botUsername?: string | undefined } = {}
): Promise<void> {
  if (!shouldNotifyTavernGameParticipants(result)) {
    return;
  }

  const session = result.session;
  if (!session) {
    return;
  }

  const recipients = session.participants.filter((participant) =>
    participant.telegramUserId !== actorTelegramUserId
  );

  if (recipients.length === 0) {
    return;
  }

  await Promise.allSettled(recipients.map((participant) =>
    ctx.api.sendMessage(
      Number(participant.telegramUserId),
      presentTavernGameParticipantUpdate(result, participant.telegramUserId),
      {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildTavernGameActionKeyboard(result, participant.telegramUserId, {
          inviteUrl: buildTavernGameInviteUrl(options.botUsername, session.token)
        })
      }
    )
  ));
}

function shouldNotifyTavernGameParticipants(result: TavernGameActionResult): boolean {
  return [
    "joined",
    "started",
    "decided",
    "resolved",
    "completed",
    "cancelled",
    "failed-refund",
    "game-disabled-refunded"
  ].includes(result.state);
}

function presentTavernGameParticipantUpdate(
  result: TavernGameActionResult,
  viewerTelegramUserId?: bigint
): string {
  if (!result.session) {
    return presentTavernGameActionResult({ ...result, viewerTelegramUserId });
  }

  if (result.state === "joined") {
    return ["До столу підсів ще один пригодник.", "", presentTavernGameSession(result.session)].join("\n");
  }

  if (result.state === "started") {
    return ["Партія почалась.", "", presentTavernGameActionResult({ ...result, viewerTelegramUserId })].join("\n");
  }

  if (result.state === "decided") {
    return ["За столом зроблено вибір.", "", presentTavernGameSession(result.session)].join("\n");
  }

  return presentTavernGameActionResult({ ...result, viewerTelegramUserId });
}
