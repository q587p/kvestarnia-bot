import { escapeHtml } from "./telegramHtml";

export interface TimedStatusLineView {
  emoji: string;
  name: string;
  remaining: string;
  label?: string | null;
  subjectHtml?: string;
  tailHtml?: string;
  terminalPunctuation?: boolean;
}

export function presentTimedStatusLine(view: TimedStatusLineView): string {
  const label = view.label === undefined ? "Стан" : view.label;
  const subject = view.subjectHtml ?? (label === null
    ? `<b>${escapeHtml(view.name)}</b>`
    : `${escapeHtml(label)}: <b>${escapeHtml(view.name)}</b>`);
  const terminal = view.terminalPunctuation === false ? "" : ".";

  return `${view.emoji} ${subject} ще <b>${escapeHtml(view.remaining)}</b>${view.tailHtml ?? ""}${terminal}`;
}
