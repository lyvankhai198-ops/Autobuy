import { useGetOrderStats, useListRecentActivity } from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Activity, CheckCircle2, Clock, XCircle, ShoppingBag,
  ArrowRight, RefreshCw, RotateCcw, Wifi, Database, Bot,
} from "lucide-react";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { formatDate } from "@/lib/utils";
import { Link } from "wouter";
import { useState, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type ChartPeriod = "7d" | "30d" | "3m";
type ChartRow = { date: string; total: number; fulfilled: number; failed: number };

/** Fill missing days in the range with zeros */
function fillChartGaps(rows: ChartRow[], period: ChartPeriod): ChartRow[] {
  const days = period === "30d" ? 30 : period === "3m" ? 90 : 7;
  const map = new Map(rows.map(r => [r.date, r]));
  const result: ChartRow[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    result.push(map.get(key) ?? { date: key, total: 0, fulfilled: 0, failed: 0 });
  }
  return result;
}

function shortDate(date: string, period: ChartPeriod) {
  const d = new Date(date + "T00:00:00");
  if (period === "3m") {
    return d.toLocaleDateString("vi-VN", { month: "short", day: "numeric" });
  }
  if (period === "30d") {
    return d.toLocaleDateString("vi-VN", { day: "numeric", month: "numeric" });
  }
  // 7d: show weekday
  const days = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
  return days[d.getDay()];
}

// Custom tooltip
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-border rounded-lg shadow-card px-3 py-2 text-xs">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      <p className="text-emerald-600">Hoàn thành: <b>{payload[0]?.value ?? 0}</b></p>
      <p className="text-red-500">Thất bại: <b>{payload[1]?.value ?? 0}</b></p>
    </div>
  );
}

export default function Dashboard() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [period, setPeriod] = useState<ChartPeriod>("7d");

  const { data: stats, isLoading: statsLoading } = useGetOrderStats();
  const { data: recentOrders, isLoading: recentLoading } = useListRecentActivity({ limit: 8 });

  const { data: chartRes } = useQuery<{ data: ChartRow[] }>({
    queryKey: ["orders-chart", period],
    queryFn: () => fetch(`${BASE}/api/orders/chart?period=${period}`).then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  const chartData = chartRes?.data
    ? fillChartGaps(chartRes.data, period).map(r => ({
        ...r,
        label: shortDate(r.date, period),
      }))
    : [];

  const total = stats?.total ?? 0;
  const fulfilled = stats?.fulfilled ?? 0;
  const failed = stats?.failed ?? 0;
  const pending = (stats?.pending ?? 0) + (stats?.processing ?? 0);

  const successRate = total > 0 ? ((fulfilled / total) * 100).toFixed(1) : "0.0";
  const failRate = total > 0 ? ((failed / total) * 100).toFixed(1) : "0.0";

  const handleSyncNow = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await fetch(`${BASE}/api/actions/sync-now`, { method: "POST" });
      const data = await res.json();
      toast({
        title: data.ok ? "Đồng bộ xong!" : "Lỗi đồng bộ",
        description: data.message,
        variant: data.ok ? "default" : "destructive",
      });
      if (data.ok) {
        setLastSync(new Date());
        queryClient.invalidateQueries();
      }
    } catch {
      toast({ title: "Lỗi", description: "Không thể kết nối server.", variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  }, []);

  const fmtSyncTime = lastSync
    ? lastSync.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div>

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3">
        {/* Left: title + subtitle + mobile status row */}
        <div>
          <h1 className="text-[31px] font-bold tracking-tight leading-tight">Tổng quan</h1>
          <p className="text-muted-foreground text-[15px] mt-[7px]">Theo dõi hoạt động hệ thống và đơn hàng.</p>
          {/* Mobile: status + refresh below subtitle */}
          <div className="flex items-center gap-2 mt-[24px] md:hidden">
            <Button
              variant="ghost" size="sm" className="gap-1.5 h-8 text-[13px] px-2"
              onClick={() => queryClient.invalidateQueries()}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
            <div className="flex items-center gap-1.5 text-[12px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-3 py-1.5 whitespace-nowrap">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Hệ thống OK
            </div>
          </div>
        </div>
        {/* Desktop: buttons on right */}
        <div className="hidden md:flex items-center gap-2.5">
          <div className="text-right">
            <Button
              variant="outline" size="sm" className="gap-1.5 h-8 text-[13px]"
              onClick={handleSyncNow} disabled={syncing}
            >
              <RotateCcw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Đang đồng bộ…" : "Đồng bộ"}
            </Button>
            {fmtSyncTime && (
              <p className="text-[10px] text-muted-foreground mt-0.5">Cập nhật: {fmtSyncTime}</p>
            )}
          </div>
          <Button
            variant="ghost" size="sm" className="gap-1.5 h-8 text-[13px]"
            onClick={() => queryClient.invalidateQueries()}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Làm mới</span>
          </Button>
          <div className="flex items-center gap-1.5 text-[12px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-3 py-1.5 whitespace-nowrap">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Hệ thống OK
          </div>
        </div>
      </div>

      {/* ── KPI 2×2 ── */}
      <div className="mt-[30px] grid grid-cols-2 gap-3">
        <KpiCard
          label="Tổng đơn" value={total} loading={statsLoading}
          icon={ShoppingBag} iconColor="text-[#5B5BF7]" iconBg="bg-[#5B5BF7]/8"
          sub="Toàn bộ đơn hàng"
        />
        <KpiCard
          label="Chờ xử lý" value={pending} loading={statsLoading}
          icon={Clock} iconColor="text-amber-600" iconBg="bg-amber-50"
          sub={pending > 0 ? "Cần xử lý ngay" : "Không có"}
          subColor={pending > 0 ? "text-amber-600 font-semibold" : undefined}
          alert={pending > 0}
        />
        <KpiCard
          label="Hoàn thành" value={fulfilled} loading={statsLoading}
          icon={CheckCircle2} iconColor="text-emerald-600" iconBg="bg-emerald-50"
          sub={`${successRate}% tổng đơn`}
          subColor="text-emerald-600"
        />
        <KpiCard
          label="Thất bại" value={failed} loading={statsLoading}
          icon={XCircle} iconColor="text-red-500" iconBg="bg-red-50"
          sub={failed > 0 ? `${failRate}% tổng đơn` : "Không có"}
          subColor={failed > 0 ? "text-red-500" : undefined}
          alert={failed > 0}
        />
      </div>

      {/* ── Chart ── */}
      <div className="mt-[30px] bg-white rounded-xl shadow-card border border-border/60 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
          <h2 className="text-[13px] font-semibold">Đơn hàng theo ngày</h2>
          <div className="flex gap-1 bg-muted rounded-lg p-0.5">
            {(["7d", "30d", "3m"] as ChartPeriod[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all ${
                  period === p
                    ? "bg-white text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {p === "7d" ? "7 ngày" : p === "30d" ? "30 ngày" : "3 tháng"}
              </button>
            ))}
          </div>
        </div>
        <div className="px-2 py-4 h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gradFulfilled" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#5B5BF7" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#5B5BF7" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradFailed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.12} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="#f0f0f0" />
              <XAxis
                dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }}
                axisLine={false} tickLine={false}
                interval={period === "3m" ? 13 : period === "30d" ? 4 : 0}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                axisLine={false} tickLine={false} allowDecimals={false}
              />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone" dataKey="fulfilled" name="Hoàn thành"
                stroke="#5B5BF7" strokeWidth={2} fill="url(#gradFulfilled)"
                dot={false} activeDot={{ r: 3, fill: "#5B5BF7" }}
              />
              <Area
                type="monotone" dataKey="failed" name="Thất bại"
                stroke="#ef4444" strokeWidth={1.5} fill="url(#gradFailed)"
                dot={false} activeDot={{ r: 3, fill: "#ef4444" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Main 2-col ── */}
      <div className="mt-[30px] grid gap-4 lg:grid-cols-3">

        {/* Recent orders — 2/3 */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-card border border-border/60 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/60">
            <h2 className="text-[13px] font-semibold">Đơn hàng gần đây</h2>
            <Link href="/orders" className="flex items-center gap-1 text-[12px] font-medium text-primary hover:text-primary/80 transition-colors">
              Xem tất cả <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {recentLoading ? (
            <div className="divide-y divide-border/50">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-3 animate-pulse">
                  <div className="h-7 w-14 bg-muted rounded shrink-0" />
                  <div className="h-3 bg-muted rounded flex-1" />
                  <div className="h-5 w-16 bg-muted rounded-full" />
                </div>
              ))}
            </div>
          ) : !recentOrders?.length ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
              <ShoppingBag className="h-8 w-8 opacity-20" />
              <p className="text-[13px]">Chưa có đơn hàng nào.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {recentOrders.map((order) => (
                <Link href={`/orders/${order.id}`} key={order.id}>
                  <div className="flex items-center justify-between px-5 py-2.5 hover:bg-slate-50/80 transition-colors cursor-pointer">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-[11px] font-mono font-semibold text-muted-foreground shrink-0 w-12">
                        #{order.id}
                      </span>
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium truncate leading-snug">
                          {order.productType || (order.customerUsername ? `@${order.customerUsername}` : `User ${order.customerId}`)}
                        </p>
                        <p className="text-[11px] text-muted-foreground font-mono">{formatDate(order.createdAt)}</p>
                      </div>
                    </div>
                    <OrderStatusBadge status={order.status} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Right: Today + System status */}
        <div className="space-y-4">

          {/* Today stats */}
          <div className="bg-white rounded-xl shadow-card border border-border/60 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border/60">
              <h2 className="text-[13px] font-semibold">Hôm nay</h2>
            </div>
            <div className="p-5 space-y-3.5">
              {statsLoading ? (
                <div className="space-y-3 animate-pulse">
                  <div className="h-10 bg-muted rounded" />
                  <div className="h-10 bg-muted rounded" />
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] text-muted-foreground">Tổng đơn</span>
                    <span className="text-[28px] font-bold font-mono tabular-nums leading-none">
                      {stats?.todayCount ?? 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] text-muted-foreground">Hoàn thành</span>
                    <span className="text-[28px] font-bold font-mono tabular-nums leading-none text-emerald-600">
                      {stats?.todayFulfilled ?? 0}
                    </span>
                  </div>
                  <div>
                    <div className="flex justify-between text-[11px] mb-1.5">
                      <span className="text-muted-foreground">Tỷ lệ thành công</span>
                      <span className="font-mono font-semibold">
                        {stats?.todayCount
                          ? Math.round(((stats.todayFulfilled ?? 0) / stats.todayCount) * 100)
                          : 100}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all duration-700"
                        style={{
                          width: `${stats?.todayCount
                            ? Math.round(((stats.todayFulfilled ?? 0) / stats.todayCount) * 100)
                            : 100}%`
                        }}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* System status */}
          <div className="bg-white rounded-xl shadow-card border border-border/60 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border/60">
              <h2 className="text-[13px] font-semibold">Trạng thái hệ thống</h2>
            </div>
            <div className="px-5 py-4 space-y-3">
              {[
                { icon: Bot, label: "Bot đặt hàng", status: "online" },
                { icon: RefreshCw, label: "Auto fulfillment", status: "online" },
                { icon: Wifi, label: "API nguồn hàng", status: "online" },
                { icon: Database, label: "Database", status: "online" },
              ].map(({ icon: Icon, label, status }) => (
                <div key={label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[13px] text-foreground">{label}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    <span className="text-[11px] text-emerald-600 font-medium">Hoạt động</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-5 py-2.5 border-t border-border/60 bg-muted/30">
              <p className="text-[11px] text-muted-foreground font-mono">
                Quét đơn: mỗi 5 giây · Đồng bộ kho: mỗi 5 phút
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

function KpiCard({
  label, value, loading, icon: Icon,
  iconColor, iconBg, sub, subColor, alert,
}: {
  label: string; value: number; loading: boolean;
  icon: any; iconColor: string; iconBg: string;
  sub: string; subColor?: string; alert?: boolean;
}) {
  return (
    <div className={`bg-white rounded-xl shadow-card border border-border/60 px-4 py-3.5 transition-shadow hover:shadow-card-hover ${alert ? "ring-1 ring-amber-300/60" : ""}`}>
      <div className="flex items-start justify-between mb-2">
        <span className="text-[12px] font-semibold text-muted-foreground">{label}</span>
        <div className={`h-7 w-7 rounded-lg flex items-center justify-center ${iconBg}`}>
          <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
        </div>
      </div>
      {loading ? (
        <div className="h-8 w-14 bg-muted animate-pulse rounded mt-1" />
      ) : (
        <div className="text-[32px] font-bold font-mono tabular-nums leading-none mb-1">
          {value}
        </div>
      )}
      <p className={`text-[11px] mt-1 ${subColor ?? "text-muted-foreground"}`}>{sub}</p>
    </div>
  );
}
