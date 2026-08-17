import { Router, type IRouter } from "express";
import { UpdateConfigBody } from "@workspace/api-zod";
import { getConfig, saveConfig } from "../lib/config";
import { restartMarketPoller } from "../lib/market-poller";
import { setDefaultCanbosoCredentials } from "../lib/canboso";

const router: IRouter = Router();

function buildConfigResponse(c: Awaited<ReturnType<typeof getConfig>>) {
  return {
    mainBotTokenSet: !!c.mainBotToken,
    secondBotTokenSet: !!c.secondBotToken,
    sourceBotApiUrlSet: !!c.sourceBotApiUrl,
    sourceBotApiKeySet: !!c.sourceBotApiKey,
    webhookUrl: c.webhookUrl ?? null,
    autoFulfill: c.autoFulfill,
    orderKeyword: c.orderKeyword ?? null,
    sentinelValue: c.sentinelValue ?? "100",
    adminChatId: c.adminChatId ?? null,
    lowBalanceThreshold: c.lowBalanceThreshold ?? null,
    marketSyncIntervalMs: (c as any).marketSyncIntervalMs ?? 300_000,
    maintenanceMode: c.maintenanceMode ?? false,
    canbosoUsername: c.canbosoUsername ?? null,
    canbosoPasswordSet: !!c.canbosoPassword,
  };
}

router.get("/config", async (_req, res): Promise<void> => {
  const config = await getConfig();
  res.json(buildConfigResponse(config));
});

router.put("/config", async (req, res): Promise<void> => {
  // Validate the fields covered by the generated schema
  const parsed = UpdateConfigBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // The generated UpdateConfigBody was created from the original OpenAPI spec and
  // does NOT include fields added later. Extract them manually from req.body.
  const body = req.body as Record<string, unknown>;

  const extras: Record<string, unknown> = {};
  if (body["marketSyncIntervalMs"] != null)
    extras["marketSyncIntervalMs"] = Number(body["marketSyncIntervalMs"]);
  if (body["maintenanceMode"] != null)
    extras["maintenanceMode"] = Boolean(body["maintenanceMode"]);
  if (typeof body["canbosoUsername"] === "string")
    extras["canbosoUsername"] = body["canbosoUsername"];
  if (typeof body["canbosoPassword"] === "string")
    extras["canbosoPassword"] = body["canbosoPassword"];
  if (typeof body["secondBotToken"] === "string")
    extras["secondBotToken"] = body["secondBotToken"];

  const updates = { ...parsed.data, ...extras };

  // Guard: Drizzle throws when .set({}) receives an empty object
  if (Object.keys(updates).length === 0) {
    const config = await getConfig();
    res.json(buildConfigResponse(config));
    return;
  }

  const updated = await saveConfig(updates as any);

  // If scan interval changed, restart the market poller with new timing
  if (extras["marketSyncIntervalMs"] != null) {
    restartMarketPoller(Number(extras["marketSyncIntervalMs"]));
  }

  // If Canboso credentials changed, hot-reload the default client
  if (extras["canbosoUsername"] != null || extras["canbosoPassword"] != null) {
    setDefaultCanbosoCredentials(
      updated.canbosoUsername ?? process.env["CANBOSO_USERNAME"] ?? "",
      updated.canbosoPassword ?? process.env["CANBOSO_PASSWORD"] ?? "",
    );
  }

  res.json(buildConfigResponse(updated));
});

export default router;
