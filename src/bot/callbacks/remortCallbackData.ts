import { err, ok, type Result } from "../../shared/result";

export type RemortCallback =
  | { type: "open" }
  | { type: "pronoun"; token: string; pronoun: string }
  | { type: "race"; token: string; raceKey: string }
  | { type: "class"; token: string; classKey: string }
  | { type: "item"; token: string; itemId: string }
  | { type: "confirm"; token: string };

const TOKEN_RE = /^[a-f0-9]{16}$/;
const KEY_RE = /^[a-z0-9-]+$/;
const ITEM_KEY_RE = /^[a-z]+(\.[a-z0-9]+(?:-[a-z0-9]+)*)+$/;

export function makeRemortOpenCallbackData(): string {
  return "v1:rm:open";
}

export function makeRemortPronounCallbackData(token: string, pronoun: string): string {
  return assertCallbackLength(`v1:rm:pr:${token}:${pronoun}`);
}

export function makeRemortRaceCallbackData(token: string, raceKey: string): string {
  return assertCallbackLength(`v1:rm:ra:${token}:${raceKey}`);
}

export function makeRemortClassCallbackData(token: string, classKey: string): string {
  return assertCallbackLength(`v1:rm:cl:${token}:${classKey}`);
}

export function makeRemortItemCallbackData(token: string, itemId: string): string {
  return assertCallbackLength(`v1:rm:it:${token}:${itemId}`);
}

export function makeRemortConfirmCallbackData(token: string): string {
  return assertCallbackLength(`v1:rm:go:${token}`);
}

export function parseRemortCallbackData(data: string | undefined): Result<RemortCallback, "invalid"> {
  if (!data) {
    return err("invalid");
  }

  const parts = data.split(":");

  if (parts[0] !== "v1" || parts[1] !== "rm") {
    return err("invalid");
  }

  if (parts[2] === "open" && parts.length === 3) {
    return ok({ type: "open" });
  }

  const token = parts[3];
  if (!token || !TOKEN_RE.test(token)) {
    return err("invalid");
  }

  const value = parts[4];

  if (parts[2] === "pr" && parts.length === 5 && value && ["he", "she", "they"].includes(value)) {
    return ok({ type: "pronoun", token, pronoun: value });
  }

  if (parts[2] === "ra" && parts.length === 5 && value && KEY_RE.test(value)) {
    return ok({ type: "race", token, raceKey: value });
  }

  if (parts[2] === "cl" && parts.length === 5 && value && KEY_RE.test(value)) {
    return ok({ type: "class", token, classKey: value });
  }

  if (parts[2] === "it" && parts.length === 5 && value && ITEM_KEY_RE.test(value)) {
    return ok({ type: "item", token, itemId: value });
  }

  if (parts[2] === "go" && parts.length === 4) {
    return ok({ type: "confirm", token });
  }

  return err("invalid");
}

function assertCallbackLength(value: string): string {
  if (value.length > 64) {
    throw new Error(`Remort callback is too long: ${value.length}`);
  }

  return value;
}
