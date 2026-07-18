import type {
  AdventureProblemResult,
  AdventureResult
} from "../services/adventureService";

type AdventureCallbackResultState =
  | AdventureProblemResult["state"]
  | AdventureResult["state"];

export function shouldMarkAdventureChoiceCallbackPresence(
  result: { state: AdventureCallbackResultState }
): boolean {
  switch (result.state) {
    case "active-fight":
    case "combat-blocked":
    case "already-completed":
      return false;
    default:
      return true;
  }
}
