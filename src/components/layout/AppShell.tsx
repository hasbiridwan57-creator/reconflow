/**
 * AppShell: sidebar navigasi + top header (spec §4.2 layout/).
 */
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wallet, Upload, History, LayoutDashboard } from "lucide-react";

const NAV = [
  { href: "/", label: "Beranda", icon: LayoutDashboard },
  { href: "/new", label: "Impor CSV", icon: Upload },
  { href: "/history", label: "Riwayat", icon: History },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900">
              <Wallet className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-semibold tracking-tight text-slate-900">ReconFlow</span>
          </Link>
          <nav className="flex items-center gap-1">
            {NAV.map((item) => {
              const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    active ? "bg-indigo-50 text-indigo-600" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto text-xs text-slate-400">Fullstack Audit-Ready · SQLite/Prisma</div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
