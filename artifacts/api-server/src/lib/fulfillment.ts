import { getConfig } from "./config";
import { logger } from "./logger";
import { resolveBotToken, type BotOwner } from "./bot-routing";

export type ProgressStage =
  | "confirming"
  | "source"
  | "fetching"
  | "processing"
  | "delivery"
  | "complete"
  | "failed";

type TelegramMessage = {
  message_id?: number;
};

const activeProgress = new Map<string, FulfillmentProgress>();

const PROGRESS_STAGES: Record<ProgressStage, { vi: string; en: string }> = {
  confirming: { vi: "🔍 Đang xác nhận đơn hàng…", en: "🔍 Confirming your order…" },
  source: { vi: "🔐 Đang xác định nguồn hàng…", en: "🔐 Selecting the source…" },
  fetching: { vi: "📦 Đang lấy sản phẩm…", en: "📦 Fetching your item…" },
  processing: { vi: "⚙️ Đang xử lý sản phẩm…", en: "⚙️ Processing your item…" },
  delivery: { vi: "🚚 Đang chuẩn bị giao hàng…", en: "🚚 Preparing delivery…" },
  complete: { vi: "✅ Đơn hàng đã hoàn tất!", en: "✅ Your order is complete!" },
  failed: { vi: "❌ Không thể hoàn tất đơn hàng.", en: "❌ We could not complete your order." },
};

const PROGRESS_BAR_SIZE = 20;

function progressText(lang: "vi" | "en", percent: number, stage: ProgressStage): string {
  const filled = Math.round((percent / 100) * PROGRESS_BAR_SIZE);
  const bar = "█".repeat(filled) + "░".repeat(PROGRESS_BAR_SIZE - filled);
  return `${PROGRESS_STAGES[stage][lang]}\n[${bar}] ${percent}%`;
}

/**
 * Owns one editable Telegram progress message for a single fulfillment.
 * The in-memory registry prevents overlapping retries in the same API process.
 * It intentionally never changes order state in the database.
 */
export class FulfillmentProgress {
  private percent = 0;
  private stage: ProgressStage = "confirming";
  private timer: ReturnType<typeof setInterval> | null = null;
  private queue: Promise<void> = Promise.resolve();
  private terminal = false;
  private cleanupTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly token: string,
    private readonly chatId: string,
    private readonly messageId: number,
    private readonly lang: "vi" | "en",
    private readonly registryKey: string,
  ) {}

  start(): void {
    if (this.timer || this.terminal) return;
    this.timer = setInterval(() => {
      if (this.terminal || this.percent >= 90) return;
      void this.update(Math.min(90, this.percent + 5), this.stage);
    }, 1500);
    this.timer.unref?.();
  }

  update(percent: number, stage: ProgressStage): Promise<void> {
    if (this.terminal) return Promise.resolve();
    const nextPercent = Math.max(this.percent, Math.min(95, percent));
    this.percent = nextPercent;
    this.stage = stage;
    this.queue = this.queue
      .then(() => this.edit(progressText(this.lang, nextPercent, stage)))
      .catch((err) => {
        logger.debug({ err: err?.message, chatId: this.chatId }, "Telegram progress update failed");
      });
    return this.queue;
  }

  resume(): void {
    if (!this.terminal) {
      this.start();
      return;
    }
    this.terminal = false;
    if (this.cleanupTimer) clearTimeout(this.cleanupTimer);
    this.cleanupTimer = null;
    this.start();
  }

  finish(): Promise<void> {
    if (this.terminal) return this.queue;
    this.terminal = true;
    if (this.timer) clearInterval(this.timer);
    this.percent = 100;
    this.stage = "complete";
    this.queue = this.queue
      .then(() => this.edit(progressText(this.lang, 100, "complete")))
      .catch((err) => {
        logger.debug({ err: err?.message, chatId: this.chatId }, "Telegram progress completion failed");
      })
      .finally(() => activeProgress.delete(this.registryKey));
    return this.queue;
  }

  fail(): Promise<void> {
    if (this.terminal) return this.queue;
    this.terminal = true;
    if (this.timer) clearInterval(this.timer);
    this.queue = this.queue
      .then(() => this.edit(progressText(this.lang, Math.min(95, this.percent), "failed")))
      .catch((err) => {
        logger.debug({ err: err?.message, chatId: this.chatId }, "Telegram progress failure update failed");
      })
      .finally(() => {
        this.cleanupTimer = setTimeout(() => activeProgress.delete(this.registryKey), 10 * 60 * 1000);
        this.cleanupTimer.unref?.();
      });
    return this.queue;
  }

  private async edit(text: string): Promise<void> {
    const response = await fetch(
      `https://api.telegram.org/bot${this.token}/editMessageText`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: this.chatId,
          message_id: this.messageId,
          text,
        }),
      },
    );
    if (!response.ok) {
      throw new Error(`Telegram progress edit failed: ${response.status}`);
    }
  }
}

export async function startFulfillmentProgress(
  chatId: string,
  owner: BotOwner,
  lang: "vi" | "en",
  preferredToken?: string,
  orderKey = chatId,
): Promise<FulfillmentProgress | null> {
  const config = await getConfig();
  const token = resolveBotToken(config, owner, preferredToken);
  if (!token) {
    logger.warn({ owner, orderKey }, "Cannot start Telegram progress: owning bot token is not configured");
    return null;
  }

  const registryKey = `${owner}:${chatId}:${orderKey}`;
  const existing = activeProgress.get(registryKey);
  if (existing) {
    existing.resume();
    existing.start();
    return existing;
  }

  const message = await sendTelegramText(token, chatId, progressText(lang, 10, "confirming"));
  const messageId = message?.message_id;
  if (!messageId) {
    logger.warn({ owner, chatId, orderKey }, "Telegram progress message did not return a message id");
    return null;
  }

  const progress = new FulfillmentProgress(token, chatId, messageId, lang, registryKey);
  activeProgress.set(registryKey, progress);
  progress.start();
  return progress;
}

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
  await sendTelegramText(token, chatId, text);
  logger.info({ chatId }, "Product delivered to customer via Telegram");
}

async function sendTelegramText(token: string, chatId: string, text: string): Promise<TelegramMessage | null> {
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

  const body = await response.json().catch(() => null) as { result?: TelegramMessage } | null;
  return body?.result ?? null;
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
