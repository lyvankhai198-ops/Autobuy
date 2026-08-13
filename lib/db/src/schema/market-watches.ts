import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Market automation watches.
 * Each row tells the system: "automatically find the cheapest source on Canboso
 * market for this product category and keep it in stock."
 */
export const marketWatchesTable = pgTable("market_watches", {
  id: serial("id").primaryKey(),

  /** User-facing label, e.g. "ChatGPT Plus 1 tháng" */
  label: text("label").notNull(),

  /** Canboso emoji category slug to filter market products (e.g. "chatgpt", "canva") */
  emoji: text("emoji"),

  /** Comma-separated keywords that must appear in product name (case-insensitive) */
  keywords: text("keywords"),

  /** Comma-separated keywords — products containing ANY of these are excluded */
  excludeKeywords: text("exclude_keywords"),

  /** How markup is applied: "fixed" (VND amount) or "percent" (% above source price) */
  markupType: text("markup_type").notNull().default("fixed"),

  /** Markup value — VND if markupType=fixed, integer percent if markupType=percent */
  markupValue: integer("markup_value").notNull().default(0),

  /** Minimum available stock required to consider a source valid */
  minStock: integer("min_stock").notNull().default(1),

  /** "active" = running, "paused" = skip this watch */
  status: text("status").notNull().default("active"),

  // ── Runtime state (updated by market poller) ────────────────────────────────

  /** Market product _id currently pulled as our source */
  currentMarketProductId: text("current_market_product_id"),

  /** Name snapshot of the current market product */
  currentMarketProductName: text("current_market_product_name"),

  /** Our own seller product _id that was created when we pulled from market */
  currentSellerProductId: text("current_seller_product_id"),

  /** Price we last saw for this market product (used to detect price changes) */
  lastMarketPrice: integer("last_market_price"),

  /** When we last switched sources */
  lastSwitchedAt: timestamp("last_switched_at", { withTimezone: true }),

  /** When this watch was last evaluated */
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),

  /** Last error message if the watch failed */
  lastError: text("last_error"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMarketWatchSchema = createInsertSchema(marketWatchesTable).omit({
  id: true,
  currentMarketProductId: true,
  currentMarketProductName: true,
  currentSellerProductId: true,
  lastMarketPrice: true,
  lastSwitchedAt: true,
  lastCheckedAt: true,
  lastError: true,
  createdAt: true,
});

export type InsertMarketWatch = z.infer<typeof insertMarketWatchSchema>;
export type MarketWatch = typeof marketWatchesTable.$inferSelect;
