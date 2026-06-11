'use client';

import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

import { useCurrentUser } from '@/modules/auth/hooks/use-current-user';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

const THEME_OPTIONS = [
  { value: 'light', label: 'Terang', icon: Sun },
  { value: 'dark', label: 'Gelap', icon: Moon },
  { value: 'system', label: 'Sistem', icon: Monitor },
] as const;

/** "Preferensi" card for the Umum settings tab — account identity + theme choice. */
export function GeneralSettings() {
  const { user, isLoading } = useCurrentUser();
  const { theme, setTheme } = useTheme();
  // next-themes only knows the real theme on the client — render a neutral state until mounted.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Preferensi</CardTitle>
        <CardDescription>Identitas akun dan tampilan aplikasi</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-3">
          <p className="eyebrow text-muted-foreground">Akun</p>
          <dl className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Nama</dt>
              <dd className="text-right font-medium">
                {isLoading ? <Skeleton className="h-4 w-32" /> : (user?.displayName ?? '—')}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Email</dt>
              <dd className="text-right font-medium break-all">
                {isLoading ? <Skeleton className="h-4 w-44" /> : (user?.email ?? '—')}
              </dd>
            </div>
          </dl>
          <p className="text-muted-foreground text-xs">
            Nama dan email dikelola lewat akun kamu — belum bisa diubah dari sini.
          </p>
        </section>

        <Separator />

        <section className="space-y-3">
          <p className="eyebrow text-muted-foreground">Tampilan</p>
          <div>
            <p className="text-sm font-medium">Tema</p>
            <p className="text-muted-foreground text-sm">
              Pilih terang, gelap, atau ikuti pengaturan perangkat kamu.
            </p>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Pilihan tema">
            {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
              const active = mounted && theme === value;
              return (
                <Button
                  key={value}
                  type="button"
                  variant={active ? 'secondary' : 'outline'}
                  size="sm"
                  aria-pressed={active}
                  onClick={() => setTheme(value)}
                >
                  <Icon className="size-4" />
                  {label}
                </Button>
              );
            })}
          </div>
        </section>
      </CardContent>
    </Card>
  );
}
