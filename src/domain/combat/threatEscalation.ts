import type { CombatStatus } from "./combatState";

export const THREAT_ESCALATION_REQUIRED_WINS = 3;
export const THREAT_ESCALATION_REPEAT_SECOND_ENEMY_LEVEL_BONUS = 2;
export const THREAT_ESCALATION_LINE_VERSION = "threat-escalation-v1";

export interface ThreatEscalationHistoryEntry {
  result: Exclude<CombatStatus, "active">;
  enemyCount: 1 | 2;
  eligible: boolean;
  escalated: boolean;
}

export type ThreatEscalationDecision =
  | { enemyCount: 1; reason: "base"; eligibleWins: number }
  | {
      enemyCount: 2;
      reason: "ordinary-win-streak";
      eligibleWins: number;
      secondEnemyLevelBonus: number;
    };

export interface ThreatEscalationLine {
  id: string;
  text: string;
}

export const THREAT_ESCALATION_LINES: readonly ThreatEscalationLine[] = [
  {
    id: "fame-went-ahead",
    text: "Слава далеко пішла. На шум прийшов ще один охочий подивитися, чи правда ви такі небезпечні."
  },
  {
    id: "legend-queue",
    text: "Монстри почули, що тут роздають легенди, і стали в чергу без талончиків."
  },
  {
    id: "one-hero-invitation",
    text: "Хтось у Низу сказав «та він один». Інші сприйняли це як запрошення."
  },
  {
    id: "crack-whispers",
    text: "Ваше імʼя вже шепочуть у щілинах. Зі щілин вилізло підкріплення."
  },
  {
    id: "independent-supervision",
    text: "Перший монстр привів знайомого. Каже, це не допомога, а незалежний нагляд."
  },
  {
    id: "nyz-added-witnesses",
    text: "Корчма записала серію перемог. Низ образився й додав свідків."
  },
  {
    id: "very-with-teeth",
    text: "До бою приєднався ще один охочий. Дуже випадково. Дуже з зубами."
  },
  {
    id: "reputation-collected-them",
    text: "Репутація пішла попереду вас і налякала монстрів настільки, що вони зібралися гуртом."
  },
  {
    id: "too-sporting",
    text: "У Низу вирішили, що одиночні дуелі — це вже занадто спортивно."
  },
  {
    id: "remembered-paws",
    text: "Ще один монстр прийшов просто подивитися. Потім згадав, що має лапи."
  },
  {
    id: "more-of-us-meeting",
    text: "Після ваших перемог монстри провели короткі збори й обрали варіант «нас більше»."
  },
  {
    id: "survival-seminar",
    text: "Старий суперник приніс нового. Каже, тепер це навчальний семінар із виживання."
  },
  {
    id: "mold-rumors",
    text: "Чутки про вас розрослися швидше за плісняву під бочками. На чутки прийшли учасники."
  }
];

export function decideThreatEscalation(
  newestFirstHistory: readonly ThreatEscalationHistoryEntry[],
  options: { remortCount?: number | undefined } = {}
): ThreatEscalationDecision {
  const requiredWins = getThreatEscalationRequiredWins(options.remortCount);
  let wins = 0;
  let wonEscalatedCheckpoints = 0;

  for (const entry of newestFirstHistory) {
    if (!entry.eligible) {
      continue;
    }

    if (entry.escalated && entry.enemyCount === 2) {
      if (entry.result !== "won") {
        return { enemyCount: 1, reason: "base", eligibleWins: 0 };
      }
      wonEscalatedCheckpoints += 1;
      continue;
    }

    if (wonEscalatedCheckpoints > 0) {
      return {
        enemyCount: 2,
        reason: "ordinary-win-streak",
        eligibleWins: requiredWins,
        secondEnemyLevelBonus:
          wonEscalatedCheckpoints * THREAT_ESCALATION_REPEAT_SECOND_ENEMY_LEVEL_BONUS
      };
    }

    if (entry.enemyCount !== 1) {
      continue;
    }

    if (entry.result !== "won") {
      return { enemyCount: 1, reason: "base", eligibleWins: 0 };
    }

    wins += 1;
    if (wins >= requiredWins) {
      return {
        enemyCount: 2,
        reason: "ordinary-win-streak",
        eligibleWins: requiredWins,
        secondEnemyLevelBonus: 0
      };
    }
  }

  if (wonEscalatedCheckpoints > 0) {
    return {
      enemyCount: 2,
      reason: "ordinary-win-streak",
      eligibleWins: requiredWins,
      secondEnemyLevelBonus:
        wonEscalatedCheckpoints * THREAT_ESCALATION_REPEAT_SECOND_ENEMY_LEVEL_BONUS
    };
  }

  return { enemyCount: 1, reason: "base", eligibleWins: wins };
}

export function getThreatEscalationRequiredWins(remortCount: number | undefined): number {
  return Math.max(1, THREAT_ESCALATION_REQUIRED_WINS - Math.max(0, Math.floor(remortCount ?? 0)));
}

export function findThreatEscalationLine(lineId: string | undefined): ThreatEscalationLine | null {
  return THREAT_ESCALATION_LINES.find((line) => line.id === lineId) ?? null;
}

export function selectThreatEscalationLineId(seed: string): string {
  let hash = 0;
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  return THREAT_ESCALATION_LINES[hash % THREAT_ESCALATION_LINES.length]!.id;
}
