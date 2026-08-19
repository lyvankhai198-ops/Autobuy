import { getConfig } from "./config";
import { logger } from "./logger";
import { resolveBotToken, type BotOwner } from "./bot-routing";

/**
 * Send a Telegram message to a customer, trying mainBotToken first.
 * If Telegram returns 403 (user never started that bot), automatically
 * falls back to secondBotToken (the English / binance bot).
 *
 * @param preferredBotToken - If set, tried first before config tokens (used for account-2 poller).
 */
export async function triggerAutoFulfill(
  chatId: string,
  productDetails: string,
  owner: BotOwner = "account-1",
  preferredToken?: string,
): Promise<void> {
  const config = await getConfig();
  const token = resolveBotToken(config, owner, preferredToken);
  if (!token) {
    logger.warn({ owner }, "Cannot send Telegram message: owning bot token is not configured");
    return;
  }
  await sendTelegramMessage(token, chatId, productDetails);
}

/**
 * Send a "please wait" message + typing indicator to the customer
 * immediately after order detection, before any source API calls.
 * Tries mainBotToken first, falls back to secondBotToken.
 */
export async function sendWaitingMessage(chatId: string, preferredBotToken?: string, lang: 'vi' | 'en' = 'vi'): Promise<void> {
  const config = await getConfig();
  const tokens = [preferredBotToken, config.mainBotToken, config.secondBotToken].filter(Boolean) as string[];
  if (tokens.length === 0) return;

  const waitingText = lang === 'en'
    ? `⏳ Your order is being processed... Please wait a moment, we are fetching and delivering your item right here.`
    : `⏳ Đơn hàng của bạn đang được xử lý... Vui lòng chờ trong giây lát, hệ thống đang lấy hàng và gửi ngay cho bạn tại đây`;

  for (const token of tokens) {
    try {
      // Typing indicator first (best-effort, ignore error)
      fetch(`https://api.telegram.org/bot${token}/sendChatAction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, action: "typing" }),
      }).catch(() => {});

      await sendTelegramMessage(token, chatId, waitingText);
      return; // success — done
    } catch (err: any) {
      const errText = String(err?.message ?? "");
      const isForbidden = errText.includes("403") || errText.includes("chat not found") || errText.includes("blocked");
      if (!isForbidden) return; // non-fatal, swallow
      // 403 → try next token
    }
  }
  // All failed — not critical, just log nothing (we don't want to break fulfillment)
}

async function sendTelegramMessage(token: string, chatId: string, text: string): Promise<void> {
  const response = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    logger.error({ chatId, status: response.status, error: errorText }, "Failed to send Telegram message");
    throw new Error(`Telegram API error ${response.status}: ${errorText}`);
  }

  logger.info({ chatId }, "Product delivered to customer via Telegram");
}

/**
 * Download a .txt file from the supplier and send it as a Telegram document.
 * Tries mainBotToken first, falls back to secondBotToken on 403.
 */
export async function sendTelegramFile(
  chatId: string,
  fileUrl: string,
  caption: string,
  orderCode: string,
  preferredBotToken?: string,
): Promise<void> {
  const config = await getConfig();

  if (!preferredBotToken && !config.mainBotToken && !config.secondBotToken) {
    logger.warn("Cannot send Telegram file: no bot token configured");
    return;
  }

  // Download the file from supplier
  const fileRes = await fetch(fileUrl);
  if (!fileRes.ok) throw new Error(`Failed to download file from supplier: ${fileRes.status}`);
  const fileBuffer = Buffer.from(await fileRes.arrayBuffer());

  const tokens = [preferredBotToken, config.mainBotToken, config.secondBotToken].filter(Boolean) as string[];

  let lastError: Error | null = null;
  for (const token of tokens) {
    try {
      await sendTelegramDocument(token, chatId, fileBuffer, caption, orderCode);
      return;
    } catch (err: any) {
      lastError = err;
      const errText = String(err?.message ?? "");
      const isForbidden = errText.includes("403") || errText.includes("chat not found") || errText.includes("blocked");
      if (!isForbidden) throw err;
      logger.warn({ chatId, errText }, "Bot token failed for file delivery, trying next token");
    }
  }

  throw lastError ?? new Error("All bot tokens failed to deliver file");
}

async function sendTelegramDocument(
  token: string,
  chatId: string,
  fileBuffer: Buffer,
  caption: string,
  orderCode: string,
): Promise<void> {
  const boundary = `----FormBoundary${Date.now()}`;
  const CRLF = "\r\n";
  const parts: Buffer[] = [];

  const addField = (name: string, value: string) => {
    parts.push(Buffer.from(
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="${name}"${CRLF}${CRLF}` +
      `${value}${CRLF}`
    ));
  };

  addField("chat_id", chatId);
  addField("caption", caption);
  addField("parse_mode", "HTML");

  const filename = `accounts_${orderCode}.txt`;
  parts.push(Buffer.from(
    `--${boundary}${CRLF}` +
    `Content-Disposition: form-data; name="document"; filename="${filename}"${CRLF}` +
    `Content-Type: text/plain${CRLF}${CRLF}`
  ));
  parts.push(fileBuffer);
  parts.push(Buffer.from(`${CRLF}--${boundary}--${CRLF}`));

  const body = Buffer.concat(parts);

  const response = await fetch(
    `https://api.telegram.org/bot${token}/sendDocument`,
    {
      method: "POST",
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
      body,
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    logger.error({ chatId, status: response.status, error: errorText }, "Failed to send Telegram document");
    throw new Error(`Telegram API error ${response.status}: ${errorText}`);
  }

  logger.info({ chatId, filename }, "Product file delivered to customer via Telegram");
}
