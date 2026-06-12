'use client';

import { useState } from 'react';
import { Archive, ChevronDown, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

import { ActionTooltip } from '@/components/ui/action-tooltip';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/error-state';
import { formatRelativeTime } from '@/lib/formatters';
import { cn } from '@/lib/utils';

import { useArchivedVariantsQuery, useRestoreVariantMutation } from '../hooks/use-products';
import type { ArchivedVariantItem } from '../types';
import { formatVariantLabel } from '../utils/variants';

/**
 * The product's soft-deleted variants, collapsed by default. Each can be restored —
 * which reinstates its original SKU — unless that SKU is taken by a live variant or
 * bundle, in which case the action is disabled with the reason in a tooltip. Renders
 * nothing while loading or when none are archived (a secondary affordance, not a list).
 */
export function ArchivedVariants({ productId }: { productId: string }) {
  const { data, isLoading, error, refetch } = useArchivedVariantsQuery(productId);
  const restore = useRestoreVariantMutation(productId);
  const [open, setOpen] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  async function handleRestore(variant: ArchivedVariantItem) {
    setRestoringId(variant.id);
    try {
      await restore.mutateAsync(variant.id);
      toast.success('Dipulihkan', { description: `${formatVariantLabel(variant)} kembali aktif.` });
    } catch (err) {
      toast.error('Gagal memulihkan', {
        description: err instanceof Error ? err.message : 'Terjadi kesalahan',
      });
    } finally {
      setRestoringId(null);
    }
  }

  if (error) {
    return (
      <ErrorState
        title="Gagal memuat varian terarsip"
        onRetry={() => void refetch()}
        className="p-6"
      />
    );
  }

  if (isLoading || !data || data.length === 0) return null;

  return (
    <div className="rounded-xl border">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <Archive className="text-muted-foreground size-4" />
          Varian terarsip <span className="text-muted-foreground">· {data.length}</span>
        </span>
        <ChevronDown
          className={cn('text-muted-foreground size-4 transition-transform', open && 'rotate-180')}
        />
      </button>
      {open ? (
        <ul className="divide-y border-t">
          {data.map((variant) => (
            <li key={variant.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{formatVariantLabel(variant)}</p>
                <p className="text-muted-foreground truncate text-xs">
                  {variant.sku} · diarsipkan {formatRelativeTime(variant.deletedAt)}
                </p>
              </div>
              {variant.restorable ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleRestore(variant)}
                  disabled={restore.isPending}
                >
                  <RotateCcw className="size-4" />
                  {restoringId === variant.id ? 'Memulihkan…' : 'Pulihkan'}
                </Button>
              ) : (
                <ActionTooltip label={variant.blockReason ?? 'Tidak bisa dipulihkan.'}>
                  <span tabIndex={0} className="inline-flex rounded-md">
                    <Button variant="outline" size="sm" disabled>
                      <RotateCcw className="size-4" />
                      Pulihkan
                    </Button>
                  </span>
                </ActionTooltip>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
