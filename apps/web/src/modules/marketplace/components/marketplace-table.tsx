'use client';

import { Link2, MoreHorizontal, RefreshCw, Unplug } from 'lucide-react';

import type { MarketplaceAccountListItemDto } from '../dto/marketplace.dto';
import { MARKETPLACE_ACCOUNT_STATUS_DESCRIPTIONS } from '../dto/marketplace.dto';
import { buildMarketplaceOAuthStartUrl } from '../hooks/use-marketplace-oauth';
import type { ProviderOAuthStatusDto } from '../dto/oauth.dto';
import { formatTokenExpiry, formatTokenExpiryRelative } from '../utils/token-lifecycle';
import { MarketplaceProviderBadge } from './marketplace-provider-badge';
import { MarketplaceStatusBadge } from './marketplace-status-badge';
import { TokenHealthBadge } from './token-health-badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

import { formatDateTime } from '@/lib/formatters';

export function MarketplaceTable({
  accounts,
  oauthStatus,
  onDisconnect,
  onReconnect,
  isDisconnecting,
}: {
  accounts: MarketplaceAccountListItemDto[];
  oauthStatus: ProviderOAuthStatusDto[];
  onDisconnect: (account: MarketplaceAccountListItemDto) => void;
  onReconnect: (account: MarketplaceAccountListItemDto) => void;
  isDisconnecting?: boolean;
}) {
  const oauthByProvider = new Map(oauthStatus.map((item) => [item.provider, item]));

  return (
    <TooltipProvider>
      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Provider</TableHead>
              <TableHead>Store</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Token health</TableHead>
              <TableHead>Last validated</TableHead>
              <TableHead>Last connected</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map((account) => {
              const providerOAuth = oauthByProvider.get(account.provider);
              const oauthConfigured = providerOAuth?.oauthConfigured ?? false;

              return (
                <TableRow key={account.id}>
                  <TableCell>
                    <MarketplaceProviderBadge provider={account.provider} />
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{account.storeName}</div>
                    <div className="text-muted-foreground text-xs">
                      ID: {account.externalStoreId}
                    </div>
                    {account.connectMode ? (
                      <div className="text-muted-foreground mt-0.5 text-xs capitalize">
                        via {account.connectMode}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <MarketplaceStatusBadge status={account.status} />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        {MARKETPLACE_ACCOUNT_STATUS_DESCRIPTIONS[account.status]}
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <TokenHealthBadge account={account} />
                      <div className="text-sm" suppressHydrationWarning>
                        {formatTokenExpiryRelative(account.tokenExpiresAt)}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {formatTokenExpiry(account.tokenExpiresAt)}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {account.health.lastValidatedAt
                      ? formatDateTime(account.health.lastValidatedAt)
                      : '—'}
                  </TableCell>
                  <TableCell>
                    {account.lastConnectedAt
                      ? formatDateTime(account.lastConnectedAt)
                      : formatDateTime(account.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="size-4" />
                          <span className="sr-only">Open actions</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {oauthConfigured ? (
                          <DropdownMenuItem asChild>
                            <a
                              href={buildMarketplaceOAuthStartUrl({
                                provider: account.provider,
                                accountId: account.health.requiresReconnect
                                  ? account.id
                                  : undefined,
                                returnUrl: `${window.location.origin}/dashboard/marketplace`,
                              })}
                            >
                              <Link2 className="size-4" />
                              {account.health.requiresReconnect
                                ? 'Reconnect with OAuth'
                                : 'Connect with OAuth'}
                            </a>
                          </DropdownMenuItem>
                        ) : null}
                        {account.health.requiresReconnect ? (
                          <DropdownMenuItem onClick={() => onReconnect(account)}>
                            <RefreshCw className="size-4" />
                            Reconnect manually
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          disabled={account.status === 'DISCONNECTED' || isDisconnecting}
                          className="text-destructive focus:text-destructive"
                          onClick={() => onDisconnect(account)}
                        >
                          <Unplug className="size-4" />
                          Disconnect
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  );
}
