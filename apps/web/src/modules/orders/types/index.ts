import type { MarketplaceProvider, OrderStatus } from '@prisma/client';

export type OrderItemDetail = {
  id: string;
  externalName: string;
  externalSku: string | null;
  quantity: number;
  unitPrice: string | null;
  resolved: boolean;
  variant: { id: string; sku: string; name: string; productName: string } | null;
};

export type OrderListItem = {
  id: string;
  externalOrderId: string;
  provider: MarketplaceProvider;
  shopName: string;
  status: OrderStatus;
  buyerName: string | null;
  noResi: string | null;
  totalAmount: string | null;
  currency: string | null;
  itemCount: number;
  unresolvedCount: number;
  inventoryApplied: boolean;
  /** When a packing video for this order's resi completed (ISO), if ever. */
  fulfilledAt: string | null;
  placedAt: string;
  /** When this order's store was last pulled (ISO), if ever. */
  lastPulledAt: string | null;
};

export type OrderDetail = OrderListItem & { items: OrderItemDetail[] };

/** Result of pulling from several stores at once. */
export type MultiPullOrdersResult = {
  storesPulled: number;
  storesSkipped: string[];
  pulled: number;
  /** Paid orders whose stock was reserved (available−, reserved+). */
  applied: number;
  /** Shipped/completed orders whose reservation was consumed (reserved−). */
  shipped: number;
  /** Cancelled orders whose reservation was released back to available. */
  reverted: number;
};
