'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { ProductDetail } from '@/modules/catalog/components/product-detail';
import { catalogKeys } from '@/modules/catalog/hooks/catalog-keys';
import type { ProductVariantItem } from '@/modules/catalog/types';
import { AdjustStockDialog } from '@/modules/inventory/components/adjust-stock-dialog';

/**
 * App-layer composition of two modules: catalog's product detail UI and the
 * inventory stock-adjust dialog. Cross-module composition lives at the page
 * layer so neither module imports the other's components.
 */
export function ProductDetailView({ productId }: { productId: string }) {
  const queryClient = useQueryClient();
  const [adjustTarget, setAdjustTarget] = useState<ProductVariantItem | null>(null);

  return (
    <>
      <ProductDetail productId={productId} onAdjustVariant={setAdjustTarget} />

      {adjustTarget ? (
        <AdjustStockDialog
          variantId={adjustTarget.id}
          variantLabel={`${adjustTarget.name} · ${adjustTarget.sku}`}
          availableStock={adjustTarget.availableStock}
          open={Boolean(adjustTarget)}
          onOpenChange={(open) => {
            if (!open) setAdjustTarget(null);
          }}
          onAdjusted={() => {
            void queryClient.invalidateQueries({ queryKey: catalogKeys.detail(productId) });
          }}
        />
      ) : null}
    </>
  );
}
