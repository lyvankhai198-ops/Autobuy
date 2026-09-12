import { eq } from "drizzle-orm";
import {
  autoPurchaseRulesTable,
  db,
  type AutoPurchaseRule,
} from "@workspace/db";
import { getConfig } from "./config";
import { buyProduct, fetchProductsFresh } from "./products";
import { logger } from "./logger";

const AUTO_PURCHASE_INTERVAL_MS = 30_000;

let timer: NodeJS.Timeout | null = null;
let isRunning = false;

export async function startAutoPurchasePoller(): Promise<void> {
  if (timer) return;
  logger.info("Auto-purchase poller started (30s interval)");
  setTimeout(() => {
    runAutoPurchaseCycle().catch((err) => logger.error({ err }, "Auto-purchase initial cycle failed"));
  }, 10_000);
  timer = setInterval(() => {
    runAutoPurchaseCycle().catch((err) => logger.error({ err }, "Auto-purchase cycle failed"));
  }, AUTO_PURCHASE_INTERVAL_MS);
}

export function stopAutoPurchasePoller(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export async function runAutoPurchaseNow(): Promise<{ ok: boolean; processed: number; message: string }> {
  if (isRunning) return { ok: false, processed: 0, message: "Đang có một vòng tự mua chạy." };
  return runAutoPurchaseCycle();
}

async function runAutoPurchaseCycle(): Promise<{ ok: boolean; processed: number; message: string }> {
  if (isRunning) return { ok: false, processed: 0, message: "Đang có một vòng tự mua chạy." };
  isRunning = true;
  let processed = 0;

  try {
    const config = await getConfig();
    if (!config.sourceBotApiUrl || !config.sourceBotApiKey) {
      return { ok: false, processed: 0, message: "Chưa cấu hình API nguồn hàng." };
    }

    const rules = await db.select().from(autoPurchaseRulesTable)
      .where(eq(autoPurchaseRulesTable.status, "active"));
    if (rules.length === 0) {
      return { ok: true, processed: 0, message: "Không có rule tự mua đang hoạt động." };
    }

    const products = await fetchProductsFresh(config.sourceBotApiUrl, config.sourceBotApiKey);
    for (const rule of rules) {
      await processRule(rule, products, config.sourceBotApiUrl, config.sourceBotApiKey).catch((err) => {
        logger.error({ err: err?.message, ruleId: rule.id }, "Auto-purchase rule failed");
      });
      processed++;
    }

    return { ok: true, processed, message: `Đã kiểm tra ${processed} rule tự mua.` };
  } finally {
    isRunning = false;
  }
}

async function processRule(
  rule: AutoPurchaseRule,
  products: Awaited<ReturnType<typeof fetchProductsFresh>>,
  baseUrl: string,
  apiKey: string,
): Promise<void> {
  const product = products.find((candidate) => candidate.id === rule.sourceProductId);
  const now = new Date();

  await db.update(autoPurchaseRulesTable)
    .set({
      lastStock: product?.stock ?? 0,
      lastCheckedAt: now,
      lastError: product ? null : "Sản phẩm không còn trong danh sách nguồn.",
      updatedAt: now,
    })
    .where(eq(autoPurchaseRulesTable.id, rule.id));

  if (!product || product.stock < rule.quantity) return;

  await db.update(autoPurchaseRulesTable)
    .set({ lastAttemptAt: now, lastError: null, updatedAt: now })
    .where(eq(autoPurchaseRulesTable.id, rule.id));

  try {
    const order = await buyProduct(
      baseUrl,
      apiKey,
      rule.sourceProductId,
      rule.quantity,
    );
    await db.update(autoPurchaseRulesTable)
      .set({
        status: "completed",
        lastOrderCode: order.order_code,
        lastPurchasedAmount: order.amount,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(autoPurchaseRulesTable.id, rule.id));
  } catch (error: any) {
    await db.update(autoPurchaseRulesTable)
      .set({ lastError: error?.message ?? "Mua hàng thất bại", updatedAt: new Date() })
      .where(eq(autoPurchaseRulesTable.id, rule.id));
  }
}