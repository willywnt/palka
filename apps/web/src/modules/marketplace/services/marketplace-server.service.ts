import 'server-only';

import { marketplaceAccountService } from './marketplace-account.service';

/**
 * @deprecated Use marketplaceAccountService directly.
 * Thin compatibility wrapper for legacy imports.
 */
export class MarketplaceServerService {
  listConnections = marketplaceAccountService.listAccounts.bind(marketplaceAccountService);
  getConnectionById = marketplaceAccountService.getAccountById.bind(marketplaceAccountService);
  createConnection = marketplaceAccountService.connectAccount.bind(marketplaceAccountService);
  disconnectConnection =
    marketplaceAccountService.disconnectAccount.bind(marketplaceAccountService);
  getDecryptedTokens = marketplaceAccountService.getDecryptedTokens.bind(marketplaceAccountService);
}

export const marketplaceServerService = new MarketplaceServerService();
