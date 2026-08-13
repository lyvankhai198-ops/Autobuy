import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Maps a canboso.com product to a source-API product.
 * The user assigns a short code (e.g. "105") for easy reference.
 */
export const productMappingsTable = pgTable("product_mappings", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),              // user-defined label like "105"
  canbosoProductId: text("canboso_product_id").notNull().unique(),
  canbosoProductName: text("canboso_product_name").notNull(),
  sourceProductId: text("source_product_id").notNull(),
  sourceProductName: text("source_product_name").notNull(),
  autoHideWhenOos: boolean("auto_hide_when_oos").notNull().default(true),
  // Price auto-sync: when set, poller adjusts canboso price to keep this margin above source price
  markupAmount: integer("markup_amount"),              // VND margin (canboso_price - source_price); null = disabled
  sourcePriceLastSeen: integer("source_price_last_seen"), // cached to detect changes
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMappingSchema = createInsertSchema(productMappingsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertMapping = z.infer<typeof insertMappingSchema>;
export type ProductMapping = typeof productMappingsTable.$inferSelect;
