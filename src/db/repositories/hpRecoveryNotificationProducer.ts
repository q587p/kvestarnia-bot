import type { Prisma } from "@prisma/client";

export type HpRecoveryQueueIntent = "recovering" | "suppress";

export class HpRecoveryNotificationProducer {
  constructor(private readonly enabled: boolean) {}

  isEnabled(): boolean {
    return this.enabled;
  }

  async record(
    tx: Prisma.TransactionClient,
    characterId: string,
    now: Date,
    intent: HpRecoveryQueueIntent,
    options: { nextAttemptAt?: Date; errorCode?: string } = {}
  ): Promise<void> {
    if (!this.enabled) {
      return;
    }

    const character = await tx.character.findUnique({
      where: { id: characterId },
      select: {
        hpCurrent: true,
        hpMax: true,
        hpRegenAt: true,
        _count: { select: { remorts: true } }
      }
    });
    if (!character) {
      return;
    }

    const suppressed = intent === "suppress";
    if (suppressed) {
      await tx.hpRecoveryNotification.updateMany({
        where: { characterId },
        data: {
          generation: { increment: 1 },
          remortCount: character._count.remorts,
          sourceHpCurrent: character.hpCurrent,
          sourceHpMax: character.hpMax,
          sourceHpRegenAt: character.hpRegenAt,
          sourceFingerprint: null,
          status: "suppressed",
          nextAttemptAt: options.nextAttemptAt ?? now,
          processingStartedAt: null,
          readyAt: null,
          sentAt: null,
          suppressedAt: now,
          attemptCount: 0,
          lastErrorCode: options.errorCode ?? null
        }
      });
      return;
    }

    await tx.hpRecoveryNotification.upsert({
      where: { characterId },
      create: {
        characterId,
        remortCount: character._count.remorts,
        sourceHpCurrent: character.hpCurrent,
        sourceHpMax: character.hpMax,
        sourceHpRegenAt: character.hpRegenAt,
        status: "waiting",
        nextAttemptAt: options.nextAttemptAt ?? now,
        suppressedAt: null,
        lastErrorCode: options.errorCode ?? null
      },
      update: {
        generation: { increment: 1 },
        remortCount: character._count.remorts,
        sourceHpCurrent: character.hpCurrent,
        sourceHpMax: character.hpMax,
        sourceHpRegenAt: character.hpRegenAt,
        sourceFingerprint: null,
        status: "waiting",
        nextAttemptAt: options.nextAttemptAt ?? now,
        processingStartedAt: null,
        readyAt: null,
        sentAt: null,
        suppressedAt: null,
        attemptCount: 0,
        lastErrorCode: options.errorCode ?? null
      }
    });
  }
}
