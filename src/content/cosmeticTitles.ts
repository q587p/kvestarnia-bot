import { achievements } from "./achievements";

export function resolveActiveCosmeticTitleLabel(
  titleGrantId: string | null | undefined
): string | null {
  if (!titleGrantId) {
    return null;
  }

  const definition = achievements.find((candidate) =>
    candidate.status === "enabled" &&
    "cosmeticTitleGrantId" in candidate &&
    candidate.cosmeticTitleGrantId === titleGrantId
  );

  return definition?.title ?? null;
}
