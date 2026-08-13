import { eq } from "drizzle-orm";
import { db, configTable, type InsertConfig, type Config } from "@workspace/db";

let cachedConfig: Config | null = null;

export async function getConfig(): Promise<Config> {
  if (cachedConfig) return cachedConfig;

  const [existing] = await db.select().from(configTable).where(eq(configTable.id, 1));

  if (existing) {
    cachedConfig = existing;
    return existing;
  }

  // Create default config row
  const [created] = await db
    .insert(configTable)
    .values({ id: 1, autoFulfill: true, orderKeyword: "mua" })
    .onConflictDoNothing()
    .returning();

  if (created) {
    cachedConfig = created;
    return created;
  }

  // Race condition: another insert happened, fetch it
  const [fetched] = await db.select().from(configTable).where(eq(configTable.id, 1));
  cachedConfig = fetched!;
  return fetched!;
}

export async function saveConfig(updates: Partial<InsertConfig>): Promise<Config> {
  // Ensure row exists
  await getConfig();

  const [updated] = await db
    .update(configTable)
    .set(updates)
    .where(eq(configTable.id, 1))
    .returning();

  cachedConfig = updated;
  return updated;
}
