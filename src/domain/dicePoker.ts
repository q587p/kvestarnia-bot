export const DICE_POKER_RULES_VERSION = "dice-poker-v1";

export const DICE_POKER_DICE_COUNT = 5;
export const DICE_POKER_MAX_DRAW_ROUNDS = 3;
export const DICE_POKER_QUICK_PLAYER_CAP = 2;
export const DICE_POKER_SCORECARD_PLAYER_CAP = 8;

export type DicePokerMode = "quick" | "scorecard";

export type DicePokerQuickRank =
  | "poker"
  | "four_kind"
  | "full_house"
  | "large_straight"
  | "small_straight"
  | "triple"
  | "two_pairs"
  | "pair"
  | "high";

export interface DicePokerQuickHand {
  rank: DicePokerQuickRank;
  rankValue: number;
  tieBreak: number[];
}

export type DicePokerQuickOutcome = "win" | "loss" | "draw";

export interface DicePokerQuickRoundState {
  kind: "dice_poker";
  mode: "quick";
  phase: "quick-reroll";
  drawRound: number;
  playerDice: number[];
  opponentDice: number[];
  selectedMask: number;
}

export interface DicePokerQuickTerminalState {
  kind: "dice_poker";
  mode: "quick";
  phase: "terminal";
  outcome: DicePokerQuickOutcome | "refund";
  drawRound: number;
  playerDice: number[];
  opponentDice: number[];
  playerHand: DicePokerQuickHand;
  opponentHand: DicePokerQuickHand;
  reason: string;
}

export const DICE_POKER_SCORE_CATEGORIES = [
  "ones",
  "twos",
  "threes",
  "fours",
  "fives",
  "sixes",
  "triple",
  "four_kind",
  "full_house",
  "small_straight",
  "large_straight",
  "poker",
  "chance"
] as const;

export type DicePokerScoreCategory = typeof DICE_POKER_SCORE_CATEGORIES[number];

export interface DicePokerScorecardState {
  kind: "dice_poker";
  mode: "scorecard";
  phase: "scorecard-roll";
  turn: number;
  roll: number;
  dice: number[];
  selectedMask: number;
  scores: Partial<Record<DicePokerScoreCategory, number>>;
}

export interface DicePokerScorecardTerminalState {
  kind: "dice_poker";
  mode: "scorecard";
  phase: "terminal";
  outcome: "scorecard-complete";
  dice: number[];
  scores: Partial<Record<DicePokerScoreCategory, number>>;
  upperTotal: number;
  upperBonus: number;
  total: number;
}

export type DicePokerState =
  | DicePokerQuickRoundState
  | DicePokerQuickTerminalState
  | DicePokerScorecardState
  | DicePokerScorecardTerminalState;

export type DicePokerParticipantOutcome = "win" | "draw" | "loss";

export interface DicePokerTableState {
  kind: "dice_poker_table";
  mode: DicePokerMode;
  phase: "waiting" | "playing" | "terminal";
  playerCap: number;
  drawRound: number;
  outcomes?: Record<string, DicePokerParticipantOutcome>;
  totals?: Record<string, number>;
}

export type DicePokerStoredState = DicePokerState | DicePokerTableState;

export function startDicePokerTable(mode: DicePokerMode): DicePokerTableState {
  return {
    kind: "dice_poker_table",
    mode,
    phase: "waiting",
    playerCap: mode === "quick" ? DICE_POKER_QUICK_PLAYER_CAP : DICE_POKER_SCORECARD_PLAYER_CAP,
    drawRound: 1
  };
}

export function startQuickDicePoker(seed: string): DicePokerQuickRoundState {
  return startQuickDicePokerRound(seed, 1);
}

export function startQuickDicePokerRound(seed: string, drawRound: number): DicePokerQuickRoundState {
  return {
    kind: "dice_poker",
    mode: "quick",
    phase: "quick-reroll",
    drawRound,
    playerDice: rollDice(seed, `quick:player:${drawRound}`, DICE_POKER_DICE_COUNT),
    opponentDice: rollDice(seed, `quick:opponent:${drawRound}`, DICE_POKER_DICE_COUNT),
    selectedMask: 0
  };
}

export function toggleDieSelection(mask: number, index: number): number {
  if (!Number.isInteger(index) || index < 0 || index >= DICE_POKER_DICE_COUNT) {
    return mask;
  }

  return mask ^ (1 << index);
}

export function resolveQuickDicePokerRound(
  state: DicePokerQuickRoundState,
  seed: string,
  rerollMask = state.selectedMask
): DicePokerQuickRoundState | DicePokerQuickTerminalState {
  const playerDice = rerollByMask(
    state.playerDice,
    rerollMask,
    seed,
    `quick:player-reroll:${state.drawRound}`
  );
  const opponentKeepMask = chooseOpponentKeepMask(state.opponentDice);
  const opponentRerollMask = maskComplement(opponentKeepMask);
  const opponentDice = rerollByMask(
    state.opponentDice,
    opponentRerollMask,
    seed,
    `quick:opponent-reroll:${state.drawRound}`
  );
  const playerHand = evaluateQuickHand(playerDice);
  const opponentHand = evaluateQuickHand(opponentDice);
  const comparison = compareQuickHands(playerHand, opponentHand);

  if (comparison === 0) {
    if (state.drawRound >= DICE_POKER_MAX_DRAW_ROUNDS) {
      return {
        kind: "dice_poker",
        mode: "quick",
        phase: "terminal",
        outcome: "refund",
        drawRound: state.drawRound,
        playerDice,
        opponentDice,
        playerHand,
        opponentHand,
        reason: "Третя нічия поспіль. Допельґанґер повертає ставку, бо стіл уже почав рахувати себе мітологічним."
      };
    }

    const nextRound = state.drawRound + 1;
    return {
      kind: "dice_poker",
      mode: "quick",
      phase: "quick-reroll",
      drawRound: nextRound,
      playerDice: rollDice(seed, `quick:player:${nextRound}`, DICE_POKER_DICE_COUNT),
      opponentDice: rollDice(seed, `quick:opponent:${nextRound}`, DICE_POKER_DICE_COUNT),
      selectedMask: 0
    };
  }

  return {
    kind: "dice_poker",
    mode: "quick",
    phase: "terminal",
    outcome: comparison > 0 ? "win" : "loss",
    drawRound: state.drawRound,
    playerDice,
    opponentDice,
    playerHand,
    opponentHand,
    reason: comparison > 0
      ? `${quickRankNoun(playerHand.rank)} сильніша за ${quickRankNoun(opponentHand.rank)}.`
      : `${quickRankNoun(opponentHand.rank)} сильніша за ${quickRankNoun(playerHand.rank)}.`
  };
}

export function evaluateQuickHand(dice: readonly number[]): DicePokerQuickHand {
  assertDice(dice);
  const sortedAsc = [...dice].sort((left, right) => left - right);
  const counts = countFaces(sortedAsc);
  const groups = [...counts.entries()].sort((left, right) => right[1] - left[1] || right[0] - left[0]);
  const [primary, secondary] = groups;
  const unique = [...new Set(sortedAsc)].join(",");

  if (primary?.[1] === 5) {
    return { rank: "poker", rankValue: 8, tieBreak: [primary[0]] };
  }
  if (primary?.[1] === 4) {
    return { rank: "four_kind", rankValue: 7, tieBreak: [primary[0], ...kickers(groups, 1)] };
  }
  if (primary?.[1] === 3 && secondary?.[1] === 2) {
    return { rank: "full_house", rankValue: 6, tieBreak: [primary[0], secondary[0]] };
  }
  if (unique === "2,3,4,5,6") {
    return { rank: "large_straight", rankValue: 5, tieBreak: [6] };
  }
  if (unique === "1,2,3,4,5") {
    return { rank: "small_straight", rankValue: 4, tieBreak: [5] };
  }
  if (primary?.[1] === 3) {
    return { rank: "triple", rankValue: 3, tieBreak: [primary[0], ...kickers(groups, 1)] };
  }

  const pairs = groups.filter(([, count]) => count === 2).map(([face]) => face).sort((left, right) => right - left);
  if (pairs.length === 2) {
    return { rank: "two_pairs", rankValue: 2, tieBreak: [...pairs, ...kickers(groups, 1)] };
  }
  if (pairs.length === 1) {
    return { rank: "pair", rankValue: 1, tieBreak: [pairs[0]!, ...kickers(groups, 1)] };
  }

  return { rank: "high", rankValue: 0, tieBreak: [...sortedAsc].sort((left, right) => right - left) };
}

export function compareQuickHands(left: DicePokerQuickHand, right: DicePokerQuickHand): number {
  if (left.rankValue !== right.rankValue) {
    return left.rankValue - right.rankValue;
  }

  const width = Math.max(left.tieBreak.length, right.tieBreak.length);
  for (let index = 0; index < width; index += 1) {
    const diff = (left.tieBreak[index] ?? 0) - (right.tieBreak[index] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }

  return 0;
}

export function chooseOpponentKeepMask(dice: readonly number[]): number {
  const hand = evaluateQuickHand(dice);
  if (["poker", "four_kind", "full_house", "large_straight", "small_straight"].includes(hand.rank)) {
    return 0b11111;
  }

  const counts = countFaces(dice);
  if (hand.rank === "triple") {
    return maskForFaces(dice, facesWithCount(counts, 3));
  }
  if (hand.rank === "two_pairs") {
    return maskForFaces(dice, facesWithCount(counts, 2));
  }
  if (hand.rank === "pair") {
    return maskForFaces(dice, facesWithCount(counts, 2));
  }

  const straightMask = openStraightCandidateMask(dice);
  if (straightMask !== null) {
    return straightMask;
  }

  const highest = Math.max(...dice);
  return maskForFirstFace(dice, highest);
}

export function startScorecardDicePoker(seed: string): DicePokerScorecardState {
  return {
    kind: "dice_poker",
    mode: "scorecard",
    phase: "scorecard-roll",
    turn: 1,
    roll: 1,
    dice: rollDice(seed, "scorecard:turn:1:roll:1", DICE_POKER_DICE_COUNT),
    selectedMask: 0,
    scores: {}
  };
}

export function rerollScorecardDice(
  state: DicePokerScorecardState,
  seed: string
): DicePokerScorecardState {
  if (state.roll >= 3) {
    return state;
  }

  return {
    ...state,
    roll: state.roll + 1,
    dice: rerollByMask(
      state.dice,
      state.selectedMask,
      seed,
      `scorecard:turn:${state.turn}:roll:${state.roll + 1}`
    ),
    selectedMask: 0
  };
}

export function scoreScorecardCategory(
  state: DicePokerScorecardState,
  category: DicePokerScoreCategory,
  seed: string
): DicePokerScorecardState | DicePokerScorecardTerminalState {
  if (state.scores[category] !== undefined) {
    return state;
  }

  const scores = {
    ...state.scores,
    [category]: scoreDicePokerCategory(category, state.dice)
  };
  const filled = Object.keys(scores).length;
  if (filled >= DICE_POKER_SCORE_CATEGORIES.length) {
    const totals = totalScorecard(scores);
    return {
      kind: "dice_poker",
      mode: "scorecard",
      phase: "terminal",
      outcome: "scorecard-complete",
      dice: state.dice,
      scores,
      ...totals
    };
  }

  const nextTurn = state.turn + 1;
  return {
    kind: "dice_poker",
    mode: "scorecard",
    phase: "scorecard-roll",
    turn: nextTurn,
    roll: 1,
    dice: rollDice(seed, `scorecard:turn:${nextTurn}:roll:1`, DICE_POKER_DICE_COUNT),
    selectedMask: 0,
    scores
  };
}

export function scoreDicePokerCategory(
  category: DicePokerScoreCategory,
  dice: readonly number[]
): number {
  assertDice(dice);
  const counts = countFaces(dice);
  const sum = dice.reduce((total, value) => total + value, 0);

  switch (category) {
    case "ones":
      return sumFace(dice, 1);
    case "twos":
      return sumFace(dice, 2);
    case "threes":
      return sumFace(dice, 3);
    case "fours":
      return sumFace(dice, 4);
    case "fives":
      return sumFace(dice, 5);
    case "sixes":
      return sumFace(dice, 6);
    case "triple":
      return maxCount(counts) >= 3 ? sum : 0;
    case "four_kind":
      return maxCount(counts) >= 4 ? sum : 0;
    case "full_house":
      return [...counts.values()].sort((left, right) => right - left).join(",") === "3,2" ? 25 : 0;
    case "small_straight":
      return hasSequence(dice, [1, 2, 3, 4]) ||
        hasSequence(dice, [2, 3, 4, 5]) ||
        hasSequence(dice, [3, 4, 5, 6])
        ? 30
        : 0;
    case "large_straight":
      return hasSequence(dice, [1, 2, 3, 4, 5]) || hasSequence(dice, [2, 3, 4, 5, 6]) ? 40 : 0;
    case "poker":
      return maxCount(counts) === 5 ? 50 : 0;
    case "chance":
      return sum;
  }
}

export function previewScorecardScores(
  dice: readonly number[],
  scores: Partial<Record<DicePokerScoreCategory, number>>
): Array<{ category: DicePokerScoreCategory; score: number }> {
  return DICE_POKER_SCORE_CATEGORIES
    .filter((category) => scores[category] === undefined)
    .map((category) => ({ category, score: scoreDicePokerCategory(category, dice) }));
}

export function totalScorecard(scores: Partial<Record<DicePokerScoreCategory, number>>): {
  upperTotal: number;
  upperBonus: number;
  total: number;
} {
  const upperTotal =
    (scores.ones ?? 0) +
    (scores.twos ?? 0) +
    (scores.threes ?? 0) +
    (scores.fours ?? 0) +
    (scores.fives ?? 0) +
    (scores.sixes ?? 0);
  const upperBonus = upperTotal >= 63 ? 35 : 0;
  const lowerTotal = DICE_POKER_SCORE_CATEGORIES
    .filter((category) => !["ones", "twos", "threes", "fours", "fives", "sixes"].includes(category))
    .reduce((sum, category) => sum + (scores[category] ?? 0), 0);

  return {
    upperTotal,
    upperBonus,
    total: upperTotal + upperBonus + lowerTotal
  };
}

export function rollDice(seed: string, salt: string, count: number): number[] {
  return Array.from({ length: count }, (_, index) =>
    1 + (hashString(`${seed}:${salt}:${index}`) % 6)
  );
}

export function isDicePokerState(value: unknown): value is DicePokerState {
  return isRecord(value) && value.kind === "dice_poker" && (value.mode === "quick" || value.mode === "scorecard");
}

export function getStoredDicePokerState(value: unknown): DicePokerState | null {
  if (isDicePokerState(value)) {
    return value;
  }
  if (!isRecord(value) || value.kind !== "dice_poker") {
    return null;
  }

  return isDicePokerState(value.state) ? value.state : null;
}

export function resolveQuickPlayerHand(
  state: DicePokerQuickRoundState,
  seed: string,
  rerollSalt: string,
  rerollMask = state.selectedMask
): DicePokerQuickTerminalState {
  const playerDice = rerollByMask(
    state.playerDice,
    rerollMask,
    seed,
    `quick:player-reroll:${state.drawRound}:${rerollSalt}`
  );
  const playerHand = evaluateQuickHand(playerDice);

  return {
    kind: "dice_poker",
    mode: "quick",
    phase: "terminal",
    outcome: "draw",
    drawRound: state.drawRound,
    playerDice,
    opponentDice: [],
    playerHand,
    opponentHand: playerHand,
    reason: "Кидок записано. Чекаємо інших гравців."
  };
}

export function isDicePokerTableState(value: unknown): value is DicePokerTableState {
  return isRecord(value) &&
    value.kind === "dice_poker_table" &&
    (value.mode === "quick" || value.mode === "scorecard") &&
    (value.phase === "waiting" || value.phase === "playing" || value.phase === "terminal") &&
    Number.isInteger(value.playerCap) &&
    Number.isInteger(value.drawRound);
}

function rerollByMask(dice: readonly number[], mask: number, seed: string, salt: string): number[] {
  const rerolled = rollDice(seed, salt, dice.length);
  return dice.map((value, index) => ((mask & (1 << index)) !== 0 ? rerolled[index] ?? value : value));
}

function maskComplement(mask: number): number {
  return (0b11111 ^ mask) & 0b11111;
}

function countFaces(dice: readonly number[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const die of dice) {
    counts.set(die, (counts.get(die) ?? 0) + 1);
  }
  return counts;
}

function facesWithCount(counts: Map<number, number>, count: number): number[] {
  return [...counts.entries()].filter(([, value]) => value === count).map(([face]) => face);
}

function maskForFaces(dice: readonly number[], faces: readonly number[]): number {
  const kept = new Set(faces);
  return dice.reduce((mask, die, index) => kept.has(die) ? mask | (1 << index) : mask, 0);
}

function maskForFirstFace(dice: readonly number[], face: number): number {
  const index = dice.findIndex((die) => die === face);
  return index >= 0 ? (1 << index) : 0;
}

function openStraightCandidateMask(dice: readonly number[]): number | null {
  const candidates = [
    [1, 2, 3, 4],
    [2, 3, 4, 5],
    [3, 4, 5, 6]
  ];

  for (const candidate of candidates) {
    if (candidate.every((face) => dice.includes(face))) {
      const used = new Set<number>();
      let mask = 0;
      for (let index = 0; index < dice.length; index += 1) {
        const die = dice[index]!;
        if (candidate.includes(die) && !used.has(die)) {
          used.add(die);
          mask |= 1 << index;
        }
      }
      return mask;
    }
  }

  return null;
}

function kickers(groups: Array<[number, number]>, count: number): number[] {
  return groups
    .filter(([, groupCount]) => groupCount === count)
    .map(([face]) => face)
    .sort((left, right) => right - left);
}

function sumFace(dice: readonly number[], face: number): number {
  return dice.filter((die) => die === face).reduce((sum, die) => sum + die, 0);
}

function maxCount(counts: Map<number, number>): number {
  return Math.max(...counts.values());
}

function hasSequence(dice: readonly number[], sequence: readonly number[]): boolean {
  const faces = new Set(dice);
  return sequence.every((face) => faces.has(face));
}

function assertDice(dice: readonly number[]): void {
  if (dice.length !== DICE_POKER_DICE_COUNT || dice.some((die) => !Number.isInteger(die) || die < 1 || die > 6)) {
    throw new RangeError("Dice poker expects five d6 values.");
  }
}

function quickRankNoun(rank: DicePokerQuickRank): string {
  return {
    poker: "покер",
    four_kind: "каре",
    full_house: "фул-хаус",
    large_straight: "великий стріт",
    small_straight: "малий стріт",
    triple: "трійка",
    two_pairs: "дві пари",
    pair: "пара",
    high: "старша кістка"
  }[rank];
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
