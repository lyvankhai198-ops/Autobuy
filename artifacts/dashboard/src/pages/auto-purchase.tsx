import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  AlertCircle,
  Boxes,
  CheckCircle2,
  Clock3,
  Loader2,
  PackageCheck,
  Pause,
  Play,
  Plus,
  RefreshCw,
  ScanLine,
  Trash2,
  Wifi,
  WifiOff,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type RuleStatus = "active" | "paused" | "completed";

interface SourceProduct {
  id: string;
  name: string;
  price: number;
  stock: number;
  description?: string;
}

interface SourceStatus {
  online: boolean;
  products?: SourceProduct[];
  checkedAt?: string;
  error?: string;
}

interface AutoPurchaseRule {
  id: number;
  label: string;
  sourceProductId: string;
  sourceProductName: string;
  quantity: number;
  status: RuleStatus;
  lastStock: number | null;
  lastCheckedAt: string | null;
  lastAttemptAt: string | null;
  lastPurchasedQuantity: number | null;
  lastOrderCode: string | null;
  lastPurchasedAmount: number | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

interface RulesResponse {
  rules: AutoPurchaseRule[];
  intervalSeconds?: number;
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error ?? `HTTP ${response.status}`);
  return data as T;
}

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" }) : "—";

const formatMoney = (value?: number | null) =>
  value == null ? "—" : `${value.toLocaleString("vi-VN")}đ`;

function StatusBadge({ status }: { status: RuleStatus }) {
  const config = {
    active: { label: "Đang chạy", className: "bg-success/10 text-success border-success/20", icon: Play },
    paused: { label: "Tạm dừng", className: "bg-warning/10 text-warning border-warning/20", icon: Pause },
    completed: { label: "Đã mua", className: "bg-info/10 text-info border-info/20", icon: CheckCircle2 },
  }[status];
  const Icon = config.icon;
  return (
    <Badge variant="outline" className={`gap-1.5 font-medium ${config.className}`} data-testid={`status-rule-${status}`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

function DetailCell({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className={`mt-1 truncate text-sm font-medium ${mono ? "font-mono text-xs" : ""}`} title={value}>{value}</p>
    </div>
  );
}

function RuleCard({
  rule,
  onToggle,
  onDelete,
  busy,
}: {
  rule: AutoPurchaseRule;
  onToggle: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const hasError = Boolean(rule.lastError);
  return (
    <Card className={`overflow-hidden transition-shadow hover:shadow-card-hover ${hasError ? "border-destructive/30" : ""}`} data-testid={`card-rule-${rule.id}`}>
      <CardHeader className="gap-3 border-b border-border/70 bg-muted/15 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${hasError ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
              <PackageCheck className="h-[18px] w-[18px]" />
            </div>
            <div className="min-w-0">
              <CardTitle className="truncate text-base" data-testid={`text-rule-label-${rule.id}`}>{rule.label}</CardTitle>
              <CardDescription className="mt-1 flex items-center gap-2 truncate font-mono text-[11px]">
                <span title={rule.sourceProductId}>{rule.sourceProductName}</span>
                <span className="text-border">/</span>
                <span>{rule.sourceProductId}</span>
              </CardDescription>
            </div>
          </div>
          <StatusBadge status={rule.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <div className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-4">
           <DetailCell label="Giới hạn mua" value={`${rule.quantity} sản phẩm`} mono />
          <DetailCell label="Tồn kho gần nhất" value={rule.lastStock == null ? "Chưa kiểm tra" : `${rule.lastStock} sản phẩm`} mono />
          <DetailCell label="Lần kiểm tra" value={formatDate(rule.lastCheckedAt)} />
          <DetailCell label="Lần thử mua" value={formatDate(rule.lastAttemptAt)} />
        </div>

        {(rule.lastOrderCode || rule.lastPurchasedQuantity != null || rule.lastPurchasedAmount != null) && (
          <div className="grid grid-cols-2 gap-x-5 gap-y-3 rounded-lg border border-success/15 bg-success/[0.04] px-3.5 py-3 sm:grid-cols-4">
            <DetailCell label="Mã đơn gần nhất" value={rule.lastOrderCode ?? "—"} mono />
            <DetailCell label="Đã mua" value={rule.lastPurchasedQuantity == null ? "—" : `${rule.lastPurchasedQuantity} sản phẩm`} mono />
            <DetailCell label="Chi phí" value={formatMoney(rule.lastPurchasedAmount)} mono />
            <DetailCell label="Cập nhật" value={formatDate(rule.updatedAt)} />
          </div>
        )}

        {hasError && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/[0.05] px-3 py-2.5 text-xs text-destructive" data-testid={`text-rule-error-${rule.id}`}>
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="break-words">{rule.lastError}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3">
          <p className="text-[11px] text-muted-foreground">
            Tạo lúc {formatDate(rule.createdAt)}
          </p>
          <div className="flex items-center gap-2">
            {rule.status !== "completed" && (
              <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={onToggle} disabled={busy} data-testid={`button-toggle-rule-${rule.id}`}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : rule.status === "active" ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                {rule.status === "active" ? "Tạm dừng" : "Tiếp tục"}
              </Button>
            )}
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={onDelete} disabled={busy} data-testid={`button-delete-rule-${rule.id}`}>
              <Trash2 className="h-3.5 w-3.5" />
              Xóa
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AutoPurchase() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [label, setLabel] = useState("");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [formOpen, setFormOpen] = useState(false);
  const [busyRuleId, setBusyRuleId] = useState<number | null>(null);
  const [scanning, setScanning] = useState(false);

  const sourceQuery = useQuery<SourceStatus>({
    queryKey: ["auto-purchase-source-status"],
    queryFn: () => apiFetch<SourceStatus>("/api/source/status"),
    refetchInterval: 60_000,
  });
  const rulesQuery = useQuery<RulesResponse>({
    queryKey: ["auto-purchase-rules"],
    queryFn: () => apiFetch<RulesResponse>("/api/auto-purchase-rules"),
    refetchInterval: 30_000,
  });

  const products = useMemo(() => sourceQuery.data?.products ?? [], [sourceQuery.data?.products]);
  const rules = rulesQuery.data?.rules ?? [];
  const selectedProduct = products.find((product) => product.id === productId);
  const activeCount = rules.filter((rule) => rule.status === "active").length;
  const pendingCount = rules.filter((rule) => rule.status === "paused").length;
  const completedCount = rules.filter((rule) => rule.status === "completed").length;

  const invalidateRules = () => queryClient.invalidateQueries({ queryKey: ["auto-purchase-rules"] });

  const createMutation = useMutation({
    mutationFn: (body: { label: string; sourceProductId: string; sourceProductName: string; quantity: number; status: "active" }) =>
      apiFetch("/api/auto-purchase-rules", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      invalidateRules();
      setLabel("");
      setProductId("");
      setQuantity("1");
      setFormOpen(false);
      toast({ title: "Đã tạo quy tắc mua tự động" });
    },
    onError: (error: Error) => toast({ title: "Không thể tạo quy tắc", description: error.message, variant: "destructive" }),
  });

  const handleCreate = () => {
    const parsedQuantity = Number(quantity);
    if (!label.trim()) {
      toast({ title: "Vui lòng nhập tên quy tắc", variant: "destructive" });
      return;
    }
    if (!selectedProduct) {
      toast({ title: "Vui lòng chọn sản phẩm nguồn", variant: "destructive" });
      return;
    }
    if (!Number.isInteger(parsedQuantity) || parsedQuantity < 1) {
      toast({ title: "Số lượng phải là số nguyên dương", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      label: label.trim(),
      sourceProductId: selectedProduct.id,
      sourceProductName: selectedProduct.name,
      quantity: parsedQuantity,
      status: "active",
    });
  };

  const handleToggle = async (rule: AutoPurchaseRule) => {
    setBusyRuleId(rule.id);
    try {
      await apiFetch(`/api/auto-purchase-rules/${rule.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: rule.status === "active" ? "paused" : "active" }),
      });
      await invalidateRules();
      toast({ title: rule.status === "active" ? "Đã tạm dừng quy tắc" : "Đã tiếp tục quy tắc" });
    } catch (error) {
      toast({ title: "Không thể cập nhật quy tắc", description: error instanceof Error ? error.message : "Vui lòng thử lại", variant: "destructive" });
    } finally {
      setBusyRuleId(null);
    }
  };

  const handleDelete = async (rule: AutoPurchaseRule) => {
    if (!window.confirm(`Xóa quy tắc "${rule.label}"?`)) return;
    setBusyRuleId(rule.id);
    try {
      await apiFetch(`/api/auto-purchase-rules/${rule.id}`, { method: "DELETE" });
      await invalidateRules();
      toast({ title: "Đã xóa quy tắc" });
    } catch (error) {
      toast({ title: "Không thể xóa quy tắc", description: error instanceof Error ? error.message : "Vui lòng thử lại", variant: "destructive" });
    } finally {
      setBusyRuleId(null);
    }
  };

  const handleScan = async () => {
    setScanning(true);
    try {
      const result = await apiFetch<{ ok: boolean; processed: number; message: string }>("/api/auto-purchase-rules/scan-now", { method: "POST" });
      await invalidateRules();
      toast({ title: result.ok ? "Đã quét xong" : "Quét hoàn tất", description: `${result.message} · ${result.processed} quy tắc đã xử lý` });
    } catch (error) {
      toast({ title: "Không thể quét ngay", description: error instanceof Error ? error.message : "Vui lòng thử lại", variant: "destructive" });
    } finally {
      setScanning(false);
    }
  };

  const loading = sourceQuery.isLoading || rulesQuery.isLoading;
  const queryError = sourceQuery.error || rulesQuery.error;

  return (
    <div className="space-y-6 pb-4" data-testid="page-auto-purchase">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            <ScanLine className="h-3.5 w-3.5" />
            Điều khiển mua hàng
          </div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-[28px]">Mua tự động</h1>
          <p className="mt-1 text-sm text-muted-foreground">Quản lý các lần mua một lần từ nguồn hàng, với trạng thái và kết quả rõ ràng.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={handleScan} disabled={scanning || loading} data-testid="button-scan-now">
            {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {scanning ? "Đang quét..." : "Quét ngay"}
          </Button>
          <Button size="sm" className="gap-2" onClick={() => setFormOpen((open) => !open)} data-testid="button-new-rule">
            <Plus className="h-4 w-4" />
            Thêm quy tắc
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Card className="border-primary/15 bg-primary/[0.035]">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-primary/10 p-2 text-primary"><Boxes className="h-4 w-4" /></div>
            <div><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Tổng quy tắc</p><p className="mt-0.5 font-mono text-xl font-semibold tabular-nums" data-testid="text-total-rules">{rules.length}</p></div>
          </CardContent>
        </Card>
        <Card><CardContent className="flex items-center gap-3 p-4"><div className="rounded-lg bg-success/10 p-2 text-success"><Play className="h-4 w-4" /></div><div><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Đang chạy</p><p className="mt-0.5 font-mono text-xl font-semibold tabular-nums" data-testid="text-active-rules">{activeCount}</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4"><div className="rounded-lg bg-warning/10 p-2 text-warning"><Pause className="h-4 w-4" /></div><div><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Tạm dừng</p><p className="mt-0.5 font-mono text-xl font-semibold tabular-nums" data-testid="text-paused-rules">{pendingCount}</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4"><div className="rounded-lg bg-info/10 p-2 text-info"><CheckCircle2 className="h-4 w-4" /></div><div><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Đã hoàn tất</p><p className="mt-0.5 font-mono text-xl font-semibold tabular-nums" data-testid="text-completed-rules">{completedCount}</p></div></CardContent></Card>
      </div>

      {formOpen && (
        <Card className="border-primary/25 shadow-card" data-testid="card-create-rule">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-base"><Plus className="h-4 w-4 text-primary" />Tạo quy tắc mua một lần</CardTitle>
            <CardDescription>Chọn đúng sản phẩm nguồn. Nếu tồn kho thấp hơn giới hạn, hệ thống sẽ mua toàn bộ số còn lại.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-[1fr_1.5fr_150px]">
              <div className="space-y-1.5">
                <Label htmlFor="auto-purchase-label">Tên quy tắc</Label>
                <Input id="auto-purchase-label" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Ví dụ: Bổ sung gói 30 ngày" data-testid="input-rule-label" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="auto-purchase-product">Sản phẩm nguồn</Label>
                <select id="auto-purchase-product" value={productId} onChange={(event) => setProductId(event.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" disabled={sourceQuery.isLoading || products.length === 0} data-testid="select-source-product">
                  <option value="">Chọn sản phẩm thực tế</option>
                  {products.map((product) => <option key={product.id} value={product.id}>{product.name} · còn {product.stock}</option>)}
                </select>
                {sourceQuery.data && !sourceQuery.data.online && <p className="flex items-center gap-1 text-[11px] text-destructive"><WifiOff className="h-3 w-3" />Nguồn hàng đang offline</p>}
              </div>
              <div className="space-y-1.5">
                 <Label htmlFor="auto-purchase-quantity">Tối đa mỗi lần mua</Label>
                <Input id="auto-purchase-quantity" type="number" min={1} step={1} value={quantity} onChange={(event) => setQuantity(event.target.value)} data-testid="input-rule-quantity" />
              </div>
            </div>
            {selectedProduct && (
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg border border-border/70 bg-muted/25 px-3 py-2.5 text-xs text-muted-foreground" data-testid="text-selected-product">
                <span className="font-medium text-foreground">{selectedProduct.name}</span>
                <span className="font-mono">Mã: {selectedProduct.id}</span>
                <span className="font-mono">Giá: {formatMoney(selectedProduct.price)}</span>
                <span className={`font-mono ${selectedProduct.stock > 0 ? "text-success" : "text-destructive"}`}>Tồn kho: {selectedProduct.stock}</span>
              </div>
            )}
            {products.length === 0 && !sourceQuery.isLoading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Boxes className="h-4 w-4" />Chưa có sản phẩm nguồn để chọn. Kiểm tra kết nối API nguồn hàng.</p>}
            <div className="flex justify-end gap-2 border-t border-border/70 pt-3">
              <Button variant="ghost" size="sm" onClick={() => setFormOpen(false)} data-testid="button-cancel-rule">Hủy</Button>
              <Button size="sm" onClick={handleCreate} disabled={createMutation.isPending || !products.length} className="gap-2" data-testid="button-create-rule">
                {createMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Tạo quy tắc
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {queryError && (
        <Card className="border-destructive/25 bg-destructive/[0.025]" data-testid="status-auto-purchase-error">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-start gap-2 text-sm text-destructive"><XCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>Không thể tải dữ liệu mua tự động. {queryError instanceof Error ? queryError.message : "Vui lòng thử lại."}</span></div>
            <Button variant="outline" size="sm" onClick={() => { sourceQuery.refetch(); rulesQuery.refetch(); }} data-testid="button-retry-auto-purchase">Thử lại</Button>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Danh sách quy tắc</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {rulesQuery.data?.intervalSeconds ? `Tự động kiểm tra mỗi ${rulesQuery.data.intervalSeconds} giây` : "Theo dõi trạng thái và kết quả từng quy tắc"}
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {sourceQuery.data?.online ? <Wifi className="h-3.5 w-3.5 text-success" /> : <WifiOff className="h-3.5 w-3.5 text-destructive" />}
          {sourceQuery.data?.online ? "Nguồn hàng trực tuyến" : "Nguồn hàng offline"}
          {sourceQuery.data?.checkedAt && <span className="font-mono">· {formatDate(sourceQuery.data.checkedAt)}</span>}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3" data-testid="loading-auto-purchase">
          {[1, 2].map((item) => <div key={item} className="h-48 animate-pulse rounded-lg bg-muted" />)}
        </div>
      ) : rules.length === 0 ? (
        <Card className="border-dashed" data-testid="empty-auto-purchase">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="rounded-xl bg-primary/10 p-3 text-primary"><PackageCheck className="h-7 w-7" /></div>
            <div><p className="font-medium">Chưa có quy tắc mua tự động</p><p className="mt-1 text-sm text-muted-foreground">Tạo quy tắc đầu tiên để hệ thống theo dõi và thực hiện một lần mua từ nguồn hàng.</p></div>
            <Button size="sm" className="mt-1 gap-2" onClick={() => setFormOpen(true)} data-testid="button-empty-new-rule"><Plus className="h-4 w-4" />Tạo quy tắc đầu tiên</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3" data-testid="list-auto-purchase-rules">
          {rules.map((rule) => <RuleCard key={rule.id} rule={rule} onToggle={() => handleToggle(rule)} onDelete={() => handleDelete(rule)} busy={busyRuleId === rule.id} />)}
        </div>
      )}

      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Clock3 className="h-3 w-3" />Dữ liệu quy tắc được làm mới tự động mỗi 30 giây.</p>
    </div>
  );
}