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
    title: 'One reliable stock count',
    text: 'A single accurate count behind every store — no more guessing what you have.',
  },
  {
    icon: RefreshCw,
    title: 'Synced across stores',
    text: 'Match your listings once, then keep stock in sync across Shopee, Tokopedia and more.',
  },
  {
    icon: ShoppingCart,
    title: 'Orders that update stock',
    text: 'Paid orders come in, reduce your stock, and update your other stores automatically.',
  },
  {
    icon: PackageCheck,
    title: 'A packing video per order',
    text: 'Scan, record, ship — a video that settles “barang tidak sesuai” disputes.',
  },
  {
    icon: LineChart,
    title: 'Smart reorder tips',
    text: 'See how fast items sell and how much to buy again — worked out for you.',
  },
  {
    icon: ScrollText,
    title: 'Full stock history',
    text: 'Every stock change, searchable and exportable — a clean record for accounting.',
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
                  Open app
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            ) : (
              <>
                <Button variant="ghost" asChild>
                  <Link href="/login">Sign in</Link>
                </Button>
                <Button asChild>
                  <Link href="/register">Create account</Link>
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
            Keep your stock accurate across every marketplace.
          </h1>
          <p className="text-muted-foreground mx-auto mt-5 max-w-xl text-lg text-pretty">
            {APP_NAME} keeps your stock right from end to end: orders from every store come in,
            stock stays in sync, and you get a packing video for every order.
          </p>
          <div className="mt-9 flex items-center justify-center gap-3">
            {isLoggedIn ? (
              <Button size="lg" asChild>
                <Link href="/dashboard">
                  Go to dashboard
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            ) : (
              <>
                <Button size="lg" asChild>
                  <Link href="/register">
                    Get started
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link href="/login">Sign in</Link>
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
          <span>{APP_NAME} — inventory &amp; fulfillment for Indonesian sellers.</span>
          <div className="flex items-center gap-4">
            {isLoggedIn ? (
              <Link href="/dashboard" className="hover:text-foreground">
                Open app
              </Link>
            ) : (
              <>
                <Link href="/login" className="hover:text-foreground">
                  Sign in
                </Link>
                <Link href="/register" className="hover:text-foreground">
                  Create account
                </Link>
              </>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
