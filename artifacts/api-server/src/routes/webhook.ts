import { Router, type IRouter } from "express";
import { db, ordersTable } from "@workspace/db";
import { getConfig } from "../lib/config";
import { processOrderInBackground } from "./orders";
import { fetchProducts, matchProduct } from "../lib/products";

const router: IRouter = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

async function callTelegram(botToken: string, method: string, body: object): Promise<any> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

/** Returns true if userId is a member/admin/creator of channelId */
async function isMember(botToken: string, channelId: string, userId: number): Promise<boolean> {
  try {
    const data = await callTelegram(botToken, "getChatMember", {
      chat_id: channelId,
      user_id: userId,
    });
    if (!data.ok) return false;
    return ["member", "administrator", "creator"].includes(data.result?.status);
  } catch {
    return false;
  }
}

/** Send the community join prompt with two inline buttons */
async function sendJoinPrompt(botToken: string, chatId: string, channelLink: string): Promise<void> {
  await callTelegram(botToken, "sendMessage", {
    chat_id: chatId,
    text: "👥 *THAM GIA CỘNG ĐỒNG*\n\nBạn cần duy trì tư cách thành viên của cộng đồng để sử dụng shop. Hãy tham gia, sau đó bấm *Xác minh thành viên*.",
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [[
        { text: "👥 Tham gia cộng đồng", url: channelLink },
        { text: "✅ Xác minh thành viên", callback_data: "verify_membership" },
      ]],
    },
  });
}

// ── Main webhook handler ──────────────────────────────────────────────────────

// Called by Telegram servers when the main bot receives a message or callback
router.post("/webhook/telegram", async (req, res): Promise<void> => {
  // Always respond 200 to Telegram immediately
  res.json({ ok: true });

  const update = req.body;
  const config = await getConfig().catch(() => null);
  if (!config?.mainBotToken) return;

  const botToken = config.mainBotToken;

  // ── Handle callback_query (button taps) ──────────────────────────────────
  const cq = update?.callback_query;
  if (cq?.data === "verify_membership") {
    const cqChatId = String(cq.message?.chat?.id ?? cq.from?.id);
    const cqUserId: number = cq.from?.id;

    // Acknowledge button tap (clears loading spinner)
    await callTelegram(botToken, "answerCallbackQuery", { callback_query_id: cq.id }).catch(() => {});

    const channelId = config.communityChannelId;
    const channelLink = config.communityChannelLink;

    if (!channelId) {
      // Community check not configured — just confirm
      await callTelegram(botToken, "sendMessage", {
        chat_id: cqChatId,
        text: "✅ Xác minh thành công! Bạn có thể đặt hàng.",
      }).catch(() => {});
      return;
    }

    const ok = await isMember(botToken, channelId, cqUserId);
    if (ok) {
      await callTelegram(botToken, "sendMessage", {
        chat_id: cqChatId,
        text: "✅ Xác minh thành công! Bạn có thể đặt hàng.",
      }).catch(() => {});
    } else {
      await callTelegram(botToken, "sendMessage", {
        chat_id: cqChatId,
        text: "❌ Bạn chưa tham gia cộng đồng. Vui lòng tham gia rồi bấm xác minh lại.",
        reply_markup: channelLink ? {
          inline_keyboard: [[
            { text: "👥 Tham gia cộng đồng", url: channelLink },
            { text: "✅ Xác minh thành viên", callback_data: "verify_membership" },
          ]],
        } : undefined,
      }).catch(() => {});
    }
    return;
  }

  // ── Handle messages ───────────────────────────────────────────────────────
  const message = update?.message;
  if (!message || !message.text) return;

  const text: string = message.text ?? "";
  const userId: number = message.from?.id;
  const chatId: string = String(message.chat?.id ?? userId);

  // ── /start → community gate (if configured) or welcome ───────────────────
  const isStart = text.trim() === "/start" || text.trim().startsWith("/start ");
  const channelId = config.communityChannelId;
  const channelLink = config.communityChannelLink;

  if (isStart || channelId) {
    if (channelId) {
      const memberOk = await isMember(botToken, channelId, userId);
      if (!memberOk) {
        await sendJoinPrompt(botToken, chatId, channelLink ?? `https://t.me/${channelId.replace(/^@/, "")}`);
        return;
      }
    }
    // If /start but user IS a member (or no gate configured) — fall through to order logic
    if (isStart) return; // /start alone doesn't create an order
  }

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
    res.status(400).json({ ok: false, description: "Bot Token chưa được cấu hình. Vui lòng lưu trước trong phần Cài Đặt." });
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
