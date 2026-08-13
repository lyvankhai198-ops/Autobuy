ALTER TABLE "config" ADD COLUMN IF NOT EXISTS "market_sync_interval_ms" integer DEFAULT 300000;
