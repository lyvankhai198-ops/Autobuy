import { Router, type IRouter } from "express";
import { eq, desc, sql, and } from "drizzle-orm";
import { db, ordersTable, productMappingsTable, marketWatchesTable } from "@workspace/db";
import {
  ListOrdersQueryParams,
  GetOrderParams,
  FulfillOrderParams,
  FulfillOrderBody,
  RetryOrderParams,
  ListRecentActivityQueryParams,
} from "@workspace/api-zod";
import { triggerAutoFulfill, sendTelegramFile, startFulfillmentProgress, type FulfillmentProgress } from "../lib/fulfillment";
import { fetchProducts, matchProduct, buyProduct, formatDeliveryMessage, formatProductListMessage, type BuyResult } from "../lib/products";
import { logger } from "../lib/logger";
import { toBotOwner } from "../lib/bot-routing";

const router: IRouter = Router();

function parseSavedPurchase(value: string | null): BuyResult | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<BuyResult>;
    if (
      typeof parsed.order_code !== "string" ||
      typeof parsed.product_name !== "string" ||
      !Array.isArray(parsed.accounts)
    ) {
      return null;
    }
    return parsed as BuyResult;
  } catch {
    return null;
  }
}

async function deliverPurchasedResult(
  customerId: string,
  result: BuyResult,
  quantity: number,
  owner: "account-1" | "account-2",
  lang: "vi" | "en",
): Promise<void> {
  const fileUrl = result.file_url ?? result.txt_url ?? result.file ?? null;
  if (fileUrl) {
    const caption = lang === "en"
      ? `✅ <b>Order completed!</b>\n\n📦 <b>Product:</b> ${result.product_name} (x${quantity})\n\n🔑 <b>Your account is attached in the file below.</b>`
      : `✅ <b>Đơn hàng đã hoàn thành!</b>\n\n📦 <b>Sản phẩm:</b> ${result.product_name} (x${quantity})\n\n🔑 <b>Tài khoản đính kèm trong file bên dưới.</b>`;
    await sendTelegramFile(customerId, fileUrl, caption, result.order_code, owner);
    return;
  }

  await triggerAutoFulfill(
    customerId,
    formatDeliveryMessage(result.product_name, result.accounts, lang),
    owner,
  );
}

router.get("/orders", async (req, res): Promise<void> => {
  const parsed = ListOrdersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { status, limit = 50, offset = 0 } = parsed.data;
  const conditions = status ? [eq(ordersTable.status, status)] : [];

  const orders = await db
    .select()
    .from(ordersTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(ordersTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json(orders);
});

router.get("/orders/stats", async (req, res): Promise<void> => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [stats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      pending: sql<number>`count(*) filter (where status = 'pending')::int`,
      processing: sql<number>`count(*) filter (where status = 'processing')::int`,
      fulfilled: sql<number>`count(*) filter (where status = 'fulfilled')::int`,
      failed: sql<number>`count(*) filter (where status = 'failed')::int`,
      todayCount: sql<number>`count(*) filter (where created_at >= ${today.toISOString()})::int`,
      todayFulfilled: sql<number>`count(*) filter (where status = 'fulfilled' and created_at >= ${today.toISOString()})::int`,
    })
    .from(ordersTable);

  res.json(stats);
});

router.get("/orders/recent", async (req, res): Promise<void> => {
  const parsed = ListRecentActivityQueryParams.safeParse(req.query);
  const limit = parsed.success ? (parsed.data.limit ?? 10) : 10;

  const orders = await db
    .select()
    .from(ordersTable)
    .orderBy(desc(ordersTable.createdAt))
    .limit(limit);

  res.json(orders);
});

router.get("/orders/chart", async (req, res): Promise<void> => {
  const period = (req.query.period as string) || "7d";
  const days = period === "30d" ? 30 : period === "3m" ? 90 : 7;

  const intervalStr = `${days} days`;
  const rows = await db.execute(sql`
    SELECT
      TO_CHAR(DATE_TRUNC('day', created_at), 'YYYY-MM-DD') AS date,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'fulfilled')::int AS fulfilled,
      COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
    FROM orders
    WHERE created_at >= NOW() - CAST(${intervalStr} AS interval)
    GROUP BY DATE_TRUNC('day', created_at)
    ORDER BY DATE_TRUNC('day', created_at) ASC
  `);

  res.json({ data: rows.rows });
});

router.get("/orders/:id", async (req, res): Promise<void> => {
  const params = GetOrderParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [order] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, params.data.id));

  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  res.json(order);
});

router.post("/orders/:id/fulfill", async (req, res): Promise<void> => {
  const params = FulfillOrderParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = FulfillOrderBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [order] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, params.data.id));

  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const owner = toBotOwner(order.accountSlot);
  if (!owner) {
    res.status(409).json({ error: "Đơn chưa xác định bot sở hữu — không thể giao tự động" });
    return;
  }

  const [updated] = await db
    .update(ordersTable)
    .set({
      status: "fulfilled",
      productDetails: body.data.productDetails,
      fulfilledAt: new Date(),
      errorMessage: null,
    })
    .where(eq(ordersTable.id, params.data.id))
    .returning();

  // Send product to customer via Telegram
  const progress = await startFulfillmentProgress(
    order.customerId,
    owner,
    order.accountSlot === "account-2" ? "en" : "vi",
    undefined,
    `manual:${order.id}`,
  ).catch(() => null);
  try {
    await progress?.update(90, "delivery");
    await triggerAutoFulfill(order.customerId, body.data.productDetails, owner);
    await progress?.finish();
  } catch (err) {
    await progress?.fail();
    req.log.warn({ err, orderId: order.id }, "Could not send Telegram message for manual fulfillment");
  }

  res.json(updated);
});

router.post("/orders/:id/retry", async (req, res): Promise<void> => {
  const params = RetryOrderParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [order] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, params.data.id));

  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const [updated] = await db
    .update(ordersTable)
    .set({ status: "processing", errorMessage: null })
    .where(eq(ordersTable.id, params.data.id))
    .returning();

  processOrderInBackground(updated.id, order.customerId, order.rawMessage, req.log, order.accountSlot).catch(() => {});

  res.json(updated);
});

/**
 * Core fulfillment logic:
 * 1. Fetch product list from supplier API
 * 2. Match product from customer message
 * 3. Call POST /api/buy on supplier
 * 4. Deliver account details to customer via Telegram
 */
// DELETE all operational data — Vùng Nguy Hiểm: orders + mappings + market watches
router.delete("/data/all", async (req, res): Promise<void> => {
  await Promise.all([
    db.delete(ordersTable),
    db.delete(productMappingsTable),
    db.delete(marketWatchesTable),
  ]);
  res.json({ ok: true });
});

export async function processOrderInBackground(
  orderId: number,
  customerId: string,
  rawMessage: string,
  log: any,
  accountSlot: string | null = null,
): Promise<void> {
  let progress: FulfillmentProgress | null = null;
  try {
    const [storedOrder] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, orderId));
    if (!storedOrder) {
      log.warn({ orderId }, "Background order not found — refusing fulfillment");
      return;
    }

    customerId = storedOrder.customerId;
    rawMessage = storedOrder.rawMessage;
    accountSlot = storedOrder.accountSlot;

    const { getConfig } = await import("../lib/config");
    const config = await getConfig();
    const owner = toBotOwner(accountSlot);
    if (!owner) {
      await db.update(ordersTable)
        .set({ status: "manual", errorMessage: "Đơn chưa xác định bot sở hữu — cần xử lý thủ công" })
        .where(eq(ordersTable.id, orderId));
      log.warn({ orderId }, "Refusing fulfillment without a fixed bot owner");
      return;
    }

    // Validate config
    if (!config.mainBotToken) {
      await db.update(ordersTable)
        .set({ status: "failed", errorMessage: "Bot Token chưa được cấu hình" })
        .where(eq(ordersTable.id, orderId));
      return;
    }

    if (!config.sourceBotApiUrl || !config.sourceBotApiKey) {
      await db.update(ordersTable)
        .set({ status: "failed", errorMessage: "API nguồn hàng chưa được cấu hình" })
        .where(eq(ordersTable.id, orderId));
      return;
    }

    const baseUrl = config.sourceBotApiUrl.replace(/\/+$/, "");
    const apiKey = config.sourceBotApiKey;

    progress = await startFulfillmentProgress(
      customerId,
      owner,
      accountSlot === "account-2" ? "en" : "vi",
      undefined,
      `order:${orderId}`,
    ).catch(() => null);
    await progress?.update(15, "confirming");

    const savedPurchase = parseSavedPurchase(storedOrder.sourceApiResponse);
    if (storedOrder.sourceApiResponse && !savedPurchase) {
      await db.update(ordersTable)
        .set({ status: "manual", errorMessage: "Kết quả mua hàng đã lưu không hợp lệ — cần kiểm tra thủ công" })
        .where(eq(ordersTable.id, orderId));
      await progress?.fail();
      log.error({ orderId }, "Saved supplier response is invalid — refusing to buy again");
      return;
    }

    if (savedPurchase) {
      // A previous attempt already bought the item. Retry only Telegram
      // delivery; never call the supplier purchase endpoint again.
      await progress?.update(90, "delivery");
      await deliverPurchasedResult(
        customerId,
        savedPurchase,
        savedPurchase.quantity || 1,
        owner,
        accountSlot === "account-2" ? "en" : "vi",
      );
      await db.update(ordersTable)
        .set({
          status: "fulfilled",
          productType: savedPurchase.product_name,
          productDetails: savedPurchase.accounts.join("\n"),
          fulfilledAt: new Date(),
          errorMessage: null,
        })
        .where(eq(ordersTable.id, orderId));
      await progress?.finish();
      log.info({ orderId, sourceOrderCode: savedPurchase.order_code }, "Redelivered saved supplier purchase");
      return;
    }

    // Fetch product list
    await progress?.update(30, "source");
    const products = await fetchProducts(baseUrl, apiKey);
    await progress?.update(55, "fetching");

    if (products.length === 0) {
      await db.update(ordersTable)
        .set({ status: "failed", errorMessage: "Không lấy được danh sách sản phẩm từ API nguồn hàng" })
        .where(eq(ordersTable.id, orderId));
      await progress?.fail();
      return;
    }

    // Match product from message
    const matched = matchProduct(products, rawMessage);

    if (!matched) {
      // No product matched — send product list to customer and mark as failed
      log.info({ orderId, rawMessage }, "No product matched, sending product list to customer");

      const listMsg = formatProductListMessage(products);
      await triggerAutoFulfill(customerId, listMsg, owner).catch(() => {});

      await db.update(ordersTable)
        .set({
          status: "failed",
          errorMessage: `Không nhận dạng được sản phẩm từ tin nhắn: "${rawMessage}". Đã gửi danh sách sản phẩm cho khách.`,
        })
        .where(eq(ordersTable.id, orderId));
      await progress?.fail();
      return;
    }

    log.info({ orderId, productId: matched.id, productName: matched.name }, "Product matched, calling supplier API");
    await progress?.update(75, "processing");

    // Update product type in DB
    await db.update(ordersTable)
      .set({ productType: matched.name })
      .where(eq(ordersTable.id, orderId));

    // Check stock
    if (matched.stock <= 0) {
      const outMsg = `❌ Sản phẩm <b>${matched.name}</b> hiện đã hết hàng.\n\n${formatProductListMessage(products)}`;
      await triggerAutoFulfill(customerId, outMsg, owner).catch(() => {});

      await db.update(ordersTable)
        .set({ status: "failed", errorMessage: `Hết hàng: ${matched.name}` })
        .where(eq(ordersTable.id, orderId));
      await progress?.fail();
      return;
    }

    // Call supplier API
    await progress?.update(90, "delivery");
    const orderResult = await buyProduct(baseUrl, apiKey, matched.id, 1);

    // Format delivery message
    const deliveryMsg = formatDeliveryMessage(orderResult.product_name, orderResult.accounts);
    const productDetails = orderResult.accounts.join("\n");

    // Save fulfilled order
    await db.update(ordersTable)
      .set({
        status: "fulfilled",
        productType: orderResult.product_name,
        productDetails,
        sourceApiResponse: JSON.stringify(orderResult),
        fulfilledAt: new Date(),
        errorMessage: null,
      })
      .where(eq(ordersTable.id, orderId));

    // Deliver to customer
    await triggerAutoFulfill(customerId, deliveryMsg, owner);
    await progress?.finish();

    log.info({ orderId, orderCode: orderResult.order_code }, "Order fulfilled and delivered to customer");
  } catch (err: any) {
    log.error({ err, orderId }, "Background order processing failed");
    await progress?.fail();
    await db.update(ordersTable)
      .set({ status: "failed", errorMessage: err?.message ?? "Lỗi không xác định" })
      .where(eq(ordersTable.id, orderId))
      .catch(() => {});
  }
}

export default router;
