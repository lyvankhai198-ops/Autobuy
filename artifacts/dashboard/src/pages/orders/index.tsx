import { useListOrders } from "@workspace/api-client-react";
import { useState, useMemo } from "react";
import { ListOrdersStatus } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { formatDate } from "@/lib/utils";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, ChevronLeft, ChevronRight, Download, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const STATUS_FILTERS: { label: string, value: ListOrdersStatus | "all" }[] = [
  { label: "Tất Cả", value: "all" },
  { label: "Chờ Xử Lý", value: "pending" },
  { label: "Đang Xử Lý", value: "processing" },
  { label: "Hoàn Thành", value: "fulfilled" },
  { label: "Thất Bại", value: "failed" },
];

const PAGE_SIZE = 10;
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function exportToCsv(orders: any[]) {
  const headers = ["ID", "Khách hàng", "Telegram ID", "Sản phẩm", "Trạng thái", "Thời gian"];
  const rows = orders.map(o => [
    o.id,
    o.customerUsername ? `@${o.customerUsername}` : "",
    o.customerId ?? "",
    `"${(o.productType ?? "").replace(/"/g, '""')}"`,
    o.status,
    formatDate(o.createdAt),
  ]);
  const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Orders() {
  const [statusFilter, setStatusFilter] = useState<ListOrdersStatus | "all">("all");
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);
  const [, setLocation] = useLocation();

  const queryParams: any = { limit: PAGE_SIZE, offset };
  if (statusFilter !== "all") queryParams.status = statusFilter;

  const { data: orders, isLoading } = useListOrders(queryParams);

  // Client-side search filter
  const filtered = useMemo(() => {
    if (!orders || !search.trim()) return orders ?? [];
    const q = search.trim().toLowerCase();
    return orders.filter(o =>
      (o.customerUsername ?? "").toLowerCase().includes(q) ||
      (o.customerId ?? "").toLowerCase().includes(q) ||
      (o.productType ?? "").toLowerCase().includes(q) ||
      String(o.id).includes(q)
    );
  }, [orders, search]);

  const handleFilterChange = (value: ListOrdersStatus | "all") => {
    setStatusFilter(value);
    setOffset(0);
    setSearch("");
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams({ limit: "1000", offset: "0" });
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetch(`${BASE}/api/orders?${params}`);
      const data = await res.json();
      exportToCsv(Array.isArray(data) ? data : []);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-1">Nhật Ký Đơn Hàng</h1>
          <p className="text-muted-foreground text-sm">Xem và quản lý tất cả đơn hàng tự động.</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 shrink-0"
          onClick={handleExport}
          disabled={exporting}
        >
          <Download className="h-4 w-4" />
          {exporting ? "Đang xuất..." : "Xuất CSV"}
        </Button>
      </div>

      <Card className="border-border shadow-sm">
        <CardHeader className="p-4 border-b border-border bg-muted/20 space-y-3">
          {/* Status filter badges */}
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map(filter => (
              <Badge
                key={filter.value}
                variant={statusFilter === filter.value ? "default" : "outline"}
                className="cursor-pointer hover:bg-primary hover:text-primary-foreground px-3 py-1.5 text-xs font-semibold transition-colors"
                onClick={() => handleFilterChange(filter.value)}
              >
                {filter.label}
              </Badge>
            ))}
          </div>
          {/* Search bar */}
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={e => { setSearch(e.target.value); setOffset(0); }}
              placeholder="Tìm theo username, ID, sản phẩm..."
              className="pl-9 pr-9 h-8 text-sm font-mono"
            />
            {search && (
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setSearch("")}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow className="hover:bg-transparent border-b-border">
                <TableHead className="w-[100px] font-mono uppercase text-xs tracking-wider">ID</TableHead>
                <TableHead className="uppercase text-xs tracking-wider">Khách Hàng</TableHead>
                <TableHead className="uppercase text-xs tracking-wider">Sản Phẩm</TableHead>
                <TableHead className="uppercase text-xs tracking-wider">Trạng Thái</TableHead>
                <TableHead className="uppercase text-xs tracking-wider">Thời Gian</TableHead>
                <TableHead className="text-right uppercase text-xs tracking-wider">Thao Tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center">
                    <div className="flex justify-center items-center gap-2 text-muted-foreground font-mono text-sm uppercase">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      Đang tải dữ liệu...
                    </div>
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground font-mono text-sm uppercase">
                    {search ? `Không tìm thấy kết quả cho "${search}"` : "Không tìm thấy đơn hàng nào"}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((order) => (
                  <TableRow
                    key={order.id}
                    className="cursor-pointer hover:bg-muted/50 transition-colors border-b-border/50 group"
                    onClick={() => setLocation(`/orders/${order.id}`)}
                  >
                    <TableCell className="font-mono font-medium">#{order.id}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium text-sm">{order.customerUsername ? `@${order.customerUsername}` : "Không rõ"}</span>
                        <span className="text-[10px] text-muted-foreground font-mono">{order.customerId}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium text-sm">{order.productType}</TableCell>
                    <TableCell><OrderStatusBadge status={order.status} /></TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">{formatDate(order.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity" asChild onClick={(e) => e.stopPropagation()}>
                        <Link href={`/orders/${order.id}`}>
                          <Eye className="h-4 w-4" />
                          <span className="sr-only">Xem</span>
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between p-4 border-t border-border bg-muted/20">
            <div className="text-xs font-mono text-muted-foreground">
              {search
                ? <span>Tìm thấy <span className="text-foreground font-semibold">{filtered.length}</span> kết quả</span>
                : <span>Từ bản ghi: <span className="text-foreground">{offset + 1}</span></span>
              }
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setOffset(o => Math.max(0, o - PAGE_SIZE))} disabled={offset === 0 || isLoading || !!search} className="font-mono text-xs uppercase h-8">
                <ChevronLeft className="h-4 w-4 mr-1" />Trước
              </Button>
              <Button variant="outline" size="sm" onClick={() => setOffset(o => o + PAGE_SIZE)} disabled={!orders || orders.length < PAGE_SIZE || isLoading || !!search} className="font-mono text-xs uppercase h-8">
                Tiếp<ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
