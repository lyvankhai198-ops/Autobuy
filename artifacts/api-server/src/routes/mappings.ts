import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, productMappingsTable, insertMappingSchema } from "@workspace/db";
import { getConfig } from "../lib/config";
import { fetchProducts } from "../lib/products";
import { getPaidOrders } from "../lib/canboso";

const router = Router();

// GET /api/mappings — list all mappings
router.get("/mappings", async (_req, res) => {
  try {
    const mappings = await db
      .select()
      .from(productMappingsTable)
      .orderBy(productMappingsTable.code);
    res.json({ mappings });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// GET /api/mappings/source-products — source API product list
router.get("/mappings/source-products", async (_req, res) => {
  try {
    const config = await getConfig();
    if (!config.sourceBotApiUrl || !config.sourceBotApiKey) {
      return res.status(400).json({ error: "Source API not configured" });
    }
    const products = await fetchProducts(config.sourceBotApiUrl, config.sourceBotApiKey);
    res.json({ products });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// GET /api/mappings/canboso-products — canboso seller product list
router.get("/mappings/canboso-products", async (_req, res) => {
  try {
    const { getSellerProducts } = await import("../lib/canboso");
    const products = await getSellerProducts();
    res.json({ products });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// POST /api/mappings — create mapping
router.post("/mappings", async (req, res) => {
  try {
    const parsed = insertMappingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Dữ liệu không hợp lệ", details: parsed.error.issues });
    }
    const [mapping] = await db
      .insert(productMappingsTable)
      .values(parsed.data)
      .returning();
    res.status(201).json({ mapping });
  } catch (err: any) {
    const isDuplicate = err?.message?.includes("unique") || err?.code === "23505";
    res.status(isDuplicate ? 409 : 500).json({
      error: isDuplicate ? "Mã hoặc sản phẩm canboso đã được ánh xạ rồi" : err?.message,
    });
  }
});

// PUT /api/mappings/:id — update mapping
router.put("/mappings/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID không hợp lệ" });
    const partial = insertMappingSchema.partial().safeParse(req.body);
    if (!partial.success) {
      return res.status(400).json({ error: "Dữ liệu không hợp lệ" });
    }
    const [updated] = await db
      .update(productMappingsTable)
      .set(partial.data)
      .where(eq(productMappingsTable.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: "Không tìm thấy" });
    res.json({ mapping: updated });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// DELETE /api/mappings/:id — delete mapping
router.delete("/mappings/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID không hợp lệ" });
    await db.delete(productMappingsTable).where(eq(productMappingsTable.id, id));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

export default router;
