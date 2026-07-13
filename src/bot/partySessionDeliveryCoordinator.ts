const deliveryTails = new Map<string, Promise<void>>();

export async function serializePartySessionDelivery<T>(
  inviteToken: string,
  work: () => Promise<T>
): Promise<T> {
  const previous = deliveryTails.get(inviteToken) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(work);
  const tail = current.then(() => undefined, () => undefined);
  deliveryTails.set(inviteToken, tail);

  try {
    return await current;
  } finally {
    if (deliveryTails.get(inviteToken) === tail) {
      deliveryTails.delete(inviteToken);
    }
  }
}

export function isPermanentPartyCardEditError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes("message to edit not found") ||
    message.includes("message can't be edited") ||
    message.includes("message cannot be edited") ||
    message.includes("message_id_invalid");
}
