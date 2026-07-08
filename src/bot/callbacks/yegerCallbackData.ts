import { err, ok, type Result } from "../../shared/result";
import {
  YEGER_BANDAGE_PURCHASE_TARGETS,
  type YegerBandagePurchaseTarget,
  type YegerNotchExchangeKind,
  type YegerRangerSupplyKind
} from "../../services/yegerQuestService";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "./onboardingCallbackData";

export type YegerCallback =
  | { type: "open" }
  | { type: "quest"; questId: "u1" }
  | { type: "outside"; questId: "u1" }
  | { type: "start"; questId: "u1" }
  | { type: "track"; questId: "u1" }
  | { type: "turn-in"; questId: "u1" }
  | { type: "bandages" }
  | { type: "field-kit-help" }
  | { type: "buy-bandage-preview"; targetQuantity: YegerBandagePurchaseTarget }
  | { type: "buy-bandage-confirm"; token: string }
  | { type: "buy-bandage-cancel"; token: string }
  | { type: "free-bandage"; kind: YegerRangerSupplyKind }
  | { type: "notch-exchange-open" }
  | { type: "notch-exchange"; kind: YegerNotchExchangeKind; expectedNotches: number }
  | { type: "help" };

export type YegerCallbackError =
  | "invalid-version"
  | "invalid-prefix"
  | "invalid-action"
  | "invalid-quest"
  | "too-long";

const PREFIX = "v1:ygr";
const UNQUIET_TRIAL_ID = "u1";

export function makeYegerOpenCallbackData(): string {
  return assertYegerCallbackData(`${PREFIX}:open`);
}

export function makeYegerQuestCallbackData(): string {
  return assertYegerCallbackData(`${PREFIX}:quest:${UNQUIET_TRIAL_ID}`);
}

export function makeYegerOutsideCallbackData(): string {
  return assertYegerCallbackData(`${PREFIX}:outside:${UNQUIET_TRIAL_ID}`);
}

export function makeYegerStartCallbackData(): string {
  return assertYegerCallbackData(`${PREFIX}:start:${UNQUIET_TRIAL_ID}`);
}

export function makeYegerTrackCallbackData(): string {
  return assertYegerCallbackData(`${PREFIX}:track:${UNQUIET_TRIAL_ID}`);
}

export function makeYegerTurnInCallbackData(): string {
  return assertYegerCallbackData(`${PREFIX}:turnin:${UNQUIET_TRIAL_ID}`);
}

export function makeYegerHelpCallbackData(): string {
  return assertYegerCallbackData(`${PREFIX}:help`);
}

export function makeYegerBandagesCallbackData(): string {
  return assertYegerCallbackData(`${PREFIX}:bandages`);
}

export function makeYegerFieldKitHelpCallbackData(): string {
  return assertYegerCallbackData(`${PREFIX}:fkit`);
}

export function makeYegerBuyBandageCallbackData(targetQuantity: YegerBandagePurchaseTarget = 1): string {
  return assertYegerCallbackData(`${PREFIX}:buy:${targetQuantity}`);
}

export function makeYegerConfirmBandagePurchaseCallbackData(token: string): string {
  return assertYegerCallbackData(`${PREFIX}:bc:${token}`);
}

export function makeYegerCancelBandagePurchaseCallbackData(token: string): string {
  return assertYegerCallbackData(`${PREFIX}:bx:${token}`);
}

export function makeYegerFreeBandageCallbackData(kind: YegerRangerSupplyKind = "bandage"): string {
  return assertYegerCallbackData(`${PREFIX}:free:${formatFreeSupplyKind(kind)}`);
}

export function makeYegerNotchExchangeOpenCallbackData(): string {
  return assertYegerCallbackData(`${PREFIX}:nx`);
}

export function makeYegerNotchExchangeCallbackData(
  kind: YegerNotchExchangeKind,
  expectedNotches: number
): string {
  return assertYegerCallbackData(`${PREFIX}:nx${formatNotchExchangeKind(kind)}:${Math.max(0, Math.floor(expectedNotches))}`);
}

export function parseYegerCallbackData(
  data: string | undefined
): Result<YegerCallback, YegerCallbackError> {
  if (!data?.startsWith("v1:")) {
    return err("invalid-version");
  }

  if (!data.startsWith(`${PREFIX}:`)) {
    return err("invalid-prefix");
  }

  if (Buffer.byteLength(data, "utf8") > TELEGRAM_CALLBACK_DATA_LIMIT) {
    return err("too-long");
  }

  const [, section, action, questId, ...rest] = data.split(":");

  if (section !== "ygr" || rest.length > 0) {
    return err("invalid-prefix");
  }

  if (action === "open") {
    return questId ? err("invalid-prefix") : ok({ type: "open" });
  }

  if (action === "help") {
    return questId ? err("invalid-prefix") : ok({ type: "help" });
  }

  if (action === "bandages") {
    return questId ? err("invalid-prefix") : ok({ type: "bandages" });
  }

  if (action === "fkit") {
    return questId ? err("invalid-prefix") : ok({ type: "field-kit-help" });
  }

  if (action === "buy") {
    if (questId === "bdg") {
      return ok({ type: "buy-bandage-preview", targetQuantity: 1 });
    }

    const target = parseBandagePurchaseTarget(questId);

    return target ? ok({ type: "buy-bandage-preview", targetQuantity: target }) : err("invalid-prefix");
  }

  if (action === "bc" || action === "bx") {
    return questId && rest.length === 0 && isPurchaseToken(questId)
      ? ok({ type: action === "bc" ? "buy-bandage-confirm" : "buy-bandage-cancel", token: questId })
      : err("invalid-prefix");
  }

  if (action === "free") {
    const kind = parseFreeSupplyKind(questId);

    return kind ? ok({ type: "free-bandage", kind }) : err("invalid-prefix");
  }

  if (action === "nx") {
    return questId ? err("invalid-prefix") : ok({ type: "notch-exchange-open" });
  }

  if (action === "nxd" || action === "nxk") {
    const expectedNotches = parseNotchSnapshot(questId);
    const kind = parseNotchExchangeKind(action);

    return kind && expectedNotches !== null
      ? ok({ type: "notch-exchange", kind, expectedNotches })
      : err("invalid-prefix");
  }

  if (questId !== UNQUIET_TRIAL_ID) {
    return err("invalid-quest");
  }

  if (action === "start") {
    return ok({ type: "start", questId: UNQUIET_TRIAL_ID });
  }

  if (action === "quest") {
    return ok({ type: "quest", questId: UNQUIET_TRIAL_ID });
  }

  if (action === "outside") {
    return ok({ type: "outside", questId: UNQUIET_TRIAL_ID });
  }

  if (action === "track") {
    return ok({ type: "track", questId: UNQUIET_TRIAL_ID });
  }

  if (action === "turnin") {
    return ok({ type: "turn-in", questId: UNQUIET_TRIAL_ID });
  }

  return err("invalid-action");
}

function assertYegerCallbackData(data: string): string {
  if (Buffer.byteLength(data, "utf8") > TELEGRAM_CALLBACK_DATA_LIMIT) {
    throw new RangeError("Yeger callback data exceeds Telegram callback data limit.");
  }

  return data;
}

function isPurchaseToken(token: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token);
}

function parseBandagePurchaseTarget(value: string | undefined): YegerBandagePurchaseTarget | null {
  const numeric = Number(value);

  return YEGER_BANDAGE_PURCHASE_TARGETS.includes(numeric as YegerBandagePurchaseTarget)
    ? numeric as YegerBandagePurchaseTarget
    : null;
}

function formatFreeSupplyKind(kind: YegerRangerSupplyKind): string {
  switch (kind) {
    case "bandage":
      return "bdg";
    case "dense-bandage":
      return "dns";
    case "field-kit":
      return "kit";
  }
}

function parseFreeSupplyKind(value: string | undefined): YegerRangerSupplyKind | null {
  switch (value) {
    case "bdg":
      return "bandage";
    case "dns":
      return "dense-bandage";
    case "kit":
      return "field-kit";
    default:
      return null;
  }
}

function formatNotchExchangeKind(kind: YegerNotchExchangeKind): "d" | "k" {
  switch (kind) {
    case "dense-bandage":
      return "d";
    case "field-kit":
      return "k";
    default:
      throw new Error("Unknown Yeger notch exchange kind.");
  }
}

function parseNotchExchangeKind(action: string): YegerNotchExchangeKind | null {
  switch (action) {
    case "nxd":
      return "dense-bandage";
    case "nxk":
      return "field-kit";
    default:
      return null;
  }
}

function parseNotchSnapshot(value: string | undefined): number | null {
  if (!value || !/^\d{1,3}$/.test(value)) {
    return null;
  }

  return Math.max(0, Math.floor(Number(value)));
}
