'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Boxes, PackageOpen, Save } from 'lucide-react';
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
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/stat-card';
import { formatCurrency } from '@/lib/formatters';

import { useBundleByVariantQuery, useSetBundleByVariantMutation } from '../hooks/use-products';
import { computeBuildableQty } from '../utils/bundle';
import { BundleComponentsField, type BundleComponentDraft } from './bundle-components-field';

const normalize = (components: { componentVariantId: string; quantity: number }[]) =>
  components
    .map((component) => `${component.componentVariantId}:${component.quantity}`)
    .sort()
    .join(',');

export function BundleDetailEditor({ variantId }: { variantId: string }) {
  const router = useRouter();
  const { data, isLoading, error } = useBundleByVariantQuery(variantId);
  const setBundle = useSetBundleByVariantMutation(variantId);
  const [components, setComponents] = useState<BundleComponentDraft[]>([]);

  useEffect(() => {
    if (data) {
      setComponents(
        data.components.map((component) => ({
          componentVariantId: component.componentVariantId,
          sku: component.sku,
          name: component.name,
          quantity: component.quantity,
          availableStock: component.availableStock,
        })),
      );
    }
  }, [data]);

  const buildable = useMemo(
    () =>
      computeBuildableQty(
        components.map((component) => ({
          quantity: component.quantity,
          availableStock: component.availableStock ?? 0,
        })),
      ),
    [components],
  );

  const hasUnknownStock = components.some((component) => component.availableStock === undefined);
  const dirty = data ? normalize(components) !== normalize(data.components) : false;
  // The page doubles as "make this variant a bundle" — a variant with no saved
  // components isn't a bundle yet, so we hide the bundle-only framing.
  const isBundle = (data?.components.length ?? 0) > 0;

  async function persist(next: BundleComponentDraft[]) {
    return setBundle.mutateAsync({
      components: next.map((component) => ({
        componentVariantId: component.componentVariantId,
        quantity: component.quantity,
      })),
    });
  }

  async function handleSave() {
    if (!dirty || components.length === 0) return;
    try {
      await persist(components);
      toast.success('Bundle saved');
    } catch (saveError) {
      toast.error('Could not save the bundle', {
        description: saveError instanceof Error ? saveError.message : 'Please try again.',
      });
    }
  }

  async function handleConvert() {
    try {
      await persist([]);
      toast.success('Converted to a normal product', {
        description: 'It now tracks its own stock instead of its components.',
      });
      router.push('/dashboard/bundles');
    } catch (convertError) {
      toast.error('Could not convert the bundle', {
        description: convertError instanceof Error ? convertError.message : 'Please try again.',
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
        <div className="mt-2 flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{data.name}</h1>
          {isBundle ? (
            <Badge className="border-transparent bg-violet-500/10 text-violet-600 dark:text-violet-400">
              Bundle
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              Not a bundle yet
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground mt-1 text-sm">
          {data.sku} · {formatCurrency(data.price)}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Components</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <BundleComponentsField
              value={components}
              onChange={setComponents}
              excludeVariantId={variantId}
            />
            <div className="flex justify-end">
              <Button
                onClick={() => void handleSave()}
                disabled={!dirty || components.length === 0 || setBundle.isPending}
              >
                <Save className="size-4" />
                {setBundle.isPending ? 'Saving…' : isBundle ? 'Save changes' : 'Make bundle'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <StatCard
            label="Buildable now"
            value={buildable}
            icon={Boxes}
            tone={buildable > 0 ? 'emerald' : 'amber'}
            hint={
              hasUnknownStock
                ? 'Newly added components count after you save.'
                : 'The most you can sell, from component stock.'
            }
          />

          {isBundle ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Convert to normal product</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-muted-foreground text-sm">
                  Remove all components so this variant tracks its own stock again.
                </p>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" className="w-full" disabled={setBundle.isPending}>
                      <PackageOpen className="size-4" />
                      Convert to normal product
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Convert “{data.name}” to a normal product?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        Its components will be removed. The variant will track its own stock instead
                        of being built from other variants. You can make it a bundle again later.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => void handleConvert()}>
                        Convert
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
