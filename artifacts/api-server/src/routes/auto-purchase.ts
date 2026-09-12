import { Router } from "express";
import { eq } from "drizzle-orm";
import {
  autoPurchaseRulesTable,
  db,
  insertAutoPurchaseRuleSchema,
} from "@workspace/db";
import { runAutoPurchaseNow } from "../lib/auto-purchase-poller";

const router = Router();

router.get("/auto-purchase-rules", async (_req, res) => {
  try {
    const rules = await db.select().from(autoPurchaseRulesTable).orderBy(autoPurchaseRulesTable.createdAt);
    res.json({ rules, intervalSeconds: 30 });
  } catch (error: any) {
    res.status(500).json({ error: error?.message ?? "Không thể tải rule tự mua." });
  }
});

router.post("/auto-purchase-rules", async (req, res) => {
  const parsed = insertAutoPurchaseRuleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dữ liệu rule không hợp lệ.", details: parsed.error.issues });
    return;
  }

  try {
    const [rule] = await db.insert(autoPurchaseRulesTable).values({
      ...parsed.data,
      quantity: Math.max(1, parsed.data.quantity ?? 1),
      status: "active",
    }).returning();
    res.status(201).json({ rule });
  } catch (error: any) {
    res.status(500).json({ error: error?.message ?? "Không thể tạo rule tự mua." });
  }
});

router.patch("/auto-purchase-rules/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "ID rule không hợp lệ." });
    return;
  }

  const status = req.body?.status;
  if (status !== "active" && status !== "paused") {
    res.status(400).json({ error: "Trạng thái chỉ có thể là active hoặc paused." });
    return;
  }

  try {
    const [rule] = await db.update(autoPurchaseRulesTable)
      .set({ status, updatedAt: new Date(), lastError: null })
      .where(eq(autoPurchaseRulesTable.id, id))
      .returning();
    if (!rule) {
      res.status(404).json({ error: "Không tìm thấy rule tự mua." });
      return;
    }
    res.json({ rule });
  } catch (error: any) {
    res.status(500).json({ error: error?.message ?? "Không thể cập nhật rule tự mua." });
  }
});

router.delete("/auto-purchase-rules/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "ID rule không hợp lệ." });
    return;
  }

  try {
    const [deleted] = await db.delete(autoPurchaseRulesTable)
      .where(eq(autoPurchaseRulesTable.id, id))
      .returning({ id: autoPurchaseRulesTable.id });
    if (!deleted) {
      res.status(404).json({ error: "Không tìm thấy rule tự mua." });
      return;
    }
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: error?.message ?? "Không thể xóa rule tự mua." });
  }
});

router.post("/auto-purchase-rules/scan-now", async (_req, res) => {
  res.json(await runAutoPurchaseNow());
});

export default router;