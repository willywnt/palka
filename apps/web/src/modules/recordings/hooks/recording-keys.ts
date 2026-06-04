import type { ListRecordingsQuery } from '../validators/list-recordings';

/**
 * Single query-key hierarchy for the recordings domain. One root (`all`) means a
 * single broad invalidation refreshes everything, while `active` and the
 * `library` views (list/detail/playback) can still be invalidated in isolation.
 *
 *   recordings
 *   ├── active
 *   └── library
 *       ├── list/<query>
 *       ├── detail/<id>
 *       └── playback/<id>
 */
export const recordingKeys = {
  all: ['recordings'] as const,
  active: ['recordings', 'active'] as const,
  library: ['recordings', 'library'] as const,
  list: (query: ListRecordingsQuery) => ['recordings', 'library', 'list', query] as const,
  detail: (id: string) => ['recordings', 'library', 'detail', id] as const,
  playback: (id: string) => ['recordings', 'library', 'playback', id] as const,
  byResi: (noResi: string) => ['recordings', 'library', 'by-resi', noResi] as const,
};
