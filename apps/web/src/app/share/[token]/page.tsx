import type { Metadata } from 'next';
import { APP_NAME } from '@olshop/config/constants';
import { PackageCheck, ShieldAlert } from 'lucide-react';

import { recordingShareService } from '@/modules/recordings/services/recording-share.service';
import { formatDateTime, formatDuration } from '@/lib/formatters';

// Always render per-request: each view validates the token, mints a fresh
// short-lived presigned URL, and records the view. Never statically cached.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Packing video',
  robots: { index: false, follow: false },
};

type Params = { token: string };

export default async function SharedRecordingPage({ params }: { params: Promise<Params> }) {
  const { token } = await params;
  const view = await recordingShareService.resolvePublicShareLink(token);

  return (
    <main className="bg-muted/30 flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="mb-4 flex items-center gap-2">
          <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg text-sm font-bold">
            {APP_NAME.charAt(0)}
          </span>
          <span className="text-base font-semibold tracking-tight">{APP_NAME}</span>
        </div>

        {view ? (
          <div className="bg-card text-card-foreground overflow-hidden rounded-xl border shadow-sm">
            <div className="border-b p-4">
              <div className="text-primary flex items-center gap-2 text-sm font-medium">
                <PackageCheck className="size-4" />
                Packing proof
              </div>
              <h1 className="mt-1 text-lg font-semibold">Tracking no. {view.noResi}</h1>
              <p className="text-muted-foreground text-sm">
                Recorded packing video, {formatDuration(view.durationSeconds)} long.
              </p>
            </div>

            <video
              controls
              playsInline
              preload="metadata"
              className="aspect-video w-full bg-black"
              src={view.playbackUrl}
            >
              <source src={view.playbackUrl} type={view.mimeType} />
              Your browser cannot play this video.
            </video>

            <div className="text-muted-foreground border-t p-4 text-xs">
              This link expires {formatDateTime(view.expiresAt)}. Shared as dispute evidence —
              please do not redistribute.
            </div>
          </div>
        ) : (
          <div className="bg-card text-card-foreground rounded-xl border p-8 text-center shadow-sm">
            <div className="bg-muted text-muted-foreground mx-auto flex size-12 items-center justify-center rounded-full">
              <ShieldAlert className="size-6" />
            </div>
            <h1 className="mt-4 text-lg font-semibold">Link unavailable</h1>
            <p className="text-muted-foreground mx-auto mt-1 max-w-sm text-sm">
              This packing-video link is invalid, has expired, or was revoked. Ask the seller for a
              fresh link.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
