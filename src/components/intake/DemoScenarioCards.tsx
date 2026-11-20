/**
 * 3 kartu skenario demo siap klik (spec §10.2 Halaman 1).
 */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { Coffee, ShoppingCart, ShieldAlert } from "lucide-react";

const SCENARIOS = [
  {
    key: "umkm" as const,
    title: "Skenario 1 — Operasional Normal UMKM",
    company: "PT Kopi Nusantara Sejahtera",
    badge: "Dasar",
    badgeClass: "bg-emerald-50 text-emerald-600 border-emerald-200",
    highlights: "Timing difference 1 hari, Deposit in Transit, Cek Beredar, Jasa Giro & Admin",
    icon: Coffee,
  },
  {
    key: "ecommerce" as const,
    title: "Skenario 2 — E-Commerce & Timing Difference",
    company: "CV Gaya Minimalis Indonesia",
    badge: "Menengah",
    badgeClass: "bg-amber-50 text-amber-600 border-amber-200",
    highlights: "Pencairan Shopee/Tokopedia/TikTok Shop selisih 1-2 hari, Unrecorded Reseller Transfer, BI-FAST",
    icon: ShoppingCart,
  },
  {
    key: "audit" as const,
    title: "Skenario 3 — Kasus Audit & Anomali",
    company: "PT Sinar Logistik Mandiri",
    badge: "Audit / Lanjutan",
    badgeClass: "bg-rose-50 text-rose-600 border-rose-200",
    highlights: "Transposition Error BBM, Double Charge Allianz, Cek Kosong NSF, Unknown Cloud Charge",
    icon: ShieldAlert,
  },
];

export function DemoScenarioCards() {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  async function launch(key: "umkm" | "ecommerce" | "audit") {
    setLoading(key);
    try {
      const { id } = await api.createDemo(key);
      toast.success("Skenario demo dimuat, auto-match dijalankan.");
      router.push(`/workspace/${id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal memuat skenario.");
      setLoading(null);
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {SCENARIOS.map((s) => {
        const Icon = s.icon;
        const isLoading = loading === s.key;
        return (
          <button
            key={s.key}
            onClick={() => launch(s.key)}
            disabled={loading !== null}
            className="group flex flex-col rounded-xl border border-slate-200 bg-white p-5 text-left shadow-xs transition hover:border-teal-300 hover:shadow-sm disabled:opacity-60"
          >
            <div className="flex items-center justify-between">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600 group-hover:bg-teal-50 group-hover:text-teal-600">
                <Icon className="h-5 w-5" />
              </div>
              <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${s.badgeClass}`}>{s.badge}</span>
            </div>
            <div className="mt-4 text-sm font-semibold text-slate-900">{s.title}</div>
            <div className="mt-1 text-xs text-slate-500">{s.company}</div>
            <div className="mt-3 text-xs leading-relaxed text-slate-600">{s.highlights}</div>
            <div className="mt-4 text-sm font-medium text-teal-600">
              {isLoading ? "Memuat..." : "Muat Skenario →"}
            </div>
          </button>
        );
      })}
    </div>
  );
}
