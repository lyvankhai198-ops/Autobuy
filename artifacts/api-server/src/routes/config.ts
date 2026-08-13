import { Router, type IRouter } from "express";
import { UpdateConfigBody } from "@workspace/api-zod";
import { getConfig, saveConfig } from "../lib/config";
import { restartMarketPoller } from "../lib/market-poller";
import { setDefaultCanbosoCredentials } from "../lib/canboso";

const router: IRouter = Router();

router.get("/config", async (req, res): Promise<void> => {
  const config = await getConfig();

  res.json({
    mainBotTokenSet: !!config.mainBotToken,
    secondBotTokenSet: !!config.secondBotToken,
    sourceBotApiUrlSet: !!config.sourceBotApiUrl,
    sourceBotApiKeySet: !!config.sourceBotApiKey,
    webhookUrl: config.webhookUrl ?? null,
    autoFulfill: config.autoFulfill,
    orderKeyword: config.orderKeyword ?? null,
    sentinelValue: config.sentinelValue ?? "100",
    adminChatId: config.adminChatId ?? null,
    lowBalanceThreshold: config.lowBalanceThreshold ?? null,
    marketSyncIntervalMs: (config as any).marketSyncIntervalMs ?? 300_000,
    maintenanceMode: config.maintenanceMode ?? false,
    canbosoUsername: config.canbosoUsername ?? null,
    canbosoPasswordSet: !!config.canbosoPassword,
    communityChannelId: config.communityChannelId ?? null,
    communityChannelLink: config.communityChannelLink ?? null,
  });
});

router.put("/config", async (req, res): Promise<void> => {
  const parsed = UpdateConfigBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updated = await saveConfig(parsed.data);

  // If scan interval changed, restart the market poller with new timing
  if (parsed.data.marketSyncIntervalMs != null) {
    restartMarketPoller(parsed.data.marketSyncIntervalMs);
  }

  // If Canboso credentials changed, hot-reload the default client
  if (parsed.data.canbosoUsername != null || parsed.data.canbosoPassword != null) {
    setDefaultCanbosoCredentials(
      updated.canbosoUsername ?? process.env["CANBOSO_USERNAME"] ?? "",
      updated.canbosoPassword ?? process.env["CANBOSO_PASSWORD"] ?? "",
    );
  }

  res.json({
    mainBotTokenSet: !!updated.mainBotToken,
    secondBotTokenSet: !!updated.secondBotToken,
    sourceBotApiUrlSet: !!updated.sourceBotApiUrl,
    sourceBotApiKeySet: !!updated.sourceBotApiKey,
    webhookUrl: updated.webhookUrl ?? null,
    autoFulfill: updated.autoFulfill,
    orderKeyword: updated.orderKeyword ?? null,
    sentinelValue: updated.sentinelValue ?? "100",
    adminChatId: updated.adminChatId ?? null,
    lowBalanceThreshold: updated.lowBalanceThreshold ?? null,
    marketSyncIntervalMs: (updated as any).marketSyncIntervalMs ?? 300_000,
    maintenanceMode: updated.maintenanceMode ?? false,
    canbosoUsername: updated.canbosoUsername ?? null,
    canbosoPasswordSet: !!updated.canbosoPassword,
    communityChannelId: updated.communityChannelId ?? null,
    communityChannelLink: updated.communityChannelLink ?? null,
  });
});

export default router;
