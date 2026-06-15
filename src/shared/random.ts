import { randomInt } from "node:crypto";

export interface RandomSource {
  nextFloat(): number;
  nextInt(minInclusive: number, maxInclusive: number): number;
}

export class CryptoRandomSource implements RandomSource {
  nextFloat(): number {
    return randomInt(0, 1_000_000) / 1_000_000;
  }

  nextInt(minInclusive: number, maxInclusive: number): number {
    assertValidRange(minInclusive, maxInclusive);
    return randomInt(minInclusive, maxInclusive + 1);
  }
}

export class FakeRandomSource implements RandomSource {
  private cursor = 0;

  constructor(private readonly values: readonly number[]) {}

  nextFloat(): number {
    const value = this.values[this.cursor] ?? this.values.at(-1) ?? 0;
    this.cursor += 1;
    return Math.min(Math.max(value, 0), 0.999_999);
  }

  nextInt(minInclusive: number, maxInclusive: number): number {
    assertValidRange(minInclusive, maxInclusive);
    const span = maxInclusive - minInclusive + 1;
    return minInclusive + Math.floor(this.nextFloat() * span);
  }
}

export class SeededRandomSource implements RandomSource {
  private state: number;

  constructor(seed: number | string) {
    this.state = normalizeSeed(seed);
  }

  nextFloat(): number {
    this.state = (Math.imul(1664525, this.state) + 1013904223) >>> 0;

    return this.state / 0x1_0000_0000;
  }

  nextInt(minInclusive: number, maxInclusive: number): number {
    assertValidRange(minInclusive, maxInclusive);
    const span = maxInclusive - minInclusive + 1;

    return minInclusive + Math.floor(this.nextFloat() * span);
  }
}

function assertValidRange(minInclusive: number, maxInclusive: number): void {
  if (!Number.isInteger(minInclusive) || !Number.isInteger(maxInclusive)) {
    throw new Error("Random integer bounds must be integers.");
  }

  if (maxInclusive < minInclusive) {
    throw new Error("maxInclusive must be greater than or equal to minInclusive.");
  }
}

function normalizeSeed(seed: number | string): number {
  if (typeof seed === "number") {
    return Math.floor(seed) >>> 0;
  }

  let hash = 2166136261;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}
