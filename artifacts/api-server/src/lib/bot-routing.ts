export type BotOwner = "account-1" | "account-2";
type BotTokenConfig = {
  mainBotToken: string | null;
  secondBotToken: string | null;
};

export function toBotOwner(accountSlot: string | null | undefined): BotOwner | null {
  if (accountSlot === "account-1" || accountSlot === "account-2") return accountSlot;
  return null;
}

/**
 * Resolve exactly one bot for an order. There is intentionally no fallback:
 * a 403 means the order was routed to the wrong bot or needs manual handling.
 */
export function resolveBotToken(
  config: BotTokenConfig,
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
  productName: string | undefined,
  accountLabel: string,
  mappedProductIds: ReadonlySet<string>,
  mappedProductNames: readonly string[],
  hasKnownSentinelCode: boolean,
): boolean {
  const normalize = (value: string) => value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const normalizedOrderName = normalize(productName ?? "");
  const nameMatches = mappedProductNames.some((mappedName) => {
    const mappedTokens = normalize(mappedName).split(/\s+/).filter((token) => token.length >= 3);
    const matched = mappedTokens.filter((token) => normalizedOrderName.includes(token));
    // Require two meaningful tokens so generic words such as "pro" or "ngay"
    // cannot route an unrelated product to account-1.
    return matched.length >= 2;
  });
  const belongsToMainProduct = (!!productId && mappedProductIds.has(productId)) || nameMatches;

  if (accountLabel === "account-1") {
    return belongsToMainProduct;
  }
  if (accountLabel === "account-2") {
    // Secondary orders can have no productId in Canboso after sentinel
    // delivery. The sentinel code is the ownership signal in that case.
    return !belongsToMainProduct
      && hasKnownSentinelCode;
  }
  return false;
}