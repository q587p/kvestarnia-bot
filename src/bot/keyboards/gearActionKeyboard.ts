import type { InlineKeyboard } from "grammy";
import type { MantokAbilityGrantDefinition } from "../../content/mantokAbilityGrants";

export function appendGearActionButtons(
  keyboard: InlineKeyboard,
  grants: readonly MantokAbilityGrantDefinition[],
  makeCallbackData: (grant: MantokAbilityGrantDefinition) => string
): void {
  for (const [index, grant] of grants.entries()) {
    if (index % 2 === 0) {
      keyboard.row();
    }
    keyboard.text(grant.buttonLabel ?? grant.label, makeCallbackData(grant));
  }

  if (grants.length > 0) {
    keyboard.row();
  }
}
