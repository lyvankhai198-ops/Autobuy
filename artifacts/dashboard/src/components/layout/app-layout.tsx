import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, ShoppingCart, Settings, ArrowLeftRight,
  Server, Zap, ChevronRight, Store
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
    <div className="flex min-h-screen w-full bg-background flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-60 border-b md:border-b-0 md:border-r border-border bg-card shrink-0 flex flex-col">

        {/* Logo */}
        <div className="h-14 flex items-center px-5 border-b border-border shrink-0 gap-2.5">
          <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <Zap className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-bold text-base tracking-tight">
            Auto<span className="text-primary">Order</span>
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-auto py-3 px-3 flex gap-4 md:flex-col md:gap-1">
          {/* Mobile: flat */}
          <div className="flex gap-1 md:hidden flex-wrap">
            {navGroups.flatMap(g => g.items).map((item) => {
              const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors text-sm font-medium whitespace-nowrap",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </div>

          {/* Desktop: grouped */}
          <div className="hidden md:flex flex-col gap-4 pt-1">
            {navGroups.map((group) => (
              <div key={group.label}>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 px-2 mb-1">
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
                          "group flex items-center gap-2.5 px-2.5 py-2 rounded-md transition-all text-sm font-medium",
                          isActive
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        )}
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        <span className="flex-1">{item.label}</span>
                        {isActive && <ChevronRight className="h-3 w-3 opacity-60" />}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </nav>

        {/* Footer status */}
        <div className="p-4 border-t border-border hidden md:block">
          <div className="flex items-center gap-2.5 px-2">
            <span className="h-2 w-2 rounded-full bg-success shrink-0 animate-pulse" />
            <div>
              <p className="text-xs font-semibold text-foreground">Hệ thống hoạt động</p>
              <p className="text-[10px] text-muted-foreground font-mono">Quét mỗi 5 giây</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
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
