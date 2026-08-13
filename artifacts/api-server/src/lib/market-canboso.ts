/**
 * Canboso Market API helpers — completely separate from the existing
 * seller/order flow. Uses the same auth token from canboso.ts.
 *
 * Endpoints confirmed working:
 *   GET  /seller/market/products          — browse ALL market listings
 *   POST /seller/market/products/{id}/pull — pull a product into our shop
 *   DELETE /seller/products/{id}           — remove (unpull) a product from our shop
 *   PUT  /seller/products/{id}             — update pricing on our product
 */

import { logger } from "./logger";

const BASE = "https://canboso.com/api";

// ── Shared auth (re-export the same token mechanism already in canboso.ts) ──
// We deliberately re-use the same in-process token by importing helpers.
import { apiFetchMarket } from "./canboso";

export interface MarketProduct {
  _id: string;
  product_name: string;
  emoji: string;
  pricing: number;              // our own pricing if we own it
  marketSalePrice: number | null;       // price charged to buyer of the product
  marketMinListingPrice: number | null; // minimum we must list at
  marketAccountAvailable: boolean;
  isMine: boolean;
  alreadyPulledToSell: boolean;
  stats: { available: number; total: number; sold: number };
  slotProductType: "account" | "slot" | "upgrade_account";
}

export interface PulledSellerProduct {
  _id: string;
  product_name: string;
  pricing: number;
  marketSourceProductId: string;
  marketSourceUnitCost: number;
}

/**
 * Fetch all products currently listed on the Canboso market.
 * Uses seller/market/products which returns every seller's listings.
 * Supports optional emoji filter (passed as query param is not supported by
 * the market endpoint, so we filter client-side).
 */
export async function getMarketProducts(opts: {
  emoji?: string;
  keywords?: string[];
  excludeKeywords?: string[];
  onlyWithStock?: boolean;
} = {}): Promise<MarketProduct[]> {
  // Fetch all pages (max 100 per page)
  let allProducts: MarketProduct[] = [];
  let page = 1;
  const limit = 100;

  while (true) {
    const data = await apiFetchMarket<{ success: boolean; products: MarketProduct[]; pagination?: { totalPages: number } }>(
      `/seller/market/products?limit=${limit}&page=${page}&sort=price_asc`,
    );
    const products = data.products ?? [];
    allProducts = allProducts.concat(products);
    const totalPages = data.pagination?.totalPages ?? 1;
    if (page >= totalPages || products.length === 0) break;
    page++;
  }

  // Client-side filters
  if (opts.emoji) {
    const e = opts.emoji.toLowerCase();
    allProducts = allProducts.filter(p => p.emoji?.toLowerCase() === e);
  }

  if (opts.keywords && opts.keywords.length > 0) {
    // Normalize: collapse all whitespace so "bh24h" matches "bh 24h", "Apple pay" matches "APPLE PAY" etc.
    const kws = opts.keywords.map(k => k.toLowerCase().replace(/\s+/g, "")).filter(Boolean);
    allProducts = allProducts.filter(p => {
      const name = p.product_name.toLowerCase().replace(/\s+/g, "");
      // OR logic: at least one keyword must appear in the product name
      return kws.some(kw => name.includes(kw));
    });
  }

  if (opts.excludeKeywords && opts.excludeKeywords.length > 0) {
    const exKws = opts.excludeKeywords.map(k => k.toLowerCase().replace(/\s+/g, "")).filter(Boolean);
    allProducts = allProducts.filter(p => {
      const name = p.product_name.toLowerCase().replace(/\s+/g, "");
      // Exclude if ANY exclude keyword found in name
      return !exKws.some(kw => name.includes(kw));
    });
  }

  if (opts.onlyWithStock) {
    allProducts = allProducts.filter(p => p.stats.available > 0);
  }

  return allProducts;
}

/**
 * Pull a market product into our seller shop with the given listing price.
 * Returns the newly-created seller product.
 */
export async function pullMarketProduct(
  marketProductId: string,
  pricing: number,
): Promise<PulledSellerProduct> {
  const data = await apiFetchMarket<{ success: boolean; product: PulledSellerProduct }>(
    `/seller/market/products/${marketProductId}/pull`,
    {
      method: "POST",
      body: JSON.stringify({ pricing }),
    },
  );
  logger.info({ marketProductId, pricing, sellerId: data.product._id }, "Market: pulled product into shop");
  return data.product;
}

/**
 * List all seller products currently in our shop.
 */
export async function getSellerProducts(): Promise<{ _id: string; product_name: string; pricing: number; marketSourceProductId: string }[]> {
  let all: { _id: string; product_name: string; pricing: number; marketSourceProductId: string }[] = [];
  let page = 1;
  while (true) {
    const data = await apiFetchMarket<{ success: boolean; products: any[]; pagination?: { totalPages: number } }>(
      `/seller/products?limit=100&page=${page}`
    );
    const products = data.products ?? [];
    all = all.concat(products);
    const totalPages = data.pagination?.totalPages ?? 1;
    if (page >= totalPages || products.length === 0) break;
    page++;
  }
  return all;
}

/**
 * Delete (unpull) one of our own seller products.
 */
export async function deleteSellerProduct(sellerProductId: string): Promise<void> {
  await apiFetchMarket(`/seller/products/${sellerProductId}`, { method: "DELETE" });
  logger.info({ sellerProductId }, "Market: deleted seller product (unpull)");
}

/**
 * Update the listing price of one of our own seller products.
 */
export async function updateSellerProductPricing(
  sellerProductId: string,
  pricing: number,
): Promise<void> {
  await apiFetchMarket(`/seller/products/${sellerProductId}`, {
    method: "PUT",
    body: JSON.stringify({ pricing }),
  });
  logger.info({ sellerProductId, pricing }, "Market: updated seller product pricing");
}

/**
 * Canboso marketplace fee rate.
 * listing_price × (1 - FEE_RATE) = money received by seller.
 */
const CANBOSO_FEE_RATE = 0.10;

/**
 * Tiered NET profit targets (money received AFTER fee, above source cost).
 * markupValue (multiplier×100) scales the profit targets linearly.
 * For Infinity tier: profit is a percent of source price.
 */
const TIERED_NET_PROFIT: { maxPrice: number; profit: number; isPercent?: boolean }[] = [
  { maxPrice: 10_000,  profit: 3_000 },   // source ≤ 10k  → want 3k net
  { maxPrice: 20_000,  profit: 5_000 },   // source ≤ 20k  → want 5k net
  { maxPrice: 30_000,  profit: 7_000 },   // source ≤ 30k  → want 7k net
  { maxPrice: 50_000,  profit: 10_000 },  // source ≤ 50k  → want 10k net
  { maxPrice: 100_000, profit: 15_000 },  // source ≤ 100k → want 15k net
  { maxPrice: 200_000, profit: 25_000 },  // source ≤ 200k → want 25k net
  { maxPrice: Infinity, profit: 15, isPercent: true }, // >200k → want 15% net profit
];

/**
 * Compute the gross markup to add to source price such that,
 * after paying CANBOSO_FEE_RATE% platform fee, the target net profit remains.
 *
 * listing = (source + targetNet) / (1 - fee)
 * markup  = listing - source
 */
function computeTieredMarkup(sourcePrice: number, multiplier: number): number {
  const scale = multiplier / 100;
  const bracket = TIERED_NET_PROFIT.find(b => sourcePrice <= b.maxPrice)!;

  const targetNet = bracket.isPercent
    ? Math.ceil(sourcePrice * bracket.profit * scale / 100)
    : Math.ceil(bracket.profit * scale);

  // listing price that yields exactly targetNet after fee
  const listing = Math.ceil((sourcePrice + targetNet) / (1 - CANBOSO_FEE_RATE));
  return listing - sourcePrice;
}

/**
 * Compute the listing price given a source price and markup config.
 * markupType:
 *   "fixed"   — add markupValue (đ) to source price
 *   "percent" — add markupValue% of source price
 *   "tiered"  — use built-in tiered bracket table; markupValue is a multiplier×100
 *               (100 = default, 80 = -20%, 150 = +50%)
 */
export function computeListingPrice(
  marketSalePrice: number,
  markupType: string,
  markupValue: number,
  minListingPrice: number,
): number {
  let price: number;
  if (markupType === "percent") {
    price = Math.ceil(marketSalePrice * (1 + markupValue / 100));
  } else if (markupType === "tiered") {
    price = marketSalePrice + computeTieredMarkup(marketSalePrice, markupValue);
  } else {
    // fixed
    price = marketSalePrice + markupValue;
  }
  // Never go below the market floor
  const floored = Math.max(price, minListingPrice);
  // Round up to nearest 1000 (always favours seller)
  return Math.ceil(floored / 1000) * 1000;
}
