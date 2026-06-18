import type { Dispatch, RefObject, SetStateAction } from 'react';
import { Banknote } from 'lucide-react';
import type { SalePaymentMethod } from '@prisma/client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NumberInput } from '@/components/ui/number-input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { formatCurrency } from '@/lib/formatters';

import type { SaleTotals } from '../utils/sale-totals';
import { KbdHint } from './pos-kbd-hint';

export const PAYMENT_OPTIONS: ReadonlyArray<{ value: SalePaymentMethod; label: string }> = [
  { value: 'CASH', label: 'Tunai' },
  { value: 'QRIS', label: 'QRIS' },
  { value: 'TRANSFER', label: 'Transfer' },
  { value: 'CARD', label: 'Kartu' },
  { value: 'OTHER', label: 'Lainnya' },
];

/** Human label for a payment-method enum — the single source for list/detail too. */
export function paymentMethodLabel(method: SalePaymentMethod): string {
  return PAYMENT_OPTIONS.find((option) => option.value === method)?.label ?? method;
}

/**
 * Presentational payment section: method/customer, discount + PPN inputs, the
 * totals summary, the CASH change calculator + quick-tender row, and the pay
 * button. All state lives in the parent — this only renders and reports events.
 */
export function PosPaymentPanel({
  paymentSectionRef,
  payButtonRef,
  paymentMethod,
  setPaymentMethod,
  customerName,
  setCustomerName,
  discountType,
  setDiscountType,
  discountValue,
  setDiscountValue,
  taxEnabled,
  setTaxEnabled,
  taxRate,
  setTaxRate,
  taxInclusive,
  setTaxInclusive,
  cashReceived,
  setCashReceived,
  totals,
  total,
  quickTenderValues,
  cartCount,
  isPending,
  onCheckout,
}: {
  paymentSectionRef: RefObject<HTMLDivElement | null>;
  payButtonRef: RefObject<HTMLButtonElement | null>;
  paymentMethod: SalePaymentMethod;
  setPaymentMethod: Dispatch<SetStateAction<SalePaymentMethod>>;
  customerName: string;
  setCustomerName: Dispatch<SetStateAction<string>>;
  discountType: 'PERCENT' | 'AMOUNT';
  setDiscountType: Dispatch<SetStateAction<'PERCENT' | 'AMOUNT'>>;
  discountValue: number;
  setDiscountValue: Dispatch<SetStateAction<number>>;
  taxEnabled: boolean;
  setTaxEnabled: (checked: boolean) => void;
  taxRate: number;
  setTaxRate: Dispatch<SetStateAction<number>>;
  taxInclusive: boolean;
  setTaxInclusive: Dispatch<SetStateAction<boolean>>;
  cashReceived: number;
  setCashReceived: Dispatch<SetStateAction<number>>;
  totals: SaleTotals;
  total: number;
  quickTenderValues: number[];
  cartCount: number;
  isPending: boolean;
  onCheckout: () => void;
}) {
  return (
    <div ref={paymentSectionRef} className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="payment">Pembayaran</Label>
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
        <div className="space-y-1.5">
          <Label htmlFor="customer">Pelanggan (opsional)</Label>
          <Input
            id="customer"
            value={customerName}
            onChange={(event) => setCustomerName(event.target.value)}
            placeholder="Pelanggan langsung"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 items-end gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="discount-value">Diskon</Label>
          <div className="flex gap-1.5">
            <Select
              value={discountType}
              onChange={(event) => setDiscountType(event.target.value as 'PERCENT' | 'AMOUNT')}
              className="w-18 shrink-0"
              aria-label="Jenis diskon"
            >
              <option value="PERCENT">%</option>
              <option value="AMOUNT">Rp</option>
            </Select>
            <NumberInput
              id="discount-value"
              value={discountValue}
              onChange={(value) => setDiscountValue(Math.max(0, value))}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="flex h-5 items-center gap-2">
            <Switch id="tax-enabled" checked={taxEnabled} onCheckedChange={setTaxEnabled} />
            <Label htmlFor="tax-enabled">PPN</Label>
          </div>
          {taxEnabled ? (
            <div className="flex gap-1.5">
              <NumberInput
                value={taxRate}
                onChange={(value) => setTaxRate(Math.min(100, Math.max(0, value)))}
                className="w-16 shrink-0"
                aria-label="Tarif PPN (persen)"
              />
              <Select
                value={taxInclusive ? 'inclusive' : 'exclusive'}
                onChange={(event) => setTaxInclusive(event.target.value === 'inclusive')}
                aria-label="Cara hitung PPN"
              >
                <option value="exclusive">Ditambahkan</option>
                <option value="inclusive">Termasuk harga</option>
              </Select>
            </div>
          ) : (
            <p className="text-muted-foreground pt-1.5 text-xs">Nonaktif</p>
          )}
        </div>
      </div>

      <div className="space-y-1 border-t pt-3">
        {totals.discountAmount > 0 || (taxEnabled && taxRate > 0) ? (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="num">{formatCurrency(totals.subtotal)}</span>
            </div>
            {totals.discountAmount > 0 ? (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Diskon{discountType === 'PERCENT' ? ` ${discountValue}%` : ''}
                </span>
                <span className="num text-signed-down">
                  −{formatCurrency(totals.discountAmount)}
                </span>
              </div>
            ) : null}
            {taxEnabled && taxRate > 0 ? (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  PPN <span className="num">{taxRate}%</span>
                  {taxInclusive ? ' (termasuk)' : ''}
                </span>
                <span className="num">
                  {taxInclusive ? '' : '+'}
                  {formatCurrency(totals.taxAmount)}
                </span>
              </div>
            ) : null}
          </>
        ) : null}
        <div className="flex items-center justify-between pt-1">
          <span className="text-muted-foreground text-sm">Total harga</span>
          <span className="num text-lg font-semibold">{formatCurrency(total)}</span>
        </div>
      </div>

      {paymentMethod === 'CASH' ? (
        <div className="grid grid-cols-2 items-end gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="cash-received">Uang diterima</Label>
            <NumberInput
              id="cash-received"
              value={cashReceived}
              onChange={(value) => setCashReceived(Math.max(0, value))}
            />
          </div>
          <p className="pb-2.5 text-right text-sm" aria-live="polite">
            {cashReceived <= 0 ? (
              <span className="text-muted-foreground">Kembalian —</span>
            ) : cashReceived >= total ? (
              <span className="text-muted-foreground">
                Kembalian{' '}
                <span className="num text-signed-up font-semibold">
                  {formatCurrency(cashReceived - total)}
                </span>
              </span>
            ) : (
              <span className="text-status-warn">
                Kurang{' '}
                <span className="num font-semibold">{formatCurrency(total - cashReceived)}</span>
              </span>
            )}
          </p>
          {cartCount > 0 ? (
            <div className="col-span-2 flex flex-wrap gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setCashReceived(total)}
              >
                Uang pas
              </Button>
              {quickTenderValues.map((value) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant="outline"
                  className="num"
                  onClick={() => setCashReceived(value)}
                >
                  {formatCurrency(value)}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <Button
        ref={payButtonRef}
        className="w-full"
        size="lg"
        onClick={onCheckout}
        disabled={cartCount === 0 || isPending}
      >
        <Banknote className="size-4" />
        {isPending ? 'Memproses...' : 'Bayar'}
        <KbdHint label="F8" className="bg-primary-foreground/15 text-primary-foreground/80 ml-1" />
      </Button>
    </div>
  );
}
