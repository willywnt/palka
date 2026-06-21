'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Download,
  Eye,
  Link2,
  MoreHorizontal,
  Play,
  Search,
  Trash2,
  Video,
} from 'lucide-react';
import { toast } from 'sonner';

import type { RecordingListItem } from '../types';
import { RECORDING_STATUS_FILTER_LABELS } from '../types';
import {
  useDeleteRecordingMutation,
  useDownloadRecordingMutation,
  useRecordingDetailQuery,
  useRecordingsListQuery,
} from '../hooks/use-recordings-management';
import {
  formatRecordingDate,
  formatRecordingDuration,
  formatRecordingFileSize,
  isPlayableRecording,
} from '../utils/recording-display';
import { useRecordingLibraryFilters } from '../hooks/use-recording-library-filters';
import { RECORDING_STATUS_FILTERS, type RecordingSortField } from '../validators/list-recordings';
import { RecordingDeleteDialog } from './recording-delete-dialog';
import { RecordingDetailModal } from './recording-detail-modal';
import { RecordingPlayerModal } from './recording-player-modal';
import { ShareEvidenceDialog } from './share-evidence-dialog';
import { OperationalStatusBadge } from './operational-status-badge';
import { RecordingRetentionBadge } from './recording-retention-badge';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { BuoyArt } from '@/components/maritime-art';
import { TablePagination } from '@/components/table-pagination';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useRecordingReliabilityStore } from '@/modules/recordings/recovery/store/recording-reliability.store';
import { useUploadRetry } from '@/modules/recordings/recovery/hooks/use-upload-retry';
import { PendingLocalPlayerModal } from '@/modules/recordings/recovery/components/pending-local-player-modal';
import { PendingRecordingDetailSheet } from '@/modules/recordings/recovery/components/pending-recording-detail-sheet';
import { PendingDiscardDialog } from '@/modules/recordings/recovery/components/pending-discard-dialog';
import type { TemporaryRecording } from '@/modules/recordings/recovery/types';
import { mapServerStatusToOperational } from '../types/operational-recording-status';
import { PendingUploadsSection } from './pending-uploads-section';

function SortButton({
  label,
  field,
  sortBy,
  sortOrder,
  onSort,
}: {
  label: string;
  field: RecordingSortField;
  sortBy: RecordingSortField;
  sortOrder: 'asc' | 'desc';
  onSort: (field: RecordingSortField) => void;
}) {
  const isActive = sortBy === field;
  const Icon = !isActive ? ArrowUpDown : sortOrder === 'asc' ? ArrowUp : ArrowDown;

  return (
    <Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={() => onSort(field)}>
      {label}
      <Icon className="size-3.5" />
    </Button>
  );
}

/** Per-recording `⋯` menu — shared by the desktop table rows and the mobile cards. */
function RecordingRowActions({
  recording,
  canPlay,
  isDownloadPending,
  onPlay,
  onDetail,
  onDownload,
  onShare,
  onDelete,
}: {
  recording: RecordingListItem;
  canPlay: boolean;
  isDownloadPending: boolean;
  onPlay: (recording: RecordingListItem) => void;
  onDetail: (recording: RecordingListItem) => void;
  onDownload: (recording: RecordingListItem) => void;
  onShare: (recording: RecordingListItem) => void;
  onDelete: (recording: RecordingListItem) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <MoreHorizontal className="size-4" />
          <span className="sr-only">Buka aksi</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled={!canPlay} onClick={() => onPlay(recording)}>
          <Play className="size-4" />
          Pratinjau
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onDetail(recording)}>
          <Eye className="size-4" />
          Lihat detail
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!canPlay || isDownloadPending}
          onClick={() => onDownload(recording)}
        >
          <Download className="size-4" />
          Unduh
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!canPlay} onClick={() => onShare(recording)}>
          <Link2 className="size-4" />
          Bagikan bukti
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onClick={() => onDelete(recording)}
        >
          <Trash2 className="size-4" />
          Hapus
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function RecordingsDashboard() {
  const { query, setQuery, searchInput, setSearchInput, listQuery } = useRecordingLibraryFilters();
  const [selectedRecording, setSelectedRecording] = useState<RecordingListItem | null>(null);
  const [playerOpen, setPlayerOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RecordingListItem | null>(null);
  const [shareTarget, setShareTarget] = useState<RecordingListItem | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [pendingPlayerTarget, setPendingPlayerTarget] = useState<TemporaryRecording | null>(null);
  const [pendingDetailTarget, setPendingDetailTarget] = useState<TemporaryRecording | null>(null);
  const [pendingDiscardTarget, setPendingDiscardTarget] = useState<TemporaryRecording | null>(null);
  const [isDiscardingPending, setIsDiscardingPending] = useState(false);

  const temporaryRecordings = useRecordingReliabilityStore((state) => state.temporaryRecordings);
  const setUploadCenterOpen = useRecordingReliabilityStore((state) => state.setUploadCenterOpen);
  const { discardRecording } = useUploadRetry();

  const { data, isLoading, error, refetch } = useRecordingsListQuery(listQuery);
  const detailQuery = useRecordingDetailQuery(detailId, detailOpen);
  const deleteMutation = useDeleteRecordingMutation();
  const downloadMutation = useDownloadRecordingMutation();

  function handleSort(field: RecordingSortField) {
    setQuery((current) => ({
      ...current,
      page: 1,
      sortBy: field,
      sortOrder: current.sortBy === field && current.sortOrder === 'desc' ? 'asc' : 'desc',
    }));
  }

  function ariaSortFor(field: RecordingSortField): 'ascending' | 'descending' | 'none' {
    if (query.sortBy !== field) return 'none';
    return query.sortOrder === 'asc' ? 'ascending' : 'descending';
  }

  function openPlayer(recording: RecordingListItem) {
    setSelectedRecording(recording);
    setPlayerOpen(true);
  }

  function openDetail(recording: RecordingListItem) {
    setDetailId(recording.id);
    setDetailOpen(true);
  }

  async function handleDownload(recording: RecordingListItem) {
    try {
      await downloadMutation.mutateAsync(recording.id);
    } catch (downloadError) {
      toast.error('Gagal mengunduh', {
        description: downloadError instanceof Error ? downloadError.message : 'Coba lagi ya.',
      });
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;

    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      toast.success('Rekaman dihapus');
      setDeleteTarget(null);
    } catch (deleteError) {
      toast.error('Gagal menghapus', {
        description: deleteError instanceof Error ? deleteError.message : 'Coba lagi ya.',
      });
    }
  }

  async function handlePendingDiscardConfirm() {
    if (!pendingDiscardTarget) return;

    setIsDiscardingPending(true);
    try {
      await discardRecording(pendingDiscardTarget.id);
      if (pendingDetailTarget?.id === pendingDiscardTarget.id) {
        setPendingDetailTarget(null);
      }
      setPendingDiscardTarget(null);
    } finally {
      setIsDiscardingPending(false);
    }
  }

  const hasSearch = Boolean(searchInput.trim());

  const hiddenServerRecordingIds = useMemo(
    () =>
      new Set(
        temporaryRecordings
          .map((recording) => recording.recordingId)
          .filter((id): id is string => Boolean(id)),
      ),
    [temporaryRecordings],
  );

  const visibleServerRecordings = useMemo(
    () => (data?.items ?? []).filter((recording) => !hiddenServerRecordingIds.has(recording.id)),
    [data?.items, hiddenServerRecordingIds],
  );

  const isEmpty =
    !isLoading && visibleServerRecordings.length === 0 && temporaryRecordings.length === 0;

  const filteredPending = useMemo(() => {
    const term = searchInput.trim().toUpperCase();
    if (!term) return temporaryRecordings;
    return temporaryRecordings.filter((recording) => recording.noResi.toUpperCase().includes(term));
  }, [searchInput, temporaryRecordings]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full sm:max-w-sm">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Cari berdasarkan no. resi..."
              className="pl-9"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {RECORDING_STATUS_FILTERS.map((status) => (
              <Button
                key={status}
                size="sm"
                variant={query.status === status ? 'default' : 'outline'}
                onClick={() => setQuery((current) => ({ ...current, page: 1, status }))}
              >
                {RECORDING_STATUS_FILTER_LABELS[status]}
              </Button>
            ))}
          </div>
        </div>

        <Button asChild>
          <Link href="/recordings">
            <Video className="size-4" />
            Rekaman baru
          </Link>
        </Button>
      </div>

      {error ? <ErrorState title="Gagal memuat rekaman" onRetry={() => void refetch()} /> : null}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : isEmpty ? (
        <EmptyState
          icon={hasSearch ? Video : undefined}
          art={hasSearch ? undefined : <BuoyArt />}
          title={hasSearch ? 'Tidak ada rekaman yang cocok' : 'Belum ada rekaman'}
          description={
            hasSearch
              ? 'Coba no. resi lain atau hapus filter kamu.'
              : 'Buat video packing pertama kamu, nanti muncul di sini.'
          }
        />
      ) : (
        <>
          <PendingUploadsSection
            recordings={filteredPending}
            onPreview={setPendingPlayerTarget}
            onViewTimeline={setPendingDetailTarget}
            onDiscard={setPendingDiscardTarget}
          />

          {visibleServerRecordings.length > 0 ? (
            <>
              {/* Mobile: stacked cards — same data + actions as the table. */}
              <div className="space-y-3 sm:hidden">
                {visibleServerRecordings.map((recording) => {
                  const canPlay = isPlayableRecording(recording.status, recording.publicUrl);

                  return (
                    <article key={recording.id} className="space-y-3 rounded-xl border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <p className="num truncate font-medium">{recording.noResi}</p>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <OperationalStatusBadge
                              status={mapServerStatusToOperational(recording.status)}
                            />
                            <RecordingRetentionBadge recording={recording} />
                          </div>
                        </div>
                        <RecordingRowActions
                          recording={recording}
                          canPlay={canPlay}
                          isDownloadPending={downloadMutation.isPending}
                          onPlay={openPlayer}
                          onDetail={openDetail}
                          onDownload={(target) => void handleDownload(target)}
                          onShare={(target) => {
                            setShareTarget(target);
                            setShareOpen(true);
                          }}
                          onDelete={setDeleteTarget}
                        />
                      </div>
                      <dl className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <dt className="text-muted-foreground">Durasi</dt>
                          <dd className="num mt-0.5 font-medium">
                            {formatRecordingDuration(recording.durationSeconds)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Ukuran file</dt>
                          <dd className="num mt-0.5 font-medium">
                            {formatRecordingFileSize(recording.fileSizeBytes)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Dibuat</dt>
                          <dd className="mt-0.5 font-medium">
                            {formatRecordingDate(recording.createdAt)}
                          </dd>
                        </div>
                      </dl>
                    </article>
                  );
                })}
              </div>

              {/* Desktop table — the Table primitive scrolls itself. */}
              <div className="hidden rounded-xl border sm:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead aria-sort={ariaSortFor('noResi')}>
                        <SortButton
                          label="No. resi"
                          field="noResi"
                          sortBy={query.sortBy}
                          sortOrder={query.sortOrder}
                          onSort={handleSort}
                        />
                      </TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead aria-sort={ariaSortFor('durationSeconds')}>
                        <SortButton
                          label="Durasi"
                          field="durationSeconds"
                          sortBy={query.sortBy}
                          sortOrder={query.sortOrder}
                          onSort={handleSort}
                        />
                      </TableHead>
                      <TableHead aria-sort={ariaSortFor('fileSizeBytes')}>
                        <SortButton
                          label="Ukuran file"
                          field="fileSizeBytes"
                          sortBy={query.sortBy}
                          sortOrder={query.sortOrder}
                          onSort={handleSort}
                        />
                      </TableHead>
                      <TableHead aria-sort={ariaSortFor('createdAt')}>
                        <SortButton
                          label="Dibuat"
                          field="createdAt"
                          sortBy={query.sortBy}
                          sortOrder={query.sortOrder}
                          onSort={handleSort}
                        />
                      </TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleServerRecordings.map((recording) => {
                      const canPlay = isPlayableRecording(recording.status, recording.publicUrl);

                      return (
                        <TableRow key={recording.id}>
                          <TableCell className="num font-medium">{recording.noResi}</TableCell>
                          <TableCell>
                            <div className="flex flex-col items-start gap-1">
                              <OperationalStatusBadge
                                status={mapServerStatusToOperational(recording.status)}
                              />
                              <RecordingRetentionBadge recording={recording} />
                            </div>
                          </TableCell>
                          <TableCell className="num">
                            {formatRecordingDuration(recording.durationSeconds)}
                          </TableCell>
                          <TableCell className="num">
                            {formatRecordingFileSize(recording.fileSizeBytes)}
                          </TableCell>
                          <TableCell>{formatRecordingDate(recording.createdAt)}</TableCell>
                          <TableCell className="text-right">
                            <RecordingRowActions
                              recording={recording}
                              canPlay={canPlay}
                              isDownloadPending={downloadMutation.isPending}
                              onPlay={openPlayer}
                              onDetail={openDetail}
                              onDownload={(target) => void handleDownload(target)}
                              onShare={(target) => {
                                setShareTarget(target);
                                setShareOpen(true);
                              }}
                              onDelete={setDeleteTarget}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          ) : null}

          {visibleServerRecordings.length > 0 ? (
            <TablePagination
              page={query.page}
              pageSize={query.pageSize}
              total={data?.meta.total ?? 0}
              onPageChange={(nextPage) => setQuery((current) => ({ ...current, page: nextPage }))}
              onPageSizeChange={(size) =>
                setQuery((current) => ({ ...current, pageSize: size, page: 1 }))
              }
            />
          ) : null}
        </>
      )}

      <RecordingPlayerModal
        recording={selectedRecording}
        open={playerOpen}
        onOpenChange={setPlayerOpen}
      />

      <ShareEvidenceDialog
        recording={shareTarget}
        open={shareOpen}
        onOpenChange={(next) => {
          setShareOpen(next);
          if (!next) setShareTarget(null);
        }}
      />

      <RecordingDetailModal
        recording={detailQuery.data ?? null}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        isLoading={detailQuery.isLoading}
      />

      <RecordingDeleteDialog
        noResi={deleteTarget?.noResi ?? ''}
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        onConfirm={() => void handleDeleteConfirm()}
        isDeleting={deleteMutation.isPending}
      />

      <PendingLocalPlayerModal
        recording={pendingPlayerTarget}
        open={Boolean(pendingPlayerTarget)}
        onOpenChange={(open) => !open && setPendingPlayerTarget(null)}
      />

      <PendingRecordingDetailSheet
        recording={pendingDetailTarget}
        open={Boolean(pendingDetailTarget)}
        onOpenChange={(open) => !open && setPendingDetailTarget(null)}
        showBack
        onBack={() => {
          setPendingDetailTarget(null);
          setUploadCenterOpen(true);
        }}
      />

      <PendingDiscardDialog
        noResi={pendingDiscardTarget?.noResi ?? null}
        open={Boolean(pendingDiscardTarget)}
        onOpenChange={(open) => !open && setPendingDiscardTarget(null)}
        onConfirm={() => void handlePendingDiscardConfirm()}
        isDiscarding={isDiscardingPending}
      />
    </div>
  );
}
