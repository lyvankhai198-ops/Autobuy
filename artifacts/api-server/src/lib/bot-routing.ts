import type { Config } from "@workspace/db";

export type BotOwner = "account-1" | "account-2";

export function toBotOwner(accountSlot: string | null | undefined): BotOwner | null {
  if (accountSlot === "account-1" || accountSlot === "account-2") return accountSlot;
  return null;
}

/**
 * Resolve exactly one bot for an order. There is intentionally no fallback:
 * a 403 means the order was routed to the wrong bot or needs manual handling.
 */
export function resolveBotToken(
  config: Pick<Config, "mainBotToken" | "secondBotToken">,
  owner: BotOwner,
  preferredToken?: string,
): string | null {
  if (owner === "account-2") {
    return preferredToken ?? config.secondBotToken ?? null;
  }
  return config.mainBotToken ?? null;
}

/**
 * Product IDs are the ownership boundary when both Canboso pollers can see
 * the same seller orders. Account-1 owns mapped products; account-2 owns
 * products outside that mapping and must use the sentinel-code fallback.
 */
export function orderBelongsToAccount(
  productId: string | undefined,
  accountLabel: string,
  mappedProductIds: ReadonlySet<string>,
  hasKnownSentinelCode: boolean,
  allowUncodedPaidOrder = false,
): boolean {
  if (accountLabel === "account-1") {
    return !!productId && mappedProductIds.has(productId);
  }
  if (accountLabel === "account-2") {
    return !!productId && !mappedProductIds.has(productId)
      && (hasKnownSentinelCode || allowUncodedPaidOrder);
  }
  return false;
}