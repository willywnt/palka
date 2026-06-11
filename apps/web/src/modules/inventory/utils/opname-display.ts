import type { StatusTone } from '@/components/status-badge';

import type { StockOpnameStatus } from '../types';

/** Label + status-tone for an opname session's status badge. */
export const OPNAME_STATUS_META: Record<StockOpnameStatus, { label: string; tone: StatusTone }> = {
  DRAFT: { label: 'Draft', tone: 'info' },
  COMPLETED: { label: 'Selesai', tone: 'ok' },
  CANCELLED: { label: 'Dibatalkan', tone: 'neutral' },
};
