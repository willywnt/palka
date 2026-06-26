'use client';

import { useState } from 'react';
import type { Route } from 'next';
import Link from 'next/link';
import {
  Boxes,
  LineChart,
  Moon,
  ScrollText,
  ShoppingCart,
  Video,
  type LucideIcon,
} from 'lucide-react';

import { STAT_TONES, type StatTone } from '@/components/stat-card';
import { WaveHairline } from '@/components/maritime-art';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/modules/auth/hooks/use-current-user';
import { useHasPermission } from '@/modules/users/hooks/use-org';
import { InventoryDashboard } from '@/modules/inventory/components/inventory-dashboard';
import { cn } from '@/lib/utils';

import { Briefing } from './briefing';
import { NetProfitCard } from './net-profit-card';
import { TutupHariDialog } from './tutup-hari-dialog';

type QuickAction = {
  label: string;
  description: string;
  href: Route;
  icon: LucideIcon;
  tone: StatTone;
};

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: 'Produk baru',
    description: 'Tambah ke katalog',
    href: '/dashboard/products',
    icon: Boxes,
    tone: 'sky',
  },
  {
    label: 'Tarik pesanan',
    description: 'Sinkronisasi dari toko',
    href: '/dashboard/marketplace',
    icon: ShoppingCart,
    tone: 'amber',
  },
  {
    label: 'Rekam packing',
    description: 'Bukti per paket',
    href: '/recordings',
    icon: Video,
    tone: 'rose',
  },
  {
    label: 'Restok',
    description: 'Yang perlu dibeli lagi',
    href: '/dashboard/inventory/reorder',
    icon: LineChart,
    tone: 'emerald',
  },
  {
    label: 'Aktivitas',
    description: 'Riwayat stok',
    href: '/dashboard/inventory/activity',
    icon: ScrollText,
    tone: 'violet',
  },
];

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Selamat pagi';
  if (hour < 18) return 'Selamat siang';
  return 'Selamat malam';
}

function todayLabel(): string {
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());
}

export function DashboardHome() {
  const { user } = useCurrentUser();
  const { allowed: canViewReports } = useHasPermission('reports.view');
  // Money is OWNER/ADMIN-only — gate the card so STAFF never sees it NOR fires the
  // finance.view-gated /reports/net-profit fetch (which would 403).
  const { allowed: canViewFinance } = useHasPermission('finance.view');
  const firstName = (user?.displayName ?? user?.email ?? '').split(/[\s@]/)[0];
  const [tutupHariOpen, setTutupHariOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="space-y-4 pt-1">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <p className="eyebrow text-primary" suppressHydrationWarning>
              Anjungan · {todayLabel()}
            </p>
            <h1 className="text-2xl font-semibold tracking-tight" suppressHydrationWarning>
              {greeting()}
              {firstName ? `, ${firstName}` : ''} 👋
            </h1>
            <p className="text-muted-foreground text-sm">
              Ringkasan toko kamu — stok, pesanan, dan yang perlu diperhatikan hari ini.
            </p>
          </div>
          {canViewReports ? (
            <Button
              type="button"
              variant="outline"
              className="sm:shrink-0"
              onClick={() => setTutupHariOpen(true)}
            >
              <Moon className="size-4" />
              Tutup hari
            </Button>
          ) : null}
        </div>

        <Briefing />

        {canViewFinance ? <NetProfitCard /> : null}

        <div className="space-y-2">
          <p className="eyebrow text-muted-foreground">Pintasan</p>
          <div className="grid gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
            {QUICK_ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.label}
                  href={action.href}
                  className="bg-card hover:border-primary/40 hover:bg-accent/50 group flex items-center gap-3 rounded-xl border p-3 transition-colors"
                >
                  <span
                    className={cn(
                      'flex size-9 shrink-0 items-center justify-center rounded-lg',
                      STAT_TONES[action.tone],
                    )}
                  >
                    <Icon className="size-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{action.label}</span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {action.description}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        <WaveHairline />
      </div>

      <InventoryDashboard />

      {canViewReports ? (
        <TutupHariDialog open={tutupHariOpen} onOpenChange={setTutupHariOpen} />
      ) : null}
    </div>
  );
}
