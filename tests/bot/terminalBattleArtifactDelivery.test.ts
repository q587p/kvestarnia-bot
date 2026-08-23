import { describe, expect, it } from "vitest";
import { buildFightResultKeyboard, buildPersistentFightResultKeyboard } from "../../src/bot/keyboards/fightKeyboard";
import { buildTrainingDoppelgangerKeyboard } from "../../src/bot/keyboards/trainingDoppelgangerKeyboard";
import {
  buildMimicTerminalBattleArtifactKeyboardOptions,
  buildSessionTerminalBattleArtifactKeyboardOptions
} from "../../src/bot/terminalBattleArtifactLink";
import type { SoloCombatSessionRecord } from "../../src/db/repositories/soloCombatSessionRepository";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";
import {
  findTerminalBattleArtifactShareButtons,
  inspectSingleTerminalBattleArtifactShare
} from "../helpers/terminalBattleArtifactShare";

const soloToken = "123e4567-e89b-42d3-a456-426614174000";
const trainingToken = "123e4567-e89b-42d3-a456-426614174001";
const mimicToken = "123e4567-e89b-42d3-a456-426614174002";

describe("terminal battle artifact delivery options", () => {
  it.each(["completed", "already-completed"] as const)(
    "adds one round-trippable share row to a %s Mimic result",
    (state) => {
      const keyboard = buildFightResultKeyboard(
        state,
        character,
        mimicToken,
        buildMimicTerminalBattleArtifactKeyboardOptions("kvestarnia_bot", state, mimicToken)
      );

      expect(inspectSingleTerminalBattleArtifactShare(keyboard).parsed).toEqual({
        type: "terminal-battle-artifact",
        kind: "mimic",
        token: mimicToken
      });
    }
  );

  it("adds one round-trippable share row to terminal solo and Training cards", () => {
    const solo = terminalSession(soloToken, "won");
    const training = terminalSession(trainingToken, "lost");

    const soloShare = inspectSingleTerminalBattleArtifactShare(buildPersistentFightResultKeyboard(
      solo,
      character,
      buildSessionTerminalBattleArtifactKeyboardOptions("kvestarnia_bot", "solo", solo)
    ));
    const trainingShare = inspectSingleTerminalBattleArtifactShare(buildTrainingDoppelgangerKeyboard(
      training,
      character,
      buildSessionTerminalBattleArtifactKeyboardOptions("kvestarnia_bot", "training", training)
    ));

    expect(soloShare.parsed).toMatchObject({ kind: "solo", token: soloToken });
    expect(trainingShare.parsed).toMatchObject({ kind: "training", token: trainingToken });
  });

  it("never exposes share URLs on active solo, Training, or Mimic cards", () => {
    const solo = terminalSession(soloToken, "active");
    const training = terminalSession(trainingToken, "active");

    expect(findTerminalBattleArtifactShareButtons(buildPersistentFightResultKeyboard(
      solo,
      character,
      buildSessionTerminalBattleArtifactKeyboardOptions("kvestarnia_bot", "solo", solo)
    ))).toEqual([]);
    expect(findTerminalBattleArtifactShareButtons(buildTrainingDoppelgangerKeyboard(
      training,
      character,
      buildSessionTerminalBattleArtifactKeyboardOptions("kvestarnia_bot", "training", training)
    ))).toEqual([]);
    expect(findTerminalBattleArtifactShareButtons(buildFightResultKeyboard("completed", character))).toEqual([]);
  });

  it("suppresses malformed usernames and artifact tokens instead of emitting malformed URLs", () => {
    const terminal = terminalSession(soloToken, "won");
    const malformedSession = terminalSession("not-a-uuid", "won");

    expect(buildSessionTerminalBattleArtifactKeyboardOptions("bad/name", "solo", terminal))
      .toEqual({ artifactUrl: null });
    expect(buildSessionTerminalBattleArtifactKeyboardOptions(undefined, "solo", terminal))
      .toEqual({ artifactUrl: null });
    expect(buildSessionTerminalBattleArtifactKeyboardOptions("kvestarnia_bot", "solo", malformedSession))
      .toEqual({ artifactUrl: null });
    expect(buildSessionTerminalBattleArtifactKeyboardOptions("kvestarnia_bot", "solo", {
      id: soloToken,
      status: "unknown"
    })).toEqual({ artifactUrl: null });
  });
});

function terminalSession(id: string, status: "active" | "won" | "lost"): SoloCombatSessionRecord {
  return {
    id,
    characterId: "character-1",
    monsterId: "monster.deadline-spider",
    status,
    turn: 1,
    state: {
      id,
      source: "normal",
      status,
      turn: 1,
      hero: { hp: status === "lost" ? 0 : 20, hpMax: 20, mana: 10, manaMax: 10 },
      monster: {
        id: "monster.deadline-spider",
        name: "Павук дедлайнів",
        level: 2,
        hp: status === "won" ? 0 : 18,
        hpMax: 18
      }
    },
    reward: null,
    createdAt: new Date("2026-08-23T10:00:00.000Z"),
    updatedAt: new Date("2026-08-23T10:00:00.000Z"),
    expiresAt: new Date("2026-08-23T10:23:00.000Z")
  };
}

const character: CharacterSummary = {
  name: "Мандрівник",
  pronoun: "they",
  pronounLabel: "Вони",
  path: "boundary",
  raceId: "race.human-ish",
  raceName: "Людисько",
  classId: "class.warrior",
  className: "Воїн",
  title: "Пересічний Пригодник",
  level: 3,
  xp: 30,
  nextLevelXp: 50,
  xpToNextLevel: 20,
  gold: 9,
  hpCurrent: 20,
  hpMax: 20,
  manaCurrent: 10,
  manaMax: 10,
  stats: { strength: 9, dexterity: 6, intelligence: 6, charisma: 6, luck: 6 },
  levelBonus: { hpMax: 6, manaMax: 3, primaryStat: { stat: "strength", bonus: 2 } }
};
