import { InlineKeyboard } from "grammy";

export const combatActionButtonLabels = {
  attack: "🗡️ Вдарити",
  defend: "🛡 Захищатися",
  items: "🎒 Одноразові манатки",
  flee: "🏃 Відступити",
  refresh: "🔎 Оновити"
} as const;

export interface CombatActionKeyboardButton {
  label: string;
  callbackData: string;
}

export interface CombatActionKeyboardLayout {
  attackButtons?: readonly CombatActionKeyboardButton[] | undefined;
  defendButton?: CombatActionKeyboardButton | undefined;
  abilityButtons?: readonly CombatActionKeyboardButton[] | undefined;
  itemsButton?: CombatActionKeyboardButton | undefined;
  fleeButton?: CombatActionKeyboardButton | undefined;
  utilityButtons?: readonly CombatActionKeyboardButton[] | undefined;
  refreshButton?: CombatActionKeyboardButton | undefined;
}

export function buildCombatActionKeyboard(
  layout: CombatActionKeyboardLayout
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  const attacks = layout.attackButtons ?? [];

  const soleAttack = attacks.length === 1 ? attacks[0] : undefined;
  if (soleAttack && layout.defendButton) {
    appendButton(keyboard, soleAttack);
    appendButton(keyboard, layout.defendButton);
    keyboard.row();
  } else {
    appendPairedRows(keyboard, attacks);
    appendFullRow(keyboard, layout.defendButton);
  }

  appendPairedRows(keyboard, layout.abilityButtons ?? []);
  appendFullRow(keyboard, layout.itemsButton);
  appendFullRow(keyboard, layout.fleeButton);
  for (const button of layout.utilityButtons ?? []) {
    appendFullRow(keyboard, button);
  }
  appendFullRow(keyboard, layout.refreshButton, false);

  while (keyboard.inline_keyboard.at(-1)?.length === 0) {
    keyboard.inline_keyboard.pop();
  }

  return keyboard;
}

function appendPairedRows(
  keyboard: InlineKeyboard,
  buttons: readonly CombatActionKeyboardButton[]
): void {
  buttons.forEach((button, index) => {
    appendButton(keyboard, button);
    if (index % 2 === 1 || index === buttons.length - 1) {
      keyboard.row();
    }
  });
}

function appendFullRow(
  keyboard: InlineKeyboard,
  button: CombatActionKeyboardButton | undefined,
  endRow = true
): void {
  if (!button) {
    return;
  }
  appendButton(keyboard, button);
  if (endRow) {
    keyboard.row();
  }
}

function appendButton(
  keyboard: InlineKeyboard,
  button: CombatActionKeyboardButton
): void {
  keyboard.text(button.label, button.callbackData);
}
