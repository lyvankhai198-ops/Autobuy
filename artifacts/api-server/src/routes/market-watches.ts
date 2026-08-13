/**
 * REST API for Market Watch management.
 *
 * GET    /api/market-watches          — list all watches
 * POST   /api/market-watches          — create a watch
 * PUT    /api/market-watches/:id      — update (label, markup, status, etc.)
 * DELETE /api/market-watches/:id      — delete a watch + unpull its seller product
 * POST   /api/market-watches/scan-now — trigger immediate market sync
 * GET    /api/market-watches/preview  — preview best source for given filters (no commit)
 */

import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, marketWatchesTable, insertMarketWatchSchema } from "@workspace/db";
import { runMarketSyncNow } from "../lib/market-poller";
import { getMarketProducts, getSellerProducts, deleteSellerProduct, computeListingPrice } from "../lib/market-canboso";

const router = Router();

// ── List ────────────────────────────────────────────────────────────────────

router.get("/market-watches", async (_req, res) => {
  try {
    const watches = await db.select().from(marketWatchesTable).orderBy(marketWatchesTable.createdAt);
    res.json({ watches });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// ── Create ──────────────────────────────────────────────────────────────────

router.post("/market-watches", async (req, res) => {
  try {
    const parsed = insertMarketWatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Dữ liệu không hợp lệ", details: parsed.error.issues });
    }
    const [watch] = await db.insert(marketWatchesTable).values(parsed.data).returning();
    res.status(201).json({ watch });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// ── Update ──────────────────────────────────────────────────────────────────

router.put("/market-watches/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID không hợp lệ" });

    const partial = insertMarketWatchSchema.partial().safeParse(req.body);
    if (!partial.success) return res.status(400).json({ error: "Dữ liệu không hợp lệ" });

    const [updated] = await db.update(marketWatchesTable).set(partial.data).where(eq(marketWatchesTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Không tìm thấy" });
    res.json({ watch: updated });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// ── Delete ──────────────────────────────────────────────────────────────────

router.delete("/market-watches/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID không hợp lệ" });

    const [watch] = await db.select().from(marketWatchesTable).where(eq(marketWatchesTable.id, id)).limit(1);
    if (!watch) return res.status(404).json({ error: "Không tìm thấy" });

    // Unpull our seller product before deleting the watch
    if (watch.currentSellerProductId) {
      await deleteSellerProduct(watch.currentSellerProductId).catch(() => {});
    }

    await db.delete(marketWatchesTable).where(eq(marketWatchesTable.id, id));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// ── Suggest: scan untracked shop products and find cheaper market sources ────

/**
 * Extract meaningful keywords from a product name for market matching.
 * Strips noise words and short tokens.
 */
function extractKeywords(name: string): string[] {
  const stopwords = new Set([
    "the", "and", "for", "plus", "pro", "premium", "tháng", "ngày", "năm",
    "một", "hai", "ba", "bốn", "slot", "acc", "account", "gói", "loại",
  ]);
  return name
    .toLowerCase()
    .split(/[\s()\[\]\/|,.\-_!@#$%^&*]+/)
    .map(w => w.replace(/[^a-z0-9àáâãèéêìíòóôõùúăđĩũơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/g, ""))
    .filter(w => w.length >= 3 && !stopwords.has(w) && !/^\d+$/.test(w))
    .slice(0, 6);
}

router.get("/market-watches/suggest", async (_req, res) => {
  try {
    const [sellerProducts, allMarketProducts, watches] = await Promise.all([
      getSellerProducts(),
      getMarketProducts({ onlyWithStock: false }),
      db.select().from(marketWatchesTable),
    ]);

    // IDs already managed by a watch rule
    const trackedSellerIds = new Set(
      watches.map(w => w.currentSellerProductId).filter(Boolean)
    );

    // Seller products not yet covered by any watch rule
    const untracked = sellerProducts.filter(p => !trackedSellerIds.has(p._id));

    // Available market sources (not ours, has stock, has price)
    const availableSources = allMarketProducts.filter(
      mp => !mp.isMine && !mp.alreadyPulledToSell && mp.marketSalePrice !== null && mp.stats.available > 0
    );

    const suggestions: {
      sellerProductId: string;
      sellerProductName: string;
      currentPrice: number;
      suggestedSource: {
        _id: string;
        product_name: string;
        marketSalePrice: number;
        available: number;
      };
      suggestedKeywords: string[];
      potentialSaving: number;
    }[] = [];

    for (const sp of untracked) {
      const keywords = extractKeywords(sp.product_name);
      if (keywords.length === 0) continue;

      // Find market products matching at least one keyword
      const matches = availableSources.filter(mp =>
        keywords.some(kw => mp.product_name.toLowerCase().includes(kw))
      );
      matches.sort((a, b) => (a.marketSalePrice ?? 0) - (b.marketSalePrice ?? 0));
      const best = matches[0];

      if (best && best.marketSalePrice! < sp.pricing) {
        suggestions.push({
          sellerProductId: sp._id,
          sellerProductName: sp.product_name,
          currentPrice: sp.pricing,
          suggestedSource: {
            _id: best._id,
            product_name: best.product_name,
            marketSalePrice: best.marketSalePrice!,
            available: best.stats.available,
          },
          suggestedKeywords: keywords,
          potentialSaving: sp.pricing - best.marketSalePrice!,
        });
      }
    }

    // Sort by highest potential saving first
    suggestions.sort((a, b) => b.potentialSaving - a.potentialSaving);

    res.json({ ok: true, suggestions, untrackedCount: untracked.length });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err?.message });
  }
});

// ── Cleanup: list orphaned seller products (dry-run) ─────────────────────────

router.get("/market-watches/cleanup-preview", async (_req, res) => {
  try {
    const allSellerProducts = await getSellerProducts();
    const watches = await db.select().from(marketWatchesTable);
    const trackedIds = new Set(watches.map(w => w.currentSellerProductId).filter(Boolean));

    const orphans = allSellerProducts.filter(
      p => p.marketSourceProductId && !trackedIds.has(p._id)
    );

    res.json({ ok: true, orphans, total: allSellerProducts.length });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err?.message });
  }
});

// ── Cleanup: delete selected seller products by ID ────────────────────────────

router.post("/market-watches/cleanup", async (req, res) => {
  try {
    const { ids } = req.body as { ids: string[] };
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ ok: false, message: "Không có sản phẩm nào được chọn." });
    }

    const deleted: string[] = [];
    const failed: string[] = [];
    for (const id of ids) {
      try {
        await deleteSellerProduct(id);
        deleted.push(id);
      } catch {
        failed.push(id);
      }
    }

    res.json({
      ok: true,
      deleted: deleted.length,
      failed: failed.length,
      message: `Đã xóa ${deleted.length} sản phẩm${failed.length ? `, thất bại ${failed.length}` : ""}.`,
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err?.message });
  }
});

// ── Scan now ────────────────────────────────────────────────────────────────

router.post("/market-watches/scan-now", async (_req, res) => {
  try {
    const result = await runMarketSyncNow();
    res.status(result.ok ? 200 : 500).json(result);
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err?.message ?? "Lỗi không xác định" });
  }
});

// ── Preview best source ─────────────────────────────────────────────────────

router.get("/market-watches/preview", async (req, res) => {
  try {
    const { emoji, keywords, excludeKeywords, markupType = "fixed", markupValue = "0", minStock = "1" } = req.query as Record<string, string>;
    const kwArray = keywords ? keywords.split(",").map(k => k.trim()).filter(Boolean) : [];
    const exKwArray = excludeKeywords ? excludeKeywords.split(",").map(k => k.trim()).filter(Boolean) : [];

    const products = await getMarketProducts({
      emoji: emoji || undefined,
      keywords: kwArray.length > 0 ? kwArray : undefined,
      excludeKeywords: exKwArray.length > 0 ? exKwArray : undefined,
      onlyWithStock: false,
    });

    const mv = parseInt(markupValue, 10) || 0;
    const ms = parseInt(minStock, 10) || 1;

    const enriched = products
      .filter(p => !p.isMine && p.marketSalePrice !== null)
      .map(p => ({
        _id: p._id,
        product_name: p.product_name,
        emoji: p.emoji,
        sellerUsername: (p as any).sellerUsername ?? "",
        marketSalePrice: p.marketSalePrice,
        marketMinListingPrice: p.marketMinListingPrice,
        available: p.stats.available,
        accountAvailable: p.marketAccountAvailable,
        hasStock: p.stats.available >= ms,
        alreadyPulled: p.alreadyPulledToSell,
        listingPrice: p.marketSalePrice
          ? computeListingPrice(p.marketSalePrice, markupType, mv, p.marketMinListingPrice ?? p.marketSalePrice)
          : null,
        slotProductType: p.slotProductType,
      }))
      .sort((a, b) => {
        // In-stock first, then by cheapest source price
        if (a.hasStock !== b.hasStock) return a.hasStock ? -1 : 1;
        return (a.marketSalePrice ?? 0) - (b.marketSalePrice ?? 0);
      });

    res.json({ products: enriched, total: enriched.length });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

export default router;
