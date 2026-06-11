'use client';

import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import {
  Clock,
  Film,
  HardDrive,
  Maximize2,
  PictureInPicture2,
  RotateCcw,
  Upload,
} from 'lucide-react';

import type { OperationalRecordingStatus } from '../types/operational-recording-status';
import { formatOperationalDateTime } from '../utils/datetime';
import { formatRecordingDuration } from '../utils/format';
import { formatRecoveryFileSize } from '@/modules/recordings/recovery/utils/format';
import { OperationalStatusBadge } from './operational-status-badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

const PLAYBACK_SPEEDS = [0.5, 1, 1.25, 1.5, 2] as const;

export type RecordingPreviewMeta = {
  noResi: string;
  status: OperationalRecordingStatus;
  durationSeconds: number;
  fileSizeBytes: number;
  recordedAt: string;
  uploadedAt?: string | null;
  retryCount?: number;
};

type RecordingPreviewShellProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meta: RecordingPreviewMeta | null;
  videoSrc: string | null;
  videoKey?: string;
  mimeType?: string;
  isLoading?: boolean;
  errorMessage?: string | null;
  onRetry?: () => void;
};

function formatPlaybackTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const whole = Math.floor(seconds);
  const mins = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function InspectorRow({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex gap-2.5 sm:gap-3">
      <div className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-lg sm:size-9">
        <Icon className="text-muted-foreground size-3.5 sm:size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="eyebrow text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-xs leading-snug font-medium break-words sm:text-sm">{value}</p>
      </div>
    </div>
  );
}

export function RecordingPreviewShell({
  open,
  onOpenChange,
  meta,
  videoSrc,
  videoKey,
  mimeType = 'video/webm',
  isLoading = false,
  errorMessage = null,
  onRetry,
}: RecordingPreviewShellProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [videoReady, setVideoReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [pipSupported, setPipSupported] = useState(false);

  useEffect(() => {
    setPipSupported(typeof document !== 'undefined' && 'pictureInPictureEnabled' in document);
  }, []);

  useEffect(() => {
    if (!open) {
      setVideoReady(false);
      setIsPlaying(false);
      setCurrentTime(0);
      videoRef.current?.pause();
    }
  }, [open]);

  useEffect(() => {
    setVideoReady(false);
    setCurrentTime(0);
  }, [videoSrc, videoKey]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed, videoSrc, videoKey]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  }, []);

  const restartPlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = 0;
    void video.play();
  }, []);

  const enterFullscreen = useCallback(() => {
    const video = videoRef.current;
    if (!video?.requestFullscreen) return;
    void video.requestFullscreen();
  }, []);

  const enterPictureInPicture = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !document.pictureInPictureEnabled) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await video.requestPictureInPicture();
      }
    } catch {
      // Browser may reject PiP.
    }
  }, []);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }

      const video = videoRef.current;
      if (!video) return;

      switch (event.key) {
        case ' ':
          event.preventDefault();
          togglePlay();
          break;
        case 'f':
        case 'F':
          event.preventDefault();
          enterFullscreen();
          break;
        case 'r':
        case 'R':
          event.preventDefault();
          restartPlayback();
          break;
        case 'ArrowLeft':
          event.preventDefault();
          video.currentTime = Math.max(0, video.currentTime - 5);
          break;
        case 'ArrowRight':
          event.preventDefault();
          video.currentTime = Math.min(video.duration || 0, video.currentTime + 5);
          break;
        default:
          break;
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, enterFullscreen, restartPlayback, togglePlay]);

  if (!meta) return null;

  const showLoader = isLoading || (Boolean(videoSrc) && !videoReady && !errorMessage);
  const showError = Boolean(errorMessage);
  const canControlVideo = Boolean(videoSrc) && !showError && videoReady;
  const displayDuration = meta.durationSeconds;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          // Mobile: edge-to-edge sheet. Tablet+: centered wide modal.
          'fixed inset-0 z-50 flex h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden border-0 p-0',
          'rounded-none pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]',
          'sm:inset-auto sm:top-[50%] sm:left-[50%] sm:h-[min(96dvh,920px)] sm:w-[calc(100vw-1.5rem)]',
          'sm:max-w-[min(calc(100vw-1.5rem),90rem)] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-2xl sm:pt-0 sm:pb-0',
          'lg:flex-row',
          '[&>button]:top-[max(0.75rem,env(safe-area-inset-top))] [&>button]:right-3 [&>button]:z-30 sm:[&>button]:top-3',
          '[&>button]:rounded-full [&>button]:border [&>button]:border-white/10 [&>button]:bg-black/50 [&>button]:text-white',
          '[&>button]:opacity-90 [&>button]:backdrop-blur-sm hover:[&>button]:bg-black/70 hover:[&>button]:opacity-100',
          '[&>button]:focus:ring-white/30',
        )}
      >
        <DialogTitle className="sr-only">Pratinjau rekaman {meta.noResi}</DialogTitle>
        <DialogDescription className="sr-only">
          Pratinjau video untuk no. resi {meta.noResi}
        </DialogDescription>

        {/* Video stage — grows on desktop; fixed share of viewport on mobile */}
        <div
          className={cn(
            'relative flex min-w-0 flex-col bg-zinc-950',
            'h-[min(52dvh,24rem)] shrink-0 sm:h-auto sm:min-h-[min(48vh,22rem)] sm:flex-1 lg:min-h-0',
          )}
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.35)_100%)]" />

          <div className="relative flex min-h-0 flex-1 items-center justify-center p-2 sm:p-4 lg:p-6">
            {showLoader ? (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-zinc-950">
                <div className="border-primary/30 border-t-primary size-12 animate-spin rounded-full border-[3px]" />
                <div className="space-y-1 text-center">
                  <p className="text-sm font-medium text-zinc-200">Menyiapkan pratinjau</p>
                  <p className="text-xs text-zinc-500">Memuat video dari penyimpanan…</p>
                </div>
              </div>
            ) : null}

            {showError ? (
              <div className="z-10 flex max-w-sm flex-col items-center gap-4 px-6 text-center">
                <div className="flex size-14 items-center justify-center rounded-full bg-zinc-900 ring-1 ring-zinc-800">
                  <Film className="size-6 text-zinc-400" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-zinc-100">Pratinjau tidak tersedia</p>
                  <p className="text-sm text-zinc-400">{errorMessage}</p>
                </div>
                {onRetry ? (
                  <Button size="sm" variant="secondary" onClick={onRetry}>
                    Coba lagi
                  </Button>
                ) : null}
              </div>
            ) : videoSrc ? (
              <video
                ref={videoRef}
                key={videoKey ?? videoSrc}
                className="max-h-full max-w-full object-contain shadow-2xl ring-1 ring-white/5"
                controls
                controlsList="nodownload"
                playsInline
                preload="metadata"
                src={videoSrc}
                onLoadedData={() => setVideoReady(true)}
                onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onError={() => setVideoReady(false)}
              >
                <source src={videoSrc} type={mimeType} />
              </video>
            ) : (
              <p className="text-sm text-zinc-500">Tidak ada pratinjau.</p>
            )}
          </div>

          {canControlVideo ? (
            <div className="relative z-10 flex shrink-0 items-center justify-between gap-3 border-t border-white/10 bg-black/40 px-3 py-2 backdrop-blur-sm sm:px-6 lg:hidden">
              <span className="num text-[11px] text-zinc-300 sm:text-xs">
                {formatPlaybackTime(currentTime)} / {formatPlaybackTime(displayDuration)}
              </span>
              <span className="text-[11px] text-zinc-500 sm:text-xs">
                {isPlaying ? 'Memutar' : 'Jeda'}
              </span>
            </div>
          ) : null}
        </div>

        {/* Inspector — scrolls on small screens; fixed sidebar on large */}
        <aside
          className={cn(
            'bg-background flex min-h-0 w-full shrink-0 flex-col border-t',
            'flex-1 sm:max-h-[46dvh] sm:flex-initial',
            'lg:max-h-none lg:w-[min(20rem,28vw)] lg:flex-none lg:border-t-0 lg:border-l xl:w-80',
          )}
        >
          <div className="shrink-0 space-y-0.5 border-b px-4 py-3 pr-12 sm:px-5 sm:py-4">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <h2 className="text-base font-semibold tracking-tight sm:text-lg">{meta.noResi}</h2>
              <OperationalStatusBadge status={meta.status} />
            </div>
            <p className="text-muted-foreground text-xs sm:text-sm">Pratinjau video packing</p>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:space-y-5 sm:px-5 sm:py-5">
            <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-1">
              <InspectorRow
                icon={Clock}
                label="Durasi"
                value={formatRecordingDuration(meta.durationSeconds)}
              />
              <InspectorRow
                icon={HardDrive}
                label="Ukuran file"
                value={formatRecoveryFileSize(meta.fileSizeBytes)}
              />
              <InspectorRow
                icon={Film}
                label="Direkam"
                value={formatOperationalDateTime(meta.recordedAt)}
              />
              {meta.uploadedAt !== undefined ? (
                <InspectorRow
                  icon={Upload}
                  label="Diupload"
                  value={
                    meta.uploadedAt ? formatOperationalDateTime(meta.uploadedAt) : 'Belum diupload'
                  }
                />
              ) : (
                <InspectorRow
                  icon={Upload}
                  label="Percobaan upload"
                  value={String(meta.retryCount ?? 0)}
                />
              )}
            </div>

            {canControlVideo ? (
              <>
                <Separator className="col-span-full" />
                <div className="col-span-full space-y-1 sm:space-y-2">
                  <p className="text-muted-foreground eyebrow">Progres</p>
                  <p className="num text-xl font-semibold tracking-tight sm:text-2xl">
                    {formatPlaybackTime(currentTime)}
                    <span className="text-muted-foreground text-sm font-normal sm:text-base">
                      {' '}
                      / {formatPlaybackTime(displayDuration)}
                    </span>
                  </p>
                </div>
              </>
            ) : null}

            <Separator className="col-span-full" />

            <div className="col-span-full space-y-2 sm:space-y-3">
              <p className="text-muted-foreground eyebrow">Kecepatan putar</p>
              <div className="flex flex-wrap gap-1.5 sm:grid sm:grid-cols-5 sm:gap-1.5">
                {PLAYBACK_SPEEDS.map((speed) => (
                  <Button
                    key={speed}
                    size="sm"
                    variant={playbackSpeed === speed ? 'default' : 'outline'}
                    className="h-8 min-w-[2.75rem] flex-1 px-0 text-xs sm:h-9 sm:min-w-0 sm:flex-none"
                    disabled={!canControlVideo && !videoSrc}
                    onClick={() => setPlaybackSpeed(speed)}
                  >
                    {speed}x
                  </Button>
                ))}
              </div>
            </div>

            <div className="col-span-full space-y-2">
              <p className="text-muted-foreground eyebrow">Aksi</p>
              <div className="grid grid-cols-3 gap-2 lg:grid-cols-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="justify-center lg:justify-start"
                  disabled={!canControlVideo}
                  onClick={enterFullscreen}
                >
                  <Maximize2 className="size-4 shrink-0" />
                  <span className="hidden sm:inline">Layar penuh</span>
                  <span className="sm:hidden">Penuh</span>
                  <kbd className="text-muted-foreground ml-auto hidden rounded border px-1.5 py-0.5 font-mono text-[10px] lg:inline">
                    F
                  </kbd>
                </Button>
                {pipSupported ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="justify-center lg:justify-start"
                    disabled={!canControlVideo}
                    onClick={() => void enterPictureInPicture()}
                  >
                    <PictureInPicture2 className="size-4 shrink-0" />
                    <span className="truncate">PiP</span>
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  size="sm"
                  className="justify-center lg:justify-start"
                  disabled={!canControlVideo}
                  onClick={restartPlayback}
                >
                  <RotateCcw className="size-4 shrink-0" />
                  <span className="truncate">Ulang</span>
                  <kbd className="text-muted-foreground ml-auto hidden rounded border px-1.5 py-0.5 font-mono text-[10px] lg:inline">
                    R
                  </kbd>
                </Button>
              </div>
            </div>
          </div>

          <div className="text-muted-foreground hidden shrink-0 border-t px-5 py-3 text-[11px] leading-relaxed lg:block">
            <kbd className="rounded border px-1 font-mono">Space</kbd> putar/jeda ·{' '}
            <kbd className="rounded border px-1 font-mono">←</kbd>
            <kbd className="rounded border px-1 font-mono">→</kbd> geser 5 detik ·{' '}
            <kbd className="rounded border px-1 font-mono">F</kbd> layar penuh
          </div>
        </aside>
      </DialogContent>
    </Dialog>
  );
}
