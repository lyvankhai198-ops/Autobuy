---
name: Gift Bot Service Management
description: How the Bot-Qu-Tng Telegram bot is actually run and how to restart it correctly
---

## The correct service to restart

`gift-bot.service` (systemd) — NOT PM2.

```bash
systemctl restart gift-bot.service
systemctl status gift-bot.service
journalctl -u gift-bot.service -n 50 --no-pager
```

**Why:** PM2's `telegram-bot` process runs a Node.js wrapper at `/opt/checkgpt/artifacts/telegram-bot/dist/index.mjs` — completely separate from the actual Python bot. The real bot runs as `/root/Bot-Qu-Tng/venv/bin/python bot.py` under systemd.

**How to apply:** Any time you edit `/root/Bot-Qu-Tng/bot.py`, always restart with `systemctl restart gift-bot.service`. Never use `pm2 restart telegram-bot` for this bot.

## Other services on the same VPS

| Service | Manager | Path |
|---|---|---|
| `gift-bot.service` | systemd | `/root/Bot-Qu-Tng/bot.py` via venv |
| `bot-api.service` | systemd | Bot-Qu-Tng API server |
| `sync-robot.service` | systemd | `/root/Bot-Qu-Tng/sync_robot.py` |
| `aicenter.service` | systemd | AI Center Bot Manager |
| `autoorder-api` | PM2 | `/root/autoorder/deploy/start-api.sh` |
| `api-server` (PM2 id=0) | PM2 | `/opt/checkgpt/artifacts/api-server` |
| `telegram-bot` (PM2 id=1) | PM2 | `/opt/checkgpt/artifacts/telegram-bot` — NOT bot.py |

## AI auto-reply config

- Settings file: `/root/Bot-Qu-Tng/data/support_chat_settings.json`
- API: `https://api.nghimmo.com` (Anthropic-compatible proxy)
- Model: `nghi/claude-haiku-4.5`
- `max_tokens=200` (reduced from 512 for faster response ~2-3s)
- Venv has `anthropic==0.122.0` installed

## Admin panel web

- URL: `http://103.180.138.203/admin-panel/#/chat-support` → tab **Cài đặt**
- Frontend source: `/root/Bot-Qu-Tng/artifacts/admin-panel/src/pages/chat-support.tsx`
- Backend API: `/root/Bot-Qu-Tng/artifacts/api-server/src/routes/chatSupport.ts`
- Build command: `cd artifacts/admin-panel && PORT=8080 BASE_PATH=/admin-panel/ npx vite build --config vite.config.ts`
- Restart API: `systemctl restart bot-api.service`

## Critical gotchas discovered

- `msg_map[mid]` must be `str(user_id)` — NOT a dict. `_route_admin_chat_reply` does `.get(uid_str)` and uses it as a dict key.
- In AI mode, `_notify_admin_new_session` must be called explicitly on first message (not auto-called like in live mode).
- `_notify_admin_new_session` must have `data=None` param or all callers using `data=data` crash with TypeError.
- Admin panel build needs both `PORT` and `BASE_PATH` env vars.
