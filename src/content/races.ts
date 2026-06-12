import type { RaceContent } from "./schema";

export const races = [
  {
    id: "race.human-ish",
    name: "Людисько",
    description: "Трохи до всього, бо якось воно буде.",
    statBonus: {
      strength: 1,
      dexterity: 1,
      intelligence: 1,
      charisma: 1,
      luck: 1
    }
  }
] satisfies RaceContent[];
