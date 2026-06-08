import Link from 'next/link';
import { APP_NAME } from '@olshop/config/constants';
import {
  ArrowRight,
  Boxes,
  LineChart,
  PackageCheck,
  RefreshCw,
  ScrollText,
  ShoppingCart,
} from 'lucide-react';

import { auth } from '@/auth';
import { Button } from '@/components/ui/button';

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
            <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg text-sm font-bold">
              {APP_NAME.charAt(0)}
            </span>
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
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="bg-primary/10 absolute -top-32 left-1/2 size-[36rem] -translate-x-1/2 rounded-full blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-3xl px-6 py-24 text-center">
          <span className="border-primary/20 bg-primary/5 text-primary eyebrow inline-flex items-center rounded-full border px-3 py-1">
            Stok · Marketplace · Packing
          </span>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Jaga stok kamu tetap akurat di semua marketplace.
          </h1>
          <p className="text-muted-foreground mx-auto mt-5 max-w-xl text-lg text-pretty">
            {APP_NAME} menjaga stok kamu tetap akurat dari hulu ke hilir: pesanan dari setiap toko
            masuk, stok tetap sinkron, dan kamu dapat video packing untuk setiap pesanan.
          </p>
          <div className="mt-9 flex items-center justify-center gap-3">
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
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
