/**
 * Background poller: detects new paid canboso.com orders,
 * buys from the source API, and delivers to customers via Telegram.
 *
 * Supports multiple Canboso accounts: call startPoller() once per account.
 * Each call returns a stop() handle — the caller owns the lifecycle.
 *
 * Account-1 (main): runs order poll + stock/price/visibility sync.
 * Account-2+ (secondary): runs order poll only (no product sync).
 */
import { eq } from "drizzle-orm";
import { db, ordersTable, productMappingsTable, marketWatchesTable } from "@workspace/db";
import { logger } from "./logger";
import {
  CanbosoClient,
  getDefaultCanbosoClient,
  isSentinelDelivery,
  getSellerProducts,
  setProductVisibility,
  setProductPrice,
  getProductItems,
  addSentinelAccounts,
  deleteSentinelAccounts,
  type CanbosoOrder,
} from "./canboso";
import { getConfig } from "./config";
import { fetchProducts, buyProduct, getBalance, formatDeliveryMessage, invalidateProductCache } from "./products";
import { triggerAutoFulfill, sendTelegramFile, sendWaitingMessage } from "./fulfillment";
import { orderBelongsToAccount, toBotOwner } from "./bot-routing";

const POLL_INTERVAL_MS = 5_000;       // 5 seconds for <10s delivery
const SYNC_INTERVAL_MS = 5 * 60_000; // 5 minutes for stock sync
const LOW_BALANCE_COOLDOWN_MS = 60 * 60_000; // 1 hour between low-balance alerts

const startedAt = new Date();

// Tracks per-account whether the previous poll cycle was in maintenance.
// Used to detect the maintenance→active transition and drain accumulated orders
// into "manual" status instead of auto-processing them.
const prevMaintenanceState = new Map<string, boolean>();

// ── Legacy single-account state (kept for stopPoller / runSyncNow API compat) ─
let legacyPollerTimer: NodeJS.Timeout | null = null;
let legacySyncTimer: NodeJS.Timeout | null = null;

export interface PollerOptions {
  /** Canboso client to use. Defaults to the account-1 singleton. */
  client?: CanbosoClient;
  /** Telegram bot token to use first when delivering to customers (overrides config). */
  preferredBotToken?: string;
  /** Label used in log messages, e.g. "account-1" or "account-2". */
  accountLabel?: string;
  /** Whether to run stock/price/visibility sync. True for account-1 only. */
  runSync?: boolean;
  /**
   * Allow sentinel-code fallback detection for orders whose Canboso productId is NOT
   * in the mappings table (needed for account-2 which shares the same Canboso account
   * but lists products under different IDs). Default false — account-1 must NEVER set
   * this true or it would steal account-2 orders and deliver via the wrong bot.
   */
  useCodeFallback?: boolean;
}

export interface PollerHandle {
  stop(): void;
}

export function startPoller(opts: PollerOptions = {}): PollerHandle {
  const {
    preferredBotToken,
    accountLabel = "account-1",
    runSync = accountLabel === "account-1",
    useCodeFallback = false,
  } = opts;

  // For account-1 (no explicit client), resolve lazily each poll cycle so that
  // credential changes via the dashboard take effect without a server restart.
  // For account-2 (explicit client), always use the same passed-in instance.
  const getClient = opts.client ? () => opts.client! : () => getDefaultCanbosoClient();

  let isRunning = false;
  let lastLowBalanceAlertAt: Date | null = null;

  logger.info({ accountLabel }, `Canboso order poller started (5s interval)`);

  async function runPoll() {
    if (isRunning) return;
    isRunning = true;
    try {
      await Promise.all([
        processPaidOrders(getClient(), preferredBotToken, accountLabel, useCodeFallback),
        runSync ? checkAndAlertLowBalance(lastLowBalanceAlertAt, (d) => { lastLowBalanceAlertAt = d; }) : Promise.resolve(),
      ]);
    } finally {
      isRunning = false;
    }
  }

  runPoll().catch((err) => logger.error({ err, accountLabel }, "Poller initial run failed"));

  const pollerTimer = setInterval(() => {
    runPoll().catch((err) => logger.error({ err, accountLabel }, "Poller run failed"));
  }, POLL_INTERVAL_MS);

  let syncTimer: NodeJS.Timeout | null = null;
  if (runSync) {
    syncTimer = setInterval(() => {
      const c = getClient();
      syncProductVisibility(c).catch((err) => logger.error({ err }, "Stock sync failed"));
      syncPrices(c).catch((err) => logger.error({ err }, "Price sync failed"));
      syncStock(c).catch((err) => logger.error({ err }, "Stock balance sync failed"));
    }, SYNC_INTERVAL_MS);
  }

  // Stash handles for legacy stopPoller() / runSyncNow() compat when it's the main poller
  if (accountLabel === "account-1") {
    legacyPollerTimer = pollerTimer;
    legacySyncTimer = syncTimer;
  }

  return {
    stop() {
      clearInterval(pollerTimer);
      if (syncTimer) clearInterval(syncTimer);
      logger.info({ accountLabel }, "Canboso order poller stopped");
    },
  };
}

export function stopPoller(): void {
  if (legacyPollerTimer) { clearInterval(legacyPollerTimer); legacyPollerTimer = null; }
  if (legacySyncTimer) { clearInterval(legacySyncTimer); legacySyncTimer = null; }
  logger.info("Canboso order poller stopped");
}

/** Trigger an immediate sync cycle (stock + prices) without waiting for the 5-minute timer. */
export async function runSyncNow(): Promise<{ ok: boolean; message: string }> {
  const client = getDefaultCanbosoClient();
  try {
    await Promise.all([
      syncStock(client).catch((err) => logger.warn({ err: err?.message }, "Sync-now: stock sync error")),
      syncPrices(client).catch((err) => logger.warn({ err: err?.message }, "Sync-now: price sync error")),
      syncProductVisibility(client).catch((err) => logger.warn({ err: err?.message }, "Sync-now: visibility sync error")),
    ]);
    return { ok: true, message: "Đồng bộ xong: kho hàng + giá + hiện/ẩn sản phẩm" };
  } catch (err: any) {
    return { ok: false, message: err?.message ?? "Lỗi không xác định" };
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function checkAndAlertLowBalance(
  lastAlertAt: Date | null,
  setLastAlertAt: (d: Date) => void,
): Promise<void> {
  const config = await getConfig().catch(() => null);
  if (!config?.sourceBotApiUrl || !config.sourceBotApiKey) return;
  if (!config.adminChatId) return;
  if (typeof config.lowBalanceThreshold !== "number" || config.lowBalanceThreshold <= 0) return;

  if (lastAlertAt) {
    const elapsed = Date.now() - lastAlertAt.getTime();
    if (elapsed < LOW_BALANCE_COOLDOWN_MS) return;
  }

  try {
    const baseUrl = config.sourceBotApiUrl.replace(/\/+$/, "");
    const balance = await getBalance(baseUrl, config.sourceBotApiKey);

    if (balance < config.lowBalanceThreshold) {
      const fmt = (v: number) => v.toLocaleString("vi-VN");
      const msg =
        `⚠️ <b>Cảnh báo số dư thấp</b>\n\n` +
        `💰 Số dư API nguồn hiện còn: <b>${fmt(balance)}đ</b>\n` +
        `🚨 Ngưỡng cảnh báo: <b>${fmt(config.lowBalanceThreshold)}đ</b>\n\n` +
        `Vui lòng nạp thêm để tránh gián đoạn giao hàng.`;

      await triggerAutoFulfill(config.adminChatId, msg);
      setLastAlertAt(new Date());
      logger.warn({ balance, threshold: config.lowBalanceThreshold }, "Poller: low balance alert sent to admin");
    }
  } catch (err: any) {
    logger.warn({ err: err?.message }, "Poller: failed to check balance for low-balance alert");
  }
}

async function processPaidOrders(
  client: CanbosoClient,
  preferredBotToken: string | undefined,
  accountLabel: string,
  useCodeFallback: boolean,
): Promise<void> {
  const config = await getConfig().catch(() => null);
  if (!config?.mainBotToken || !config.sourceBotApiUrl || !config.sourceBotApiKey) return;

  const prevMaint = prevMaintenanceState.get(accountLabel) ?? false;
  const nowMaint  = !!config.maintenanceMode;
  prevMaintenanceState.set(accountLabel, nowMaint);

  if (nowMaint) return; // bảo trì — tạm dừng xử lý đơn

  let paidOrders: CanbosoOrder[] = [];
  let sentinelOrders: CanbosoOrder[] = [];
  try {
    const allMappings = await db.select().from(productMappingsTable);
    const sentinelByProductId = new Map(
      allMappings.map((m) => [m.canbosoProductId, m.code]),
    );
    // All known sentinel codes (e.g. "MS1", "MS2", "MS3") — used for cross-account detection
    const knownCodes = new Set(allMappings.map((m) => m.code).filter(Boolean));

    const [paid, completed] = await Promise.all([
      client.getPaidOrders(100),
      client.getRecentCompletedOrders(100),
    ]);
    const mappedProductIds = new Set(allMappings.map((m) => m.canbosoProductId));
    const knownCode = (o: CanbosoOrder) => (o.deliveredAccounts ?? []).some(
      (a: any) => knownCodes.has(String(a.user ?? "").trim()),
    );
    // Both pollers may see the same seller feed. Ownership is decided before
    // claiming the DB row, so account-2 cannot steal account-1's order.
    paidOrders = paid.filter((o) =>
      orderBelongsToAccount(o.productId, accountLabel, mappedProductIds, knownCode(o)),
    );

    sentinelOrders = completed.filter((o) => {
      if (!orderBelongsToAccount(
        o.productId,
        accountLabel,
        mappedProductIds,
        knownCode(o),
      )) return false;
      // Primary path: productId in mappings table
      if (o.productId) {
        const expectedCode = sentinelByProductId.get(o.productId);
        if (expectedCode && isSentinelDelivery(o, expectedCode)) return true;
      }
      // Fallback: deliveredAccounts contains a known code (account-2 only — guards against
      // account-1 stealing orders that belong to the secondary bot)
      if (!useCodeFallback) return false;
      return knownCode(o);
    });
  } catch (err: any) {
    logger.warn({ err: err?.message, accountLabel }, "Poller: failed to fetch orders");
    return;
  }

  const ordersToProcess = [...paidOrders, ...sentinelOrders];
  if (ordersToProcess.length === 0) return;

  // ── Maintenance just turned OFF → drain accumulated orders as manual ──────
  // Do NOT auto-process orders that piled up while maintenance was active.
  // Insert them as "manual" so admin can review and fulfil by hand.
  if (prevMaint) {
    let drained = 0;
    for (const order of ordersToProcess) {
      if (await isAlreadyProcessed(order.orderCode)) continue;
      await db.insert(ordersTable).values({
        canbosoOrderCode: order.orderCode,
        customerId: String((order as any).buyerId ?? "unknown"),
        customerUsername: null,
        productType: (order as any).productName ?? "general",
        rawMessage: "",
        status: "manual",
        errorMessage: "Đơn tích lũy trong thời gian bảo trì — cần xử lý thủ công",
        accountSlot: accountLabel,
      }).catch(() => {}); // ignore unique constraint conflicts
      drained++;
    }
    logger.info({ accountLabel, drained }, "Maintenance ended: drained accumulated orders to manual status");
    return; // skip auto-processing this cycle
  }

  const sentinelCodes = new Set(sentinelOrders.map((o) => o.orderCode));

  for (const order of ordersToProcess) {
    const isSentinel = sentinelCodes.has(order.orderCode);
    await processOrder(order, config, isSentinel, preferredBotToken, accountLabel, useCodeFallback).catch((err) =>
      logger.error({ err, orderCode: order.orderCode, accountLabel }, "Poller: order processing error"),
    );
  }
}

async function isAlreadyProcessed(orderCode: string): Promise<boolean> {
  const [existing] = await db
    .select({ id: ordersTable.id })
    .from(ordersTable)
    .where(eq(ordersTable.canbosoOrderCode, orderCode))
    .limit(1);
  return !!existing;
}

async function getMappingByCanbosoProductId(canbosoProductId: string) {
  const [mapping] = await db
    .select()
    .from(productMappingsTable)
    .where(eq(productMappingsTable.canbosoProductId, canbosoProductId))
    .limit(1);
  return mapping ?? null;
}

/** Returns true if this Canboso product is managed by a market_watch rule. */
async function isMarketWatchProduct(canbosoProductId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: marketWatchesTable.id })
    .from(marketWatchesTable)
    .where(eq(marketWatchesTable.currentSellerProductId, canbosoProductId))
    .limit(1);
  return !!row;
}

async function processOrder(
  order: CanbosoOrder,
  config: any,
  skipStartedAtCheck = false,
  preferredBotToken?: string,
  accountLabel?: string,
  useCodeFallback = false,
): Promise<void> {
  if (!skipStartedAtCheck && order.paidAt && new Date(order.paidAt) < startedAt) return;
  // Quick pre-check (optimisation — avoids DB insert attempt for already-known orders)
  if (await isAlreadyProcessed(order.orderCode)) return;

  if (order.productId && await isMarketWatchProduct(order.productId)) {
    logger.info({ orderCode: order.orderCode, productId: order.productId }, "Poller: skipping market-watch product (fulfilled by marketplace)");
    return;
  }

  const productLabel = order.displayProductType ?? order.productType;
  const orderKind = order.status === "completed" ? "sentinel-completed" : "paid";

  const chatId = String(order.chatId);
  const owner = toBotOwner(accountLabel);
  if (!owner) {
    logger.error({ orderCode: order.orderCode, accountLabel }, "Poller: unknown account owner — refusing to fulfill");
    return;
  }
  // Determine language for customer-facing messages
  const lang: 'vi' | 'en' = preferredBotToken ? 'en' : 'vi';

  // Atomic claim: onConflictDoNothing() ensures only ONE poller wins this order.
  // If another poller (e.g. account-2) already inserted this orderCode, the insert
  // returns no rows and we bail out immediately — prevents double-processing and
  // wrong-bot delivery.
  const [dbOrder] = await db
    .insert(ordersTable)
    .values({
      customerId: chatId,
      customerUsername: order.chatName?.replace("@", "") ?? null,
      productType: productLabel,
      rawMessage: `[canboso:${accountLabel ?? "1"}] ${order.orderCode} — ${productLabel} x${order.finalQuantity}`,
      status: "processing",
      canbosoOrderCode: order.orderCode,
      accountSlot: accountLabel ?? null,
    })
    .onConflictDoNothing()
    .returning();

  // Another poller already claimed this order — stop here
  if (!dbOrder) {
    logger.info({ orderCode: order.orderCode, accountLabel }, "Poller: order already claimed by another account — skipping");
    return;
  }

  logger.info({ orderCode: order.orderCode, product: productLabel, kind: orderKind, accountLabel }, "Poller: new order detected — processing");

  await sendWaitingMessage(chatId, owner, lang, preferredBotToken).catch(() => {});

  const baseUrl = config.sourceBotApiUrl.replace(/\/+$/, "");
  const apiKey = config.sourceBotApiKey;

  try {
    const products = await fetchProducts(baseUrl, apiKey);
    const qty = order.finalQuantity ?? order.quantity ?? 1;

    let sourceProductId: string | null = null;
    let sourceName: string | null = null;

    if (order.productId) {
      const mapping = await getMappingByCanbosoProductId(order.productId);
      if (mapping) {
        sourceProductId = mapping.sourceProductId;
        sourceName = mapping.sourceProductName;
        logger.info({ orderCode: order.orderCode, via: "mapping", code: mapping.code }, "Matched via mapping table");
      }
    }

    // Fallback for cross-account sentinel orders (account-2 only): productId not in mappings
    // but deliveredAccounts contains a known sentinel code (e.g. "MS3").
    // Guard: account-1 must never use this path or it will steal account-2's orders.
    if (useCodeFallback && !sourceProductId && order.deliveredAccounts?.length > 0) {
      const sentinelCode = String(order.deliveredAccounts[0].user ?? "").trim();
      if (sentinelCode) {
        const [mappingByCode] = await db
          .select()
          .from(productMappingsTable)
          .where(eq(productMappingsTable.code, sentinelCode))
          .limit(1);
        if (mappingByCode) {
          sourceProductId = mappingByCode.sourceProductId;
          sourceName = mappingByCode.sourceProductName;
          logger.info({ orderCode: order.orderCode, via: "sentinel-code", code: sentinelCode }, "Matched via sentinel code fallback");
        }
      }
    }

    if (!sourceProductId) {
      const adminMsg =
        `🚨 <b>CẦN XỬ LÝ THỦ CÔNG</b>\n\n` +
        `📋 Đơn: <b>${order.orderCode}</b>\n` +
        `👤 Khách: @${order.chatName ?? chatId} (${chatId})\n` +
        `📦 Sản phẩm: <b>${productLabel}</b> x${order.finalQuantity ?? 1}\n\n` +
        `⚠️ Chưa có mapping cho sản phẩm này. Vui lòng vào <b>Ánh Xạ Sản Phẩm</b> để thêm rồi giao thủ công.`;
      await triggerAutoFulfill(chatId, lang === 'en'
        ? `⏳ Your order is being processed manually. Our team will contact you shortly.`
        : `⏳ Đơn hàng đang được xử lý thủ công, admin sẽ liên hệ sớm.`, owner, preferredBotToken).catch(() => {});
      await triggerAutoFulfill(config.adminChatId, adminMsg, owner, preferredBotToken).catch(() => {});
      await db.update(ordersTable).set({ status: "manual", errorMessage: `Chưa có mapping: "${productLabel}"` }).where(eq(ordersTable.id, dbOrder.id));
      logger.warn({ orderCode: order.orderCode, product: productLabel }, "Poller: no mapping — marked manual");
      return;
    }

    const sourceProduct = products.find(p => p.id === sourceProductId);
    if (sourceProduct && sourceProduct.stock <= 0) {
      await triggerAutoFulfill(chatId,
        lang === 'en'
          ? `❌ <b>${sourceName}</b> is currently out of stock.\nPlease contact support for assistance.`
          : `❌ Sản phẩm <b>${sourceName}</b> hiện đã hết hàng.\nVui lòng liên hệ admin để được hỗ trợ.`,
        owner,
        preferredBotToken,
      ).catch(() => {});
      await db.update(ordersTable).set({ status: "failed", errorMessage: `Hết hàng: ${sourceName}` }).where(eq(ordersTable.id, dbOrder.id));

      if (order.productId) {
        const mapping = await getMappingByCanbosoProductId(order.productId);
        if (mapping?.autoHideWhenOos) {
          await setProductVisibility(order.productId, true).catch(() => {});
        }
      }
      return;
    }

    if (sourceProduct && sourceProduct.price > 0) {
      const required = sourceProduct.price * qty;
      const balance = await getBalance(baseUrl, apiKey).catch(() => 0);
      if (balance < required) {
        const fmt = (v: number) => v.toLocaleString("vi-VN");
        logger.warn(
          { orderCode: order.orderCode, balance, required, qty },
          "Poller: insufficient balance — cannot fulfill order",
        );

        await triggerAutoFulfill(chatId,
          lang === 'en'
            ? `⏳ <b>Your order is being processed.</b>\n\nWe will deliver as soon as possible. Thank you for your patience!`
            : `⏳ <b>Đơn hàng của bạn đang được xử lý.</b>\n\nChúng tôi sẽ giao hàng sớm nhất có thể. Cảm ơn bạn đã chờ đợi!`,
          owner,
          preferredBotToken,
        ).catch(() => {});

        if (config.adminChatId) {
          await triggerAutoFulfill(config.adminChatId,
            `🚨 <b>CẦN XỬ LÝ THỦ CÔNG</b>\n\n` +
            `📋 Đơn: <code>${order.orderCode}</code>\n` +
            `👤 Khách: ${order.chatName ?? chatId} (<code>${chatId}</code>)\n` +
            `📦 Sản phẩm: <b>${sourceName}</b> x${qty}\n` +
            `💰 Cần: <b>${fmt(required)}đ</b> | Số dư hiện tại: <b>${fmt(balance)}đ</b>\n\n` +
            `⚠️ Số dư API nguồn không đủ. Vui lòng nạp thêm và giao hàng thủ công.`,
            owner,
            preferredBotToken,
          ).catch(() => {});
        }

        await db.update(ordersTable).set({
          status: "failed",
          errorMessage: `Số dư không đủ: cần ${(sourceProduct.price * qty).toLocaleString("vi-VN")}đ (x${qty})`,
        }).where(eq(ordersTable.id, dbOrder.id));
        return;
      }
    }

    const orderResult = await buyProduct(baseUrl, apiKey, sourceProductId, qty);

    const fileUrl = orderResult.file_url ?? orderResult.txt_url ?? orderResult.file ?? null;
    const isFileDelivery = !!fileUrl || orderResult.accounts.length === 0;

    const productDetails = isFileDelivery
      ? `[file] ${fileUrl ?? "unknown"}`
      : orderResult.accounts.join("\n");

    await db.update(ordersTable).set({
      status: "fulfilled",
      productType: orderResult.product_name,
      productDetails,
      sourceApiResponse: JSON.stringify(orderResult),
      fulfilledAt: new Date(),
    }).where(eq(ordersTable.id, dbOrder.id));

    if (isFileDelivery && fileUrl) {
      const caption = lang === 'en'
        ? `✅ <b>Order completed!</b>\n\n` +
          `📦 <b>Product:</b> ${orderResult.product_name} (x${qty})\n\n` +
          `🔑 <b>Your account is attached in the file below.</b>`
        : `✅ <b>Đơn hàng đã hoàn thành!</b>\n\n` +
          `📦 <b>Sản phẩm:</b> ${orderResult.product_name} (x${qty})\n\n` +
          `🔑 <b>Tài khoản đính kèm trong file bên dưới.</b>`;
      await sendTelegramFile(chatId, fileUrl, caption, orderResult.order_code, owner, preferredBotToken);
    } else {
      const deliveryMsg = formatDeliveryMessage(orderResult.product_name, orderResult.accounts, lang);
      await triggerAutoFulfill(chatId, deliveryMsg, owner, preferredBotToken);
    }

    if (config.adminChatId) {
      const fmt = (v: number) => v.toLocaleString("vi-VN");
      const balanceAfter = await getBalance(baseUrl, apiKey).catch(() => null);
      const customerName = order.chatName ? `${order.chatName} (<code>${chatId}</code>)` : `<code>${chatId}</code>`;
      const adminMsg =
        `✅ <b>Đơn hàng thành công!</b>\n\n` +
        `📋 Mã đơn: <code>${order.orderCode}</code>\n` +
        `👤 Khách: ${customerName}\n` +
        `📦 Sản phẩm: <b>${orderResult.product_name}</b> x${qty}\n` +
        (balanceAfter !== null ? `💰 Số dư còn lại: <b>${fmt(balanceAfter)}đ</b>` : ``);
      await triggerAutoFulfill(config.adminChatId, adminMsg, owner, preferredBotToken).catch(() => {});
    }

    logger.info(
      { orderCode: order.orderCode, sourceOrder: orderResult.order_code, isFileDelivery, accountLabel },
      "Poller: fulfilled and delivered",
    );
  } catch (err: any) {
    logger.error({ err: err?.message, orderCode: order.orderCode }, "Poller: fulfillment error");
    await db.update(ordersTable).set({
      status: "failed",
      errorMessage: err?.message ?? "Lỗi không xác định",
    }).where(eq(ordersTable.id, dbOrder.id)).catch(() => {});
  }
}

// ── Sync functions (account-1 only) ──────────────────────────────────────────

async function syncPrices(client: CanbosoClient): Promise<void> {
  const config = await getConfig().catch(() => null);
  if (!config?.sourceBotApiUrl || !config.sourceBotApiKey) return;

  try {
    invalidateProductCache();
    const baseUrl = config.sourceBotApiUrl.replace(/\/+$/, "");
    const [mappings, sourceProducts] = await Promise.all([
      db.select().from(productMappingsTable),
      fetchProducts(baseUrl, config.sourceBotApiKey),
    ]);

    for (const mapping of mappings) {
      if (mapping.markupAmount == null) continue;
      const source = sourceProducts.find(p => p.id === mapping.sourceProductId);
      if (!source) continue;

      const currentSourcePrice = source.price;
      const lastSeenPrice = mapping.sourcePriceLastSeen;
      if (lastSeenPrice !== null && lastSeenPrice === currentSourcePrice) continue;

      const newCanbosoPrice = currentSourcePrice + mapping.markupAmount;
      if (newCanbosoPrice <= 0) continue;

      try {
        await client.setProductPrice(mapping.canbosoProductId, newCanbosoPrice);
        await db.update(productMappingsTable)
          .set({ sourcePriceLastSeen: currentSourcePrice })
          .where(eq(productMappingsTable.id, mapping.id));

        const fmt = (v: number) => v.toLocaleString("vi-VN");
        logger.info(
          { code: mapping.code, oldPrice: lastSeenPrice, newSourcePrice: currentSourcePrice, newCanbosoPrice },
          "Price sync: updated canboso price",
        );

        if (lastSeenPrice !== null && config.adminChatId) {
          const direction = currentSourcePrice > lastSeenPrice ? "tăng" : "giảm";
          const diff = Math.abs(currentSourcePrice - lastSeenPrice);
          const msg =
            `📈 <b>Giá nguồn ${direction} — đã tự cập nhật Canboso</b>\n\n` +
            `📦 Sản phẩm: <b>${mapping.canbosoProductName}</b>\n` +
            `🔁 Giá nguồn: <b>${fmt(lastSeenPrice)}đ → ${fmt(currentSourcePrice)}đ</b> (${direction} ${fmt(diff)}đ)\n` +
            `🏷️ Giá Canboso: <b>${fmt(lastSeenPrice + mapping.markupAmount)}đ → ${fmt(newCanbosoPrice)}đ</b> (${direction} ${fmt(diff)}đ)`;
          await triggerAutoFulfill(config.adminChatId, msg).catch(() => {});
        }
      } catch (err: any) {
        logger.warn({ err: err?.message, code: mapping.code }, "Price sync: failed to update canboso price");
      }
    }
  } catch (err: any) {
    logger.warn({ err: err?.message }, "Price sync failed");
  }
}

async function syncProductVisibility(client: CanbosoClient): Promise<void> {
  const config = await getConfig().catch(() => null);
  if (!config?.sourceBotApiUrl || !config.sourceBotApiKey) return;

  try {
    invalidateProductCache();
    const [mappings, sourceProducts, canbosoProducts] = await Promise.all([
      db.select().from(productMappingsTable),
      fetchProducts(config.sourceBotApiUrl, config.sourceBotApiKey),
      client.getSellerProducts(),
    ]);

    for (const mapping of mappings) {
      if (!mapping.autoHideWhenOos) continue;
      const source = sourceProducts.find(p => p.id === mapping.sourceProductId);
      const canboso = canbosoProducts.find(p => p._id === mapping.canbosoProductId);
      if (!source || !canboso) continue;

      const shouldBeHidden = source.stock <= 0;
      if (canboso.hiddenInBotMenu !== shouldBeHidden) {
        await client.setProductVisibility(mapping.canbosoProductId, shouldBeHidden).catch(() => {});
        logger.info({ code: mapping.code, hidden: shouldBeHidden, stock: source.stock }, "Stock sync: updated product visibility");
      }
    }
  } catch (err: any) {
    logger.warn({ err: err?.message }, "Stock sync failed");
  }
}

async function syncStock(client: CanbosoClient): Promise<void> {
  const config = await getConfig().catch(() => null);
  if (!config?.sourceBotApiUrl || !config.sourceBotApiKey) return;

  try {
    const [mappings, sourceProducts] = await Promise.all([
      db.select().from(productMappingsTable),
      fetchProducts(config.sourceBotApiUrl, config.sourceBotApiKey),
    ]);

    const syncable = mappings.filter(m => m.code && m.canbosoProductId && m.sourceProductId);
    if (syncable.length === 0) return;

    for (const mapping of syncable) {
      try {
        const source = sourceProducts.find(p => p.id === mapping.sourceProductId);
        if (!source) continue;

        const targetQty = Math.max(0, source.stock);
        const items = await client.getProductItems(mapping.canbosoProductId);
        const sentinelItems = items.filter(
          item => item.status === "available" && String(item.user ?? "").trim() === mapping.code,
        );
        const currentQty = sentinelItems.length;

        if (currentQty === targetQty) continue;

        const diff = targetQty - currentQty;
        if (diff > 0) {
          await client.addSentinelAccounts(mapping.canbosoProductId, mapping.code, diff);
          logger.info({ code: mapping.code, currentQty, targetQty, added: diff }, "Stock balance: added sentinel accounts to Canboso");
        } else {
          const toDelete = sentinelItems.slice(0, Math.abs(diff)).map(i => i._id);
          await client.deleteSentinelAccounts(toDelete);
          logger.info({ code: mapping.code, currentQty, targetQty, deleted: toDelete.length }, "Stock balance: removed excess sentinel accounts from Canboso");
        }
      } catch (err: any) {
        logger.warn({ err: err?.message, code: mapping.code }, "Stock balance: failed for mapping");
      }
    }
  } catch (err: any) {
    logger.warn({ err: err?.message }, "Stock balance sync failed");
  }
}
