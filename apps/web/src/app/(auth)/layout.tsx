import Link from 'next/link';
import { APP_NAME } from '@falka/config/constants';
import { Boxes, PackageCheck, RefreshCw } from 'lucide-react';

import { BrandBadge } from '@/components/brand-mark';
import { WaveHairline } from '@/components/maritime-art';

const HIGHLIGHTS = [
  {
    icon: Boxes,
    title: 'Stok selalu akurat',
    text: 'Satu angka stok yang bisa kamu percaya, di semua toko.',
  },
  {
    icon: RefreshCw,
    title: 'Sinkron antar toko',
    text: 'Stok ikut update otomatis biar kamu nggak oversell.',
  },
  {
    icon: PackageCheck,
    title: 'Bukti video packing',
    text: 'Setiap pesanan terekam — siap jadi bukti kalau ada komplain.',
  },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="bg-primary text-primary-foreground relative hidden flex-col justify-between overflow-hidden p-10 lg:flex">
        {/* Calm water, not SaaS blur-blobs: two riak strokes low on the panel. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-10 space-y-4">
          <WaveHairline className="h-4 text-white/25" />
          <WaveHairline className="h-4 text-white/15" />
        </div>

        <Link href="/" className="relative flex items-center gap-2.5">
          <BrandBadge className="text-primary size-9 bg-white" markClassName="size-6" />
          <span className="text-lg font-semibold tracking-tight">{APP_NAME}</span>
        </Link>

        <div className="relative space-y-8">
          <div className="space-y-3">
            <h2 className="text-3xl font-semibold tracking-tight text-balance">
              Lihat lebih tajam, jualan lebih tenang.
            </h2>
            <p className="text-primary-foreground/70 max-w-sm text-pretty">
              Pesanan dari semua toko masuk, stok tetap sinkron, dan setiap paket punya video
              packing.
            </p>
          </div>

          <ul className="space-y-4">
            {HIGHLIGHTS.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.title} className="flex items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/10">
                    <Icon className="size-4" />
                  </span>
                  <div>
                    <p className="text-sm font-medium">{item.title}</p>
                    <p className="text-primary-foreground/60 text-sm">{item.text}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <p className="text-primary-foreground/50 relative text-xs">
          Dibuat untuk penjual Indonesia.
        </p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-6">
          <Link href="/" className="flex items-center justify-center gap-2 lg:hidden">
            <BrandBadge />
            <span className="text-base font-semibold tracking-tight">{APP_NAME}</span>
          </Link>
          {children}
        </div>
      </div>
    </div>
  );
}
