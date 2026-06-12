import Link from 'next/link';
import { APP_NAME } from '@falka/config/constants';
import {
  ArrowRight,
  Boxes,
  LineChart,
  PackageCheck,
  QrCode,
  RefreshCw,
  ScanLine,
  ScrollText,
  ShoppingCart,
  Smartphone,
} from 'lucide-react';

import { auth } from '@/auth';
import { BrandBadge, BrandMark } from '@/components/brand-mark';
import { WaveHairline } from '@/components/maritime-art';
import {
  AnjunganMock,
  DisputeEvidenceMock,
  LedgerTrailMock,
  MiniQueueMock,
  PackingScanMock,
  PosTotalMock,
  ProfitMock,
} from '@/components/marketing/product-mocks';
import { Button } from '@/components/ui/button';

/** The seller's day, told as 4 steps — each backed by a tiny real-UI mock. */
const DAY_STEPS = [
  {
    time: 'Pagi',
    text: 'Buka Anjungan — antrian kerja sudah dihitung, kamu tahu persis mulai dari mana.',
    Mock: MiniQueueMock,
  },
  {
    time: 'Siang',
    text: 'Scan resi, kamera merekam packing-nya — satu video bukti untuk setiap paket.',
    Mock: PackingScanMock,
  },
  {
    time: 'Sore',
    text: 'Pembeli datang ke toko? Kasir memotong stok yang sama — online nggak bisa oversell.',
    Mock: PosTotalMock,
  },
  {
    time: 'Malam',
    text: 'Tutup hari dengan angka jujur: omzet dan margin bersih, retur sudah dihitung.',
    Mock: ProfitMock,
  },
];

/** Warehouse without expensive hardware — phone + printed QR labels. */
const SCANNER_CARDS = [
  {
    icon: Smartphone,
    title: 'HP jadi scanner',
    text: 'Scan QR pemasangan dari layar, HP kamu langsung jadi scanner nirkabel — buat kasir, PO, dan opname.',
  },
  {
    icon: QrCode,
    title: 'Label QR dari studio label',
    text: 'Cetak label QR per produk di kertas A4 biasa — tempel di rak, siap discan kapan saja.',
  },
  {
    icon: ScanLine,
    title: 'Opname scan-hitung',
    text: 'Hitung stok fisik sambil jalan: tiap scan nambah satu, selisihnya langsung ketahuan dan dibereskan.',
  },
];

const FEATURES = [
  {
    icon: Boxes,
    title: 'Stok selalu akurat',
    text: 'Satu angka stok yang benar untuk semua toko kamu — nggak perlu nebak-nebak lagi.',
  },
  {
    icon: RefreshCw,
    title: 'Sinkronisasi stok di semua toko',
    text: 'Kaitkan listing sekali, stok kamu langsung sinkron di Shopee, Tokopedia, dan lainnya.',
  },
  {
    icon: ShoppingCart,
    title: 'Pesanan langsung potong stok',
    text: 'Pesanan dibayar masuk, stok berkurang, toko lain ikut update otomatis.',
  },
  {
    icon: PackageCheck,
    title: 'Satu video packing per pesanan',
    text: 'Scan, rekam, kirim — video yang menyelesaikan komplain “barang tidak sesuai”.',
  },
  {
    icon: LineChart,
    title: 'Saran restok yang pintar',
    text: 'Lihat seberapa cepat barang laku dan berapa yang perlu kamu restok — sudah dihitung otomatis.',
  },
  {
    icon: ScrollText,
    title: 'Riwayat stok lengkap',
    text: 'Setiap perubahan stok, bisa dicari dan diekspor — catatan rapi buat pembukuan.',
  },
];

export default async function HomePage() {
  const session = await auth();
  const isLoggedIn = Boolean(session?.user);

  return (
    <div className="bg-background min-h-screen">
      <header className="bg-background/80 sticky top-0 z-40 border-b backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <Link href="/" className="flex items-center gap-2.5">
            <BrandBadge />
            <span className="text-lg font-semibold tracking-tight">{APP_NAME}</span>
          </Link>
          <div className="flex items-center gap-2">
            {isLoggedIn ? (
              <Button asChild>
                <Link href="/dashboard">
                  Buka aplikasi
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            ) : (
              <>
                <Button variant="ghost" asChild>
                  <Link href="/login">Masuk</Link>
                </Button>
                <Button asChild>
                  <Link href="/register">Buat akun</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        {/* Horizon wash — sea-glass light fading to paper, no SaaS blur-blobs. */}
        <div
          aria-hidden
          className="from-sea-glass pointer-events-none absolute inset-x-0 top-0 h-80 bg-gradient-to-b to-transparent"
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-6 py-16 lg:grid-cols-2 lg:py-24">
          <div className="text-center lg:text-left">
            <span className="border-primary/20 bg-primary/5 text-primary eyebrow inline-flex items-center rounded-full border px-3 py-1">
              Stok · Kasir · Bukti packing
            </span>
            <h1 className="mt-6 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              Lihat lebih tajam, jualan lebih tenang.
            </h1>
            <p className="text-muted-foreground mx-auto mt-5 max-w-xl text-lg text-pretty lg:mx-0">
              {APP_NAME} menjaga satu angka stok yang benar di semua toko kamu — dan setiap paket
              yang keluar punya satu video bukti packing.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
              {isLoggedIn ? (
                <Button size="lg" asChild>
                  <Link href="/dashboard">
                    Ke dashboard
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              ) : (
                <>
                  <Button size="lg" asChild>
                    <Link href="/register">
                      Mulai sekarang
                      <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                  <Button size="lg" variant="outline" asChild>
                    <Link href="/login">Masuk</Link>
                  </Button>
                </>
              )}
            </div>
          </div>
          <div className="mx-auto w-full max-w-md space-y-2.5 lg:max-w-none">
            <AnjunganMock />
            <p className="text-muted-foreground text-center text-xs">
              Tampilan asli aplikasinya — bukan ilustrasi.
            </p>
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-6 pb-2">
          <WaveHairline />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="max-w-2xl">
          <p className="eyebrow text-primary">Satu hari bersama {APP_NAME}</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            Dari pagi sampai tutup toko, satu tempat kerja.
          </h2>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {DAY_STEPS.map(({ time, text, Mock }) => (
            <div key={time} className="bg-card flex flex-col gap-4 rounded-lg border p-5">
              <div className="space-y-1.5">
                <p className="eyebrow text-primary">{time}</p>
                <p className="text-sm text-pretty">{text}</p>
              </div>
              <div className="mt-auto">
                <Mock />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-sea-glass border-y">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="max-w-2xl">
            <p className="eyebrow text-primary">Bukti, bukan klaim</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
              Setiap pergerakan stok ada buktinya.
            </h2>
            <p className="text-muted-foreground mt-3 text-pretty">
              Stok dicatat di buku besar yang hanya bisa bertambah, dan setiap paket direkam saat
              dipacking. Kalau ada selisih atau komplain, kamu tinggal tunjukkan catatannya.
            </p>
          </div>
          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            <div className="bg-card rounded-xl border p-6">
              <LedgerTrailMock />
              <p className="text-muted-foreground mt-4 text-sm text-pretty">
                Buku besar stok yang nggak bisa diedit — setiap angka ada riwayatnya.
              </p>
            </div>
            <div className="bg-card rounded-xl border p-6">
              <DisputeEvidenceMock />
              <p className="text-muted-foreground mt-4 text-sm text-pretty">
                Komplain &ldquo;barang tidak sesuai&rdquo;? Kirim video packing resinya — sengketa
                selesai dengan bukti, bukan debat.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="max-w-2xl">
          <p className="eyebrow text-primary">Tanpa alat tambahan</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            Gudang tanpa alat mahal.
          </h2>
          <p className="text-muted-foreground mt-3 text-pretty">
            Nggak perlu beli scanner atau printer barcode khusus — HP kamu dan kertas A4 sudah
            cukup.
          </p>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SCANNER_CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.title} className="bg-card rounded-lg border p-5">
                <span className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-lg">
                  <Icon className="size-5" />
                </span>
                <h3 className="mt-4 font-semibold tracking-tight">{card.title}</h3>
                <p className="text-muted-foreground mt-1.5 text-sm text-pretty">{card.text}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="max-w-2xl">
          <p className="eyebrow text-primary">Lengkapnya</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            Semua yang tokomu butuhkan, satu aplikasi.
          </h2>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="bg-card hover:border-primary/40 group relative rounded-lg border p-5 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-lg">
                    <Icon className="size-5" />
                  </span>
                  <span className="text-muted-foreground/50 num text-xs">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                </div>
                <h3 className="mt-4 font-semibold tracking-tight">{feature.title}</h3>
                <p className="text-muted-foreground mt-1.5 text-sm text-pretty">{feature.text}</p>
              </div>
            );
          })}
        </div>

        {/* Pandu teaser — honest "coming" banner, no fake AI interactivity. */}
        <div className="bg-sea-glass mt-10 flex flex-col gap-4 rounded-lg border p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3.5">
            <span className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg">
              <BrandMark className="size-5" />
            </span>
            <div className="space-y-1">
              <p className="eyebrow text-primary">Segera hadir</p>
              <h3 className="font-semibold tracking-tight">Pandu — pemandu tokomu</h3>
              <p className="text-muted-foreground max-w-xl text-sm text-pretty">
                Asisten dengan mata elang untuk stokmu: &ldquo;Stok kaos hitam M habis ±2 hari lagi
                — buatkan PO?&rdquo; Pandu mengawasi angkanya, kamu yang memutuskan.
              </p>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t">
        <div className="text-muted-foreground mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-6 py-6 text-sm sm:flex-row">
          <span>{APP_NAME} — inventaris &amp; fulfillment buat seller Indonesia.</span>
          <div className="flex items-center gap-4">
            {isLoggedIn ? (
              <Link href="/dashboard" className="hover:text-foreground">
                Buka aplikasi
              </Link>
            ) : (
              <>
                <Link href="/login" className="hover:text-foreground">
                  Masuk
                </Link>
                <Link href="/register" className="hover:text-foreground">
                  Buat akun
                </Link>
              </>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
