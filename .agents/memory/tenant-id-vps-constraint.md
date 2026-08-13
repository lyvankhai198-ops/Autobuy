---
name: VPS tenant_id DB constraint
description: VPS production DB has tenant_id NOT NULL DEFAULT 1 on 4 tables from a reverted multi-tenant migration — must never be removed or reset.
---

## The rule

**NEVER** alter, drop, or reset the `tenant_id` column on the VPS production DB tables. Do NOT run `drizzle-kit push` or `drizzle-kit migrate` against the VPS production DB.

## Background

A multi-tenant migration was applied to the VPS production DB (and dev DB) adding `tenant_id` columns to:
- `orders`
- `product_mappings`
- `market_watches`
- `config`

The code was later reverted to single-tenant (git reset --hard). The Drizzle schema files do **not** include `tenant_id` — these columns exist only in the live DB via raw SQL.

## Why it matters

The code never sets `tenant_id` on inserts. If the column has `NOT NULL` with no default, every INSERT fails with:

```
null value in column "tenant_id" of relation "orders" violates not-null constraint
```

This silently kills **both** account-1 (bot chính) and account-2 (bot phụ) order processing — orders are detected but never fulfilled or delivered.

## Current state (fixed)

`DEFAULT 1` has been set on all 4 columns via:
```sql
ALTER TABLE orders ALTER COLUMN tenant_id SET DEFAULT 1;
ALTER TABLE product_mappings ALTER COLUMN tenant_id SET DEFAULT 1;
ALTER TABLE market_watches ALTER COLUMN tenant_id SET DEFAULT 1;
ALTER TABLE config ALTER COLUMN tenant_id SET DEFAULT 1;
```

## How to apply

If the VPS DB is ever reset or recreated, run the 4 ALTER TABLE statements above immediately before starting the server.

**Why:** Without `DEFAULT 1`, every order insert by account-2 (bot phụ) fails. The user considers this a critical issue and does not want it broken again.
