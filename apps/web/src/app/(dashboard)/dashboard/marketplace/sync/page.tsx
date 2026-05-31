import { MarketplaceSyncDashboard } from '@/modules/marketplace/components/marketplace-sync-dashboard';

export default function MarketplaceSyncPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Stock synchronization</h1>
        <p className="text-muted-foreground text-sm">
          Async inventory → marketplace stock sync jobs, failures, and provider health.
        </p>
      </div>
      <MarketplaceSyncDashboard />
    </div>
  );
}
