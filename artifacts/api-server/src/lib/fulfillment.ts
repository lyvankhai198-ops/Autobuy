import { getConfig } from "./config";
import { logger } from "./logger";
import { resolveBotToken, type BotOwner } from "./bot-routing";

/**
 * Send a Telegram message through the bot that owns the order.
 * There is intentionally no cross-bot fallback.
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
 * Uses only the bot that owns the order.
 */
export async function sendWaitingMessage(
  chatId: string,
  owner: BotOwner = "account-1",
  lang: "vi" | "en" = "vi",
  preferredToken?: string,
): Promise<void> {
  const config = await getConfig();
  const token = resolveBotToken(config, owner, preferredToken);
  if (!token) return;

  const waitingText = lang === 'en'
    ? `⏳ Your order is being processed... Please wait a moment, we are fetching and delivering your item right here.`
    : `⏳ Đơn hàng của bạn đang được xử lý... Vui lòng chờ trong giây lát, hệ thống đang lấy hàng và gửi ngay cho bạn tại đây`;

  fetch(`https://api.telegram.org/bot${token}/sendChatAction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action: "typing" }),
  }).catch(() => {});
  await sendTelegramMessage(token, chatId, waitingText).catch(() => {});
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
 * Uses only the bot that owns the order.
 */
export async function sendTelegramFile(
  chatId: string,
  fileUrl: string,
  caption: string,
  orderCode: string,
  owner: BotOwner = "account-1",
  preferredToken?: string,
): Promise<void> {
  const config = await getConfig();
  const token = resolveBotToken(config, owner, preferredToken);

  if (!token) {
    logger.warn({ owner }, "Cannot send Telegram file: owning bot token is not configured");
    return;
  }

  // Download the file from supplier
  const fileRes = await fetch(fileUrl);
  if (!fileRes.ok) throw new Error(`Failed to download file from supplier: ${fileRes.status}`);
  const fileBuffer = Buffer.from(await fileRes.arrayBuffer());

  await sendTelegramDocument(token, chatId, fileBuffer, caption, orderCode);
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
