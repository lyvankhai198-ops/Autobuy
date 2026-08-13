---
name: VPS deploy workflow
description: How to push code from Replit to GitHub and deploy to the AutoOrder VPS
---

# VPS Deploy Workflow

## VPS details
- IP: 103.180.138.203, user: root
- Project path: `/root/autoorder`
- Process manager: PM2, process name: `autoorder-api` (id 6, fork mode)
- API runs on port 3002
- PM2 script: `/root/autoorder/deploy/start-api.sh`
- Env vars: loaded from `/root/autoorder/.env` by the start script

## Other PM2 processes on VPS (different project, do NOT touch)
- `api-server` (id 0) — `/opt/checkgpt/artifacts/api-server`
- `telegram-bot` (id 4) — `/opt/checkgpt/artifacts/telegram-bot`

## Full deploy sequence (run from Replit shell)

```bash
# 1. Push to GitHub
git add -A
git commit -m "Your message"
git push origin main

# 2. SSH into VPS and deploy
sshpass -p "$VPS_PASSWORD" ssh -o StrictHostKeyChecking=no root@103.180.138.203 "
  cd /root/autoorder &&
  git fetch origin && git reset --hard origin/main &&
  pnpm install --frozen-lockfile &&
  pnpm --filter @workspace/api-server run build &&
  pm2 restart autoorder-api --update-env &&
  sleep 2 && pm2 logs autoorder-api --lines 5 --nostream
"
```

## Key gotchas
- `git pull` fails if branches diverge — always use `git fetch && git reset --hard origin/main`
- The `deploy/` folder is NOT in git (gitignored or absent) — if it disappears after a reset, recreate `deploy/start-api.sh` manually (see script content below)
- PM2 does NOT automatically load `.env` — `start-api.sh` must `source .env` with `set -a` before exec
- `--update-env` flag needed on `pm2 restart` to pick up env changes

## deploy/start-api.sh content (recreate if missing)
```bash
#!/bin/bash
set -e
cd /root/autoorder
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi
export NODE_ENV=production
exec node --enable-source-maps artifacts/api-server/dist/index.mjs
```
