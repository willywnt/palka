# Product import — scaling to large files

Companion to the bulk product import/export feature (see `backlog.md`, 2026-06-20).
Records how large uploads are handled today and the **prepared** design for very large
files in the VPS era.

## Why this is mostly a non-problem: the import is idempotent

Classification is **by SKU** (`planProductImport`): a row whose SKU already exists →
UPDATE; otherwise → CREATE. A blank SKU resolves to a deterministic generated base
(`effectiveImportSku`) and is matched the same way. Consequences:

- **Re-running an import is safe.** A row that was CREATED in a previous run now finds
  its SKU → becomes an UPDATE (same field values) → no duplicate, no error.
- **Stock isn't double-counted.** Initial stock only seeds NEW variants; on re-import
  the row is an UPDATE, which ignores the stock cell.

So a partial failure has **no destructive "hole"** — the user fixes the error rows and
re-imports the whole file; already-imported rows become no-op updates.

## Today (shipped) — chunked synchronous commit

- Client parses .xlsx in the browser, plans/validates on the client (existing data via
  `POST /products/import/resolve`), and shows an editable preview.
- **Commit is sent in sequential chunks** of `COMMIT_BATCH_SIZE` (100) rows; each chunk
  is a `POST /products/import` the server re-plans + applies authoritatively. A progress
  bar tracks rows done; a failed chunk marks its rows `error` (retryable per the
  idempotency above) and the run continues.
- The preview table **virtualizes** (`@tanstack/react-virtual`, `VirtualizedTable`) above
  ~100 rows, so ~2000 rows stay smooth.
- Practical cap: `MAX_IMPORT_ROWS` = 2000 per import. Good for the overwhelming majority
  of catalogs. Works without a worker (client chunked commit).

## Prepared design — BullMQ background import (VPS era, very large files)

The BullMQ worker now runs on the always-on VPS, so the worker-based large-file import is
now **BUILDABLE** (VPS-era) — it's just NOT built yet, on purpose. Build this once, when a
real need for >2000-row imports appears.

Shape:

1. **Upload + stage.** `POST /products/import/jobs` accepts the parsed rows (or the raw
   file via R2 presign for huge files), persists them to a staging table
   (`ProductImportJob` + `ProductImportJobRow`, status `PENDING`), enqueues a
   `process-product-import` job (queue in `@palka/queue`), returns a `jobId`.
2. **Worker** (`apps/worker`) processes rows in chunks using the SAME pure
   `planProductImport` + `catalogServerService` paths, updating per-row status + a
   running counter on the job (so progress is durable across reloads).
3. **Poll** `GET /products/import/jobs/:id` for progress + the per-row report; the wizard
   shows the same preview/progress UI, just driven by the job instead of inline chunks.
4. **Resume/retry** is free thanks to idempotency: re-running unfinished/errored rows
   never duplicates.

Migration needed (HARD CONSTRAINT #1): the two staging tables. Defer until VPS.

## If a middle step is ever needed before the VPS

Raising `MAX_IMPORT_ROWS` + keeping the chunked client commit scales to several thousand
rows without new infra (each chunk is a normal request; only wall-clock grows). The
worker job is the answer only for tens-of-thousands or when the import must survive the
user closing the tab.
