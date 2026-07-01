export interface BattleJournalPageInput {
  title: string;
  headerLines?: string[];
  emptyText?: string;
  turn?: number;
  page?: number;
  totalPages?: number;
  opponentRows?: string[];
  actorRows?: string[];
  actionLines?: string[];
  noticeLines?: string[];
  actionHeading?: string;
  noticeHeading?: string;
}

export function presentBattleJournalPage(input: BattleJournalPageInput): string {
  const lines = [input.title, ...(input.headerLines ?? [])];

  if (input.turn === undefined || input.totalPages === undefined) {
    if (input.emptyText) {
      lines.push("", input.emptyText);
    }
    return lines.join("\n");
  }

  lines.push(
    "",
    `Хід <b>${input.turn}</b> · запис ${(input.page ?? 0) + 1}/${input.totalPages}`,
    ...(input.opponentRows ?? []),
    ...(input.actorRows ?? [])
  );

  if ((input.actionLines?.length ?? 0) > 0) {
    lines.push("", input.actionHeading ?? "<b>Останні дії:</b>", ...input.actionLines!);
  }

  if ((input.noticeLines?.length ?? 0) > 0) {
    lines.push("", input.noticeHeading ?? "<b>Кулдауни та ефекти:</b>", ...input.noticeLines!);
  }

  return lines.join("\n");
}
