import { Video } from 'lucide-react';

import { NumberDelta } from '@/components/number-delta';
import { StatusBadge } from '@/components/status-badge';

/*
 * Landing-page product mocks — believable mini views composed from the REAL
 * design-system primitives (no screenshots, no images, no client JS). Every
 * visual block is aria-hidden and paired with an sr-only summary so screen
 * readers get the story without the decoration.
 */

const HERO_QUEUE = [
  { count: 7, label: 'pesanan dibayar, belum dikirim', badge: null },
  { count: 2, label: 'varian habis ±4 hari lagi', badge: 'Mendesak' },
  { count: 1, label: 'retur menunggu diproses', badge: null },
];

/** The hero "Anjungan" card — a Monday-morning work queue, exactly like the app's home. */
export function AnjunganMock() {
  return (
    <div>
      <p className="sr-only">
        Contoh tampilan Anjungan hari Senin pagi: antrian kerja berisi 7 pesanan dibayar yang belum
        dikirim, 2 varian habis kira-kira 4 hari lagi dengan tanda mendesak, 1 retur menunggu
        diproses, plus ringkasan stok kemarin — restok tambah 24, terjual kurang 6.
      </p>
      <div aria-hidden className="bg-card overflow-hidden rounded-xl border">
        <div className="space-y-1 border-b px-5 py-4">
          <p className="eyebrow text-primary">Anjungan · Senin pagi</p>
          <p className="font-semibold tracking-tight">Antrian kerja</p>
        </div>
        <ul className="divide-y px-5">
          {HERO_QUEUE.map((row) => (
            <li key={row.label} className="flex items-center justify-between gap-3 py-3">
              <span className="flex min-w-0 items-baseline gap-2 text-sm">
                <span className="num font-semibold">{row.count}</span>
                <span className="text-muted-foreground truncate">{row.label}</span>
              </span>
              {row.badge ? <StatusBadge tone="urgent">{row.badge}</StatusBadge> : null}
            </li>
          ))}
        </ul>
        <div className="bg-background/60 flex items-center justify-between gap-3 border-t px-5 py-3 text-xs">
          <span className="text-muted-foreground">Stok kemarin</span>
          <span className="flex items-center gap-3">
            <span className="text-muted-foreground">
              restok <NumberDelta value={24} className="text-xs" />
            </span>
            <span className="text-muted-foreground">
              terjual <NumberDelta value={-6} className="text-xs" />
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

/** Pagi — the morning queue, condensed to two hairline rows. */
export function MiniQueueMock() {
  return (
    <div>
      <p className="sr-only">
        Contoh antrian kerja pagi: 7 pesanan dibayar belum dikirim, 2 varian perlu restok.
      </p>
      <div aria-hidden className="bg-background divide-y rounded-lg border px-3.5">
        <div className="flex items-baseline gap-2 py-2.5 text-sm">
          <span className="num font-semibold">7</span>
          <span className="text-muted-foreground truncate">pesanan dibayar, belum dikirim</span>
        </div>
        <div className="flex items-baseline gap-2 py-2.5 text-sm">
          <span className="num font-semibold">2</span>
          <span className="text-muted-foreground truncate">varian perlu restok</span>
        </div>
      </div>
    </div>
  );
}

/** Siang — a resi scanned, packing recorded, evidence attached. */
export function PackingScanMock() {
  return (
    <div>
      <p className="sr-only">
        Contoh hasil scan resi JX-8829-ID: status terekam, dengan video bukti packing berdurasi 42
        detik.
      </p>
      <div aria-hidden className="bg-background space-y-1.5 rounded-lg border px-3.5 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <span className="num text-sm font-medium">JX-8829-ID</span>
          <StatusBadge tone="ok">Terekam</StatusBadge>
        </div>
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <Video className="size-3.5 shrink-0" />
          video bukti · <span className="num">00:42</span>
        </p>
      </div>
    </div>
  );
}

/** Sore — a counter sale cutting the SAME stock the marketplaces read. */
export function PosTotalMock() {
  return (
    <div>
      <p className="sr-only">
        Contoh transaksi kasir dengan total Rp185.000 — stok di Shopee dan Tokopedia ikut turun
        otomatis.
      </p>
      <div aria-hidden className="bg-background rounded-lg border px-3.5 py-2.5">
        <p className="eyebrow text-muted-foreground">Total</p>
        <p className="num-display mt-1">Rp185.000</p>
        <p className="text-muted-foreground mt-2 border-t pt-2 text-xs">
          stok Shopee &amp; Tokopedia ikut turun
        </p>
      </div>
    </div>
  );
}

/** Malam — honest closing numbers: omzet and net margin. */
export function ProfitMock() {
  return (
    <div>
      <p className="sr-only">
        Contoh laporan tutup hari: omzet naik Rp1,84 juta dan margin bersih naik 28 persen.
      </p>
      <div aria-hidden className="bg-background divide-y rounded-lg border px-3.5">
        <div className="flex items-center justify-between gap-3 py-2.5 text-sm">
          <span className="text-muted-foreground">Omzet hari ini</span>
          <NumberDelta
            value={1840000}
            format={(abs) => `Rp${(abs / 1_000_000).toFixed(2).replace('.', ',')} jt`}
            className="text-sm"
          />
        </div>
        <div className="flex items-center justify-between gap-3 py-2.5 text-sm">
          <span className="text-muted-foreground">Margin bersih</span>
          <NumberDelta value={28} format={(abs) => `${abs}%`} className="text-sm" />
        </div>
      </div>
    </div>
  );
}

const LEDGER_ROWS = [
  { reason: 'RESTOCK', delta: 24, time: 'Sen 08.12' },
  { reason: 'SALE', delta: -2, time: 'Sen 10.40' },
  { reason: 'ORDER_RESERVE', delta: -5, time: 'Sen 13.05' },
  { reason: 'RETURN', delta: 1, time: 'Sel 09.21' },
];

/** The append-only stock ledger for one SKU — the trust receipt. */
export function LedgerTrailMock() {
  return (
    <div>
      <p className="sr-only">
        Contoh riwayat buku besar stok untuk satu SKU kaos hitam ukuran M: restok tambah 24,
        penjualan kurang 2, reservasi pesanan kurang 5, retur tambah 1 — setiap baris punya catatan
        waktu kejadian.
      </p>
      <div aria-hidden className="bg-background rounded-lg border">
        <div className="flex items-center justify-between gap-3 border-b px-3.5 py-2.5">
          <span className="num text-xs font-medium">KAOS-HTM-M</span>
          <span className="text-muted-foreground text-xs">Kaos hitam · M</span>
        </div>
        <ul className="divide-y px-3.5">
          {LEDGER_ROWS.map((row) => (
            <li key={row.reason} className="flex items-center justify-between gap-3 py-2">
              <span className="num text-muted-foreground text-xs">{row.reason}</span>
              <span className="flex items-center gap-3">
                <NumberDelta value={row.delta} className="text-xs" />
                <span className="num text-muted-foreground/70 text-xs">{row.time}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** A complaint answered by the packing video — dispute evidence, not debate. */
export function DisputeEvidenceMock() {
  return (
    <div>
      <p className="sr-only">
        Contoh penyelesaian komplain: pembeli bilang barang tidak sesuai, kamu membalas dengan video
        packing resi JX-8829-ID berdurasi 42 detik — bukti terkirim.
      </p>
      <div aria-hidden className="space-y-2.5">
        <div className="space-y-1">
          <p className="eyebrow text-muted-foreground">Komplain pembeli</p>
          <p className="bg-muted text-foreground w-fit rounded-lg rounded-tl-sm px-3 py-2 text-sm">
            &ldquo;Barang tidak sesuai&rdquo;
          </p>
        </div>
        <div className="bg-background flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3.5 py-2.5">
          <span className="flex min-w-0 items-center gap-2 text-sm">
            <Video className="text-primary size-4 shrink-0" />
            <span className="truncate">
              Video packing <span className="num">JX-8829-ID</span> ·{' '}
              <span className="num">00:42</span>
            </span>
          </span>
          <StatusBadge tone="ok">Bukti terkirim</StatusBadge>
        </div>
      </div>
    </div>
  );
}
