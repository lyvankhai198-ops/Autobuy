import { logger } from "./logger";

export interface SupplierProduct {
  id: string;
  name: string;
  price: number;
  stock: number;
  description: string;
  emoji: string;
}

export interface BuyResult {
  order_code: string;
  product_name: string;
  quantity: number;
  amount: number;
  accounts: string[];
  balance_after: number;
  // When quantity is large the source API may return a file instead of inline accounts
  file_url?: string;
  txt_url?: string;
  file?: string;
}

let cachedProducts: SupplierProduct[] | null = null;
let lastFetchAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function fetchProducts(baseUrl: string, apiKey: string): Promise<SupplierProduct[]> {
  const now = Date.now();
  if (cachedProducts && now - lastFetchAt < CACHE_TTL_MS) return cachedProducts;

  const cleanUrl = baseUrl.replace(/\/+$/, "");
  try {
    const res = await fetch(`${cleanUrl}/api/products`, {
      headers: { "X-API-Key": apiKey },
    });
    const data = await res.json() as { success: boolean; products: SupplierProduct[] };
    if (data.success && Array.isArray(data.products)) {
      cachedProducts = data.products;
      lastFetchAt = now;
      logger.info({ count: data.products.length }, "Product list refreshed from supplier API");
    }
  } catch (err) {
    logger.warn({ err }, "Failed to fetch product list from supplier API");
  }

  return cachedProducts ?? [];
}

/** Fetch current balance from the source API */
export async function getBalance(baseUrl: string, apiKey: string): Promise<number> {
  const res = await fetch(`${baseUrl}/api/balance`, {
    headers: { "X-API-Key": apiKey },
  });
  const data = await res.json() as { success: boolean; balance?: number };
  return data.balance ?? 0;
}

/** Clear in-memory cache so next call re-fetches */
export function invalidateProductCache(): void {
  cachedProducts = null;
  lastFetchAt = 0;
}

/**
 * Tokens that appear in many product names but do NOT identify a specific product.
 * Matching on these alone causes false positives (e.g. "BHF" or "tháng" matching
 * across completely different product categories).
 */
const MATCH_STOPWORDS = new Set([
  // vendor / shop tags
  "bhf", "kbh", "vip", "hot",
  // generic product words
  "link", "key", "tai", "khoan", "account", "acc", "slot",
  "pro", "plus", "max", "ultra", "team", "gia", "dinh",
  // time units (diacritic-stripped)
  "thang", "ngay", "nam", "gio", "phut",
  // numbers and noise
  "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "12",
  "30", "365",
]);

/**
 * Find the best matching product for a customer's message.
 * Strategy:
 *  1. Exact product ID match in message
 *  2. Keyword match from product name using only meaningful (non-stopword) tokens
 *     — requires at least 2 meaningful tokens to match to avoid false positives
 *  3. Prefer products with stock > 0
 */
export function matchProduct(products: SupplierProduct[], message: string): SupplierProduct | null {
  const msg = message.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // 1. Exact product id in message
  const byId = products.find(p => msg.includes(p.id.toLowerCase()));
  if (byId) return byId;

  // 2. Keyword match — only count meaningful (non-stopword) tokens
  const scored: { product: SupplierProduct; score: number; total: number }[] = [];

  for (const product of products) {
    const normalizedName = product.name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\[\]()]/g, "");

    const allTokens = normalizedName.split(/[\s_-]+/).filter(t => t.length >= 3);
    // Only score on tokens that are product-specific (not in stopwords)
    const meaningfulTokens = allTokens.filter(t => !MATCH_STOPWORDS.has(t));

    if (meaningfulTokens.length === 0) continue;

    const matchedCount = meaningfulTokens.filter(token => msg.includes(token)).length;

    // Must match at least 2 meaningful tokens to qualify
    if (matchedCount >= 2) {
      scored.push({ product, score: matchedCount, total: meaningfulTokens.length });
    }
  }

  if (scored.length === 0) return null;

  // Sort by: score desc → coverage (score/total) desc → prefer in-stock
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const covA = a.score / a.total;
    const covB = b.score / b.total;
    if (Math.abs(covB - covA) > 0.01) return covB - covA;
    return (b.product.stock > 0 ? 1 : 0) - (a.product.stock > 0 ? 1 : 0);
  });

  return scored[0].product;
}

/**
 * Call supplier API to buy a product.
 */
export async function buyProduct(
  baseUrl: string,
  apiKey: string,
  productId: string,
  quantity = 1,
): Promise<BuyResult> {
  const res = await fetch(`${baseUrl}/api/buy`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({ product_id: productId, quantity }),
  });

  const data = await res.json() as { success: boolean; order?: BuyResult; error?: string; message?: string };

  logger.info({ raw: JSON.stringify(data).slice(0, 500) }, "Supplier API buy raw response");

  if (!res.ok || !data.success) {
    const errMsg = data.error ?? data.message ?? `HTTP ${res.status}`;
    throw new Error(`Supplier API error: ${errMsg}`);
  }

  if (!data.order) throw new Error("Supplier API returned success but no order data");

  const order = data.order;
  // Normalise: ensure accounts is always an array (may be absent when file is returned)
  if (!Array.isArray(order.accounts)) order.accounts = [];

  // Detect file URL — source API may put it in file_url, txt_url, file, or as a single URL in accounts[0]
  const firstAcc = order.accounts[0] ?? "";
  if (!order.file_url && !order.txt_url && firstAcc.startsWith("http") && firstAcc.includes(".txt")) {
    order.file_url = firstAcc;
    order.accounts = [];
  }

  return order;
}

/**
 * Format a list of products as a human-readable Telegram message.
 */
export function formatProductListMessage(products: SupplierProduct[]): string {
  const available = products.filter(p => p.stock > 0);
  if (available.length === 0) {
    return "❌ Hiện tại tất cả sản phẩm đều đã hết hàng. Vui lòng quay lại sau!";
  }

  const lines = available.map(
    p => `• <b>${p.name}</b>\n  💰 ${p.price.toLocaleString("vi-VN")}đ | Còn: ${p.stock}`,
  );

  return (
    `📦 <b>Danh sách sản phẩm có sẵn:</b>\n\n` +
    lines.join("\n\n") +
    `\n\n💬 Gõ <code>mua [tên sản phẩm]</code> để đặt hàng.`
  );
}

/**
 * Format delivered accounts into a nice Telegram message.
 */
export function formatDeliveryMessage(productName: string, accounts: string[], lang: 'vi' | 'en' = 'vi'): string {
  const qty = accounts.length;
  const accountLines = qty > 1
    ? accounts.map((acc, i) => `<b>[${i + 1}/${qty}]</b> <code>${acc}</code>`).join("\n\n")
    : `<code>${accounts[0] ?? ""}</code>`;

  if (lang === 'en') {
    return (
      `✅ <b>Order completed!</b>\n\n` +
      `📦 <b>Product:</b> ${productName}${qty > 1 ? ` (x${qty})` : ""}\n\n` +
      `🔑 <b>Account info:</b>\n${accountLines}`
    );
  }
  return (
    `✅ <b>Đơn hàng đã hoàn thành!</b>\n\n` +
    `📦 <b>Sản phẩm:</b> ${productName}${qty > 1 ? ` (x${qty})` : ""}\n\n` +
    `🔑 <b>Thông tin tài khoản:</b>\n${accountLines}`
  );
}
