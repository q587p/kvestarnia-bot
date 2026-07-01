import { YEGER_UNQUIET_TRIAL_SECOND_TARGET } from "../../services/yegerQuestService";

export function presentYegerQuestTitle(progress: { target: number }): string {
  return progress.target === YEGER_UNQUIET_TRIAL_SECOND_TARGET ? "Неспокійні справи 2.0" : "Неспокійні справи";
}
