import type {
  PassageSearchNodeKey,
  PassageSearchService
} from "../services/passageSearchService";

export async function isPassageSearchAvailable(
  service: PassageSearchService | undefined,
  telegramUserId: bigint,
  nodeKey: PassageSearchNodeKey
): Promise<boolean> {
  if (!service) {
    return true;
  }

  const availability = await service.getNodeAvailability(telegramUserId, [nodeKey]);

  return availability[nodeKey]?.searchAvailable !== false;
}
