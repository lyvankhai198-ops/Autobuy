import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, RefreshCw, ArrowRight, Package2, TrendingUp, Zap } from "lucide-react";

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

interface Mapping {
  id: number;
  code: string;
  canbosoProductId: string;
  canbosoProductName: string;
  sourceProductId: string;
  sourceProductName: string;
  autoHideWhenOos: boolean;
  markupAmount: number | null;
  sourcePriceLastSeen: number | null;
}

interface CanbosoProduct {
  _id: string;
  product_name: string;
  hiddenInBotMenu: boolean;
  stats: { available: number };
  pricing: number;
}

interface SourceProduct {
  id: string;
  name: string;
  stock: number;
  price: number;
}

const fmt = (v: number) => v.toLocaleString("vi-VN");

export default function Mappings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [code, setCode] = useState("");
  const [selectedCanboso, setSelectedCanboso] = useState<CanbosoProduct | null>(null);
  const [selectedSource, setSelectedSource] = useState<SourceProduct | null>(null);
  const [autoHide, setAutoHide] = useState(true);
  const [autoSyncPrice, setAutoSyncPrice] = useState(false);
  const [markupAmount, setMarkupAmount] = useState<string>("");
  const [searchCanboso, setSearchCanboso] = useState("");
  const [searchSource, setSearchSource] = useState("");

  // Auto-calculate markup when both products are selected
  useEffect(() => {
    if (selectedCanboso && selectedSource) {
      const diff = selectedCanboso.pricing - selectedSource.price;
      if (diff > 0) {
        setMarkupAmount(String(diff));
        setAutoSyncPrice(true);
      } else {
        setMarkupAmount("");
        setAutoSyncPrice(false);
      }
    }
  }, [selectedCanboso, selectedSource]);

  const { data: mappingsData, isLoading: loadingMappings } = useQuery({
    queryKey: ["mappings"],
    queryFn: () => apiFetch<{ mappings: Mapping[] }>("/api/mappings"),
  });

  const { data: canbosoData, isLoading: loadingCanboso } = useQuery({
    queryKey: ["canboso-products"],
    queryFn: () => apiFetch<{ products: CanbosoProduct[] }>("/api/mappings/canboso-products"),
    staleTime: 30_000,
  });

  const { data: sourceData, isLoading: loadingSource } = useQuery({
    queryKey: ["source-products"],
    queryFn: () => apiFetch<{ products: SourceProduct[] }>("/api/mappings/source-products"),
    staleTime: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: (body: object) => apiFetch<{ mapping: Mapping }>("/api/mappings", {
      method: "POST",
      body: JSON.stringify(body),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mappings"] });
      setCode(""); setSelectedCanboso(null); setSelectedSource(null);
      setAutoSyncPrice(false); setMarkupAmount("");
      toast({ title: "Đã lưu ánh xạ" });
    },
    onError: (err: any) => toast({ title: "Lỗi", description: err?.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/mappings/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mappings"] });
      toast({ title: "Đã xóa ánh xạ" });
    },
    onError: () => toast({ title: "Lỗi khi xóa", variant: "destructive" }),
  });

  const syncMutation = useMutation({
    mutationFn: () => apiFetch<{ ok: boolean; message: string }>("/api/actions/sync-now", { method: "POST" }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["canboso-products"] });
      queryClient.invalidateQueries({ queryKey: ["source-products"] });
      queryClient.invalidateQueries({ queryKey: ["mappings"] });
      toast({ title: "Đồng bộ xong!", description: data.message });
    },
    onError: (err: any) => toast({ title: "Lỗi đồng bộ", description: err?.message, variant: "destructive" }),
  });

  const handleCreate = () => {
    if (!code.trim() || !selectedCanboso || !selectedSource) {
      toast({ title: "Vui lòng điền đầy đủ", variant: "destructive" });
      return;
    }
    const parsedMarkup = parseInt(markupAmount.replace(/\D/g, ""), 10);
    createMutation.mutate({
      code: code.trim(),
      canbosoProductId: selectedCanboso._id,
      canbosoProductName: selectedCanboso.product_name,
      sourceProductId: selectedSource.id,
      sourceProductName: selectedSource.name,
      autoHideWhenOos: autoHide,
      markupAmount: autoSyncPrice && parsedMarkup > 0 ? parsedMarkup : null,
      sourcePriceLastSeen: autoSyncPrice ? selectedSource.price : null,
    });
  };

  const mappings = mappingsData?.mappings ?? [];
  const canbosoProducts = (canbosoData?.products ?? []).filter(p =>
    p.product_name.toLowerCase().includes(searchCanboso.toLowerCase())
  );
  const sourceProducts = (sourceData?.products ?? []).filter(p =>
    p.name.toLowerCase().includes(searchSource.toLowerCase())
  );

  const mappedCanbosoIds = new Set(mappings.map(m => m.canbosoProductId));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight mb-1">Ánh Xạ Sản Phẩm</h1>
        <p className="text-muted-foreground text-sm">
          Kết nối sản phẩm trên canboso.com với sản phẩm nguồn hàng. Gán mã tuỳ chỉnh để dễ nhận diện.
        </p>
      </div>

      {/* Existing mappings */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Package2 className="h-5 w-5 text-primary" />
                Danh Sách Ánh Xạ
              </CardTitle>
              <CardDescription className="mt-1">{mappings.length} ánh xạ đang hoạt động</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 shrink-0"
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
            >
              {syncMutation.isPending ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Zap className="h-3.5 w-3.5 text-yellow-500" />
              )}
              {syncMutation.isPending ? "Đang đồng bộ..." : "Đồng bộ ngay"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loadingMappings ? (
            <div className="text-sm text-muted-foreground py-4 text-center">Đang tải...</div>
          ) : mappings.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center border border-dashed rounded-md">
              Chưa có ánh xạ nào. Tạo ánh xạ đầu tiên bên dưới.
            </div>
          ) : (
            <div className="space-y-2">
              {mappings.map(m => (
                <div key={m.id} className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30">
                  <span className="font-mono text-xs bg-primary/10 text-primary px-2 py-1 rounded font-bold min-w-[48px] text-center">
                    {m.code}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap text-sm">
                      <span className="truncate text-foreground font-medium">{m.canbosoProductName}</span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="truncate text-primary">{m.sourceProductName}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      {m.autoHideWhenOos && (
                        <span className="text-[10px] text-muted-foreground font-mono uppercase">tự ẩn khi hết hàng</span>
                      )}
                      {m.markupAmount != null && (
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono flex items-center gap-1">
                          <TrendingUp className="h-2.5 w-2.5" />
                          tự đồng bộ giá
                          {m.sourcePriceLastSeen != null && (
                            <span className="text-muted-foreground">
                              · nguồn {fmt(m.sourcePriceLastSeen)}đ → canboso {fmt(m.sourcePriceLastSeen + m.markupAmount)}đ
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-destructive hover:text-destructive shrink-0"
                    onClick={() => deleteMutation.mutate(m.id)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create new mapping */}
      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" />
            Tạo Ánh Xạ Mới
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Code */}
          <div className="space-y-2 max-w-xs">
            <Label htmlFor="code" className="font-semibold">Mã Tuỳ Chỉnh</Label>
            <p className="text-xs text-muted-foreground">VD: 105, canva, gemini-pro</p>
            <Input
              id="code"
              value={code}
              onChange={e => setCode(e.target.value)}
              placeholder="105"
              className="font-mono"
            />
          </div>

          {/* Selection grid */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Canboso products */}
            <div className="space-y-2">
              <Label className="font-semibold">Sản Phẩm Canboso.com</Label>
              <Input
                placeholder="Tìm kiếm..."
                value={searchCanboso}
                onChange={e => setSearchCanboso(e.target.value)}
                className="h-8 text-sm"
              />
              <div className="border rounded-md overflow-auto max-h-64 divide-y">
                {loadingCanboso ? (
                  <div className="p-3 text-sm text-center text-muted-foreground">Đang tải...</div>
                ) : canbosoProducts.length === 0 ? (
                  <div className="p-3 text-sm text-center text-muted-foreground">Không tìm thấy</div>
                ) : canbosoProducts.map(p => {
                  const alreadyMapped = mappedCanbosoIds.has(p._id);
                  const isSelected = selectedCanboso?._id === p._id;
                  return (
                    <button
                      key={p._id}
                      disabled={alreadyMapped && !isSelected}
                      onClick={() => setSelectedCanboso(isSelected ? null : p)}
                      className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                        isSelected ? "bg-primary text-primary-foreground" :
                        alreadyMapped ? "bg-muted/50 text-muted-foreground cursor-not-allowed" :
                        "hover:bg-muted"
                      }`}
                    >
                      <div className="font-medium truncate">{p.product_name}</div>
                      <div className="text-[11px] opacity-75 mt-0.5">
                        {p.stats.available} còn · <b>{fmt(p.pricing)}đ</b>
                        {alreadyMapped && !isSelected && " · đã ánh xạ"}
                        {p.hiddenInBotMenu && " · 🔕 ẩn"}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Source products */}
            <div className="space-y-2">
              <Label className="font-semibold">Sản Phẩm Nguồn Hàng</Label>
              <Input
                placeholder="Tìm kiếm..."
                value={searchSource}
                onChange={e => setSearchSource(e.target.value)}
                className="h-8 text-sm"
              />
              <div className="border rounded-md overflow-auto max-h-64 divide-y">
                {loadingSource ? (
                  <div className="p-3 text-sm text-center text-muted-foreground">Đang tải...</div>
                ) : sourceProducts.length === 0 ? (
                  <div className="p-3 text-sm text-center text-muted-foreground">Không tìm thấy</div>
                ) : sourceProducts.map(p => {
                  const isSelected = selectedSource?.id === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedSource(isSelected ? null : p)}
                      className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                        isSelected ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                      }`}
                    >
                      <div className="font-medium truncate">{p.name}</div>
                      <div className="text-[11px] opacity-75 mt-0.5">
                        {p.stock > 0 ? `${p.stock} còn` : "⚠️ hết hàng"} · <b>{fmt(p.price)}đ</b>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Preview */}
          {(selectedCanboso || selectedSource) && (
            <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg text-sm flex-wrap">
              <span className="font-mono bg-primary/10 text-primary px-2 py-0.5 rounded text-xs font-bold">
                {code || "???"}
              </span>
              <span className="text-muted-foreground">{selectedCanboso?.product_name ?? "—"}</span>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <span className="text-primary">{selectedSource?.name ?? "—"}</span>
              {selectedCanboso && selectedSource && (
                <span className="ml-auto text-xs text-muted-foreground">
                  Biên: {fmt(selectedCanboso.pricing)}đ − {fmt(selectedSource.price)}đ
                  {" = "}
                  <span className={selectedCanboso.pricing - selectedSource.price > 0 ? "text-emerald-600 font-semibold" : "text-destructive font-semibold"}>
                    {fmt(selectedCanboso.pricing - selectedSource.price)}đ
                  </span>
                </span>
              )}
            </div>
          )}

          {/* Auto-sync price toggle */}
          <div className="space-y-3 p-3 bg-muted/30 rounded-lg border border-muted">
            <div className="flex items-center gap-3">
              <Switch checked={autoSyncPrice} onCheckedChange={setAutoSyncPrice} id="auto-sync-price" />
              <div>
                <Label htmlFor="auto-sync-price" className="font-medium flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                  Tự động cập nhật giá Canboso khi nguồn tăng/giảm giá
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Nguồn tăng bao nhiêu, Canboso tăng bấy nhiêu. Cập nhật mỗi 5 phút, admin nhận thông báo Telegram.
                </p>
              </div>
            </div>

            {autoSyncPrice && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Chênh lệch giá hiện tại (Canboso − Nguồn)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    value={markupAmount}
                    onChange={e => setMarkupAmount(e.target.value.replace(/\D/g, ""))}
                    placeholder="30000"
                    className="font-mono max-w-[180px] h-8 text-sm"
                  />
                  <span className="text-sm text-muted-foreground">đ</span>
                  {markupAmount && selectedSource && (
                    <span className="text-xs text-muted-foreground">
                      → Giá Canboso hiện tại: <b className="text-foreground">{fmt((selectedSource.price) + parseInt(markupAmount || "0"))}đ</b>
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Nguồn tăng/giảm bao nhiêu → Canboso tăng/giảm bấy nhiêu. Khoảng cách {markupAmount ? fmt(parseInt(markupAmount)) : "?"}đ luôn được giữ.
                </p>
              </div>
            )}
          </div>

          {/* Auto-hide toggle */}
          <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
            <Switch checked={autoHide} onCheckedChange={setAutoHide} id="auto-hide" />
            <div>
              <Label htmlFor="auto-hide" className="font-medium">Tự ẩn khi hết hàng</Label>
              <p className="text-xs text-muted-foreground">Ẩn sản phẩm trên canboso khi nguồn hết hàng, hiện lại khi có hàng.</p>
            </div>
          </div>

          <Button
            onClick={handleCreate}
            disabled={!code.trim() || !selectedCanboso || !selectedSource || createMutation.isPending}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            {createMutation.isPending ? "Đang lưu..." : "Lưu Ánh Xạ"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
