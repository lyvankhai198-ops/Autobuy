---
name: VPS deploy workflow
description: How to deploy the AutoOrder API server to VPS 103.180.138.203, including service management, ports, and 3-project isolation.
---

## 3-Project isolation on VPS 103.180.138.203

| Project | Dir | Service | Port | Nginx paths |
|---------|-----|---------|------|-------------|
| **AutoOrder** | `/root/autoorder` | `autoorder-api.service` (systemd) | **3003** | `/autoorder/`, `/autoorder/api/` |
| **Bot-Qu-Tng** | `/root/Bot-Qu-Tng` | `bot-api.service` (systemd) | 3002 | `/api/`, `/admin-panel/` |
| **CheckGPT** | `/opt/checkgpt` | pm2 `api-server` (id=0) | 3001 | `/checkgpt-api/`, `/checkgpt-admin/` |

**Why:** Previously AutoOrder had NO service — nginx was routing `/autoorder/api/` to port 3002 (Bot-Qu-Tng), causing blank dashboard. Fixed Aug 17 2026 by creating `autoorder-api.service` on port 3003.

## Deploy flow for AutoOrder

```bash
# Option 1: automated script
VPS_PASSWORD='...' bash deploy/deploy-vps.sh

# Option 2: manual
cd /root/autoorder
git pull origin main
pnpm install --frozen-lockfile
pnpm --filter @workspace/api-server build
BASE_PATH=/autoorder/ pnpm --filter @workspace/dashboard build
cp -r artifacts/dashboard/dist/public/. /var/www/autoorder/dashboard/
systemctl restart autoorder-api.service
```

## Service: autoorder-api.service
- **Port**: 3003 (hardcoded in service, overrides .env PORT=3002)
- **WorkingDirectory**: `/root/autoorder`
- **ExecStart**: `/usr/bin/node --enable-source-maps /root/autoorder/artifacts/api-server/dist/index.mjs`
- **Env vars**: All hardcoded in service file (NOT via EnvironmentFile — systemd EnvironmentFile does NOT get overridden by Environment= for same key)

## Dashboard build
- Must be built with `BASE_PATH=/autoorder/` so Vite sets `BASE_URL=/autoorder/`
- `main.tsx` and `App.tsx` both call `setBaseUrl(import.meta.env.BASE_URL)` → API calls become `/autoorder/api/...`
- Static files served from `/var/www/autoorder/dashboard/` by nginx

## Nginx config
- File: `/etc/nginx/sites-enabled/botadmin`
- `/autoorder/api/` rewrites to `/api/` then proxies to port 3003
- `/autoorder/` serves static files from `/var/www/autoorder/dashboard/`
- Do NOT change the port 3002 entries — those belong to Bot-Qu-Tng

## Critical gotchas
- `EnvironmentFile` does NOT get overridden by `Environment=` in systemd for the same key — always hardcode PORT and other service-specific vars directly in `Environment=` lines
- Dashboard `BASE_PATH=/autoorder/` is required at build time; rebuilding without it breaks API routing
- The .env file at `/root/autoorder/.env` has `PORT=3002` — intentionally NOT loaded by the service

## Other services (do NOT touch)
- `bot-api.service`: Bot-Qu-Tng API — do NOT change its port or WorkingDirectory
- pm2 `api-server` (id=0): CheckGPT at `/opt/checkgpt` — leave alone
- pm2 `telegram-bot` (id=1): Node.js wrapper — leave alone
- `gift-bot.service`: real Python Telegram bot at `/root/Bot-Qu-Tng/bot.py`
- `sync-robot.service`: Bot Sync Robot
