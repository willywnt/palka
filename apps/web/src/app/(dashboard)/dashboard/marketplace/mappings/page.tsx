import { MarketplaceMappingDashboard } from '@/modules/marketplace/components/marketplace-mapping-dashboard';

export default function MarketplaceMappingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">SKU mapping</h1>
        <p className="text-muted-foreground text-sm">
          Import marketplace products and link them to internal inventory SKUs.
        </p>
      </div>
      <MarketplaceMappingDashboard />
    </div>
  );
}
