'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowRight, Info, TriangleAlert, X } from 'lucide-react';

import { BrandMark } from '@/components/brand-mark';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

import { usePanduNudges, type PanduNudge } from './pandu-nudges';
import { PANDU_SUGGESTIONS, routePanduQuery } from './pandu-router';

/*
 * Routes that own the thumb zone / full attention — the dock stays out of the
 * way there (POS checkout, new-PO scanning, the recording station).
 */
const SUPPRESSED_ROUTES = ['/recordings', '/dashboard/sales/new', '/dashboard/purchasing/new'];

function NudgeRow({ nudge, onDismiss }: { nudge: PanduNudge; onDismiss: (id: string) => void }) {
  const Icon = nudge.tone === 'urgent' ? TriangleAlert : Info;

  return (
    <li className="bg-card flex items-start gap-2.5 rounded-lg border p-3">
      <Icon
        aria-hidden
        className={cn(
          'mt-0.5 size-4 shrink-0',
          nudge.tone === 'urgent' ? 'text-highlight-strong' : 'text-muted-foreground',
        )}
      />
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm text-pretty">{nudge.text}</p>
        <Button size="sm" variant="outline" className="h-7" asChild>
          <Link href={nudge.href}>
            {nudge.actionLabel}
            <ArrowRight className="size-3.5" />
          </Link>
        </Button>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="text-muted-foreground -mt-1 -mr-1 size-7"
        onClick={() => onDismiss(nudge.id)}
      >
        <X className="size-3.5" />
        <span className="sr-only">Abaikan catatan ini</span>
      </Button>
    </li>
  );
}

/**
 * The Pandu dock — the assistant's persistent home (Suar Dermaga pattern):
 * a bottom-right pill opening a sea-glass card with proactive notes (real
 * data, rule-ranked) and an honest navigate-only question bar.
 */
export function PanduDock() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [noMatch, setNoMatch] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { nudges, hasUrgent, isLoading, isError, dismissNudge } = usePanduNudges();

  // The urgent dot depends on localStorage-persisted dismissals — render it
  // only after mount so SSR and first client paint agree.
  useEffect(() => {
    setMounted(true);
  }, []);

  // Close (and clear the draft) whenever the user navigates.
  useEffect(() => {
    setOpen(false);
    setQuery('');
    setNoMatch(false);
  }, [pathname]);

  if (SUPPRESSED_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`))) {
    return null;
  }

  function handleAsk(event: React.FormEvent) {
    event.preventDefault();
    const destination = routePanduQuery(query);
    if (destination) {
      setNoMatch(false);
      router.push(destination.href);
      return;
    }
    setNoMatch(true);
  }

  return (
    <>
      {open ? (
        <section
          aria-label="Pandu — pemandu tokomu"
          className="bg-sea-glass animate-in fade-in slide-in-from-bottom-3 ease-tide fixed inset-x-3 bottom-20 z-50 flex max-h-[75svh] flex-col overflow-hidden rounded-xl border shadow-lg duration-300 sm:inset-x-auto sm:right-4 sm:w-[360px] md:bottom-4"
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false);
          }}
        >
          <header className="flex items-center gap-2 border-b px-4 py-3">
            <BrandMark className="text-primary size-4.5" />
            <p className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight">
              Pandu <span className="text-muted-foreground font-normal">— pemandu tokomu</span>
            </p>
            <Badge variant="outline" className="text-muted-foreground text-[10px] uppercase">
              Pratinjau
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground size-7"
              onClick={() => setOpen(false)}
            >
              <X className="size-4" />
              <span className="sr-only">Tutup Pandu</span>
            </Button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            <p className="eyebrow text-muted-foreground">Sorotan hari ini · otomatis</p>

            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : isError && nudges.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Sorotan nggak bisa dimuat sekarang — coba buka lagi nanti.
              </p>
            ) : nudges.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Laut tenang — nggak ada yang perlu perhatian khusus sekarang.
              </p>
            ) : (
              <ul className="space-y-2">
                {nudges.map((nudge) => (
                  <NudgeRow key={nudge.id} nudge={nudge} onDismiss={dismissNudge} />
                ))}
              </ul>
            )}

            {noMatch ? (
              <div className="space-y-2">
                <p className="text-muted-foreground text-sm">
                  Pandu masih belajar di pelabuhan — coba salah satu ini:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {PANDU_SUGGESTIONS.map((suggestion) => (
                    <Button
                      key={suggestion.href}
                      size="sm"
                      variant="secondary"
                      className="h-7"
                      asChild
                    >
                      <Link href={suggestion.href}>{suggestion.label}</Link>
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <form onSubmit={handleAsk} className="flex items-center gap-2 border-t p-3">
            <Input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setNoMatch(false);
              }}
              placeholder="Tanya stokmu… (mis. “sisa kaos hitam M”)"
              aria-label="Tanya Pandu"
              className="bg-card h-9"
            />
            <Button type="submit" size="icon" className="size-9 shrink-0" disabled={!query.trim()}>
              <ArrowRight className="size-4" />
              <span className="sr-only">Kirim pertanyaan</span>
            </Button>
          </form>

          <p className="text-muted-foreground border-t px-4 py-2 text-[11px]">
            Pratinjau — Pandu baru bisa navigasi &amp; sorotan otomatis, belum menjawab bebas.
          </p>
        </section>
      ) : (
        <Button
          onClick={() => setOpen(true)}
          className="ease-tide fixed right-4 bottom-20 z-50 h-12 rounded-full pr-5 pl-4 shadow-lg transition-transform duration-200 hover:-translate-y-0.5 md:bottom-4"
        >
          <span className="relative flex items-center">
            <BrandMark className="size-5" />
            {mounted && hasUrgent ? (
              <span
                aria-hidden
                className="bg-highlight pandu-breath absolute -top-1 -right-1 size-2.5 rounded-full"
              />
            ) : null}
          </span>
          Pandu
          {mounted && hasUrgent ? <span className="sr-only">— ada catatan penting</span> : null}
        </Button>
      )}
    </>
  );
}
