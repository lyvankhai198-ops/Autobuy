import app from "./app";
import { logger } from "./lib/logger";
import { startPoller } from "./lib/poller";
import { startMarketPoller } from "./lib/market-poller";
import { CanbosoClient, setDefaultCanbosoCredentials } from "./lib/canboso";
import { getConfig } from "./lib/config";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Load Canboso credentials from config DB at startup (overrides env vars if set)
  getConfig().then((cfg) => {
    if (cfg.canbosoUsername && cfg.canbosoPassword) {
      setDefaultCanbosoCredentials(cfg.canbosoUsername, cfg.canbosoPassword);
      logger.info("Canboso credentials loaded from config DB");
    }
  }).catch(() => {});

  // Account 1 (main) — order poll + stock/price/visibility sync
  startPoller({ accountLabel: "account-1", runSync: true });

  // Account 2 (secondary bot) — order poll only, uses its own bot token for delivery
  const u2 = process.env["CANBOSO2_USERNAME"];
  const p2 = process.env["CANBOSO2_PASSWORD"];
  const t2 = process.env["CANBOSO2_BOT_TOKEN"];
  if (u2 && p2) {
    const client2 = new CanbosoClient(u2, p2);
    startPoller({
      client: client2,
      preferredBotToken: t2 ?? undefined,
      accountLabel: "account-2",
      runSync: false,
      useCodeFallback: true, // account-2 products share same Canboso account but have different productIds
    });
    logger.info("Account-2 poller started");
  }

  startMarketPoller().catch((err) => logger.error({ err }, "Failed to start market poller"));
});
