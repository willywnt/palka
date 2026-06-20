'use client';

import { useRef, useState } from 'react';
import { Download, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { StatusBadge, type StatusTone } from '@/components/status-badge';

import { productsExportUrl, useImportProductsMutation } from '../hooks/use-products';
import type { ProductImportReport, ProductImportStatus } from '../types';

const STATUS_META: Record<ProductImportStatus, { tone: StatusTone; label: string }> = {
  create: { tone: 'info', label: 'Buat' },
  update: { tone: 'ok', label: 'Perbarui' },
  skip: { tone: 'neutral', label: 'Lewati' },
  error: { tone: 'danger', label: 'Error' },
};

export function ProductImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [report, setReport] = useState<ProductImportReport | null>(null);
  const importMutation = useImportProductsMutation();

  function reset() {
    setCsv(null);
    setFileName(null);
    setReport(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleFile(file: File) {
    setFileName(file.name);
    setReport(null);
    let text: string;
    try {
      text = await file.text();
    } catch {
      toast.error('Gagal membaca file', { description: 'Pastikan file CSV valid.' });
      return;
    }
    setCsv(text);
    try {
      const preview = await importMutation.mutateAsync({ csv: text, commit: false });
      setReport(preview);
    } catch (error) {
      setCsv(null);
      toast.error('Gagal memeriksa CSV', {
        description: error instanceof Error ? error.message : 'Terjadi kesalahan',
      });
    }
  }

  async function handleConfirm() {
    if (!csv) return;
    try {
      const result = await importMutation.mutateAsync({ csv, commit: true });
      setReport(result);
      toast.success('Impor selesai', {
        description: `${result.summary.create} dibuat, ${result.summary.update} diperbarui${
          result.summary.error > 0 ? `, ${result.summary.error} gagal` : ''
        }.`,
      });
    } catch (error) {
      toast.error('Gagal mengimpor', {
        description: error instanceof Error ? error.message : 'Terjadi kesalahan',
      });
    }
  }

  const actionable = report ? report.summary.create + report.summary.update : 0;
  const committed = report?.committed ?? false;
  const pending = importMutation.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh] !max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Impor produk (CSV)</DialogTitle>
          <DialogDescription>
            Unggah CSV untuk membuat produk baru atau memperbarui harga/modal/nama varian
            berdasarkan SKU. Pakai file hasil “Ekspor CSV” sebagai template. Stok hanya diisi untuk
            varian baru.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="size-4" />
              {fileName ? 'Ganti file' : 'Pilih file CSV'}
            </Button>
            <Button type="button" variant="ghost" size="sm" asChild>
              <a href={productsExportUrl()} download>
                <Download className="size-4" />
                Unduh template
              </a>
            </Button>
            {fileName ? (
              <span className="text-muted-foreground inline-flex items-center gap-1.5 text-sm">
                <FileSpreadsheet className="size-4" />
                {fileName}
              </span>
            ) : null}
          </div>

          {pending && !report ? (
            <div className="text-muted-foreground flex items-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin" />
              Memeriksa file…
            </div>
          ) : null}

          {report ? (
            <>
              <div className="flex flex-wrap gap-2">
                <StatusBadge tone="info">{report.summary.create} buat</StatusBadge>
                <StatusBadge tone="ok">{report.summary.update} perbarui</StatusBadge>
                <StatusBadge tone="neutral">{report.summary.skip} lewati</StatusBadge>
                {report.summary.error > 0 ? (
                  <StatusBadge tone="danger">{report.summary.error} error</StatusBadge>
                ) : null}
              </div>

              {committed ? (
                <div className="border-status-ok/30 bg-status-ok/10 text-status-ok rounded-lg border px-3 py-2 text-sm">
                  Impor selesai. {report.summary.create} produk dibuat, {report.summary.update}{' '}
                  diperbarui
                  {report.summary.error > 0 ? `, ${report.summary.error} gagal` : ''}.
                </div>
              ) : null}

              <div className="max-h-[40vh] overflow-auto rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-14">Baris</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Produk / Varian</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Catatan</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.rows.map((row) => {
                      const meta = STATUS_META[row.status];
                      return (
                        <TableRow key={row.line}>
                          <TableCell className="num text-muted-foreground">{row.line}</TableCell>
                          <TableCell>
                            <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{row.productName || '—'}</div>
                            {row.variantName ? (
                              <div className="text-muted-foreground text-xs">{row.variantName}</div>
                            ) : null}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{row.sku ?? '—'}</TableCell>
                          <TableCell
                            className={
                              row.status === 'error'
                                ? 'text-destructive text-xs'
                                : 'text-muted-foreground text-xs'
                            }
                          >
                            {row.message ?? '—'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {committed ? 'Tutup' : 'Batal'}
          </Button>
          {report && !committed ? (
            <Button type="button" disabled={pending || actionable === 0} onClick={handleConfirm}>
              {pending ? 'Mengimpor…' : `Impor ${actionable} item`}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
