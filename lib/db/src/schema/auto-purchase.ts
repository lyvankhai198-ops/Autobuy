import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Independent one-shot purchase rules.
 * A rule buys the configured quantity when the source reports enough stock,
 * then marks itself completed so the same stock is never bought twice.
 */
export const autoPurchaseRulesTable = pgTable("auto_purchase_rules", {
  id: serial("id").primaryKey(),
  label: text("label").notNull(),
  sourceProductId: text("source_product_id").notNull(),
  sourceProductName: text("source_product_name").notNull(),
  quantity: integer("quantity").notNull().default(1),
  status: text("status").notNull().default("active"),
  lastStock: integer("last_stock"),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  lastPurchasedQuantity: integer("last_purchased_quantity"),
  lastOrderCode: text("last_order_code"),
  lastPurchasedAmount: integer("last_purchased_amount"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAutoPurchaseRuleSchema = createInsertSchema(autoPurchaseRulesTable).omit({
  id: true,
  lastStock: true,
  lastCheckedAt: true,
  lastAttemptAt: true,
  lastPurchasedQuantity: true,
  lastOrderCode: true,
  lastPurchasedAmount: true,
  lastError: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAutoPurchaseRule = z.infer<typeof insertAutoPurchaseRuleSchema>;
export type AutoPurchaseRule = typeof autoPurchaseRulesTable.$inferSelect;