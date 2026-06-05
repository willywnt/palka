'use client';

import { useMemo, useState } from 'react';
import {
  PackageSearch,
  Plus,
  ScanLine,
  ShoppingCart,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { toast } from 'sonner';
import type { SalePaymentMethod } from '@prisma/client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NumberInput } from '@/components/ui/number-input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-state';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useScanSoundPref } from '@/hooks/use-scan-sound-pref';
import { useSoundUnlock } from '@/hooks/use-sound-unlock';
import { formatCurrency } from '@/lib/formatters';
import { unlockScanSound } from '@/lib/scan-sound';
import { cn } from '@/lib/utils';
import { ConnectScannerDialog } from '@/modules/scanner-pairing/components/connect-scanner-dialog';

import { useCreateSaleMutation, useSellableVariantsQuery } from '../hooks/use-sales';
import { usePosScanner, type PosScannerStatus } from '../hooks/use-pos-scanner';
import type { SellableVariant } from '../types';

const SCAN_SOUND_STORAGE_KEY = 'olshop-pos-scan-sound';

/** Per-state copy + accent for the POS phone-scanner indicator. */
const SCAN_STATUS_META: Record<
  PosScannerStatus,
  { dot: string; cta: string; hint: string | null }
> = {
  off: { dot: '', cta: '', hint: null },
  idle: { dot: 'bg-muted-foreground/40', cta: 'Scan with phone', hint: null },
  waiting: {
    dot: 'bg-amber-500',
    cta: 'Show QR',
    hint: 'Waiting for your phone to connect…',
  },
  connected: {
    dot: 'bg-emerald-500',
    cta: 'Phone connected',
    hint: 'Phone connected — scan a product label to add it to the cart.',
  },
  disconnected: {
    dot: 'bg-destructive',
    cta: 'Reconnect',
    hint: 'Phone disconnected. Tap Reconnect to show a fresh QR.',
  },
};

type CartLine = {
  variantId: string;
  sku: string;
  name: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  availableStock: number;
};

const PAYMENT_OPTIONS: ReadonlyArray<{ value: SalePaymentMethod; label: string }> = [
  { value: 'CASH', label: 'Cash' },
  { value: 'QRIS', label: 'QRIS' },
  { value: 'TRANSFER', label: 'Transfer' },
  { value: 'CARD', label: 'Card' },
  { value: 'OTHER', label: 'Other' },
];

export function PosTerminal() {
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebouncedValue(searchInput.trim(), 300);
  const { data: results, isLoading } = useSellableVariantsQuery(debouncedSearch);

  const [cart, setCart] = useState<CartLine[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<SalePaymentMethod>('CASH');
  const [customerName, setCustomerName] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const { soundOn, toggleSound } = useScanSoundPref(SCAN_SOUND_STORAGE_KEY);

  // Unlock Web Audio on the first interaction so scan beeps can play.
  useSoundUnlock();

  function openScanner() {
    // Opening from a click unlocks audio so later socket-driven beeps can play.
    unlockScanSound();
    setScannerOpen(true);
  }

  const createSale = useCreateSaleMutation();

  const total = useMemo(
    () => cart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0),
    [cart],
  );

  function addToCart(variant: SellableVariant) {
    setCart((prev) => {
      const existing = prev.find((line) => line.variantId === variant.variantId);
      if (existing) {
        return prev.map((line) =>
          line.variantId === variant.variantId ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }
      return [
        ...prev,
        {
          variantId: variant.variantId,
          sku: variant.sku,
          name: variant.name,
          productName: variant.productName,
          unitPrice: Number(variant.price),
          quantity: 1,
          availableStock: variant.availableStock,
        },
      ];
    });
  }

  // Mobile scan-to-cart: a paired phone scans a product label → add the line.
  const { scannerEnabled, status: scannerStatus } = usePosScanner({
    onResolved: addToCart,
    soundEnabled: soundOn,
  });
  const scanMeta = SCAN_STATUS_META[scannerStatus];

  function patchLine(variantId: string, patch: Partial<CartLine>) {
    setCart((prev) =>
      prev.map((line) => (line.variantId === variantId ? { ...line, ...patch } : line)),
    );
  }

  function removeLine(variantId: string) {
    setCart((prev) => prev.filter((line) => line.variantId !== variantId));
  }

  async function handleCheckout() {
    if (cart.length === 0) return;
    try {
      const sale = await createSale.mutateAsync({
        items: cart.map((line) => ({
          variantId: line.variantId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
        })),
        paymentMethod,
        customerName: customerName.trim() || undefined,
      });
      toast.success(`Sale ${sale.code} recorded`, {
        description: `${formatCurrency(sale.totalAmount)} · stock updated`,
      });
      setCart([]);
      setCustomerName('');
      setSearchInput('');
    } catch (error) {
      toast.error('Checkout failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* Product picker */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">Find product</CardTitle>
            {scannerEnabled ? (
              <div className="flex items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={toggleSound}
                  aria-label={soundOn ? 'Mute scan sound' : 'Unmute scan sound'}
                  title={soundOn ? 'Mute scan sound' : 'Unmute scan sound'}
                >
                  {soundOn ? (
                    <Volume2 className="size-4" />
                  ) : (
                    <VolumeX className="text-muted-foreground size-4" />
                  )}
                </Button>
                <Button variant="outline" size="sm" onClick={openScanner}>
                  <span className={cn('size-2 rounded-full', scanMeta.dot)} aria-hidden />
                  <ScanLine className="size-4" />
                  {scanMeta.cta}
                </Button>
              </div>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search SKU or product name..."
            autoFocus
          />
          {scannerEnabled && scanMeta.hint ? (
            <p
              className={cn(
                'text-xs',
                scannerStatus === 'disconnected' ? 'text-destructive' : 'text-muted-foreground',
              )}
            >
              {scanMeta.hint}
            </p>
          ) : null}
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-12 w-full" />
              ))}
            </div>
          ) : (results?.length ?? 0) === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              {debouncedSearch ? 'No matching products.' : 'Type to search products.'}
            </p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {results?.map((variant) => (
                <li
                  key={variant.variantId}
                  className="flex items-center justify-between gap-3 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {variant.productName} · {variant.name}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {variant.sku} · {formatCurrency(variant.price)} ·{' '}
                      <span className={variant.availableStock <= 0 ? 'text-destructive' : ''}>
                        {variant.availableStock} in stock
                      </span>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => addToCart(variant)}>
                    <Plus className="size-4" />
                    Add
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Cart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cart</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {cart.length === 0 ? (
            <EmptyState
              icon={ShoppingCart}
              title="Cart is empty"
              description="Search a product and add it to start a sale."
            />
          ) : (
            <div className="space-y-3">
              {cart.map((line) => {
                const oversold = line.quantity > line.availableStock;
                return (
                  <div key={line.variantId} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {line.productName} · {line.name}
                        </div>
                        <div className="text-muted-foreground text-xs">{line.sku}</div>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => removeLine(line.variantId)}
                        aria-label="Remove"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    <div className="mt-2 grid grid-cols-[5rem_1fr_auto] items-center gap-2">
                      <div>
                        <Label className="text-muted-foreground text-xs">Qty</Label>
                        <NumberInput
                          value={line.quantity}
                          onChange={(value) =>
                            patchLine(line.variantId, { quantity: Math.max(1, value) })
                          }
                        />
                      </div>
                      <div>
                        <Label className="text-muted-foreground text-xs">Unit price</Label>
                        <NumberInput
                          value={line.unitPrice}
                          onChange={(value) =>
                            patchLine(line.variantId, { unitPrice: Math.max(0, value) })
                          }
                        />
                      </div>
                      <div className="text-right">
                        <div className="text-muted-foreground text-xs">Line</div>
                        <div className="font-medium tabular-nums">
                          {formatCurrency(line.unitPrice * line.quantity)}
                        </div>
                      </div>
                    </div>
                    {oversold ? (
                      <Badge variant="outline" className="mt-2 border-amber-500 text-amber-600">
                        Oversell — only {line.availableStock} in stock
                      </Badge>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}

          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="payment" className="text-muted-foreground text-xs">
                  Payment
                </Label>
                <Select
                  id="payment"
                  value={paymentMethod}
                  onChange={(event) => setPaymentMethod(event.target.value as SalePaymentMethod)}
                >
                  {PAYMENT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="customer" className="text-muted-foreground text-xs">
                  Customer (optional)
                </Label>
                <Input
                  id="customer"
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                  placeholder="Walk-in"
                />
              </div>
            </div>

            <div className="flex items-center justify-between border-t pt-3">
              <span className="text-muted-foreground text-sm">Total</span>
              <span className="text-lg font-semibold tabular-nums">{formatCurrency(total)}</span>
            </div>

            <Button
              className="w-full"
              size="lg"
              onClick={() => void handleCheckout()}
              disabled={cart.length === 0 || createSale.isPending}
            >
              <PackageSearch className="size-4" />
              {createSale.isPending ? 'Processing...' : 'Checkout'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <ConnectScannerDialog open={scannerOpen} onOpenChange={setScannerOpen} purpose="POS" />
    </div>
  );
}
