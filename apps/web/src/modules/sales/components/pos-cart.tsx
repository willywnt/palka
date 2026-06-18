import { Boxes, Minus, Plus, ShoppingCart, Trash2 } from 'lucide-react';

import { ActionTooltip } from '@/components/ui/action-tooltip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NumberInput } from '@/components/ui/number-input';
import { EmptyState } from '@/components/empty-state';
import { ImageThumb } from '@/components/image-thumb';
import { formatCurrency } from '@/lib/formatters';
import { formatProductVariantLabel } from '@/lib/variant-label';

import type { BundleCartLine, CartLine, VariantCartLine } from './pos-cart-types';

/**
 * − / + buttons flanking the qty input (kasir speed). Both paths go through the
 * SAME clamped (≥1) update the input itself reports — typing still works.
 */
function QtyStepper({
  id,
  quantity,
  onQuantityChange,
}: {
  id: string;
  quantity: number;
  onQuantityChange: (quantity: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="shrink-0"
        onClick={() => onQuantityChange(Math.max(1, quantity - 1))}
        disabled={quantity <= 1}
        aria-label="Kurangi jumlah"
      >
        <Minus className="size-4" />
      </Button>
      <NumberInput
        id={id}
        className="w-16 text-center"
        value={quantity}
        onChange={(value) => onQuantityChange(Math.max(1, value))}
      />
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="shrink-0"
        onClick={() => onQuantityChange(quantity + 1)}
        aria-label="Tambah jumlah"
      >
        <Plus className="size-4" />
      </Button>
    </div>
  );
}

/** A standalone-variant cart row. */
function VariantCartRow({
  line,
  oversold,
  onPatch,
  onRemove,
}: {
  line: VariantCartLine;
  oversold: boolean;
  onPatch: (patch: Partial<VariantCartLine>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <ImageThumb src={line.imageUrl} alt={line.name} />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">
              {formatProductVariantLabel(line.productName, line)}
            </div>
            <div className="text-muted-foreground text-xs">
              {line.sku} · {line.availableStock} tersedia · {line.incomingStock} akan datang
            </div>
          </div>
        </div>
        <ActionTooltip label="Hapus dari keranjang">
          <Button size="icon" variant="ghost" onClick={onRemove}>
            <Trash2 className="size-4" />
            <span className="sr-only">Hapus dari keranjang</span>
          </Button>
        </ActionTooltip>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div className="space-y-1.5">
          <Label htmlFor={`cart-qty-${line.variantId}`}>Qty</Label>
          <QtyStepper
            id={`cart-qty-${line.variantId}`}
            quantity={line.quantity}
            onQuantityChange={(quantity) => onPatch({ quantity })}
          />
        </div>
        <div className="min-w-28 flex-1 space-y-1.5">
          <Label htmlFor={`cart-price-${line.variantId}`}>Harga satuan</Label>
          <NumberInput
            id={`cart-price-${line.variantId}`}
            value={line.unitPrice}
            onChange={(value) => onPatch({ unitPrice: Math.max(0, value) })}
          />
        </div>
        <div className="ml-auto text-right">
          <div className="text-muted-foreground text-xs">Total</div>
          <div className="num font-medium">{formatCurrency(line.unitPrice * line.quantity)}</div>
        </div>
      </div>
      {oversold ? (
        <Badge
          variant="outline"
          className="border-highlight/40 bg-highlight/15 text-status-warn mt-2"
        >
          Melebihi stok (boleh, barangnya ada di tangan) · sisa {line.availableStock} di sistem
        </Badge>
      ) : null}
      {line.cost != null && line.unitPrice < line.cost ? (
        <Badge
          variant="outline"
          className="border-highlight/40 bg-highlight/15 text-status-warn mt-2"
        >
          Di bawah modal (<span className="num">{formatCurrency(line.cost)}</span>) — margin minus
        </Badge>
      ) : null}
    </div>
  );
}

/** A bundle cart row: a violet badge + its component variants and resulting quantities. */
function BundleCartRow({
  line,
  oversold,
  onPatch,
  onRemove,
}: {
  line: BundleCartLine;
  oversold: boolean;
  onPatch: (patch: Partial<BundleCartLine>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <ImageThumb src={line.imageUrl} alt={line.name} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium">{line.name}</span>
              <Badge
                variant="outline"
                className="border-violet-500/40 text-violet-600 dark:text-violet-400"
              >
                <Boxes className="size-3" />
                Bundel
              </Badge>
            </div>
            <div className="text-muted-foreground text-xs">{line.sku}</div>
          </div>
        </div>
        <ActionTooltip label="Hapus dari keranjang">
          <Button size="icon" variant="ghost" onClick={onRemove}>
            <Trash2 className="size-4" />
            <span className="sr-only">Hapus dari keranjang</span>
          </Button>
        </ActionTooltip>
      </div>

      <ul className="bg-muted/40 mt-2 space-y-1 rounded-md px-2.5 py-2">
        {line.components.map((component) => (
          <li
            key={component.productVariantId}
            className="text-muted-foreground flex items-center justify-between gap-2 text-xs"
          >
            <span className="truncate">{component.name}</span>
            <span className="num whitespace-nowrap">{line.quantity * component.quantity}×</span>
          </li>
        ))}
      </ul>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div className="space-y-1.5">
          <Label htmlFor={`cart-qty-${line.bundleId}`}>Qty</Label>
          <QtyStepper
            id={`cart-qty-${line.bundleId}`}
            quantity={line.quantity}
            onQuantityChange={(quantity) => onPatch({ quantity })}
          />
        </div>
        <div className="min-w-28 flex-1 space-y-1.5">
          <Label htmlFor={`cart-price-${line.bundleId}`}>Harga bundel</Label>
          <NumberInput
            id={`cart-price-${line.bundleId}`}
            value={line.unitPrice}
            onChange={(value) => onPatch({ unitPrice: Math.max(0, value) })}
          />
        </div>
        <div className="ml-auto text-right">
          <div className="text-muted-foreground text-xs">Total</div>
          <div className="num font-medium">{formatCurrency(line.unitPrice * line.quantity)}</div>
        </div>
      </div>
      {oversold ? (
        <Badge
          variant="outline"
          className="border-highlight/40 bg-highlight/15 text-status-warn mt-2"
        >
          Melebihi stok (boleh, barangnya ada di tangan) · ada komponen yang kurang
        </Badge>
      ) : null}
    </div>
  );
}

/** Presentational cart line list (empty state, variant + bundle rows). */
export function PosCart({
  cart,
  isLineOversold,
  onPatchVariantLine,
  onRemoveVariantLine,
  onPatchBundleLine,
  onRemoveBundleLine,
}: {
  cart: CartLine[];
  isLineOversold: (line: CartLine) => boolean;
  onPatchVariantLine: (variantId: string, patch: Partial<VariantCartLine>) => void;
  onRemoveVariantLine: (variantId: string) => void;
  onPatchBundleLine: (bundleId: string, patch: Partial<BundleCartLine>) => void;
  onRemoveBundleLine: (bundleId: string) => void;
}) {
  if (cart.length === 0) {
    return (
      <EmptyState
        icon={ShoppingCart}
        title="Keranjang kosong"
        description="Cari produk lalu tambahkan buat mulai jualan."
      />
    );
  }

  return (
    <div className="space-y-3">
      {cart.map((line) =>
        line.kind === 'variant' ? (
          <VariantCartRow
            key={`variant-${line.variantId}`}
            line={line}
            oversold={isLineOversold(line)}
            onPatch={(patch) => onPatchVariantLine(line.variantId, patch)}
            onRemove={() => onRemoveVariantLine(line.variantId)}
          />
        ) : (
          <BundleCartRow
            key={`bundle-${line.bundleId}`}
            line={line}
            oversold={isLineOversold(line)}
            onPatch={(patch) => onPatchBundleLine(line.bundleId, patch)}
            onRemove={() => onRemoveBundleLine(line.bundleId)}
          />
        ),
      )}
    </div>
  );
}
