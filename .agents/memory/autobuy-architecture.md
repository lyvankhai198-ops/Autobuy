---
name: Autobuy architecture
description: Core architecture of the AutoOrder Dashboard — how the system is structured and key decisions
---

# Autobuy (AutoOrder Dashboard) Architecture

## What it does
Middleware automation: receives Telegram orders → buys from Canboso supplier → delivers product to customer via Telegram bot.

## Key services
- `artifacts/api-server` — Express 5 API on port 8080 at `/api`
- `artifacts/dashboard` — React + Vite frontend on port 23183 at `/`

## Multi-account Canboso support
- Account-1 (main): polls orders + runs stock/price/visibility sync
- Account-2 (secondary): polls orders only, separate bot token for delivery (`CANBOSO2_*` env vars)
- Each account uses its own `CanbosoClient` instance

## Delivery mechanism
- Platform has no general "complete order" API — delivery goes via Telegram Bot directly to customer `chatId`
- Tries `mainBotToken`, then `secondBotToken` (403 fallback), then `preferredBotToken` for account-2

## Sentinel stock system
- Sentinel accounts (e.g. user="100") in Canboso product items are "virtual" placeholders
- Poller detects sentinel delivery → buys real stock from source API → sends to customer
- Account-2 uses code-based fallback since productIds differ from account-1

## DB schema (lib/db/src/schema/)
- `orders` — order tracking with `canbosoOrderCode`, `accountSlot`
- `config` — single-row (id=1) with all tokens, URLs, flags (canboso credentials stored here too)
- `product_mappings` — maps Canboso productId ↔ source productId with markup/autoHide settings
- `market_watches` — auto-pull cheapest market source for given product category

## Zod / codegen gotcha
- Use `type: number` (NOT `type: integer`) in OpenAPI spec — Orval generates `z.int()` for integer which only exists in Zod v4, not v3

## Config hot-reload
- Canboso credentials can be changed via dashboard → `saveConfig` → `setDefaultCanbosoCredentials()` (no restart needed)
- Market poller interval can be changed via dashboard → `restartMarketPoller(newIntervalMs)`

## OpenAPI / Config type gotcha (fixed Aug 2026)
- Config response fields `secondBotTokenSet`, `maintenanceMode`, `canbosoUsername`, `canbosoPasswordSet`, `marketSyncIntervalMs` were missing from the OpenAPI spec
- ConfigInput was also missing `secondBotToken`, `maintenanceMode`, `canbosoUsername`, `canbosoPassword`, `marketSyncIntervalMs`
- Solution: add all fields to openapi.yaml then run `pnpm --filter @workspace/api-spec run codegen`
- The config route (routes/config.ts) manually handles extra fields via `extras` object for fields not in generated schema — whenever adding new DB config fields, add them to BOTH openapi.yaml AND the extras extraction block in routes/config.ts

## TypeScript TS7030 pattern in Express routes
- Routes using `return res.status(400).json(...)` inside `try` blocks cause TS7030 ("Not all code paths return a value")
- Fix: `res.status(400).json(...); return;` pattern instead of `return res.status(400).json(...)`

## VPS deploy — dashboard copy
- `cp -r dist/public/. /var/www/...` pattern fails with "Permission denied" on VPS
- Fix: copy with explicit file patterns (cp assets/, cp *.html, etc.) or use rsync if available
- Or use heredoc SSH with `bash << 'REMOTE'` for complex multi-step remote commands
