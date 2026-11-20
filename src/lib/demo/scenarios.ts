/**
 * 3 Skenario demo dengan dataset CSV persis dari RECONFLOW_MASTER_SPEC.md §11.
 * Semua angka sudah diverifikasi & dipakai automated test.
 */
import type { MatchingConfig } from "@/lib/schemas/reconciliation";

export interface DemoScenario {
  scenarioKey: "umkm" | "ecommerce" | "audit";
  companyName: string;
  bankAccountName: string;
  periodLabel: string;
  periodEndDate: string;
  openingBalance: number;
  endingBankBalance: number;
  endingBookBalance: number;
  bankCsv: string;
  bookCsv: string;
}

export const DEFAULT_MATCHING_CONFIG: MatchingConfig = {
  dateToleranceDays: 5,
  amountToleranceRupiah: 100000,
  minFuzzyScore: 0.35,
  detectTransposition: true,
};

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    scenarioKey: "umkm",
    companyName: "PT Kopi Nusantara Sejahtera",
    bankAccountName: "BCA Bisnis - 8820194421",
    periodLabel: "Oktober 2026",
    periodEndDate: "2026-10-31",
    openingBalance: 50000000,
    endingBankBalance: 68181000,
    endingBookBalance: 73300000,
    bankCsv: `tanggal,no_referensi,keterangan,debit_keluar,kredit_masuk,saldo
2026-10-02,BNK-1001,"CR QRIS SETTLEMENT 01-02 OKT",0,14500000,64500000
2026-10-05,BNK-1002,"DB TRF PT ROASTERY JAYA",8200000,0,56300000
2026-10-10,BNK-1003,"DB AUTODEBIT PLN & PDAM",1850000,0,54450000
2026-10-16,BNK-1004,"CR KLIRING CATERING BUMN",0,18750000,73200000
2026-10-20,BNK-1005,"DB SEWA RUKO OKT 2026",12000000,0,61200000
2026-10-25,BNK-1006,"DB PAYROLL KARYAWAN OKT",15500000,0,45700000
2026-10-28,BNK-1007,"CR QRIS SETTLEMENT 20-27 OKT",0,22400000,68100000
2026-10-31,BNK-1008,"CR JASA GIRO OKT 2026",0,145000,68245000
2026-10-31,BNK-1009,"DB PAJAK JASA GIRO 20%",29000,0,68216000
2026-10-31,BNK-1010,"DB BIAYA ADMIN BULANAN",35000,0,68181000`,
    bookCsv: `tanggal,no_bukti,deskripsi,akun_lawan,debit_masuk,kredit_keluar,saldo
2026-10-02,BKM-001,"Penjualan Kopi QRIS 01-02 Okt","Pendapatan Penjualan",14500000,0,64500000
2026-10-05,BKK-001,"Pembelian Biji Kopi PT Roastery Jaya","Persediaan Bahan Baku",0,8200000,56300000
2026-10-10,BKK-002,"Bayar Listrik & Air Outlet","Beban Utilitas",0,1850000,54450000
2026-10-15,BKM-002,"Pembayaran Catering Event BUMN","Pendapatan Catering",18750000,0,73200000
2026-10-20,BKK-003,"Sewa Ruko Bulan Oktober 2026","Beban Sewa",0,12000000,61200000
2026-10-25,BKK-004,"Gaji Barista & Staff Oktober","Beban Gaji",0,15500000,45700000
2026-10-28,BKM-003,"Penjualan Kopi QRIS 20-27 Okt","Pendapatan Penjualan",22400000,0,68100000
2026-10-30,BKK-005,"Cek #4012 Pembelian Cup & Kemasan CV Packindo","Persediaan Kemasan",0,4600000,63500000
2026-10-31,BKM-004,"Setoran Tunai Penjualan 28-31 Okt","Pendapatan Penjualan",9800000,0,73300000`,
  },
  {
    scenarioKey: "ecommerce",
    companyName: "CV Gaya Minimalis Indonesia",
    bankAccountName: "Mandiri Giro - 14400982100",
    periodLabel: "Oktober 2026",
    periodEndDate: "2026-10-31",
    openingBalance: 125000000,
    endingBankBalance: 208925500,
    endingBookBalance: 215900000,
    bankCsv: `tanggal,no_referensi,keterangan,debit_keluar,kredit_masuk,saldo
2026-10-03,TRF-901,"CR SHOPEE INTL ID PAYOUT #8821",0,42600000,167600000
2026-10-06,TRF-902,"DB META ADS IRELAND BILLING",14250000,0,153350000
2026-10-09,TRF-903,"CR TOKOPEDIA ESCROW BATCH 10A",0,31800000,185150000
2026-10-12,TRF-904,"DB JNE EXPRESS INVOICE OKT-1",6750000,0,178400000
2026-10-15,TRF-905,"CR TIKTOK SHOP SETTLEMENT W2",0,27450000,205850000
2026-10-18,TRF-906,"DB TRF KONVEKSI BANDUNG JAYA",38000000,0,167850000
2026-10-18,TRF-907,"DB BIAYA BI-FAST",2500,0,167847500
2026-10-22,TRF-908,"CR TRF TOKO RESELLER SURABAYA",0,16500000,184347500
2026-10-25,TRF-909,"DB PAYROLL TIM DIGITAL & GUDANG",24500000,0,159847500
2026-10-27,TRF-910,"CR SHOPEE INTL ID PAYOUT #8940",0,48900000,208747500
2026-10-31,TRF-911,"DB BIAYA ADMIN & TOKEN BISNIS",50000,0,208697500
2026-10-31,TRF-912,"CR BUNGA GIRO OKT",0,285000,208982500
2026-10-31,TRF-913,"DB PAJAK BUNGA GIRO",57000,0,208925500`,
    bookCsv: `tanggal,no_bukti,deskripsi,akun_lawan,debit_masuk,kredit_keluar,saldo
2026-10-01,KM-201,"Pencairan Saldo Shopee Batch #8821","Piutang Marketplace",42600000,0,167600000
2026-10-06,KK-201,"Pembayaran Iklan Meta Ads Oktober","Beban Pemasaran",0,14250000,153350000
2026-10-08,KM-202,"Settlement Tokopedia Batch 10A","Piutang Marketplace",31800000,0,185150000
2026-10-12,KK-202,"Tagihan Ekspedisi JNE Express","Beban Pengiriman",0,6750000,178400000
2026-10-13,KM-203,"Pencairan TikTok Shop Minggu 2","Piutang Marketplace",27450000,0,205850000
2026-10-18,KK-203,"Pelunasan PO Kain Konveksi Bandung Jaya","Utang Usaha",0,38000000,167850000
2026-10-25,KK-204,"Gaji Tim Digital Marketing & Gudang","Beban Gaji",0,24500000,143350000
2026-10-25,KM-204,"Pencairan Saldo Shopee Batch #8940","Piutang Marketplace",48900000,0,192250000
2026-10-29,KK-205,"Bilyet Giro #BG-882 Pembelian Packaging Box","Persediaan Kemasan",0,11400000,180850000
2026-10-30,KM-205,"Withdraw TikTok Shop Akhir Bulan","Piutang Marketplace",19300000,0,200150000
2026-10-31,KM-206,"Withdraw Tokopedia Akhir Bulan","Piutang Marketplace",15750000,0,215900000`,
  },
  {
    scenarioKey: "audit",
    companyName: "PT Sinar Logistik Mandiri",
    bankAccountName: "BNI Korporasi - 0091827364",
    periodLabel: "Oktober 2026",
    periodEndDate: "2026-10-31",
    openingBalance: 340000000,
    endingBankBalance: 369296000,
    endingBookBalance: 405160000,
    bankCsv: `tanggal,no_referensi,keterangan,debit_keluar,kredit_masuk,saldo
2026-10-02,B-501,"CR PELUNASAN INV-091 PT GARUDA FOOD",0,85000000,425000000
2026-10-05,B-502,"DB PERTAMINA FLEET CARD BBM",12450000,0,412550000
2026-10-08,B-503,"CR SETORAN CEK PT MAJU JAYA",0,15000000,427550000
2026-10-10,B-504,"DB RETUR CEK KOSONG PT MAJU JAYA (NSF)",15000000,0,412550000
2026-10-10,B-505,"DB BIAYA PENOLAKAN CEK KOSONG",125000,0,412425000
2026-10-14,B-506,"DB AUTODEBIT ASURANSI ARMADA ALLIANZ",8500000,0,403925000
2026-10-14,B-507,"DB AUTODEBIT ASURANSI ARMADA ALLIANZ",8500000,0,395425000
2026-10-18,B-508,"CR PELUNASAN INV-094 PT INDOFARMA",0,62500000,457925000
2026-10-21,B-509,"DB SERVIS TRUK PT HINO MOTOR",19800000,0,438125000
2026-10-23,B-510,"DB CARD DEBIT UNKNOWN SAAS CLOUD USD",1250000,0,436875000
2026-10-26,B-511,"DB PAYROLL DRIVER & OPERASIONAL",68000000,0,368875000
2026-10-31,B-512,"CR JASA GIRO KORPORASI",0,620000,369495000
2026-10-31,B-513,"DB PAJAK JASA GIRO",124000,0,369371000
2026-10-31,B-514,"DB BIAYA ADMIN GIRO KORPORASI",75000,0,369296000`,
    bookCsv: `tanggal,no_bukti,deskripsi,akun_lawan,debit_masuk,kredit_keluar,saldo
2026-10-02,JKM-301,"Pelunasan Piutang PT Garuda Food INV-091","Piutang Usaha",85000000,0,425000000
2026-10-05,JKK-301,"Tagihan BBM Pertamina Fleet Card","Beban BBM & Tol",0,12540000,412460000
2026-10-08,JKM-302,"Penerimaan Cek Pelunasan PT Maju Jaya","Piutang Usaha",15000000,0,427460000
2026-10-14,JKK-302,"Premi Asuransi Armada Bulanan Allianz","Beban Asuransi",0,8500000,418960000
2026-10-17,JKM-303,"Pelunasan Piutang PT Indofarma INV-094","Piutang Usaha",62500000,0,481460000
2026-10-21,JKK-303,"Perawatan Rutin Armada PT Hino Motor","Beban Pemeliharaan",0,19800000,461660000
2026-10-26,JKK-304,"Gaji Driver & Staf Operasional Okt","Beban Gaji",0,68000000,393660000
2026-10-29,JKK-305,"Cek #7781 Pembelian Ban Truk CV Karya Ban","Beban Pemeliharaan",0,22500000,371160000
2026-10-31,JKM-304,"Setoran Tunai Tagihan COD Pengiriman Bali","Piutang Usaha",34000000,0,405160000`,
  },
];

export function getScenario(key: string): DemoScenario | undefined {
  return DEMO_SCENARIOS.find((s) => s.scenarioKey === key);
}
