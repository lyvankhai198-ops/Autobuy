import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, ShoppingCart, Settings, ArrowLeftRight,
  Server, Zap, Store,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { type ReactNode } from "react";

const navGroups = [
  {
    label: "Vận Hành",
    items: [
      { href: "/", label: "Tổng Quan", icon: LayoutDashboard },
      { href: "/orders", label: "Đơn Hàng", icon: ShoppingCart },
    ],
  },
  {
    label: "Tự Động Hóa",
    items: [
      { href: "/market", label: "Chợ Tự Động", icon: Store },
    ],
  },
  {
    label: "Cấu Hình",
    items: [
      { href: "/mappings", label: "Ánh Xạ Sản Phẩm", icon: ArrowLeftRight },
      { href: "/source-api", label: "API Nguồn Hàng", icon: Server },
      { href: "/config", label: "Cài Đặt", icon: Settings },
    ],
  },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="flex min-h-screen w-full flex-col md:flex-row bg-[#F0F2F5]">

      {/* ── Sidebar ── */}
      <aside className="w-full md:w-56 shrink-0 flex flex-col bg-[#0D1117] md:min-h-screen">

        {/* Logo */}
        <div className="h-14 flex items-center px-4 shrink-0 gap-2.5">
          <div className="h-7 w-7 rounded-lg bg-indigo-500 flex items-center justify-center shrink-0 shadow-lg shadow-indigo-500/30">
            <Zap className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="font-bold text-[15px] tracking-tight text-white">
            Auto<span className="text-indigo-400">Order</span>
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-auto py-2 px-2.5 flex gap-2 md:flex-col md:gap-0">

          {/* Mobile: flat row */}
          <div className="flex gap-1 md:hidden flex-wrap py-1">
            {navGroups.flatMap(g => g.items).map((item) => {
              const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-all",
                    isActive
                      ? "bg-indigo-500 text-white shadow-sm shadow-indigo-500/30"
                      : "text-slate-400 hover:bg-white/8 hover:text-white"
                  )}
                >
                  <item.icon className="h-3.5 w-3.5 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </div>

          {/* Desktop: grouped */}
          <div className="hidden md:flex flex-col gap-5 pt-2 pb-4">
            {navGroups.map((group) => (
              <div key={group.label}>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 px-2.5 mb-1">
                  {group.label}
                </p>
                <div className="flex flex-col gap-0.5">
                  {group.items.map((item) => {
                    const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "group flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-all text-sm font-medium",
                          isActive
                            ? "bg-indigo-500 text-white shadow-md shadow-indigo-500/25"
                            : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
                        )}
                      >
                        <item.icon className={cn("h-4 w-4 shrink-0", isActive ? "text-white" : "text-slate-500 group-hover:text-slate-300")} />
                        <span className="flex-1">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </nav>

        {/* Footer status */}
        <div className="p-3 pb-4 hidden md:block">
          <div className="flex items-center gap-2.5 bg-white/[0.04] rounded-lg px-3 py-2.5 border border-white/[0.06]">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <div>
              <p className="text-[11px] font-semibold text-slate-300">Hệ thống hoạt động</p>
              <p className="text-[10px] text-slate-600 font-mono">Quét mỗi 5 giây</p>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex-1 overflow-auto p-4 md:p-7">
          <div className="mx-auto max-w-5xl">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
