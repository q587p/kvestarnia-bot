import type { ResourceRecoveryNotice } from "../../services/characterResourceService";

export function presentResourceRecoveryNotice(notice: ResourceRecoveryNotice): string {
  if (notice.type === "hp-full") {
    return [
      `❤️ <b>Здоров’я знову повне: ${notice.hpCurrent}/${notice.hpMax}</b>.`,
      "Корчмар подивився, кивнув і записав вас у графу «може знову лізти в бій, дуель або інше сумнівне рішення»."
    ].join("\n");
  }

  return "";
}

export function prefixResourceRecoveryNotice(
  text: string,
  notice: ResourceRecoveryNotice | undefined
): string {
  if (!notice) {
    return text;
  }

  return [presentResourceRecoveryNotice(notice), "", text].join("\n");
}
