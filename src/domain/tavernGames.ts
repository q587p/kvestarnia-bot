export const TAVERN_GAME_RULES_VERSION = "tavern-games-v1";
export const TAVLEI_DOPPELGANGER_RULES_VERSION = "tavlei-doppelganger-v1";
export const TAVLEI_DOPPELGANGER_CHARACTER_ID = "__doppelganger__";
export const TAVLEI_DOPPELGANGER_NAME = "Сумлінний Допельґанґер";

export const TAVERN_GAME_KEYS = ["tavlei", "kosti"] as const;
export type TavernGameKey = typeof TAVERN_GAME_KEYS[number];

export const TAVLEI_TACTICS = [
  "careful_defense",
  "quiet_trap",
  "sharp_opening",
  "long_game"
] as const;
export type TavleiTactic = typeof TAVLEI_TACTICS[number];

export const KOSTI_STYLES = ["steady", "push", "sign_hunter"] as const;
export type KostiStyle = typeof KOSTI_STYLES[number];

export const KOSTI_SIGNS = ["two_pairs", "triple", "high_hand", "straight", "tower", "no_sign"] as const;
export type KostiSign = typeof KOSTI_SIGNS[number];

export const TAVLEI_PLAYER_CAP = 2;
export const KOSTI_MIN_PLAYERS = 2;
export const KOSTI_PLAYER_CAP = 7;

export interface TavernGamePlayer {
  participantId: string;
  characterId: string;
  name: string;
  level: number;
  stats: {
    intelligence: number;
    luck: number;
  };
  stakeGold: number;
  decision?: unknown;
}

export interface TavleiDoppelgangerState {
  kind: "tavlei_doppelganger";
  opponent: "doppelganger";
}

export type TavernGameDecision =
  | { gameKey: "tavlei"; tactic: TavleiTactic }
  | { gameKey: "kosti"; style: KostiStyle; sign: KostiSign };

export type TavernGameResolution =
  | {
      gameKey: "tavlei";
      outcome: "win";
      potGold: number;
      payouts: Record<string, number>;
      refunds: Record<string, number>;
      players: Array<{
        participantId: string;
        characterId: string;
        name: string;
        tactic: TavleiTactic;
      }>;
      winnerCharacterId: string;
      winnerName: string;
      loserName: string;
      narrativeKey: string;
      opponentKind?: "doppelganger";
    }
  | {
      gameKey: "tavlei";
      outcome: "draw";
      potGold: number;
      payouts: Record<string, number>;
      refunds: Record<string, number>;
      players: Array<{
        participantId: string;
        characterId: string;
        name: string;
        tactic: TavleiTactic;
      }>;
      opponentKind?: "doppelganger";
    }
  | {
      gameKey: "kosti";
      outcome: "completed";
      potGold: number;
      mainPoolGold: number;
      signPoolGold: number;
      payouts: Record<string, number>;
      refunds: Record<string, number>;
      mainWinnerCharacterId: string;
      mainWinnerName: string;
      signWinnerCharacterIds: string[];
      signWinnerNames: string[];
      signShareGold: number;
      unusedSignPoolToMain: boolean;
      players: Array<{
        participantId: string;
        characterId: string;
        name: string;
        style: KostiStyle;
        sign: KostiSign;
        dice: number[];
        handLabel: KostiHandLabel;
        rank: number;
        score: number;
        sum: number;
        signMatched: boolean;
      }>;
    };

export type KostiHandLabel =
  | "five_kind"
  | "straight"
  | "four_kind"
  | "full_house"
  | "triple"
  | "two_pairs"
  | "pair"
  | "high";

export function isTavernGameKey(value: string): value is TavernGameKey {
  return (TAVERN_GAME_KEYS as readonly string[]).includes(value);
}

export function isTavleiTactic(value: string): value is TavleiTactic {
  return (TAVLEI_TACTICS as readonly string[]).includes(value);
}

export function isTavleiDoppelgangerState(value: unknown): value is TavleiDoppelgangerState {
  return isRecord(value) && value.kind === "tavlei_doppelganger" && value.opponent === "doppelganger";
}

export function isKostiStyle(value: string): value is KostiStyle {
  return (KOSTI_STYLES as readonly string[]).includes(value);
}

export function isKostiSign(value: string): value is KostiSign {
  return (KOSTI_SIGNS as readonly string[]).includes(value);
}

export function parseTavernGameDecision(
  gameKey: "tavlei",
  value: unknown
): Extract<TavernGameDecision, { gameKey: "tavlei" }>;
export function parseTavernGameDecision(
  gameKey: "kosti",
  value: unknown
): Extract<TavernGameDecision, { gameKey: "kosti" }>;
export function parseTavernGameDecision(gameKey: TavernGameKey, value: unknown): TavernGameDecision;
export function parseTavernGameDecision(gameKey: TavernGameKey, value: unknown): TavernGameDecision {
  if (gameKey === "tavlei") {
    const tactic = isRecord(value) && typeof value.tactic === "string" && isTavleiTactic(value.tactic)
      ? value.tactic
      : "careful_defense";
    return { gameKey, tactic };
  }

  return {
    gameKey,
    style: isRecord(value) && typeof value.style === "string" && isKostiStyle(value.style)
      ? value.style
      : "steady",
    sign: isRecord(value) && typeof value.sign === "string" && isKostiSign(value.sign)
      ? value.sign
      : "high_hand"
  };
}

export function resolveTavernGame(input: {
  gameKey: TavernGameKey;
  seed: string;
  stakeGold: number;
  players: TavernGamePlayer[];
}): TavernGameResolution {
  if (input.gameKey === "tavlei") {
    return resolveTavlei(input);
  }

  return resolveKosti(input);
}

export function resolveTavlei(input: {
  seed: string;
  stakeGold: number;
  players: TavernGamePlayer[];
}): Extract<TavernGameResolution, { gameKey: "tavlei" }> {
  if (input.players.length !== 2) {
    throw new Error("Tavlei requires exactly two players.");
  }

  const [left, right] = input.players;
  if (!left || !right) {
    throw new Error("Tavlei player list is incomplete.");
  }

  const leftDecision = parseTavernGameDecision("tavlei", left.decision);
  const rightDecision = parseTavernGameDecision("tavlei", right.decision);
  const leftScore = scoreTavlei(input.seed, left, leftDecision.tactic, rightDecision.tactic);
  const rightScore = scoreTavlei(input.seed, right, rightDecision.tactic, leftDecision.tactic);
  const potGold = input.stakeGold * 2;
  const players = [
    {
      participantId: left.participantId,
      characterId: left.characterId,
      name: left.name,
      tactic: leftDecision.tactic
    },
    {
      participantId: right.participantId,
      characterId: right.characterId,
      name: right.name,
      tactic: rightDecision.tactic
    }
  ];

  if (Math.abs(leftScore - rightScore) <= 1) {
    return {
      gameKey: "tavlei",
      outcome: "draw",
      potGold,
      payouts: {},
      refunds: {
        [left.characterId]: input.stakeGold,
        [right.characterId]: input.stakeGold
      },
      players
    };
  }

  const winner = leftScore > rightScore ? left : right;
  const loser = winner.characterId === left.characterId ? right : left;

  return {
    gameKey: "tavlei",
    outcome: "win",
    potGold,
    payouts: { [winner.characterId]: potGold },
    refunds: {},
    players,
    winnerCharacterId: winner.characterId,
    winnerName: winner.name,
    loserName: loser.name,
    narrativeKey: `${winner === left ? leftDecision.tactic : rightDecision.tactic}:${
      winner === left ? rightDecision.tactic : leftDecision.tactic
    }`
  };
}

export function resolveTavleiDoppelganger(input: {
  seed: string;
  stakeGold: number;
  player: TavernGamePlayer;
}): Extract<TavernGameResolution, { gameKey: "tavlei" }> {
  const playerDecision = parseTavernGameDecision("tavlei", input.player.decision);
  const opponentTactic = TAVLEI_TACTICS[hashString(`${input.seed}:doppelganger:tactic`) % TAVLEI_TACTICS.length]!;
  const opponent: TavernGamePlayer = {
    participantId: "doppelganger",
    characterId: TAVLEI_DOPPELGANGER_CHARACTER_ID,
    name: TAVLEI_DOPPELGANGER_NAME,
    level: input.player.level,
    stats: input.player.stats,
    stakeGold: 0,
    decision: { gameKey: "tavlei", tactic: opponentTactic }
  };
  const playerScore = scoreTavlei(input.seed, input.player, playerDecision.tactic, opponentTactic);
  const opponentScore = scoreTavlei(input.seed, opponent, opponentTactic, playerDecision.tactic);
  const players = [
    {
      participantId: input.player.participantId,
      characterId: input.player.characterId,
      name: input.player.name,
      tactic: playerDecision.tactic
    },
    {
      participantId: opponent.participantId,
      characterId: opponent.characterId,
      name: opponent.name,
      tactic: opponentTactic
    }
  ];

  if (Math.abs(playerScore - opponentScore) <= 1) {
    return {
      gameKey: "tavlei",
      outcome: "draw",
      potGold: input.stakeGold,
      payouts: {},
      refunds: { [input.player.characterId]: input.stakeGold },
      players,
      opponentKind: "doppelganger"
    };
  }

  const playerWon = playerScore > opponentScore;
  const winner = playerWon ? input.player : opponent;
  const loser = playerWon ? opponent : input.player;

  return {
    gameKey: "tavlei",
    outcome: "win",
    potGold: input.stakeGold,
    payouts: { [winner.characterId]: input.stakeGold },
    refunds: {},
    players,
    winnerCharacterId: winner.characterId,
    winnerName: winner.name,
    loserName: loser.name,
    narrativeKey: `${playerWon ? playerDecision.tactic : opponentTactic}:${
      playerWon ? opponentTactic : playerDecision.tactic
    }`,
    opponentKind: "doppelganger"
  };
}

export function resolveKosti(input: {
  seed: string;
  stakeGold: number;
  players: TavernGamePlayer[];
}): Extract<TavernGameResolution, { gameKey: "kosti" }> {
  if (input.players.length < KOSTI_MIN_PLAYERS || input.players.length > KOSTI_PLAYER_CAP) {
    throw new Error("Kosti requires two to seven players.");
  }

  const potGold = input.stakeGold * input.players.length;
  const mainPoolGold = Math.floor(potGold * 0.7);
  const signPoolGold = potGold - mainPoolGold;
  const players = input.players.map((player, index) => {
    const decision = parseTavernGameDecision("kosti", player.decision);
    const dice = rollDice(input.seed, `${player.participantId}:${index}`, 5, 6);
    const hand = rankKostiHand(dice);
    const styleScore = applyKostiStyle(hand.rank, hand.sum, decision.style);

    return {
      participantId: player.participantId,
      characterId: player.characterId,
      name: player.name,
      style: decision.style,
      sign: decision.sign,
      dice,
      handLabel: hand.label,
      rank: hand.rank,
      score: hand.rank + styleScore,
      sum: hand.sum,
      signMatched: matchesKostiSign(decision.sign, dice)
    };
  });

  const ordered = [...players].sort((left, right) =>
    right.score - left.score ||
    right.rank - left.rank ||
    right.sum - left.sum ||
    Math.max(...right.dice) - Math.max(...left.dice) ||
    seededTieBreak(input.seed, left.participantId) - seededTieBreak(input.seed, right.participantId)
  );
  const mainWinner = ordered[0];
  if (!mainWinner) {
    throw new Error("Kosti winner is missing.");
  }

  const signWinners = players.filter((player) => player.signMatched);
  const payouts: Record<string, number> = { [mainWinner.characterId]: mainPoolGold };
  let signShareGold = 0;
  let unusedSignPoolToMain = false;

  if (signWinners.length === 0) {
    payouts[mainWinner.characterId] = (payouts[mainWinner.characterId] ?? 0) + signPoolGold;
    unusedSignPoolToMain = true;
  } else {
    signShareGold = Math.floor(signPoolGold / signWinners.length);
    const remainder = signPoolGold - signShareGold * signWinners.length;
    for (const winner of signWinners) {
      payouts[winner.characterId] = (payouts[winner.characterId] ?? 0) + signShareGold;
    }
    payouts[mainWinner.characterId] = (payouts[mainWinner.characterId] ?? 0) + remainder;
  }

  const paidTotal = Object.values(payouts).reduce((sum, value) => sum + value, 0);
  if (paidTotal !== potGold) {
    throw new Error(`Kosti payout mismatch: ${paidTotal} != ${potGold}`);
  }

  return {
    gameKey: "kosti",
    outcome: "completed",
    potGold,
    mainPoolGold,
    signPoolGold,
    payouts,
    refunds: {},
    mainWinnerCharacterId: mainWinner.characterId,
    mainWinnerName: mainWinner.name,
    signWinnerCharacterIds: signWinners.map((player) => player.characterId),
    signWinnerNames: signWinners.map((player) => player.name),
    signShareGold,
    unusedSignPoolToMain,
    players
  };
}

export function rankKostiHand(dice: readonly number[]): { label: KostiHandLabel; rank: number; sum: number } {
  const sorted = [...dice].sort((left, right) => left - right);
  const sum = sorted.reduce((total, value) => total + value, 0);
  const counts = countFaces(sorted);
  const groups = [...counts.entries()].sort((left, right) => right[1] - left[1] || right[0] - left[0]);
  const [primary, secondary] = groups;
  const isStraight = isKostiStraight(sorted);

  if (primary?.[1] === 5) {
    return { label: "five_kind", rank: 700 + primary[0] * 10, sum };
  }
  if (isStraight) {
    return { label: "straight", rank: 650 + sorted[4]!, sum };
  }
  if (primary?.[1] === 4) {
    const kicker = groups.find(([, count]) => count === 1)?.[0] ?? 0;
    return { label: "four_kind", rank: 600 + primary[0] * 10 + kicker, sum };
  }
  if (primary?.[1] === 3 && secondary?.[1] === 2) {
    return { label: "full_house", rank: 550 + primary[0] * 10 + secondary[0], sum };
  }
  if (primary?.[1] === 3) {
    const kickersSum = groups.filter(([, count]) => count === 1).reduce((total, [face]) => total + face, 0);
    return { label: "triple", rank: 500 + primary[0] * 10 + kickersSum, sum };
  }
  const pairs = groups.filter(([, count]) => count === 2).map(([face]) => face).sort((left, right) => right - left);
  if (pairs.length === 2) {
    const kicker = groups.find(([, count]) => count === 1)?.[0] ?? 0;
    return { label: "two_pairs", rank: 400 + pairs[0]! * 10 + pairs[1]! + kicker, sum };
  }
  if (pairs.length === 1) {
    const kickersSum = groups.filter(([, count]) => count === 1).reduce((total, [face]) => total + face, 0);
    return { label: "pair", rank: 300 + pairs[0]! * 10 + kickersSum, sum };
  }

  return { label: "high", rank: 100 + sum, sum };
}

export function matchesKostiSign(sign: KostiSign, dice: readonly number[]): boolean {
  const counts = [...countFaces(dice).values()].sort((left, right) => right - left);
  const sum = dice.reduce((total, value) => total + value, 0);

  switch (sign) {
    case "two_pairs":
      return counts.join(",") === "2,2,1";
    case "triple":
      return (counts[0] ?? 0) >= 3;
    case "high_hand":
      return sum >= 22;
    case "straight":
      return isKostiStraight([...dice].sort((left, right) => left - right));
    case "tower":
      return (counts[0] ?? 0) >= 4;
    case "no_sign":
      return false;
  }
}

const tavleiMatchup: Record<TavleiTactic, Record<TavleiTactic, number>> = {
  careful_defense: {
    careful_defense: 0,
    quiet_trap: 4,
    sharp_opening: -2,
    long_game: -4
  },
  quiet_trap: {
    careful_defense: -4,
    quiet_trap: 0,
    sharp_opening: 5,
    long_game: -2
  },
  sharp_opening: {
    careful_defense: 2,
    quiet_trap: -5,
    sharp_opening: 0,
    long_game: 5
  },
  long_game: {
    careful_defense: 4,
    quiet_trap: 2,
    sharp_opening: -5,
    long_game: 0
  }
};

function scoreTavlei(
  seed: string,
  player: TavernGamePlayer,
  tactic: TavleiTactic,
  opponentTactic: TavleiTactic
): number {
  const roll = rollDice(seed, player.participantId, 2, 10).reduce((sum, value) => sum + value, 0);
  return roll +
    player.stats.intelligence * 1.8 +
    player.stats.luck * 0.6 +
    tavleiMatchup[tactic][opponentTactic] +
    Math.min(3, Math.floor(player.level / 5));
}

function rollDice(seed: string, salt: string, count: number, sides: number): number[] {
  return Array.from({ length: count }, (_, index) =>
    1 + (hashString(`${seed}:${salt}:${index}`) % sides)
  );
}

function seededTieBreak(seed: string, participantId: string): number {
  return hashString(`${seed}:tie:${participantId}`);
}

function applyKostiStyle(rank: number, sum: number, style: KostiStyle): number {
  if (style === "steady" && rank < 500) {
    return 2;
  }
  if (style === "push" && (rank >= 500 || sum >= 22)) {
    return 3;
  }
  if (style === "push" && rank < 400) {
    return -4;
  }
  if (style === "sign_hunter") {
    return -2;
  }

  return 0;
}

function countFaces(dice: readonly number[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const die of dice) {
    counts.set(die, (counts.get(die) ?? 0) + 1);
  }
  return counts;
}

function isKostiStraight(sortedDice: readonly number[]): boolean {
  const value = [...new Set(sortedDice)].join(",");
  return value === "1,2,3,4,5" || value === "2,3,4,5,6";
}

function hashString(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
