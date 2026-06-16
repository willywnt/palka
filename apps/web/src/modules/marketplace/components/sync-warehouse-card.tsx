'use client';

import { useMemo, useState } from 'react';
import { Warehouse } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';

import { useUpdateSyncWarehouseMutation } from '../hooks/use-marketplace-connections';

const SINGLE_WAREHOUSE = '' as const;

/**
 * Per-connection sync-warehouse picker (Lazada multi-warehouse). Falka owns exactly ONE
 * warehouse: stock push writes `available` to the chosen warehouseCode and LEAVES every other
 * warehouse untouched (non-destructive). "Satu gudang (default)" clears it back to the bare
 * single-warehouse path. Options come from the warehouseCodes seen at the last import.
 */
export function SyncWarehouseCard({
  connectionId,
  syncWarehouseCode,
  knownWarehouseCodes,
}: {
  connectionId: string;
  syncWarehouseCode: string | null;
  knownWarehouseCodes: string[];
}) {
  const mutation = useUpdateSyncWarehouseMutation(connectionId);
  const [value, setValue] = useState(syncWarehouseCode ?? SINGLE_WAREHOUSE);

  // Always offer the currently-saved code even if a fresh import hasn't surfaced it yet.
  const options = useMemo(() => {
    const set = new Set(knownWarehouseCodes);
    if (syncWarehouseCode) set.add(syncWarehouseCode);
    return [...set].sort();
  }, [knownWarehouseCodes, syncWarehouseCode]);

  const dirty = value !== (syncWarehouseCode ?? SINGLE_WAREHOUSE);

  async function handleSave() {
    try {
      await mutation.mutateAsync(value === SINGLE_WAREHOUSE ? null : value);
      toast.success('Gudang sinkron disimpan', {
        description:
          value === SINGLE_WAREHOUSE
            ? 'Stok dikirim sebagai gudang tunggal (jalur default).'
            : `Stok hanya dikirim ke gudang ${value}; gudang lain tidak disentuh.`,
      });
    } catch (error) {
      toast.error('Gagal menyimpan gudang sinkron', {
        description: error instanceof Error ? error.message : 'Terjadi kesalahan',
      });
    }
  }

  return (
    <section className="rounded-xl border p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg">
          <Warehouse className="size-4" />
        </span>
        <div className="space-y-1">
          <h2 className="text-sm font-semibold">Gudang sinkron</h2>
          <p className="text-muted-foreground text-sm">
            Lazada bisa memecah stok satu SKU ke beberapa gudang. Pilih satu gudang yang Falka
            kelola — stok hanya dikirim ke situ, gudang lain dibiarkan apa adanya (tidak
            di-nol-kan).
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Select
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="w-full sm:max-w-xs"
          aria-label="Gudang sinkron"
        >
          <option value={SINGLE_WAREHOUSE}>Satu gudang (default)</option>
          {options.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </Select>
        <Button onClick={() => void handleSave()} disabled={!dirty || mutation.isPending}>
          {mutation.isPending ? 'Menyimpan...' : 'Simpan'}
        </Button>
      </div>

      {knownWarehouseCodes.length === 0 ? (
        <p className="text-muted-foreground mt-3 text-xs">
          Belum ada gudang terdeteksi. Impor listing dulu untuk memunculkan pilihan gudang.
        </p>
      ) : null}
    </section>
  );
}
