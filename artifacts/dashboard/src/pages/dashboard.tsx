import { useGetOrderStats, useListRecentActivity } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Activity, CheckCircle2, Clock, XCircle, ShoppingBag,
  TrendingUp, Zap, ArrowRight, RefreshCw, RotateCcw
} from "lucide-react";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { formatDate } from "@/lib/utils";
import { Link } from "wouter";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Dashboard() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const { data: stats, isLoading: statsLoading } = useGetOrderStats();
  const { data: recentOrders, isLoading: recentLoading } = useListRecentActivity({ limit: 8 });

  const successRate = stats?.todayCount
    ? Math.round(((stats.todayFulfilled || 0) / stats.todayCount) * 100)
    : 100;

  const handleRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries();
    setRefreshing(false);
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const res = await fetch(`${BASE}/api/actions/sync-now`, { method: "POST" });
      const data = await res.json();
      toast({
        title: data.ok ? "Đồng bộ xong!" : "Lỗi đồng bộ",
        description: data.message,
        variant: data.ok ? "default" : "destructive",
      });
      if (data.ok) queryClient.invalidateQueries();
    } catch {
      toast({ title: "Lỗi", description: "Không thể kết nối server.", variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tổng Quan</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Theo dõi luồng đơn hàng tự động thời gian thực.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={handleSyncNow}
            disabled={syncing}
          >
            <RotateCcw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Đang đồng bộ..." : "Đồng bộ ngay"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="gap-2"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Làm mới
          </Button>
          <div className="flex items-center gap-2 text-xs font-mono bg-success/10 text-success border border-success/20 rounded-full px-3 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
            Đang hoạt động
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Tổng Đơn" value={stats?.total} icon={ShoppingBag} loading={statsLoading} iconClass="bg-slate-100 text-slate-600" />
        <StatCard title="Chờ Xử Lý" value={stats?.pending} icon={Clock} loading={statsLoading} iconClass="bg-warning/10 text-warning" valueClass={stats?.pending ? "text-warning" : undefined} highlight={!!stats?.pending} />
        <StatCard title="Hoàn Thành" value={stats?.fulfilled} icon={CheckCircle2} loading={statsLoading} iconClass="bg-success/10 text-success" valueClass="text-success" />
        <StatCard title="Thất Bại" value={stats?.failed} icon={XCircle} loading={statsLoading} iconClass="bg-destructive/10 text-destructive" valueClass={stats?.failed ? "text-destructive" : undefined} />
      </div>

      {/* Main content */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Recent activity — 2/3 width */}
        <Card className="lg:col-span-2 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-border">
            <div>
              <CardTitle className="text-base">Hoạt Động Gần Đây</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">8 đơn hàng mới nhất</p>
            </div>
            <Link href="/orders" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              Xem tất cả <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {recentLoading ? (
              <div className="divide-y divide-border">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center gap-4 px-5 py-3.5 animate-pulse">
                    <div className="h-8 w-8 bg-muted rounded-full shrink-0" />
                    <div className="space-y-2 flex-1">
                      <div className="h-3.5 bg-muted rounded w-1/4" />
                      <div className="h-3 bg-muted rounded w-1/3" />
                    </div>
                    <div className="h-5 w-20 bg-muted rounded-full" />
                  </div>
                ))}
              </div>
            ) : !recentOrders?.length ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                <Zap className="h-8 w-8 opacity-20" />
                <p className="text-sm">Chưa có đơn hàng nào.</p>
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {recentOrders.map((order) => (
                  <Link href={`/orders/${order.id}`} key={order.id}>
                    <div className="flex items-center justify-between px-5 py-3 hover:bg-muted/40 transition-colors group cursor-pointer">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-8 w-8 rounded-full bg-primary/8 flex items-center justify-center shrink-0">
                          <span className="text-[10px] font-mono font-bold text-primary">#{order.id}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {order.customerUsername ? `@${order.customerUsername}` : order.customerId}
                          </p>
                          <p className="text-[11px] text-muted-foreground font-mono">{formatDate(order.createdAt)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 ml-4 shrink-0">
                        <span className="text-xs text-muted-foreground hidden md:block max-w-[180px] truncate">{order.productType}</span>
                        <OrderStatusBadge status={order.status} />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right column */}
        <div className="space-y-4">
          {/* Today's performance */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                <CardTitle className="text-base">Hôm Nay</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              {statsLoading ? (
                <div className="space-y-3 animate-pulse">
                  <div className="h-10 bg-muted rounded" />
                  <div className="h-10 bg-muted rounded" />
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Tổng đơn</span>
                    <span className="text-2xl font-bold font-mono">{stats?.todayCount || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Hoàn thành</span>
                    <span className="text-2xl font-bold font-mono text-success">{stats?.todayFulfilled || 0}</span>
                  </div>
                  <div className="pt-2">
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-muted-foreground">Tỷ lệ thành công</span>
                      <span className="font-mono font-semibold">{successRate}%</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-success rounded-full transition-all duration-500" style={{ width: `${successRate}%` }} />
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Poller status */}
          <Card className="shadow-sm bg-primary text-primary-foreground border-0">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 mb-3">
                <Activity className="h-4 w-4 opacity-80" />
                <span className="text-sm font-semibold">Tự Động Hoạt Động</span>
              </div>
              <div className="space-y-2 text-xs opacity-80 font-mono">
                <div className="flex justify-between">
                  <span>Quét đơn</span>
                  <span className="text-primary-foreground font-semibold opacity-100">mỗi 5 giây</span>
                </div>
                <div className="flex justify-between">
                  <span>Đồng bộ kho</span>
                  <span className="text-primary-foreground font-semibold opacity-100">mỗi 5 phút</span>
                </div>
                <div className="flex justify-between">
                  <span>Canboso.com</span>
                  <span className="text-success font-semibold opacity-100">✓ Kết nối</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title, value, icon: Icon, loading, iconClass, valueClass, highlight
}: {
  title: string; value?: number; icon: any; loading: boolean; iconClass?: string; valueClass?: string; highlight?: boolean;
}) {
  return (
    <Card className={`shadow-sm transition-shadow hover:shadow-md ${highlight ? "ring-1 ring-warning/30" : ""}`}>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</span>
          <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${iconClass}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        {loading ? (
          <div className="h-8 w-16 bg-muted animate-pulse rounded" />
        ) : (
          <div className={`text-3xl font-bold font-mono tabular-nums ${valueClass ?? ""}`}>{value ?? 0}</div>
        )}
      </CardContent>
    </Card>
  );
}
