export type Clock = () => Date;

export const systemClock: Clock = () => new Date();

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
