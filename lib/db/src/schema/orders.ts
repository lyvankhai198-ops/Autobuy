import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  customerId: text("customer_id").notNull(),
  customerUsername: text("customer_username"),
  productType: text("product_type").notNull().default("general"),
  productDetails: text("product_details"),
  status: text("status").notNull().default("pending"), // pending | processing | fulfilled | failed
  rawMessage: text("raw_message").notNull().default(""),
  errorMessage: text("error_message"),
  sourceApiResponse: text("source_api_response"),
  canbosoOrderCode: text("canboso_order_code").unique(), // links to canboso platform order — UNIQUE enforces one-poller-per-order
  accountSlot: text("account_slot"),            // which canboso account handled this order (e.g. "account-1", "account-2")
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  fulfilledAt: timestamp("fulfilled_at", { withTimezone: true }),
});

export const insertOrderSchema = createInsertSchema(ordersTable).omit({
  id: true,
  createdAt: true,
});
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
