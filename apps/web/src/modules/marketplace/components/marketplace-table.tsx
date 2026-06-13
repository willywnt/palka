'use client';

import Link from 'next/link';
import { MoreHorizontal, Unplug } from 'lucide-react';

import type { MarketplaceConnectionListItem } from '../types';
import {
  formatTokenExpiry,
  formatTokenExpiryRelative,
  isTokenExpiringSoon,
} from '../utils/token-lifecycle';
import { MarketplaceProviderBadge } from './marketplace-provider-badge';
import { MarketplaceStatusBadge } from './marketplace-status-badge';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { formatDateTime } from '@/lib/formatters';
import { useHasPermission } from '@/modules/users/hooks/use-org';

/** Token still valid but inside the 24h warning window — worth a heads-up badge. */
function isExpiringSoon(connection: MarketplaceConnectionListItem): boolean {
  return connection.tokenStatus === 'valid' && isTokenExpiringSoon(connection.tokenExpiresAt);
}

export function MarketplaceTable({
  connections,
  onDisconnect,
  isDisconnecting,
}: {
  connections: MarketplaceConnectionListItem[];
  onDisconnect: (connection: MarketplaceConnectionListItem) => void;
  isDisconnecting?: boolean;
}) {
  const { allowed: canManage } = useHasPermission('marketplace.manage');

  // The ⋯ menu — shared by the sm+ table and the <sm card list. Disconnect is
  // its only entry, so without the permission there's no menu at all (cosmetic; server guards).
  function renderRowActions(connection: MarketplaceConnectionListItem) {
    if (!canManage) return null;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <MoreHorizontal className="size-4" />
            <span className="sr-only">Buka aksi</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            disabled={!connection.isActive || isDisconnecting}
            className="text-destructive focus:text-destructive"
            onClick={() => onDisconnect(connection)}
          >
            <Unplug className="size-4" />
            Putuskan koneksi
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <>
      <div className="hidden rounded-xl border sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Provider</TableHead>
              <TableHead>Toko</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Masa berlaku token</TableHead>
              <TableHead>Terhubung sejak</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {connections.map((connection) => (
              <TableRow key={connection.id}>
                <TableCell>
                  <MarketplaceProviderBadge provider={connection.provider} />
                </TableCell>
                <TableCell>
                  <Link
                    href={`/dashboard/marketplace/${connection.id}`}
                    className="font-medium hover:underline"
                  >
                    {connection.shopName}
                  </Link>
                  <div className="text-muted-foreground text-xs">
                    ID: <span className="num">{connection.shopId}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <MarketplaceStatusBadge status={connection.connectionStatus} />
                    {(connection.failedSyncCount ?? 0) > 0 ? (
                      <StatusBadge tone="danger">
                        <span className="num">{connection.failedSyncCount}</span> gagal sinkron
                      </StatusBadge>
                    ) : null}
                    {(connection.needsReviewCount ?? 0) > 0 ? (
                      <StatusBadge tone="warn">
                        <span className="num">{connection.needsReviewCount}</span> perlu ditinjau
                      </StatusBadge>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-sm" suppressHydrationWarning>
                    {formatTokenExpiryRelative(connection.tokenExpiresAt)}
                  </div>
                  <div className="text-muted-foreground text-xs" suppressHydrationWarning>
                    {formatTokenExpiry(connection.tokenExpiresAt)}
                  </div>
                  {isExpiringSoon(connection) ? (
                    <StatusBadge tone="warn" className="mt-1">
                      Segera kedaluwarsa
                    </StatusBadge>
                  ) : null}
                </TableCell>
                <TableCell>
                  <span suppressHydrationWarning>{formatDateTime(connection.createdAt)}</span>
                </TableCell>
                <TableCell className="text-right">{renderRowActions(connection)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-3 sm:hidden">
        {connections.map((connection) => (
          <div key={connection.id} className="bg-card rounded-xl border p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link
                  href={`/dashboard/marketplace/${connection.id}`}
                  className="font-medium break-words hover:underline"
                >
                  {connection.shopName}
                </Link>
                <p className="text-muted-foreground text-xs">
                  ID: <span className="num">{connection.shopId}</span>
                </p>
              </div>
              <div className="-mt-1.5 -mr-1.5 shrink-0">{renderRowActions(connection)}</div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <MarketplaceProviderBadge provider={connection.provider} />
              <MarketplaceStatusBadge status={connection.connectionStatus} />
              {(connection.failedSyncCount ?? 0) > 0 ? (
                <StatusBadge tone="danger">
                  <span className="num">{connection.failedSyncCount}</span> gagal sinkron
                </StatusBadge>
              ) : null}
              {(connection.needsReviewCount ?? 0) > 0 ? (
                <StatusBadge tone="warn">
                  <span className="num">{connection.needsReviewCount}</span> perlu ditinjau
                </StatusBadge>
              ) : null}
              {isExpiringSoon(connection) ? (
                <StatusBadge tone="warn">Segera kedaluwarsa</StatusBadge>
              ) : null}
            </div>
            <p className="mt-3 text-sm" suppressHydrationWarning>
              {formatTokenExpiryRelative(connection.tokenExpiresAt)}
              <span className="text-muted-foreground">
                {' '}
                · {formatTokenExpiry(connection.tokenExpiresAt)}
              </span>
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              Terhubung sejak{' '}
              <span suppressHydrationWarning>{formatDateTime(connection.createdAt)}</span>
            </p>
          </div>
        ))}
      </div>
    </>
  );
}
