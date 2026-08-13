import { pgTable, text, boolean, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Single-row config table. Always upsert with id=1.
export const configTable = pgTable("config", {
  id: serial("id").primaryKey(),
  mainBotToken: text("main_bot_token"),
  sourceBotApiUrl: text("source_bot_api_url"),
  sourceBotApiKey: text("source_bot_api_key"),
  webhookUrl: text("webhook_url"),
  autoFulfill: boolean("auto_fulfill").notNull().default(true),
  orderKeyword: text("order_keyword").default("mua"),
  sentinelValue: text("sentinel_value").default("100"),
  adminChatId: text("admin_chat_id"),
  secondBotToken: text("second_bot_token"),
  lowBalanceThreshold: integer("low_balance_threshold"),
  marketSyncIntervalMs: integer("market_sync_interval_ms").default(300_000),
  maintenanceMode: boolean("maintenance_mode").notNull().default(false),
  canbosoUsername: text("canboso_username"),
  canbosoPassword: text("canboso_password"),
  communityChannelId: text("community_channel_id"),
  communityChannelLink: text("community_channel_link"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertConfigSchema = createInsertSchema(configTable).omit({
  id: true,
  updatedAt: true,
});
export type InsertConfig = z.infer<typeof insertConfigSchema>;
export type Config = typeof configTable.$inferSelect;
