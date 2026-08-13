# AutoOrder Dashboard

Middleware automation dashboard that intercepts Telegram orders from a main sales bot, automatically calls a supplier bot API (Canboso) to fulfill them, and delivers the product to the customer — all without manual intervention.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/dashboard run dev` — run the frontend dashboard (port 23183)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Frontend: React + Vite + Tailwind CSS + TanStack Query

## Where things live

- `lib/api-spec/openapi.yaml` — API contract source of truth
- `lib/db/src/schema/orders.ts` — orders table schema
- `lib/db/src/schema/config.ts` — single-row system config table (always id=1)
- `lib/db/src/schema/mappings.ts` — Canboso ↔ source product mappings
- `lib/db/src/schema/market-watches.ts` — market automation rules
- `artifacts/api-server/src/routes/orders.ts` — order CRUD + fulfill/retry routes
- `artifacts/api-server/src/routes/webhook.ts` — Telegram webhook receiver + webhook setup
- `artifacts/api-server/src/routes/config.ts` — config read/write routes
- `artifacts/api-server/src/lib/canboso.ts` — Canboso API client (per-account class)
- `artifacts/api-server/src/lib/poller.ts` — 5s order polling loop (multi-account)
- `artifacts/api-server/src/lib/fulfillment.ts` — Telegram delivery with bot fallback
- `artifacts/api-server/src/lib/market-poller.ts` — 5-min market automation poller
- `artifacts/dashboard/src/` — React frontend

## Architecture decisions

- **Single-row config table**: `config` table always uses `id=1`, upserted on first access. Secrets (bot tokens, API keys) stored in DB — never exposed via API, only boolean "is set" flags returned.
- **Webhook → background processing**: Telegram webhook responds with 200 immediately, then processes orders in a fire-and-forget background function. Prevents Telegram retries.
- **Sentinel stock system**: Canboso "delivers" a sentinel code (e.g. "100") as placeholder — poller detects this and buys real stock from source API, then delivers to customer via Telegram.
- **Multi-account support**: Account-1 (main) runs order poll + stock sync; Account-2+ runs order poll only with its own bot token. Each uses a `CanbosoClient` instance.
- **`zod.int()` not available in Zod v3**: Use `type: number` (not `type: integer`) in OpenAPI spec to avoid Orval generating `z.int()` which only exists in Zod v4.

## Product

- Dashboard: stats (total/pending/processing/fulfilled/failed, today's count), recent activity feed
- Orders: filterable list, per-order detail with fulfill/retry actions
- Mappings: link Canboso products to source API products with markup rules
- Market: auto-pull cheapest market source per product category
- Config: toggle auto-fulfill, set order keyword, register Telegram webhook, check API key status

## User preferences

- Vietnamese-speaking user (reseller business)
- Main bot: Telegram (user has Bot Token)
- Source supplier: Canboso.com
- Delivery method: Auto Telegram message to customer

## Gotchas

- After any `lib/db/src/schema/` change, run `pnpm run typecheck:libs` before running `pnpm --filter @workspace/api-server run typecheck`.
- The config cache in `src/lib/config.ts` is in-memory — invalidated only when `saveConfig` is called. If you update the DB directly, restart the server.
- Telegram webhook URL must be HTTPS — only works on a deployed/public URL, not localhost.
- Never use `type: integer` in OpenAPI spec — always use `type: number` to avoid Zod v3 compatibility errors.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
