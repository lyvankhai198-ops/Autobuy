import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import {
  ShoppingBag, Plus, Trash2, Play, Pause, RotateCcw, Search,
  TrendingUp, AlertCircle, CheckCircle2, Clock, Loader2, Eye, ChevronUp, Pencil, X, Timer
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
  return data as T;
}

const fmt = (v: number | null | undefined) =>
  v != null ? v.toLocaleString("vi-VN") + "đ" : "—";
const formatDate = (s?: string | null) => s ? new Date(s).toLocaleString("vi-VN") : "—";

interface MarketWatch {
  id: number;
  label: string;
  emoji: string | null;
  keywords: string | null;
  excludeKeywords: string | null;
  markupType: string;
  markupValue: number;
  minStock: number;
  status: string;
  currentMarketProductId: string | null;
  currentMarketProductName: string | null;
  currentSellerProductId: string | null;
  lastMarketPrice: number | null;
  lastSwitchedAt: string | null;
  lastCheckedAt: string | null;
  lastError: string | null;
  createdAt: string;
}

interface PreviewProduct {
  _id: string;
  product_name: string;
  emoji: string;
  sellerUsername: string;
  marketSalePrice: number | null;
  marketMinListingPrice: number | null;
  available: number;
  accountAvailable: boolean;
  hasStock: boolean;
  alreadyPulled: boolean;
  listingPrice: number | null;
  slotProductType: string;
}

const EMOJI_OPTIONS = [
  { value: "", label: "Tất cả" },
  { value: "chatgpt", label: "ChatGPT" },
  { value: "canva", label: "Canva" },
  { value: "netflix", label: "Netflix" },
  { value: "spotify", label: "Spotify" },
  { value: "capcut", label: "CapCut" },
  { value: "claude", label: "Claude" },
  { value: "gemini", label: "Gemini" },
  { value: "surfshark", label: "Surfshark VPN" },
  { value: "nordvpn", label: "NordVPN" },
  { value: "hma_vpn", label: "HMA VPN" },
  { value: "meitu", label: "Meitu" },
  { value: "wink", label: "Wink" },
  { value: "outlook", label: "Hotmail/Outlook" },
  { value: "google_one", label: "Google One" },
  { value: "grok", label: "Grok" },
  { value: "lovable", label: "Lovable" },
  { value: "replit", label: "Replit" },
];

export default function Market() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Form state
  const [label, setLabel] = useState("");
  const [emoji, setEmoji] = useState("");
  const [keywords, setKeywords] = useState("");
  const [excludeKeywords, setExcludeKeywords] = useState("");
  const [markupType, setMarkupType] = useState<"fixed" | "percent">("fixed");
  const [markupValue, setMarkupValue] = useState("5000");
  const [minStock, setMinStock] = useState("1");
  const [showForm, setShowForm] = useState(false);

  // Preview state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewProducts, setPreviewProducts] = useState<PreviewProduct[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Scan state
  const [scanning, setScanning] = useState(false);

  // Interval state
  const [savingInterval, setSavingInterval] = useState(false);

  const { data: configData } = useQuery({
    queryKey: ["market-config"],
    queryFn: () => apiFetch<{ marketSyncIntervalMs: number | null }>("/api/config"),
  });
  const currentIntervalMs = configData?.marketSyncIntervalMs ?? 300_000;

  const handleIntervalChange = async (value: string) => {
    setSavingInterval(true);
    try {
      await apiFetch("/api/config", {
        method: "PUT",
        body: JSON.stringify({ marketSyncIntervalMs: Number(value) }),
      });
      queryClient.invalidateQueries({ queryKey: ["market-config"] });
      toast({ title: "✅ Đã cập nhật chu kỳ quét" });
    } catch (err: any) {
      toast({ title: "Lỗi", description: err?.message, variant: "destructive" });
    } finally {
      setSavingInterval(false);
    }
  };

  // Cleanup dialog state
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [cleanupDeleting, setCleanupDeleting] = useState(false);
  const [orphans, setOrphans] = useState<{ _id: string; product_name: string; pricing: number }[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ["market-watches"],
    queryFn: () => apiFetch<{ watches: MarketWatch[] }>("/api/market-watches"),
    refetchInterval: 30_000,
  });

  const watches = data?.watches ?? [];

  const createMutation = useMutation({
    mutationFn: (body: object) => apiFetch<{ watch: MarketWatch }>("/api/market-watches", {
      method: "POST",
      body: JSON.stringify(body),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["market-watches"] });
      toast({ title: "✅ Đã tạo quy tắc" });
      resetForm();
    },
    onError: (err: any) => toast({ title: "Lỗi", description: err?.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/market-watches/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["market-watches"] });
      toast({ title: "Đã xóa quy tắc" });
    },
    onError: () => toast({ title: "Lỗi khi xóa", variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiFetch<{ watch: MarketWatch }>(`/api/market-watches/${id}`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["market-watches"] }),
    onError: () => toast({ title: "Lỗi", variant: "destructive" }),
  });

  const resetForm = () => {
    setLabel(""); setEmoji(""); setKeywords(""); setExcludeKeywords(""); setMarkupType("fixed");
    setMarkupValue("5000"); setMinStock("1"); setShowForm(false); setPreviewOpen(false); setPreviewProducts([]);
  };

  const handleCreate = () => {
    if (!label.trim()) {
      toast({ title: "Vui lòng nhập tên quy tắc", variant: "destructive" });
      return;
    }
    if (!emoji && !keywords.trim()) {
      toast({ title: "Vui lòng chọn ít nhất emoji hoặc từ khóa", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      label: label.trim(),
      emoji: emoji || null,
      keywords: keywords.trim() || null,
      excludeKeywords: excludeKeywords.trim() || null,
      markupType,
      markupValue: parseInt(markupValue, 10) || 0,
      minStock: parseInt(minStock, 10) || 1,
    });
  };

  const handlePreview = async () => {
    setPreviewLoading(true);
    setPreviewOpen(true);
    try {
      const params = new URLSearchParams();
      if (emoji) params.set("emoji", emoji);
      if (keywords.trim()) params.set("keywords", keywords.trim());
      if (excludeKeywords.trim()) params.set("excludeKeywords", excludeKeywords.trim());
      params.set("markupType", markupType);
      params.set("markupValue", markupValue);
      params.set("minStock", minStock);
      const result = await apiFetch<{ products: PreviewProduct[] }>(`/api/market-watches/preview?${params}`);
      setPreviewProducts(result.products);
    } catch (err: any) {
      toast({ title: "Lỗi tìm kiếm", description: err?.message, variant: "destructive" });
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleScanNow = async () => {
    setScanning(true);
    try {
      const result = await apiFetch<{ ok: boolean; message: string }>("/api/market-watches/scan-now", { method: "POST" });
      toast({ title: result.ok ? "✅ Đồng bộ xong" : "⚠️ Hoàn tất", description: result.message });
      queryClient.invalidateQueries({ queryKey: ["market-watches"] });
    } catch {
      toast({ title: "Lỗi đồng bộ", variant: "destructive" });
    } finally {
      setScanning(false);
    }
  };

  const handleOpenCleanup = async () => {
    setCleanupLoading(true);
    setCleanupOpen(true);
    setSelectedIds(new Set());
    try {
      const result = await apiFetch<{ ok: boolean; orphans: { _id: string; product_name: string; pricing: number }[] }>(
        "/api/market-watches/cleanup-preview"
      );
      setOrphans(result.orphans ?? []);
    } catch {
      toast({ title: "Lỗi tải danh sách", variant: "destructive" });
      setCleanupOpen(false);
    } finally {
      setCleanupLoading(false);
    }
  };

  const handleConfirmCleanup = async () => {
    if (selectedIds.size === 0) return;
    setCleanupDeleting(true);
    try {
      const result = await apiFetch<{ ok: boolean; message: string }>(
        "/api/market-watches/cleanup", { method: "POST", body: JSON.stringify({ ids: [...selectedIds] }) }
      );
      toast({ title: "🗑️ Đã xóa", description: result.message });
      setCleanupOpen(false);
      setOrphans([]);
    } catch {
      toast({ title: "Lỗi xóa sản phẩm", variant: "destructive" });
    } finally {
      setCleanupDeleting(false);
    }
  };

  const toggleSelect = (id: string) =>
    setSelectedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  return (
    <div className="space-y-6">


      {/* ── Cleanup Dialog ────────────────────────────────────────────── */}
      <Dialog open={cleanupOpen} onOpenChange={setCleanupOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Dọn dẹp shop</DialogTitle>
            <DialogDescription>
              Các sản phẩm dưới đây được kéo từ chợ nhưng không thuộc quy tắc nào đang quản lý. Chọn cái nào muốn xóa rồi bấm xác nhận.
            </DialogDescription>
          </DialogHeader>

          {cleanupLoading ? (
            <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Đang tải danh sách...
            </div>
          ) : orphans.length === 0 ? (
            <p className="text-sm text-center py-8 text-muted-foreground">✅ Shop không có sản phẩm nào cần dọn.</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {/* Select all */}
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer hover:text-foreground pb-1 border-b">
                <input
                  type="checkbox"
                  checked={selectedIds.size === orphans.length}
                  onChange={() => setSelectedIds(
                    selectedIds.size === orphans.length ? new Set() : new Set(orphans.map(o => o._id))
                  )}
                />
                Chọn tất cả ({orphans.length} sản phẩm)
              </label>
              {orphans.map(p => (
                <label key={p._id} className="flex items-start gap-2.5 cursor-pointer hover:bg-muted/50 rounded px-1 py-1.5">
                  <input
                    type="checkbox"
                    className="mt-0.5 shrink-0"
                    checked={selectedIds.has(p._id)}
                    onChange={() => toggleSelect(p._id)}
                  />
                  <div className="min-w-0">
                    <p className="text-sm leading-snug break-all">{p.product_name}</p>
                    <p className="text-[11px] text-muted-foreground font-mono">{fmt(p.pricing)}</p>
                  </div>
                </label>
              ))}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="ghost" size="sm" onClick={() => setCleanupOpen(false)}>Hủy</Button>
            {orphans.length > 0 && (
              <Button
                variant="destructive" size="sm"
                disabled={selectedIds.size === 0 || cleanupDeleting}
                onClick={handleConfirmCleanup}
                className="gap-1.5"
              >
                {cleanupDeleting && <Loader2 className="h-3 w-3 animate-spin" />}
                Xóa {selectedIds.size > 0 ? `${selectedIds.size} ` : ""}sản phẩm đã chọn
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Chợ Tự Động</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Tự động tìm nguồn rẻ nhất, kéo hàng về shop, đổi nguồn khi hết hàng.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {/* Interval selector */}
          <div className="flex items-center gap-1.5 border rounded-md px-2 h-8 bg-background text-sm">
            {savingInterval
              ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              : <Timer className="h-3.5 w-3.5 text-muted-foreground" />
            }
            <select
              className="bg-transparent outline-none text-sm cursor-pointer pr-1"
              value={String(currentIntervalMs)}
              onChange={(e) => handleIntervalChange(e.target.value)}
              disabled={savingInterval}
            >
              <option value="300000">5 phút</option>
              <option value="600000">10 phút</option>
              <option value="1800000">30 phút</option>
              <option value="3600000">1 giờ</option>
              <option value="86400000">1 ngày</option>
            </select>
          </div>
          <Button
            variant="outline" size="sm" className="gap-2"
            onClick={handleScanNow} disabled={scanning}
          >
            <RotateCcw className={`h-3.5 w-3.5 ${scanning ? "animate-spin" : ""}`} />
            {scanning ? "Đang quét..." : "Quét ngay"}
          </Button>
          <Button
            variant="outline" size="sm" className="gap-2 text-destructive hover:text-destructive"
            onClick={handleOpenCleanup} disabled={cleanupLoading}
          >
            {cleanupLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            Dọn dẹp shop
          </Button>
          <Button size="sm" className="gap-2" onClick={() => setShowForm(v => !v)}>
            <Plus className="h-3.5 w-3.5" />
            Thêm quy tắc
          </Button>
        </div>
      </div>

      {/* Create form */}
      {showForm && (
        <Card className="border-primary/30 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ShoppingBag className="h-4 w-4 text-primary" />
              Tạo Quy Tắc Mới
            </CardTitle>
            <CardDescription>Hệ thống sẽ tự tìm sản phẩm rẻ nhất trên chợ khớp bộ lọc và kéo về shop.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              {/* Label */}
              <div className="space-y-1.5">
                <Label>Tên quy tắc <span className="text-destructive">*</span></Label>
                <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="vd: ChatGPT Plus 1 tháng" />
              </div>
              {/* Emoji */}
              <div className="space-y-1.5">
                <Label>Danh mục (Emoji)</Label>
                <select
                  value={emoji}
                  onChange={e => setEmoji(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {EMOJI_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              {/* Keywords */}
              <div className="space-y-1.5">
                <Label>Từ khóa lọc tên sản phẩm</Label>
                <Input
                  value={keywords}
                  onChange={e => setKeywords(e.target.value)}
                  placeholder="vd: BHF, bhf (ngăn cách bởi dấu phẩy)"
                />
                <p className="text-[11px] text-muted-foreground">Ít nhất 1 từ khóa khớp là đủ (dùng để lọc từ đồng nghĩa)</p>
              </div>
              {/* Exclude keywords */}
              <div className="space-y-1.5">
                <Label>Loại trừ sản phẩm chứa</Label>
                <Input
                  value={excludeKeywords}
                  onChange={e => setExcludeKeywords(e.target.value)}
                  placeholder="vd: 2 ngày, 30D, trial (ngăn cách bởi dấu phẩy)"
                />
                <p className="text-[11px] text-muted-foreground">Bỏ qua sản phẩm có chứa bất kỳ từ nào trong danh sách này</p>
              </div>
              {/* Min stock */}
              <div className="space-y-1.5">
                <Label>Tồn kho tối thiểu</Label>
                <Input type="number" min={1} value={minStock} onChange={e => setMinStock(e.target.value)} />
                <p className="text-[11px] text-muted-foreground">Bỏ qua nguồn có ít hơn số sản phẩm này</p>
              </div>
            </div>

            {/* Markup */}
            <div className="space-y-2">
              <Label>Markup (lợi nhuận)</Label>
              <div className="flex gap-3 items-start flex-wrap">
                <div className="flex rounded-md border border-input overflow-hidden">
                  {([
                    { value: "tiered", label: "🎯 Tự động theo giá" },
                    { value: "percent", label: "Phần trăm (%)" },
                    { value: "fixed", label: "Cố định (đ)" },
                  ] as const).map(t => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => {
                        setMarkupType(t.value as any);
                        if (t.value === "tiered") setMarkupValue("100");
                        if (t.value === "percent") setMarkupValue("10");
                        if (t.value === "fixed") setMarkupValue("5000");
                      }}
                      className={`px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${markupType === t.value ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {markupType === "tiered" && (
                <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="w-40">
                      <Label className="text-xs">Hệ số điều chỉnh</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <Input
                          type="number" min={10} max={500} step={10}
                          value={markupValue}
                          onChange={e => setMarkupValue(e.target.value)}
                          className="w-24 h-8 text-sm"
                        />
                        <span className="text-sm text-muted-foreground font-mono">
                          {markupValue === "100" ? "= mặc định" : markupValue > "100" ? `= +${+markupValue - 100}% lãi` : `= -${100 - +markupValue}% lãi`}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-[11px] text-muted-foreground space-y-0.5">
                    <p className="font-semibold text-foreground/70 mb-1">
                      Phí sàn 10% · hệ số ×{(+markupValue / 100).toFixed(2)} · lãi = tiền về tay sau khi trừ phí:
                    </p>
                    <div className="grid grid-cols-3 gap-x-2 font-semibold text-foreground/50 mb-1">
                      <span>Giá vốn (vd)</span><span>Lãi thực về</span><span>Giá treo</span>
                    </div>
                    {([
                      [10_000, 3_000],
                      [20_000, 5_000],
                      [30_000, 7_000],
                      [50_000, 10_000],
                      [100_000, 15_000],
                      [200_000, 25_000],
                    ] as [number, number][]).map(([src, baseNet]) => {
                      const scale = +markupValue / 100;
                      const net = Math.ceil(baseNet * scale);
                      const listing = Math.ceil((src + net) / 0.9);
                      return (
                        <div key={src} className="grid grid-cols-3 gap-x-2">
                          <span className="font-mono">{src.toLocaleString("vi-VN")}đ</span>
                          <span className="text-success font-semibold">+{net.toLocaleString("vi-VN")}đ</span>
                          <span className="font-mono">{listing.toLocaleString("vi-VN")}đ</span>
                        </div>
                      );
                    })}
                    <div className="grid grid-cols-3 gap-x-2 mt-0.5">
                      <span className="font-mono">&gt; 200,000đ</span>
                      <span className="text-success font-semibold">+{(15 * +markupValue / 100).toFixed(1)}% giá vốn</span>
                      <span className="font-mono">÷ 0.9</span>
                    </div>
                  </div>
                </div>
              )}

              {markupType === "percent" && (
                <div className="flex items-center gap-3">
                  <div className="w-40">
                    <Input
                      type="number" min={0}
                      value={markupValue}
                      onChange={e => setMarkupValue(e.target.value)}
                      placeholder="10"
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">% thêm vào giá vốn (vd: 10 = +10%)</p>
                </div>
              )}

              {markupType === "fixed" && (
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <div className="w-40">
                      <Input
                        type="number" min={0}
                        value={markupValue}
                        onChange={e => setMarkupValue(e.target.value)}
                        placeholder="5000"
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground">VND thêm vào giá vốn (tất cả mặt hàng)</p>
                  </div>
                  <p className="text-[11px] text-amber-600">⚠️ Lưu ý: markup cố định không phù hợp khi có mặt hàng chênh lệch giá lớn.</p>
                </div>
              )}
            </div>

            {/* Preview results */}
            {previewOpen && (
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 bg-muted/40 border-b border-border">
                  <span className="text-sm font-semibold">Kết quả xem trước ({previewProducts.length} sản phẩm)</span>
                  <button onClick={() => setPreviewOpen(false)} className="text-muted-foreground hover:text-foreground">
                    <ChevronUp className="h-4 w-4" />
                  </button>
                </div>
                {previewLoading ? (
                  <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground text-sm">
                    <Loader2 className="h-4 w-4 animate-spin" /> Đang tìm kiếm...
                  </div>
                ) : previewProducts.length === 0 ? (
                  <div className="text-center py-6 text-sm text-muted-foreground">Không tìm thấy sản phẩm nào</div>
                ) : (
                  <div className="divide-y divide-border max-h-72 overflow-auto">
                    {previewProducts.slice(0, 20).map((p, i) => (
                      <div key={p._id} className={`flex items-center gap-3 px-4 py-2.5 text-sm ${i === 0 && p.hasStock ? "bg-success/5" : ""}`}>
                        {i === 0 && p.hasStock && <span className="text-[10px] font-bold text-success bg-success/10 px-1.5 py-0.5 rounded">BEST</span>}
                        <div className="flex-1 min-w-0">
                          <p className={`font-medium truncate text-xs ${!p.hasStock ? "text-muted-foreground line-through" : ""}`}>{p.product_name}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">@{p.sellerUsername} · stock: {p.available}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-mono font-semibold">{fmt(p.marketSalePrice)} <span className="text-muted-foreground font-normal">vốn</span></p>
                          <p className="text-[10px] font-mono text-primary">→ treo {fmt(p.listingPrice)}</p>
                        </div>
                        {!p.hasStock && (
                          <Badge variant="outline" className="text-[10px] shrink-0">Hết hàng</Badge>
                        )}
                        {p.alreadyPulled && <Badge variant="secondary" className="text-[10px] shrink-0">Đã kéo</Badge>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-between items-center pt-1 flex-wrap gap-2">
              <Button variant="outline" size="sm" className="gap-2" onClick={handlePreview} disabled={previewLoading}>
                <Eye className="h-3.5 w-3.5" />
                Xem trước kết quả
              </Button>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={resetForm}>Hủy</Button>
                <Button size="sm" onClick={handleCreate} disabled={createMutation.isPending} className="gap-2">
                  {createMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Tạo quy tắc
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Watches list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map(i => (
            <div key={i} className="h-28 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : watches.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <ShoppingBag className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground text-center">
              Chưa có quy tắc nào.<br />
              Bấm <b>"Thêm quy tắc"</b> để tự động hóa việc tìm nguồn từ chợ.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {watches.map(w => (
            <WatchCard
              key={w.id}
              watch={w}
              onDelete={() => deleteMutation.mutate(w.id)}
              onToggle={() => toggleMutation.mutate({ id: w.id, status: w.status === "active" ? "paused" : "active" })}
              onUpdate={async (data) => {
                await apiFetch(`/api/market-watches/${w.id}`, { method: "PUT", body: JSON.stringify(data) });
                queryClient.invalidateQueries({ queryKey: ["market-watches"] });
                toast({ title: "✅ Đã lưu thay đổi" });
              }}
              onScan={async () => {
                const result = await apiFetch<{ ok: boolean; message: string }>(
                  `/api/market-watches/${w.id}/scan`, { method: "POST" }
                );
                queryClient.invalidateQueries({ queryKey: ["market-watches"] });
                toast({ title: result.ok ? "✅ " + result.message : "⚠️ " + result.message });
              }}
              deleting={deleteMutation.isPending}
              toggling={toggleMutation.isPending}
            />
          ))}
        </div>
      )}

      {/* How it works */}
      <Card className="bg-muted/30 border-dashed shadow-none">
        <CardContent className="pt-4 pb-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Cách hoạt động</p>
          <div className="grid sm:grid-cols-3 gap-3 text-xs text-muted-foreground">
            <div className="flex gap-2">
              <Search className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
              <span><b className="text-foreground">Mỗi 5 phút</b> quét chợ, tìm sản phẩm rẻ nhất khớp bộ lọc</span>
            </div>
            <div className="flex gap-2">
              <TrendingUp className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
              <span>Khi nguồn tăng/giảm giá, <b className="text-foreground">tự cập nhật giá treo</b> để giữ markup</span>
            </div>
            <div className="flex gap-2">
              <RotateCcw className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
              <span>Khi nguồn hết hàng, <b className="text-foreground">tự đổi sang nguồn khác</b> rẻ nhất</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function WatchCard({
  watch, onDelete, onToggle, onUpdate, onScan, deleting, toggling
}: {
  watch: MarketWatch;
  onDelete: () => void;
  onToggle: () => void;
  onUpdate: (data: object) => Promise<void>;
  onScan: () => Promise<void>;
  deleting: boolean;
  toggling: boolean;
}) {
  const isActive = watch.status === "active";
  const hasSource = !!watch.currentMarketProductId;

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [eLabel, setELabel] = useState(watch.label);
  const [eEmoji, setEEmoji] = useState(watch.emoji ?? "");
  const [eKeywords, setEKeywords] = useState(watch.keywords ?? "");
  const [eExcludeKeywords, setEExcludeKeywords] = useState(watch.excludeKeywords ?? "");
  const [eMarkupType, setEMarkupType] = useState(watch.markupType ?? "tiered");
  const [eMarkupValue, setEMarkupValue] = useState(String(watch.markupValue ?? 100));
  const [eMinStock, setEMinStock] = useState(String(watch.minStock ?? 1));

  const openEdit = () => {
    setELabel(watch.label); setEEmoji(watch.emoji ?? ""); setEKeywords(watch.keywords ?? "");
    setEExcludeKeywords(watch.excludeKeywords ?? "");
    setEMarkupType(watch.markupType ?? "tiered"); setEMarkupValue(String(watch.markupValue ?? 100));
    setEMinStock(String(watch.minStock ?? 1)); setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onUpdate({ label: eLabel.trim(), emoji: eEmoji || null, keywords: eKeywords.trim() || null, excludeKeywords: eExcludeKeywords.trim() || null, markupType: eMarkupType, markupValue: parseInt(eMarkupValue, 10) || 0, minStock: parseInt(eMinStock, 10) || 1 });
      setEditing(false);
    } finally { setSaving(false); }
  };

  const markupDisplay = watch.markupType === "tiered"
    ? `tự động ×${(watch.markupValue / 100).toFixed(2)}`
    : watch.markupType === "percent" ? `${watch.markupValue}%` : fmt(watch.markupValue);

  return (
    <Card className={`shadow-sm transition-all ${!isActive ? "opacity-60" : ""} ${watch.lastError ? "border-destructive/30" : ""}`}>
      <CardContent className="pt-4 pb-4">
        {!editing ? (
          /* ── View ── */
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className={`mt-1 h-2.5 w-2.5 rounded-full shrink-0 ${isActive && hasSource ? "bg-success animate-pulse" : isActive ? "bg-warning" : "bg-muted-foreground/40"}`} />
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-sm break-all">{watch.label}</p>
                  <Badge variant={isActive ? "default" : "secondary"} className="text-[10px]">{isActive ? "Đang chạy" : "Tạm dừng"}</Badge>
                  {watch.emoji && <Badge variant="outline" className="text-[10px] font-mono">{watch.emoji}</Badge>}
                  {watch.keywords && <span className="text-[10px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded break-all">"{watch.keywords}"</span>}
                  {watch.excludeKeywords && <span className="text-[10px] text-destructive/70 font-mono bg-destructive/10 px-1.5 py-0.5 rounded break-all">−"{watch.excludeKeywords}"</span>}
                </div>
                {hasSource ? (
                  <div className="mt-1.5 flex items-center gap-2 flex-wrap text-xs">
                    <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                    <span className="text-muted-foreground">Nguồn hiện tại:</span>
                    <span className="font-medium truncate max-w-xs">{watch.currentMarketProductName}</span>
                    <span className="text-muted-foreground font-mono">vốn {fmt(watch.lastMarketPrice)} · markup {markupDisplay}</span>
                  </div>
                ) : (
                  <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5 shrink-0" />
                    <span>Chưa tìm được nguồn — sẽ tự tìm ở lần quét tiếp theo</span>
                  </div>
                )}
                {watch.lastError && (
                  <div className="mt-1.5 flex items-center gap-1.5 text-xs text-destructive">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    <span>{watch.lastError}</span>
                  </div>
                )}
                <p className="mt-1 text-[10px] text-muted-foreground font-mono">
                  Kiểm tra lần cuối: {formatDate(watch.lastCheckedAt)}
                  {watch.lastSwitchedAt && ` · Đổi nguồn: ${formatDate(watch.lastSwitchedAt)}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground" onClick={openEdit} title="Chỉnh sửa">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost" size="sm"
                className="h-8 w-8 p-0 text-muted-foreground hover:text-primary"
                title="Quét ngay"
                disabled={scanning || !isActive}
                onClick={async () => {
                  setScanning(true);
                  try { await onScan(); } finally { setScanning(false); }
                }}
              >
                {scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={onToggle} disabled={toggling}>
                {toggling ? <Loader2 className="h-3 w-3 animate-spin" /> : isActive ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                {isActive ? "Dừng" : "Chạy"}
              </Button>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive" onClick={onDelete} disabled={deleting}>
                {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        ) : (
          /* ── Edit ── */
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Chỉnh sửa quy tắc</p>
              <button onClick={() => setEditing(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tên quy tắc</Label>
              <Input value={eLabel} onChange={e => setELabel(e.target.value)} className="h-8 text-sm" placeholder="ChatGPT Plus BHF 1 tháng" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Danh mục (Emoji)</Label>
                <select value={eEmoji} onChange={e => setEEmoji(e.target.value)}
                  className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {EMOJI_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tồn kho tối thiểu</Label>
                <Input type="number" min={1} value={eMinStock} onChange={e => setEMinStock(e.target.value)} className="h-8 text-sm" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Từ khóa lọc (ngăn cách bởi dấu phẩy)</Label>
              <Input value={eKeywords} onChange={e => setEKeywords(e.target.value)} placeholder="bhf, 1 tháng, bh24h" className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Loại trừ sản phẩm chứa</Label>
              <Input value={eExcludeKeywords} onChange={e => setEExcludeKeywords(e.target.value)} placeholder="2 ngày, 30D, trial" className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Markup</Label>
              <div className="flex gap-2 flex-wrap items-center">
                <div className="flex rounded-md border border-input overflow-hidden">
                  {([{ value: "tiered", label: "🎯 Tự động" }, { value: "percent", label: "%" }, { value: "fixed", label: "Cố định" }] as const).map(t => (
                    <button key={t.value} type="button" onClick={() => setEMarkupType(t.value)}
                      className={`px-2.5 py-1.5 text-[11px] font-medium transition-colors ${eMarkupType === t.value ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}>
                      {t.label}
                    </button>
                  ))}
                </div>
                <Input type="number" min={0} value={eMarkupValue} onChange={e => setEMarkupValue(e.target.value)}
                  className="w-28 h-8 text-sm" placeholder={eMarkupType === "tiered" ? "100" : eMarkupType === "percent" ? "10" : "5000"} />
                <span className="text-[11px] text-muted-foreground">
                  {eMarkupType === "tiered" ? `×${(+eMarkupValue / 100).toFixed(2)} (100 = mặc định)` : eMarkupType === "percent" ? `% giá vốn` : `đ cố định`}
                </span>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setEditing(false)}>Hủy</Button>
              <Button size="sm" className="h-8 text-xs gap-1.5" onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="h-3 w-3 animate-spin" />}
                Lưu thay đổi
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
