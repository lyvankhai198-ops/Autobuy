import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Wifi, WifiOff, RefreshCw, Package, Wallet, Clock, AlertTriangle,
  CheckCircle2, XCircle
} from "lucide-react";
import { useState } from "react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface SourceProduct {
  id: string;
  name: string;
  price: number;
  stock: number;
  description: string;
}

interface SourceStatus {
  online: boolean;
  balance?: number;
  userId?: number;
  products?: SourceProduct[];
  checkedAt?: string;
  error?: string;
}

export default function SourceApi() {
  const [refetchKey, setRefetchKey] = useState(0);

  const { data, isLoading, isFetching, dataUpdatedAt } = useQuery<SourceStatus>({
    queryKey: ["source-status", refetchKey],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/source/status`);
      return res.json();
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const handleRefresh = () => setRefetchKey((k) => k + 1);

  const totalStock = data?.products?.reduce((sum, p) => sum + p.stock, 0) ?? 0;
  const inStockCount = data?.products?.filter((p) => p.stock > 0).length ?? 0;
  const outOfStockCount = (data?.products?.length ?? 0) - inStockCount;

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-10 bg-muted w-1/3 rounded" />
        <div className="h-32 bg-muted rounded" />
        <div className="h-64 bg-muted rounded" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-1">API Nguồn Hàng</h1>
          <p className="text-muted-foreground text-sm">
            Theo dõi tình trạng kết nối và kho hàng từ nhà cung cấp.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 shrink-0"
          onClick={handleRefresh}
          disabled={isFetching}
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Làm mới
        </Button>
      </div>

      {/* Status + Balance cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        {/* Online status */}
        <Card className={data?.online ? "border-success/30" : "border-destructive/30"}>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              {data?.online
                ? <div className="p-2 rounded-lg bg-success/10"><Wifi className="h-5 w-5 text-success" /></div>
                : <div className="p-2 rounded-lg bg-destructive/10"><WifiOff className="h-5 w-5 text-destructive" /></div>
              }
              <div>
                <div className="text-xs uppercase font-mono text-muted-foreground tracking-wide mb-0.5">Kết Nối</div>
                <div className={`font-bold text-lg leading-none ${data?.online ? "text-success" : "text-destructive"}`}>
                  {data?.online ? "Trực Tuyến" : "Offline"}
                </div>
              </div>
            </div>
            {data?.error && (
              <p className="mt-3 text-xs text-destructive flex items-start gap-1">
                <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                {data.error}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Balance */}
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Wallet className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="text-xs uppercase font-mono text-muted-foreground tracking-wide mb-0.5">Số Dư</div>
                <div className="font-bold text-lg leading-none tabular-nums">
                  {data?.balance !== undefined
                    ? `${data.balance.toLocaleString("vi-VN")}đ`
                    : "—"
                  }
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stock overview */}
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-info/10">
                <Package className="h-5 w-5 text-info" />
              </div>
              <div>
                <div className="text-xs uppercase font-mono text-muted-foreground tracking-wide mb-0.5">Kho Hàng</div>
                <div className="font-bold text-lg leading-none tabular-nums">
                  {totalStock.toLocaleString("vi-VN")} item
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {inStockCount} loại có hàng · {outOfStockCount} loại hết
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Last checked */}
      {data?.checkedAt && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
          <Clock className="h-3 w-3" />
          Cập nhật lúc {new Date(data.checkedAt).toLocaleTimeString("vi-VN")}
          &nbsp;·&nbsp;Tự động làm mới mỗi 60 giây
        </div>
      )}

      {/* Product list */}
      {data?.online && data.products && data.products.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              <CardTitle>Danh Sách Sản Phẩm</CardTitle>
            </div>
            <CardDescription>
              {data.products.length} sản phẩm từ nhà cung cấp — tồn kho thời gian thực.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {data.products
                .slice()
                .sort((a, b) => b.stock - a.stock)
                .map((product) => (
                  <div
                    key={product.id}
                    className={`flex items-center justify-between px-6 py-3 ${
                      product.stock === 0 ? "opacity-50 bg-muted/20" : ""
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {product.stock > 0
                        ? <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                        : <XCircle className="h-4 w-4 text-destructive shrink-0" />
                      }
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">{product.name}</div>
                        <div className="text-xs text-muted-foreground font-mono">{product.id}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0 ml-4">
                      <div className="text-right hidden sm:block">
                        <div className="text-xs text-muted-foreground">Giá nhập</div>
                        <div className="font-mono text-sm font-semibold">
                          {product.price.toLocaleString("vi-VN")}đ
                        </div>
                      </div>

                      <Badge
                        variant={product.stock > 10 ? "default" : product.stock > 0 ? "secondary" : "destructive"}
                        className="font-mono tabular-nums w-20 justify-center"
                      >
                        {product.stock > 0
                          ? `${product.stock} item`
                          : "Hết hàng"
                        }
                      </Badge>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {!data?.online && (
        <Card className="border-destructive/20">
          <CardContent className="pt-6 pb-6 text-center text-sm text-muted-foreground">
            <WifiOff className="h-8 w-8 mx-auto mb-3 text-destructive/40" />
            Không kết nối được API nguồn hàng.
            Kiểm tra URL và API Key trong trang <b>Cấu Hình</b>.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
