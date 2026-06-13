'use client';

import { useEffect, useMemo, useState } from 'react';
import { Lock, RotateCcw, Save, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

import { ErrorState } from '@/components/error-state';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  usePermissionMatrixQuery,
  useUpdatePermissionsMutation,
} from '@/modules/users/hooks/use-team';
import {
  DEFAULT_PERMISSIONS,
  PERMISSION_KEYS,
  PERMISSION_META,
  type ConfigurableRole,
  type PermissionKey,
  type PermissionMatrix,
} from '@/modules/users/permissions/catalog';

const CONFIGURABLE_ROLES: readonly ConfigurableRole[] = ['ADMIN', 'STAFF'];
const ROLE_LABEL: Record<ConfigurableRole, string> = { ADMIN: 'Admin', STAFF: 'Staf' };

/** A deep clone so the local draft never mutates the cached matrix. */
function cloneMatrix(matrix: PermissionMatrix): PermissionMatrix {
  return {
    ADMIN: { ...matrix.ADMIN },
    STAFF: { ...matrix.STAFF },
  };
}

function matricesEqual(a: PermissionMatrix, b: PermissionMatrix): boolean {
  return CONFIGURABLE_ROLES.every((role) =>
    PERMISSION_KEYS.every((key) => a[role][key] === b[role][key]),
  );
}

/** "Peran & akses" tab body — the owner-only configurable permission matrix. */
export function AccessSettings() {
  const { data, isLoading, error, refetch } = usePermissionMatrixQuery();
  const updateMutation = useUpdatePermissionsMutation();
  const [draft, setDraft] = useState<PermissionMatrix | null>(null);

  // Seed the draft from the server, and re-seed whenever a save brings fresh data.
  useEffect(() => {
    if (data) setDraft(cloneMatrix(data));
  }, [data]);

  const dirty = useMemo(() => (data && draft ? !matricesEqual(data, draft) : false), [data, draft]);
  const atDefaults = useMemo(
    () => (draft ? matricesEqual(draft, DEFAULT_PERMISSIONS) : false),
    [draft],
  );

  function toggle(role: ConfigurableRole, key: PermissionKey, value: boolean) {
    setDraft((current) =>
      current ? { ...current, [role]: { ...current[role], [key]: value } } : current,
    );
  }

  function resetToDefaults() {
    setDraft(cloneMatrix(DEFAULT_PERMISSIONS));
  }

  async function handleSave() {
    if (!draft) return;
    try {
      await updateMutation.mutateAsync(draft);
      toast.success('Peran & akses disimpan');
    } catch (err) {
      toast.error('Gagal menyimpan peran & akses', {
        description: err instanceof Error ? err.message : 'Terjadi kesalahan',
      });
    }
  }

  if (error) {
    return (
      <ErrorState
        title="Gagal memuat peran & akses"
        description={error instanceof Error ? error.message : undefined}
        onRetry={() => void refetch()}
      />
    );
  }

  if (isLoading || !draft) {
    return <Skeleton className="h-72 w-full" />;
  }

  const busy = updateMutation.isPending;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="eyebrow text-muted-foreground">Peran & akses</p>
        <p className="text-muted-foreground text-sm">
          Atur apa yang boleh dilakukan tiap peran. Pemilik selalu punya akses penuh dan tidak bisa
          dibatasi.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Izin</TableHead>
              <TableHead className="w-24 text-center">Pemilik</TableHead>
              <TableHead className="w-24 text-center">Admin</TableHead>
              <TableHead className="w-24 text-center">Staf</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {PERMISSION_KEYS.map((key) => {
              const meta = PERMISSION_META[key];
              return (
                <TableRow key={key}>
                  <TableCell>
                    <p className="font-medium">{meta.label}</p>
                    <p className="text-muted-foreground text-xs">{meta.description}</p>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="text-muted-foreground inline-flex items-center justify-center">
                      <Lock aria-hidden className="size-4" />
                      <span className="sr-only">Pemilik selalu boleh</span>
                    </span>
                  </TableCell>
                  {CONFIGURABLE_ROLES.map((role) => (
                    <TableCell key={role} className="text-center">
                      <Switch
                        checked={draft[role][key]}
                        onCheckedChange={(value) => toggle(role, key, value)}
                        disabled={busy}
                        aria-label={`${meta.label} untuk ${ROLE_LABEL[role]}`}
                      />
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
          <ShieldCheck aria-hidden className="size-3.5" />
          Perubahan berlaku saat anggota tim memuat ulang halamannya.
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={resetToDefaults}
            disabled={busy || atDefaults}
            className="sm:shrink-0"
          >
            <RotateCcw className="size-4" />
            Kembalikan ke bawaan
          </Button>
          <Button
            onClick={() => void handleSave()}
            disabled={busy || !dirty}
            className="sm:shrink-0"
          >
            <Save className="size-4" />
            {busy ? 'Menyimpan…' : 'Simpan'}
          </Button>
        </div>
      </div>
    </div>
  );
}
