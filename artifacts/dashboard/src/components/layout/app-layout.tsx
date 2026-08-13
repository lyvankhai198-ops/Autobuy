import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, ShoppingCart, Settings, ArrowLeftRight,
  Server, Zap, Store, MoreHorizontal, Bell, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { type ReactNode, useState } from "react";

const mainNav = [
  { href: "/", label: "Tổng quan", icon: LayoutDashboard },
  { href: "/orders", label: "Đơn hàng", icon: ShoppingCart },
  { href: "/market", label: "Tự động", icon: Zap },
];

const moreNav = [
  { href: "/mappings", label: "Ánh Xạ Sản Phẩm", icon: ArrowLeftRight },
  { href: "/source-api", label: "API Nguồn Hàng", icon: Server },
  { href: "/config", label: "Cài Đặt", icon: Settings },
];

const sidebarGroups = [
  {
    label: "Vận Hành",
    items: [
      { href: "/", label: "Tổng Quan", icon: LayoutDashboard },
      { href: "/orders", label: "Đơn Hàng", icon: ShoppingCart },
    ],
  },
  {
    label: "Tự Động Hóa",
    items: [{ href: "/market", label: "Chợ Tự Động", icon: Store }],
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
  const [moreOpen, setMoreOpen] = useState(false);

  const isActive = (href: string) =>
    href === "/" ? location === "/" : location.startsWith(href);

  const isMoreActive = moreNav.some(item => isActive(item.href));

  return (
    <div className="flex min-h-screen w-full flex-col md:flex-row bg-background">

      {/* ════════════════ MOBILE ════════════════ */}

      {/* Top header — mobile only */}
      <header className="md:hidden fixed top-0 inset-x-0 z-40 h-[60px] bg-[#0D1117] flex items-center justify-between px-4 border-b border-white/[0.06]">
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div className="logo-icon h-[44px] w-[44px] rounded-full flex items-center justify-center shrink-0">
            <Zap className="h-[22px] w-[22px] text-white drop-shadow-sm" strokeWidth={2.5} />
          </div>
          <span className="logo-text text-[25px] text-white">
            Auto<span className="text-[#a78bfa]">Order</span>
          </span>
        </div>
        {/* Right icons */}
        <div className="flex items-center gap-3">
          <button className="text-slate-400 hover:text-slate-200 transition-colors">
            <Bell className="h-4.5 w-4.5" />
          </button>
          <div className="h-7 w-7 rounded-full bg-[#5B5BF7]/20 border border-[#5B5BF7]/40 flex items-center justify-center">
            <span className="text-[10px] font-bold text-[#8080ff]">AD</span>
          </div>
        </div>
      </header>

      {/* "Khác" slide-up overlay — mobile */}
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setMoreOpen(false)} />
          <div className="relative bg-white rounded-t-2xl pb-6 pt-2 shadow-2xl">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
              <span className="text-sm font-semibold">Khác</span>
              <button onClick={() => setMoreOpen(false)} className="text-muted-foreground hover:text-foreground p-1">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-3 pt-2">
              {moreNav.map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-3.5 rounded-xl transition-colors",
                    isActive(item.href)
                      ? "bg-[#5B5BF7]/8 text-[#5B5BF7] font-semibold"
                      : "text-foreground hover:bg-muted"
                  )}
                >
                  <item.icon className={cn("h-5 w-5", isActive(item.href) ? "text-[#5B5BF7]" : "text-muted-foreground")} />
                  <span className="text-[15px]">{item.label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bottom nav — mobile only */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 h-16 bg-white border-t border-border flex items-stretch">
        {mainNav.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-1 transition-colors",
              isActive(item.href) ? "text-[#5B5BF7]" : "text-muted-foreground"
            )}
          >
            <item.icon className="h-5 w-5" />
            <span className="text-[10px] font-medium">{item.label}</span>
          </Link>
        ))}
        <button
          onClick={() => setMoreOpen(true)}
          className={cn(
            "flex-1 flex flex-col items-center justify-center gap-1 transition-colors",
            isMoreActive ? "text-[#5B5BF7]" : "text-muted-foreground"
          )}
        >
          <MoreHorizontal className="h-5 w-5" />
          <span className="text-[10px] font-medium">Khác</span>
        </button>
      </nav>

      {/* ════════════════ DESKTOP ════════════════ */}

      {/* Sidebar */}
      <aside className="hidden md:flex w-56 shrink-0 flex-col bg-[#0D1117] min-h-screen sticky top-0">
        {/* Logo */}
        <div className="h-14 flex items-center px-4 shrink-0 gap-2.5">
          <div className="logo-icon h-8 w-8 rounded-full flex items-center justify-center shrink-0">
            <Zap className="h-4 w-4 text-white" strokeWidth={2.5} />
          </div>
          <span className="logo-text text-[18px] text-white">
            Auto<span className="text-[#a78bfa]">Order</span>
          </span>
        </div>

        {/* Nav groups */}
        <nav className="flex-1 overflow-auto px-2.5 py-3">
          <div className="flex flex-col gap-5">
            {sidebarGroups.map((group) => (
              <div key={group.label}>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 px-2.5 mb-1">
                  {group.label}
                </p>
                <div className="flex flex-col gap-0.5">
                  {group.items.map((item) => {
                    const active = isActive(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "group flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-all text-sm font-medium",
                          active
                            ? "bg-[#5B5BF7] text-white shadow-md shadow-[#5B5BF7]/25"
                            : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
                        )}
                      >
                        <item.icon className={cn("h-4 w-4 shrink-0", active ? "text-white" : "text-slate-500 group-hover:text-slate-300")} />
                        <span className="flex-1">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </nav>

        {/* Status footer */}
        <div className="p-3 pb-4">
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

      {/* ════════════════ CONTENT ════════════════ */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile: space for fixed header + bottom nav */}
        <div className="flex-1 overflow-auto pt-[84px] pb-16 md:pt-0 md:pb-0 px-4 md:px-7 md:py-7">
          <div className="mx-auto max-w-5xl">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
