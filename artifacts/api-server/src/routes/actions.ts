import { Router, type IRouter } from "express";
import { getConfig } from "../lib/config";
import { triggerAutoFulfill } from "../lib/fulfillment";
import { runSyncNow } from "../lib/poller";
import { invalidateProductCache } from "../lib/products";
import { CanbosoClient } from "../lib/canboso";

const router: IRouter = Router();

/**
 * POST /api/actions/test-bot
 * Sends a test Telegram message to the configured adminChatId.
 */
router.post("/actions/test-bot", async (req, res): Promise<void> => {
  const config = await getConfig();

  if (!config.mainBotToken && !config.secondBotToken) {
    res.status(400).json({ ok: false, message: "Chưa cấu hình bot token." });
    return;
  }
  if (!config.adminChatId) {
    res.status(400).json({ ok: false, message: "Chưa cấu hình Admin Chat ID." });
    return;
  }

  try {
    await triggerAutoFulfill(
      config.adminChatId,
      `✅ <b>Kiểm tra kết nối bot thành công!</b>\n\nBot đang hoạt động bình thường và có thể gửi thông báo cho bạn.`,
    );
    res.json({ ok: true, message: "Đã gửi tin nhắn test thành công!" });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err?.message ?? "Không thể gửi tin nhắn." });
  }
});

/**
 * POST /api/actions/sync-now
 * Immediately runs stock + price + visibility sync without waiting for the 5-min timer.
 */
router.post("/actions/sync-now", async (_req, res): Promise<void> => {
  invalidateProductCache(); // force source-API cache to refresh on next fetch
  const result = await runSyncNow();
  res.status(result.ok ? 200 : 500).json(result);
});

/**
 * POST /api/actions/test-canboso
 * Tests Canboso login with provided (or stored) credentials.
 * Body: { username?: string; password?: string }
 */
router.post("/actions/test-canboso", async (req, res): Promise<void> => {
  const config = await getConfig();
  const username: string = req.body?.username?.trim() || config.canbosoUsername || process.env["CANBOSO_USERNAME"] || "";
  const password: string = req.body?.password?.trim() || config.canbosoPassword || process.env["CANBOSO_PASSWORD"] || "";

  if (!username || !password) {
    res.status(400).json({ ok: false, message: "Chưa có thông tin đăng nhập Canboso." });
    return;
  }

  try {
    const testClient = new CanbosoClient(username, password);
    const products = await testClient.getSellerProducts();
    res.json({ ok: true, message: `Đăng nhập thành công! Tìm thấy ${products?.length ?? 0} sản phẩm.` });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err?.message ?? "Đăng nhập thất bại." });
  }
});

export default router;
