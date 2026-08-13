import { Router, type IRouter } from "express";
import { db, ordersTable } from "@workspace/db";
import { getConfig } from "../lib/config";
import { processOrderInBackground } from "./orders";
import { fetchProducts, matchProduct } from "../lib/products";

const router: IRouter = Router();

// ── Main webhook handler ──────────────────────────────────────────────────────

// Called by Telegram servers when the main bot receives a message
router.post("/webhook/telegram", async (req, res): Promise<void> => {
  // Always respond 200 to Telegram immediately
  res.json({ ok: true });

  const update = req.body;
  const config = await getConfig().catch(() => null);
  if (!config?.mainBotToken) return;

  // ── Handle messages ───────────────────────────────────────────────────────
  const message = update?.message;
  if (!message || !message.text) return;

  const text: string = message.text ?? "";
  const userId: number = message.from?.id;
  const chatId: string = String(message.chat?.id ?? userId);

  // ── Existing order keyword logic (unchanged) ──────────────────────────────
  const keyword = (config.orderKeyword ?? "mua").toLowerCase();
  if (!text.toLowerCase().includes(keyword)) return;

  const customerId = String(userId ?? "");
  const customerUsername = message.from?.username ?? null;

  req.log.info({ customerId, text }, "New order received via Telegram webhook");

  // Try to detect product type from message for better tracking
  let productType = "general";
  if (config.sourceBotApiUrl && config.sourceBotApiKey) {
    try {
      const baseUrl = config.sourceBotApiUrl.replace(/\/+$/, "");
      const products = await fetchProducts(baseUrl, config.sourceBotApiKey);
      const matched = matchProduct(products, text);
      if (matched) productType = matched.name;
    } catch {
      // Non-critical — continue with "general"
    }
  }

  // Save order to DB
  const [order] = await db
    .insert(ordersTable)
    .values({
      customerId: chatId,
      customerUsername,
      productType,
      rawMessage: text,
      status: config.autoFulfill ? "processing" : "pending",
    })
    .returning();

  if (config.autoFulfill) {
    processOrderInBackground(order.id, chatId, text, req.log).catch(() => {});
  }
});

// Setup webhook URL on the main Telegram bot
router.post("/webhook/setup", async (req, res): Promise<void> => {
  const config = await getConfig();

  if (!config.mainBotToken) {
    res.status(400).json({ ok: false, description: "Bot Token chưa được cấu hình. Vui lòng lưu trước trong phần Cấu Hình." });
    return;
  }

  // Use REPLIT_DOMAINS for deployed env, fall back to REPLIT_DEV_DOMAIN for dev
  const replDomain =
    process.env.REPLIT_DOMAINS?.split(",")[0] ??
    process.env.REPLIT_DEV_DOMAIN;

  if (!replDomain) {
    res.status(400).json({ ok: false, description: "Không xác định được URL server. Vui lòng deploy trước." });
    return;
  }

  const webhookUrl = `https://${replDomain}/api/webhook/telegram`;

  const response = await fetch(
    `https://api.telegram.org/bot${config.mainBotToken}/setWebhook`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: webhookUrl, allowed_updates: ["message", "callback_query"] }),
    },
  );

  const result = await response.json() as { ok: boolean; description?: string };

  if (result.ok) {
    const { saveConfig } = await import("../lib/config");
    await saveConfig({ webhookUrl }).catch(() => {});
  }

  res.json({
    ok: result.ok,
    description: result.description ?? (result.ok ? "Webhook đã được đăng ký thành công" : "Đăng ký thất bại"),
  });
});

export default router;
