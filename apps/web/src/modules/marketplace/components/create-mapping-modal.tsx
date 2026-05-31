'use client';

import { useState } from 'react';
import { toast } from 'sonner';

import type { MarketplaceProductListItemDto } from '../dto/product.dto';
import { useCreateMappingMutation } from '../hooks/use-marketplace-mappings';
import { useVariantsPaginatedQuery } from '@/modules/inventory/hooks/use-inventory';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function CreateMappingModal({
  product,
  open,
  onOpenChange,
}: {
  product: MarketplaceProductListItemDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [search, setSearch] = useState('');
  const [selectedVariantId, setSelectedVariantId] = useState<string>('');

  const variantsQuery = useVariantsPaginatedQuery({
    page: 1,
    pageSize: 20,
    search,
    active: 'ALL',
    stockStatus: 'ALL',
    sortBy: 'sku',
    sortOrder: 'asc',
  });

  const createMutation = useCreateMappingMutation();

  async function handleSubmit() {
    if (!product || !selectedVariantId) return;

    try {
      await createMutation.mutateAsync({
        productVariantId: selectedVariantId,
        marketplaceProductId: product.id,
        syncEnabled: true,
      });
      toast.success('Mapping created', {
        description: `Linked ${product.externalSku ?? product.externalProductName} to internal SKU.`,
      });
      setSelectedVariantId('');
      setSearch('');
      onOpenChange(false);
    } catch (error) {
      toast.error('Mapping failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Map marketplace SKU</DialogTitle>
          <DialogDescription>
            {product ? (
              <>
                Link marketplace SKU{' '}
                <strong>{product.externalSku ?? product.externalProductName}</strong> to an internal
                variant. This connection is required before stock sync.
              </>
            ) : (
              'Select a marketplace product.'
            )}
          </DialogDescription>
        </DialogHeader>

        {product ? (
          <div className="space-y-4">
            <div className="bg-muted/40 rounded-lg border p-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-muted-foreground text-xs">Marketplace</span>
                  <p className="font-medium">{product.externalProductName}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">External SKU</span>
                  <p className="font-mono">{product.externalSku ?? '—'}</p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="variant-search">Search internal SKU</Label>
              <Input
                id="variant-search"
                placeholder="Search by SKU, barcode, name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border p-2">
              {(variantsQuery.data?.items ?? []).map((variant) => (
                <button
                  key={variant.id}
                  type="button"
                  onClick={() => setSelectedVariantId(variant.id)}
                  className={`hover:bg-muted w-full rounded-md px-2 py-2 text-left text-sm ${
                    selectedVariantId === variant.id ? 'bg-primary/10 border-primary border' : ''
                  }`}
                >
                  <span className="font-mono font-medium">{variant.sku}</span>
                  <span className="text-muted-foreground ml-2">{variant.name}</span>
                </button>
              ))}
              {(variantsQuery.data?.items.length ?? 0) === 0 ? (
                <p className="text-muted-foreground py-4 text-center text-sm">No variants found.</p>
              ) : null}
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={!selectedVariantId || createMutation.isPending}
          >
            {createMutation.isPending ? 'Linking...' : 'Create mapping'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
