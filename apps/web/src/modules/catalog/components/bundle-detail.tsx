'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Boxes, Save, Trash2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { NumberInput } from '@/components/ui/number-input';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/stat-card';
import { formatCurrency } from '@/lib/formatters';

import {
  useBundleQuery,
  useDeleteBundleMutation,
  useUpdateBundleMutation,
} from '../hooks/use-bundles';
import { suggestVariantSku } from '../utils/variants';
import { BundleComponentsField, type BundleComponentDraft } from './bundle-components-field';
import { BundleImage } from './bundle-image';

export function BundleDetailEditor({ bundleId }: { bundleId: string }) {
  const router = useRouter();
  const { data, isLoading, error } = useBundleQuery(bundleId);
  const updateBundle = useUpdateBundleMutation(bundleId);
  const deleteBundle = useDeleteBundleMutation();

  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [price, setPrice] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [components, setComponents] = useState<BundleComponentDraft[]>([]);

  useEffect(() => {
    if (!data) return;
    setName(data.name);
    setSku(data.sku);
    setPrice(Number(data.price));
    setIsActive(data.isActive);
    setComponents(
      data.components.map((component) => ({
        productVariantId: component.productVariantId,
        sku: component.sku,
        name: component.name,
        quantity: component.quantity,
        availableStock: component.availableStock,
      })),
    );
  }, [data]);

  const canSave =
    name.trim().length > 0 &&
    sku.trim().length > 0 &&
    components.length > 0 &&
    !updateBundle.isPending;

  async function handleSave() {
    if (!canSave) return;
    try {
      await updateBundle.mutateAsync({
        name: name.trim(),
        sku: sku.trim(),
        price,
        isActive,
        items: components.map((component) => ({
          productVariantId: component.productVariantId,
          quantity: component.quantity,
        })),
      });
      toast.success('Bundle saved');
    } catch (saveError) {
      toast.error('Could not save the bundle', {
        description: saveError instanceof Error ? saveError.message : 'Please try again.',
      });
    }
  }

  async function handleDelete() {
    try {
      await deleteBundle.mutateAsync(bundleId);
      toast.success('Bundle deleted');
      router.push('/dashboard/bundles');
    } catch (deleteError) {
      toast.error('Could not delete the bundle', {
        description: deleteError instanceof Error ? deleteError.message : 'Please try again.',
      });
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/dashboard/bundles">
            <ArrowLeft className="size-4" />
            Bundles
          </Link>
        </Button>
        <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border p-4 text-sm">
          {error instanceof Error ? error.message : 'This bundle could not be found.'}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/dashboard/bundles">
            <ArrowLeft className="size-4" />
            Bundles
          </Link>
        </Button>
        <div className="mt-2 flex items-center gap-3">
          <BundleImage bundleId={bundleId} imageUrl={data.imageUrl} label={data.name} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-2xl font-semibold tracking-tight">{data.name}</h1>
              <Badge className="border-transparent bg-violet-500/10 text-violet-600 dark:text-violet-400">
                Bundle
              </Badge>
            </div>
            <p className="text-muted-foreground mt-1 text-sm">
              {data.sku} · {formatCurrency(data.price)}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="bundle-name">Name</Label>
                <Input
                  id="bundle-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. Paket Hemat"
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
              <div className="flex items-center justify-between gap-3 sm:col-span-2">
                <div>
                  <Label htmlFor="bundle-active">Active</Label>
                  <p className="text-muted-foreground text-xs">
                    Inactive bundles can&apos;t be sold or bought (hidden from POS, New PO, and
                    scan).
                  </p>
                </div>
                <Switch id="bundle-active" checked={isActive} onCheckedChange={setIsActive} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Components</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <BundleComponentsField value={components} onChange={setComponents} />
              <div className="flex justify-end">
                <Button onClick={() => void handleSave()} disabled={!canSave}>
                  <Save className="size-4" />
                  {updateBundle.isPending ? 'Saving…' : 'Save changes'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <StatCard
            label="Available"
            value={data.available}
            icon={Boxes}
            tone={data.available > 0 ? 'emerald' : 'amber'}
            hint="The most you can sell, from component stock. Updates after you save."
          />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Delete bundle</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-muted-foreground text-sm">
                Removes the bundle. Its component variants and their stock are untouched.
              </p>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="text-destructive w-full"
                    disabled={deleteBundle.isPending}
                  >
                    <Trash2 className="size-4" />
                    Delete bundle
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete “{data.name}”?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This removes the bundle. Its component variants and their stock are untouched.
                      This can&apos;t be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => void handleDelete()}>
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
