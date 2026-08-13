import { useGetOrderStats, useListRecentActivity } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
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

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tổng Quan</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Theo dõi luồng đơn hàng tự động thời gian thực.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={handleSyncNow} disabled={syncing}>
            <RotateCcw className={`h-3 w-3 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Đang đồng bộ..." : "Đồng bộ"}
          </Button>
          <Button variant="ghost" size="sm" className="gap-1.5 h-8 text-xs" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
            Làm mới
          </Button>
          <div className="flex items-center gap-1.5 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-3 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Đang hoạt động
          </div>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Tổng Đơn" value={stats?.total} icon={ShoppingBag}
          loading={statsLoading} accent="indigo"
        />
        <StatCard
          title="Chờ Xử Lý" value={stats?.pending} icon={Clock}
          loading={statsLoading} accent="amber"
          alert={!!stats?.pending}
        />
        <StatCard
          title="Hoàn Thành" value={stats?.fulfilled} icon={CheckCircle2}
          loading={statsLoading} accent="emerald"
        />
        <StatCard
          title="Thất Bại" value={stats?.failed} icon={XCircle}
          loading={statsLoading} accent="red"
          alert={!!stats?.failed}
        />
      </div>

      {/* ── Main grid ── */}
      <div className="grid gap-4 lg:grid-cols-3">

        {/* Recent activity — 2/3 */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-card border border-border/60 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
            <div>
              <h2 className="text-sm font-semibold">Hoạt Động Gần Đây</h2>
              <p className="text-xs text-muted-foreground mt-0.5">8 đơn hàng mới nhất</p>
            </div>
            <Link href="/orders" className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors">
              Xem tất cả <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {recentLoading ? (
            <div className="divide-y divide-border/60">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-3.5 animate-pulse">
                  <div className="h-8 w-8 bg-muted rounded-full shrink-0" />
                  <div className="space-y-2 flex-1">
                    <div className="h-3 bg-muted rounded w-1/4" />
                    <div className="h-2.5 bg-muted rounded w-1/3" />
                  </div>
                  <div className="h-5 w-16 bg-muted rounded-full" />
                </div>
              ))}
            </div>
          ) : !recentOrders?.length ? (
            <div className="flex flex-col items-center justify-center py-14 text-muted-foreground gap-3">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                <Zap className="h-5 w-5 opacity-30" />
              </div>
              <p className="text-sm">Chưa có đơn hàng nào.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {recentOrders.map((order) => (
                <Link href={`/orders/${order.id}`} key={order.id}>
                  <div className="flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors cursor-pointer">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-8 w-8 rounded-full bg-indigo-50 flex items-center justify-center shrink-0">
                        <span className="text-[10px] font-mono font-bold text-indigo-600">#{order.id}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {order.customerUsername ? `@${order.customerUsername}` : order.customerId}
                        </p>
                        <p className="text-[11px] text-muted-foreground font-mono">{formatDate(order.createdAt)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 ml-4 shrink-0">
                      <span className="text-xs text-muted-foreground hidden md:block max-w-[160px] truncate">{order.productType}</span>
                      <OrderStatusBadge status={order.status} />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4">

          {/* Today */}
          <div className="bg-white rounded-xl shadow-card border border-border/60 overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-border/60">
              <TrendingUp className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Hôm Nay</h2>
            </div>
            <div className="p-5 space-y-4">
              {statsLoading ? (
                <div className="space-y-4 animate-pulse">
                  <div className="h-10 bg-muted rounded" />
                  <div className="h-10 bg-muted rounded" />
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Tổng đơn</span>
                    <span className="text-3xl font-bold font-mono tabular-nums">{stats?.todayCount || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Hoàn thành</span>
                    <span className="text-3xl font-bold font-mono tabular-nums text-emerald-600">{stats?.todayFulfilled || 0}</span>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-2">
                      <span className="text-muted-foreground">Tỷ lệ thành công</span>
                      <span className="font-mono font-semibold">{successRate}%</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all duration-700"
                        style={{ width: `${successRate}%` }}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Bot status */}
          <div className="rounded-xl overflow-hidden bg-[#0D1117] border border-white/[0.06]">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-white/[0.06]">
              <Activity className="h-4 w-4 text-indigo-400" />
              <span className="text-sm font-semibold text-slate-200">Tự Động Hoạt Động</span>
            </div>
            <div className="p-5 space-y-3">
              {[
                { label: "Quét đơn", value: "mỗi 5 giây" },
                { label: "Đồng bộ kho", value: "mỗi 5 phút" },
                { label: "Canboso.com", value: "✓ Kết nối", highlight: true },
              ].map(({ label, value, highlight }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-xs text-slate-500 font-mono">{label}</span>
                  <span className={`text-xs font-mono font-semibold ${highlight ? "text-emerald-400" : "text-slate-300"}`}>{value}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

const accentMap = {
  indigo: {
    strip: "bg-indigo-500",
    icon: "bg-indigo-50 text-indigo-600",
    value: "text-foreground",
  },
  emerald: {
    strip: "bg-emerald-500",
    icon: "bg-emerald-50 text-emerald-600",
    value: "text-emerald-600",
  },
  amber: {
    strip: "bg-amber-400",
    icon: "bg-amber-50 text-amber-600",
    value: "text-amber-600",
  },
  red: {
    strip: "bg-red-500",
    icon: "bg-red-50 text-red-600",
    value: "text-red-600",
  },
};

function StatCard({
  title, value, icon: Icon, loading, accent, alert,
}: {
  title: string;
  value?: number;
  icon: any;
  loading: boolean;
  accent: keyof typeof accentMap;
  alert?: boolean;
}) {
  const colors = accentMap[accent];
  return (
    <div className={`bg-white rounded-xl shadow-card border border-border/60 overflow-hidden transition-shadow hover:shadow-card-hover ${alert ? "ring-1 ring-amber-300" : ""}`}>
      {/* accent strip */}
      <div className={`h-0.5 ${colors.strip}`} />
      <div className="px-5 pt-4 pb-5">
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">{title}</span>
          <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${colors.icon}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        {loading ? (
          <div className="h-9 w-20 bg-muted animate-pulse rounded" />
        ) : (
          <div className={`text-4xl font-bold font-mono tabular-nums leading-none ${value ? colors.value : "text-foreground"}`}>
            {value ?? 0}
          </div>
        )}
      </div>
    </div>
  );
}
