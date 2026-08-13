/**
 * Market automation poller.
 *
 * Completely independent of the existing order-fulfillment poller.
 * Runs every 5 minutes. For each active MarketWatch:
 *   1. Fetch matching market products (by emoji + keywords)
 *   2. Pick the cheapest source with adequate stock
 *   3. If current source is still valid → check for price changes → reprice
 *   4. If current source is OOS or missing → switch to best available
 *   5. Notify admin via Telegram on switch / error
 *
 * Does NOT touch: orders, fulfillment, existing product_mappings, poller.ts
 */

import { eq } from "drizzle-orm";
import { db, marketWatchesTable, type MarketWatch } from "@workspace/db";
import { logger } from "./logger";
import { getConfig } from "./config";
import { triggerAutoFulfill } from "./fulfillment";
import { getDefaultCanbosoClient } from "./canboso";
import {
  getMarketProducts,
  pullMarketProduct,
  deleteSellerProduct,
  updateSellerProductPricing,
  computeListingPrice,
  type MarketProduct,
} from "./market-canboso";

const DEFAULT_INTERVAL_MS = 5 * 60_000; // 5 minutes

let marketTimer: NodeJS.Timeout | null = null;
let isMarketSyncRunning = false;
let currentIntervalMs = DEFAULT_INTERVAL_MS;

export async function startMarketPoller(): Promise<void> {
  if (marketTimer) return;
  // Read interval from DB (fall back to default if not set)
  try {
    const cfg = await getConfig();
    currentIntervalMs = (cfg as any).marketSyncIntervalMs ?? DEFAULT_INTERVAL_MS;
  } catch { /* use default */ }
  const mins = Math.round(currentIntervalMs / 60_000);
  logger.info(`Market automation poller started (${mins} min interval)`);
  // Run once on startup after a short delay to avoid startup contention
  setTimeout(() => {
    runMarketSync().catch((err) => logger.error({ err }, "Market poller initial run failed"));
  }, 15_000);
  marketTimer = setInterval(() => {
    runMarketSync().catch((err) => logger.error({ err }, "Market poller run failed"));
  }, currentIntervalMs);
}

export function stopMarketPoller(): void {
  if (marketTimer) { clearInterval(marketTimer); marketTimer = null; }
  logger.info("Market automation poller stopped");
}

/** Change polling interval on the fly — stops the old timer and starts a new one. */
export function restartMarketPoller(newIntervalMs: number): void {
  stopMarketPoller();
  currentIntervalMs = newIntervalMs;
  const mins = Math.round(newIntervalMs / 60_000);
  logger.info(`Market automation poller restarted (${mins} min interval)`);
  marketTimer = setInterval(() => {
    runMarketSync().catch((err) => logger.error({ err }, "Market poller run failed"));
  }, currentIntervalMs);
}

/** Trigger an immediate market sync cycle (called from /api/market-watches/scan-now). */
export async function runMarketSyncNow(): Promise<{ ok: boolean; processed: number; message: string }> {
  if (isMarketSyncRunning) return { ok: false, processed: 0, message: "Đồng bộ đang chạy, vui lòng chờ." };
  const result = await runMarketSync();
  return result;
}

async function runMarketSync(): Promise<{ ok: boolean; processed: number; message: string }> {
  if (isMarketSyncRunning) return { ok: false, processed: 0, message: "Đang chạy" };
  isMarketSyncRunning = true;
  let processed = 0;

  try {
    // Credentials are provided via env vars or runtime override (setDefaultCanbosoCredentials)
    // — the client itself validates at login time; no pre-check needed here.

    const watches = await db.select().from(marketWatchesTable)
      .where(eq(marketWatchesTable.status, "active"));

    if (watches.length === 0) return { ok: true, processed: 0, message: "Không có quy tắc nào đang hoạt động" };

    const config = await getConfig().catch(() => null);

    for (const watch of watches) {
      try {
        await processWatch(watch, config);
        processed++;
      } catch (err: any) {
        logger.error({ err: err?.message, watchId: watch.id }, "Market poller: watch processing failed");
        await db.update(marketWatchesTable)
          .set({ lastError: err?.message ?? "Lỗi không xác định", lastCheckedAt: new Date() })
          .where(eq(marketWatchesTable.id, watch.id));
      }
    }

    return { ok: true, processed, message: `Đã kiểm tra ${processed}/${watches.length} quy tắc` };
  } finally {
    isMarketSyncRunning = false;
  }
}

async function processWatch(watch: MarketWatch, config: any): Promise<void> {
  // 1. Fetch matching market products
  const keywords = watch.keywords
    ? watch.keywords.split(",").map(k => k.trim()).filter(Boolean)
    : [];

  const excludeKeywords = (watch as any).excludeKeywords
    ? (watch as any).excludeKeywords.split(",").map((k: string) => k.trim()).filter(Boolean)
    : [];

  const candidates = await getMarketProducts({
    emoji: watch.emoji ?? undefined,
    keywords: keywords.length > 0 ? keywords : undefined,
    excludeKeywords: excludeKeywords.length > 0 ? excludeKeywords : undefined,
    onlyWithStock: false, // we'll check stock ourselves
  });

  // 2. Filter to valid sources: in-stock, not ours
  // Note: we intentionally do NOT filter by alreadyPulledToSell — we delete the old seller
  // product before pulling a new one, so there is no duplicate risk. Filtering it out would
  // cause us to skip cheaper sources that we previously used but are now unlisted from our shop.
  const available = candidates.filter(
    p => !p.isMine
      && p.stats.available >= (watch.minStock ?? 1)
      && p.marketSalePrice !== null
  );
  available.sort((a, b) => (a.marketSalePrice ?? 0) - (b.marketSalePrice ?? 0));

  await db.update(marketWatchesTable)
    .set({ lastCheckedAt: new Date(), lastError: null })
    .where(eq(marketWatchesTable.id, watch.id));

  // 3. Check if current source is still valid
  const currentStillValid = watch.currentMarketProductId
    ? available.some(p => p._id === watch.currentMarketProductId)
    : false;

  const bestAvailable = available[0] ?? null; // sorted cheapest first

  if (currentStillValid) {
    const current = available.find(p => p._id === watch.currentMarketProductId)!;
    const currentPrice = current.marketSalePrice!;

    // ── If a CHEAPER source exists → switch to it immediately ────────────
    const cheaperExists =
      bestAvailable &&
      bestAvailable._id !== watch.currentMarketProductId &&
      bestAvailable.marketSalePrice! < currentPrice;

    if (!cheaperExists) {
      // Current source is the cheapest — only need to reprice if it changed
      const newSourcePrice = currentPrice;

      if (watch.lastMarketPrice !== null && watch.lastMarketPrice !== newSourcePrice) {
        const newListingPrice = computeListingPrice(
          newSourcePrice,
          watch.markupType,
          watch.markupValue,
          current.marketMinListingPrice ?? newSourcePrice,
        );

        if (watch.currentSellerProductId) {
          await updateSellerProductPricing(watch.currentSellerProductId, newListingPrice).catch(
            (err) => logger.warn({ err: err?.message, watchId: watch.id }, "Market: failed to update pricing")
          );
        }

        await db.update(marketWatchesTable)
          .set({ lastMarketPrice: newSourcePrice, lastError: null })
          .where(eq(marketWatchesTable.id, watch.id));

        const fmt = (v: number) => v.toLocaleString("vi-VN");
        const direction = newSourcePrice > (watch.lastMarketPrice ?? 0) ? "tăng" : "giảm";
        logger.info({ watchId: watch.id, label: watch.label, oldPrice: watch.lastMarketPrice, newPrice: newSourcePrice }, "Market: repriced");

        if (config?.adminChatId) {
          await triggerAutoFulfill(config.adminChatId,
            `📈 <b>[Chợ] Giá nguồn ${direction}</b>\n\n` +
            `📦 Quy tắc: <b>${watch.label}</b>\n` +
            `🔁 Giá vốn: <b>${fmt(watch.lastMarketPrice ?? 0)}đ → ${fmt(newSourcePrice)}đ</b>\n` +
            `🏷️ Giá treo mới: <b>${fmt(newListingPrice)}đ</b>`
          ).catch(() => {});
        }
      }
      return;
    }

    // cheaperExists — fall through to switch logic below
    logger.info(
      { watchId: watch.id, label: watch.label, currentPrice, bestPrice: bestAvailable.marketSalePrice, bestName: bestAvailable.product_name },
      "Market: cheaper source found — switching"
    );
  }

  // 4. Current source is OOS/missing, or a cheaper source was found — switch ──
  if (!bestAvailable) {
    const oos = candidates.filter(p => !p.isMine && p.marketSalePrice !== null);
    logger.warn({ watchId: watch.id, label: watch.label, totalCandidates: candidates.length, oos: oos.length }, "Market: no valid source found");

    await db.update(marketWatchesTable)
      .set({ lastError: `Không tìm thấy nguồn nào có hàng (${candidates.length} sản phẩm khớp, ${oos.length} hết hàng)` })
      .where(eq(marketWatchesTable.id, watch.id));
    return;
  }

  const best = bestAvailable!;
  const sourcePrice = best.marketSalePrice!;
  const listingPrice = computeListingPrice(
    sourcePrice,
    watch.markupType,
    watch.markupValue,
    best.marketMinListingPrice ?? sourcePrice,
  );

  // Delete old seller product FIRST so Canboso doesn't reject the pull as duplicate
  if (watch.currentSellerProductId) {
    await deleteSellerProduct(watch.currentSellerProductId).catch(
      (err) => logger.warn({ err: err?.message, watchId: watch.id }, "Market: failed to delete old seller product (continuing)")
    );
  }

  // Pull the new product into our shop
  const pulled = await pullMarketProduct(best._id, listingPrice);

  const oldSource = watch.currentMarketProductName ?? "—";
  await db.update(marketWatchesTable).set({
    currentMarketProductId: best._id,
    currentMarketProductName: best.product_name,
    currentSellerProductId: pulled._id,
    lastMarketPrice: sourcePrice,
    lastSwitchedAt: new Date(),
    lastError: null,
  }).where(eq(marketWatchesTable.id, watch.id));

  const fmt = (v: number) => v.toLocaleString("vi-VN");
  logger.info({ watchId: watch.id, label: watch.label, from: oldSource, to: best.product_name, price: sourcePrice }, "Market: switched source");

  if (config?.adminChatId) {
    const isSwitch = !!watch.currentMarketProductId;
    await triggerAutoFulfill(config.adminChatId,
      `${isSwitch ? "🔄" : "✅"} <b>[Chợ] ${isSwitch ? "Đổi nguồn tự động" : "Kéo nguồn mới"}</b>\n\n` +
      `📦 Quy tắc: <b>${watch.label}</b>\n` +
      (isSwitch ? `🔁 Nguồn cũ: ${oldSource}\n` : ``) +
      `✅ Nguồn mới: <b>${best.product_name}</b>\n` +
      (isSwitch && watch.lastMarketPrice != null
        ? `💰 Giá vốn: <b>${fmt(watch.lastMarketPrice)}đ → ${fmt(sourcePrice)}đ</b> | Giá treo: <b>${fmt(listingPrice)}đ</b>\n`
        : `💰 Giá vốn: <b>${fmt(sourcePrice)}đ</b> | Giá treo: <b>${fmt(listingPrice)}đ</b>\n`) +
      `📦 Tồn kho: <b>${best.stats.available}</b> sản phẩm`
    ).catch(() => {});
  }
}
