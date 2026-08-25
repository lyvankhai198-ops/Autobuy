---
name: Shared Canboso bot routing
description: Durable routing constraint when AutoOrder's two Telegram bots use one Canboso seller account
---

When both Telegram bots share one Canboso seller account, do not use poller timing, product names, or cross-bot Telegram fallback as ownership signals. Route from the order's currency/source signal and send only through the resolved owner bot.

**Why:** Canboso does not include the originating Telegram bot in the seller order payload, so two pollers can see the same order. Cross-bot fallback caused purchases from one bot to be delivered through the other.

**How to apply:** Preserve the current ownership rule for VND versus `amountUsd` orders, reject ambiguous orders rather than guessing, and keep `mainBotToken`/`secondBotToken` isolated.