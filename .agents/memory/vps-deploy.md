---
name: VPS deploy workflow
description: How to deploy the AutoOrder API server to VPS 103.180.138.203, including service management, ports, and gotchas.
---

## Deploy flow
1. `git push origin main` from Replit workspace
2. SSH to VPS: `cd /root/autoorder && git pull origin main`
3. Build: `pnpm --filter @workspace/api-server build`
4. Restart: `systemctl restart bot-api.service`

## Service: bot-api.service
- **Managed by**: `systemctl` (NOT pm2 anymore — pm2 `autoorder-api` was deleted Aug 17 2026)
- **Working directory**: `/root/autoorder` (was wrongly set to `/root/Bot-Qu-Tng` before Aug 17 2026 fix)
- **Port**: `3002` (environment `PORT=3002` in service file)
- **Service file**: `/etc/systemd/system/bot-api.service`
- **Required env vars in service**: `PORT`, `DATABASE_URL`, `SESSION_SECRET`, `NODE_ENV`, and others

## Critical gotchas
- `DATABASE_URL` MUST be in the service environment — it's NOT auto-loaded from `.env`; it was added manually after Aug 17 2026 fix
- The pm2 process `autoorder-api` (pid=78594) ran OLD code for 2+ days because `systemctl restart bot-api.service` was restarting the WRONG service (running from wrong WorkingDirectory with wrong PORT)
- After deleting pm2 `autoorder-api`, the systemd service owns port 3002 exclusively
- pm2 still manages: `api-server` (different service, port unknown) and `telegram-bot` — DO NOT touch these

## Other pm2 processes (do not restart via systemctl)
- `telegram-bot` (pm2 id=1): the gift-bot Telegram bot — restart via `systemctl restart gift-bot.service` NOT pm2
- `api-server` (pm2 id=0): separate service, unknown purpose, leave alone

## Database
- Connection string is in `/root/autoorder/.env`: `DATABASE_URL=postgresql://autoorder:...@localhost:5432/autoorder`
- 4 prod tables have `tenant_id NOT NULL DEFAULT 1` — never drop or reset

## ⚠️ CRITICAL: VPS src/ directory mismatch (fixed Aug 17 2026)
The VPS `/root/autoorder/artifacts/api-server/src/` contains Bot-Qu-Tng source files (botAdmin, ocr, marketOrders routes etc.) that are NOT in Replit's git repo. These files are gitignored or committed in a different branch on VPS, so `git pull` from Replit never overwrites them.

**Symptom**: After a rebuild, all AutoOrder routes (/api/config, /api/orders/*, etc.) return 404. Only /api/healthz works.

**Fix**: Use `scp` or `tar+ssh` to copy `/home/runner/workspace/artifacts/api-server/src/` to VPS, then rebuild:
```
cd /home/runner/workspace && tar czf /tmp/api-server-src.tar.gz artifacts/api-server/src/
sshpass -p '...' scp -o StrictHostKeyChecking=no /tmp/api-server-src.tar.gz root@103.180.138.203:/tmp/
sshpass -p '...' ssh root@103.180.138.203 'cd /root/autoorder && tar xzf /tmp/api-server-src.tar.gz && pnpm --filter @workspace/api-server build && systemctl restart bot-api.service'
```

**Why:** Port 3002 was occupied by an old pm2 process running Aug 15 code. All systemctl deploys silently ran from the wrong WorkingDirectory. Fix: deleted pm2 autoorder-api, fixed WorkingDirectory, added DATABASE_URL to service.
