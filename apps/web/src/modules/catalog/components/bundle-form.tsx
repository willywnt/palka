'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Layers, Wand2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NumberInput } from '@/components/ui/number-input';

import { useCreateBundleMutation } from '../hooks/use-products';
import { suggestVariantSku } from '../utils/variants';
import { BundleComponentsField, type BundleComponentDraft } from './bundle-components-field';

/** From-scratch bundle creation: mints a stockless host variant, then sets its components. */
export function BundleForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [price, setPrice] = useState(0);
  const [components, setComponents] = useState<BundleComponentDraft[]>([]);
  const createBundle = useCreateBundleMutation();

  const canSubmit =
    name.trim().length > 0 &&
    sku.trim().length > 0 &&
    components.length > 0 &&
    !createBundle.isPending;

  async function handleCreate() {
    if (!canSubmit) return;
    try {
      const result = await createBundle.mutateAsync({
        name: name.trim(),
        sku: sku.trim(),
        price,
        components: components.map((component) => ({
          componentVariantId: component.componentVariantId,
          quantity: component.quantity,
        })),
      });
      toast.success('Bundle created');
      router.push(`/dashboard/bundles/${result.bundleVariantId}`);
    } catch (error) {
      toast.error('Could not create the bundle', {
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bundle details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="bundle-name">Name</Label>
            <Input
              id="bundle-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Paket Hemat"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bundle-sku">SKU</Label>
            <div className="flex gap-2">
              <Input
                id="bundle-sku"
                value={sku}
                onChange={(event) => setSku(event.target.value)}
                placeholder="e.g. PAKET-HEMAT"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={!name.trim()}
                onClick={() => setSku(suggestVariantSku(name))}
                title="Generate SKU from the name"
              >
                <Wand2 className="size-4" />
                <span className="sr-only">Generate SKU</span>
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bundle-price">Price</Label>
            <NumberInput
              id="bundle-price"
              value={price}
              onChange={(value) => setPrice(Math.max(0, value))}
            />
          </div>
          <p className="text-muted-foreground text-xs">
            A bundle keeps no stock of its own — selling one decrements its component variants. How
            many you can sell is computed from component stock.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Components</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <BundleComponentsField value={components} onChange={setComponents} />
          <Button
            className="w-full"
            size="lg"
            onClick={() => void handleCreate()}
            disabled={!canSubmit}
          >
            <Layers className="size-4" />
            {createBundle.isPending ? 'Creating…' : 'Create bundle'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
