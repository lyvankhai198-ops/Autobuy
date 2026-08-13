/**
 * Source API monitoring routes.
 * GET /api/source/status  — balance + product list with stock levels
 */
import { Router, type IRouter } from "express";
import { getConfig } from "../lib/config";
import { invalidateProductCache } from "../lib/products";

const router: IRouter = Router();

router.get("/source/status", async (req, res): Promise<void> => {
  const config = await getConfig().catch(() => null);
  if (!config?.sourceBotApiUrl || !config.sourceBotApiKey) {
    res.status(503).json({ online: false, error: "Source API not configured" });
    return;
  }

  const baseUrl = config.sourceBotApiUrl.replace(/\/+$/, "");
  const headers = { "X-API-Key": config.sourceBotApiKey };

  try {
    // Always fetch fresh data for the monitoring view
    invalidateProductCache();

    const [balanceRes, productsRes] = await Promise.all([
      fetch(`${baseUrl}/api/balance`, { headers }),
      fetch(`${baseUrl}/api/products`, { headers }),
    ]);

    const [balanceData, productsData] = await Promise.all([
      balanceRes.json() as Promise<{ success: boolean; balance?: number; user_id?: number }>,
      productsRes.json() as Promise<{ success: boolean; products?: any[] }>,
    ]);

    if (!balanceRes.ok || !productsRes.ok) {
      res.status(502).json({ online: false, error: "Source API returned an error" });
      return;
    }

    res.json({
      online: true,
      balance: balanceData.balance ?? 0,
      userId: balanceData.user_id ?? null,
      products: (productsData.products ?? []).map((p: any) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        stock: p.stock,
        description: p.description ?? "",
        emoji: p.emoji ?? "",
      })),
      checkedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(502).json({ online: false, error: err?.message ?? "Connection failed" });
  }
});

export default router;
